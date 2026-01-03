# -*- coding: utf-8 -*-
"""
Smart Context Manager - Intelligens kontextus kezelés az LLM számára

Fő funkciók:
1. @file mention parsing - automatikus fájl beillesztés
2. Project Memory - fontos tények tárolása projektekről
3. Active Files Tracking - aktív fájlok követése a beszélgetésben
4. Smart History - nagyobb és okosabb chat history
5. File Request Protocol - modell kérhet fájlokat
6. Stale Context Filtering - régi, nem releváns kontextus szűrése
"""

import os
import re
import json
import sqlite3
from datetime import datetime
from typing import List, Dict, Optional, Tuple
from pathlib import Path

# ===================================
# CONFIGURATION
# ===================================

# Chat history limits
MAX_HISTORY_MESSAGES = 20  # Csökkentve a relevancia érdekében
MAX_HISTORY_CHARS_PER_MSG = 3000  # Optimalizálva

# File inclusion limits - MEGNÖVELVE az egész fájlokhoz
MAX_FILE_CONTENT_CHARS = 32000  # 32KB per file (egész fájlok)
MAX_TOTAL_FILE_CHARS = 80000  # 80KB összesen
MAX_FILES_TO_INCLUDE = 10  # Max files to include at once

# Aktív fájl tartalom limit (az aktuálisan szerkesztett fájl)
MAX_ACTIVE_FILE_CHARS = 50000  # 50KB az aktív fájlnak

# Memory database path
MEMORY_DB_PATH = os.path.join(os.path.dirname(__file__), "..", "project_memory.db")

# ===================================
# STALE CONTEXT PATTERNS
# ===================================

# Minták amik jelzik a régi terminal outputokat - ezeket szűrjük
STALE_OUTPUT_PATTERNS = [
    r'✅ Terminal SIKERES:',
    r'❌ Terminal HIBA:',
    r'Ellenőrzés eredménye:',
    r'Fájl tartalma \(.+\):',
    r'\[TERMINAL\].*\[/TERMINAL\]',
    r'\[VERIFY\].*\[/VERIFY\]',
    r'Converted.*to UTF-8',
    r'Get-ChildItem.*-Recurse',
    r'Get-Content.*-Encoding',
    r'Set-Content.*-Encoding',
]

# Minták amik jelzik a témaváltást
TOPIC_CHANGE_KEYWORDS = [
    "most pedig", "térjünk rá", "új téma", "más kérdés",
    "változtassunk", "hagyjuk ezt", "következő feladat",
    "új feladat", "egyébként", "mellesleg",
]


# ===================================
# DATABASE INITIALIZATION
# ===================================

def get_memory_conn():
    """Memory database connection"""
    conn = sqlite3.connect(MEMORY_DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    return conn


def init_memory_db():
    """Initialize memory database tables"""
    conn = get_memory_conn()
    conn.executescript("""
        -- Project Memory: fontos tények tárolása projektekről
        CREATE TABLE IF NOT EXISTS project_memory (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            fact_type TEXT NOT NULL,  -- 'file_purpose', 'architecture', 'bug', 'feature', etc.
            fact_key TEXT NOT NULL,   -- pl. 'collision_detection_location'
            fact_value TEXT NOT NULL,
            confidence REAL DEFAULT 1.0,
            created_at TEXT NOT NULL,
            last_accessed_at TEXT NOT NULL,
            access_count INTEGER DEFAULT 1,
            UNIQUE(project_id, fact_key)
        );
        
        -- Active Files: aktuálisan releváns fájlok a beszélgetésben
        CREATE TABLE IF NOT EXISTS active_files (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            file_path TEXT NOT NULL,
            relevance_score REAL DEFAULT 1.0,
            mentioned_at TEXT NOT NULL,
            UNIQUE(project_id, session_id, file_path)
        );
        
        -- Conversation Context: beszélgetés kontextus
        CREATE TABLE IF NOT EXISTS conversation_context (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            session_id TEXT NOT NULL,
            context_type TEXT NOT NULL,  -- 'topic', 'goal', 'files_discussed'
            context_value TEXT NOT NULL,
            updated_at TEXT NOT NULL
        );
        
        CREATE INDEX IF NOT EXISTS idx_memory_project ON project_memory(project_id);
        CREATE INDEX IF NOT EXISTS idx_memory_type ON project_memory(fact_type);
        CREATE INDEX IF NOT EXISTS idx_active_session ON active_files(project_id, session_id);
    """)
    conn.commit()
    conn.close()


# Initialize DB on module load
init_memory_db()


# ===================================
# PROJECT FILE STRUCTURE
# ===================================

# Ignorálandó mappák és fájlok
IGNORE_DIRS = {
    'node_modules', '.git', '__pycache__', 'venv', '.venv', 
    'dist', 'build', '.next', '.cache', 'coverage', '.idea',
    'backup', '.llm-backups', 'env', '.env'
}

IGNORE_EXTENSIONS = {
    '.pyc', '.pyo', '.so', '.dll', '.exe', '.bin',
    '.jpg', '.jpeg', '.png', '.gif', '.ico', '.svg',
    '.mp3', '.mp4', '.wav', '.avi', '.mov',
    '.zip', '.tar', '.gz', '.rar', '.7z',
    '.pdf', '.doc', '.docx', '.xls', '.xlsx',
    '.woff', '.woff2', '.ttf', '.eot',
    '.lock', '.log'
}

CODE_EXTENSIONS = {
    '.js', '.ts', '.tsx', '.jsx', '.py', '.css', '.html', 
    '.json', '.txt', '.md', '.yml', '.yaml', '.xml',
    '.sql', '.sh', '.bat', '.ps1', '.env', '.ini', '.cfg'
}


def get_project_file_structure(project_root: str, max_depth: int = 4) -> Dict:
    """
    Rekurzívan felépíti a projekt fájl struktúráját.
    
    Returns:
    {
        "tree": "ASCII fa reprezentáció",
        "files": ["fájl1.js", "mappa/fájl2.py", ...],
        "summary": "X fájl, Y mappa"
    }
    """
    if not project_root or not os.path.isdir(project_root):
        return {"tree": "", "files": [], "summary": "Nincs projekt"}
    
    files = []
    tree_lines = []
    
    def walk_dir(path: str, prefix: str = "", depth: int = 0):
        if depth > max_depth:
            return
        
        try:
            entries = sorted(os.listdir(path))
        except PermissionError:
            return
        
        # Szűrjük az ignorálandó elemeket
        dirs = []
        file_list = []
        
        for entry in entries:
            if entry.startswith('.') and entry not in ['.env']:
                continue
            
            full_path = os.path.join(path, entry)
            
            if os.path.isdir(full_path):
                if entry.lower() not in IGNORE_DIRS:
                    dirs.append(entry)
            else:
                ext = os.path.splitext(entry)[1].lower()
                if ext not in IGNORE_EXTENSIONS:
                    file_list.append(entry)
        
        # Rajzoljuk a fát
        all_entries = dirs + file_list
        for i, entry in enumerate(all_entries):
            is_last = (i == len(all_entries) - 1)
            connector = "└── " if is_last else "├── "
            
            full_path = os.path.join(path, entry)
            rel_path = os.path.relpath(full_path, project_root).replace('\\', '/')
            
            if os.path.isdir(full_path):
                tree_lines.append(f"{prefix}{connector}📁 {entry}/")
                next_prefix = prefix + ("    " if is_last else "│   ")
                walk_dir(full_path, next_prefix, depth + 1)
            else:
                ext = os.path.splitext(entry)[1].lower()
                icon = "📄" if ext in CODE_EXTENSIONS else "📎"
                tree_lines.append(f"{prefix}{connector}{icon} {entry}")
                files.append(rel_path)
    
    walk_dir(project_root)
    
    # Összesítés
    dir_count = sum(1 for line in tree_lines if "📁" in line)
    
    return {
        "tree": "\n".join(tree_lines),
        "files": files,
        "summary": f"{len(files)} fájl, {dir_count} mappa",
        "code_files": [f for f in files if os.path.splitext(f)[1].lower() in CODE_EXTENSIONS]
    }


def detect_relevant_files_from_message(message: str, project_files: List[str]) -> List[str]:
    """
    A user üzenete alapján meghatározza mely fájlok lehetnek relevánsak.
    """
    relevant = []
    message_lower = message.lower()
    
    # Kulcsszavak és fájl típusok összekapcsolása
    keywords_to_files = {
        'játék': ['game.js', 'game.ts', 'main.js'],
        'game': ['game.js', 'game.ts', 'main.js'],
        'stílus': ['style.css', 'styles.css', 'main.css', 'index.css'],
        'css': ['style.css', 'styles.css', 'main.css'],
        'html': ['index.html', 'main.html'],
        'konfig': ['config.js', 'config.json', 'settings.json'],
        'config': ['config.js', 'config.json', 'settings.json'],
        'mobil': ['mobile.js', 'mobile_config.js', 'responsive.css'],
        'mobile': ['mobile.js', 'mobile_config.js'],
    }
    
    # Közvetlen fájlnév említések
    for file_path in project_files:
        filename = os.path.basename(file_path).lower()
        filename_no_ext = os.path.splitext(filename)[0]
        
        # Ha a fájlnév szerepel az üzenetben
        if filename in message_lower or filename_no_ext in message_lower:
            if file_path not in relevant:
                relevant.append(file_path)
    
    # Kulcsszó alapú keresés
    for keyword, target_files in keywords_to_files.items():
        if keyword in message_lower:
            for target in target_files:
                for file_path in project_files:
                    if target.lower() in file_path.lower():
                        if file_path not in relevant:
                            relevant.append(file_path)
    
    return relevant[:5]  # Max 5 releváns fájl


# ===================================
# @FILE MENTION PARSING
# ===================================

def parse_file_mentions(message: str) -> List[str]:
    """
    Parse @file mentions from user message.
    
    Supports formats:
    - @path/to/file.js
    - @static/js/game.js
    - @"path with spaces/file.js"
    - @'another path/file.js'
    """
    patterns = [
        # Quoted paths: @"path/to/file" or @'path/to/file'
        r'@["\']([^"\']+)["\']',
        # Unquoted paths: @path/to/file.ext (stops at space or end)
        r'@([\w\-./\\]+\.[\w]+)',
        # Directory mention: @static/js/ (ends with /)
        r'@([\w\-./\\]+/)',
    ]
    
    mentions = []
    for pattern in patterns:
        matches = re.findall(pattern, message)
        mentions.extend(matches)
    
    # Normalize paths
    normalized = []
    for m in mentions:
        # Convert backslashes to forward slashes
        m = m.replace('\\', '/')
        # Remove trailing slashes
        m = m.rstrip('/')
        if m and m not in normalized:
            normalized.append(m)
    
    return normalized


def auto_detect_file_mentions(message: str) -> List[str]:
    """
    AUTOMATIKUSAN detektálja a fájlneveket a szövegben @ nélkül is!
    
    Felismeri:
    - game.js, main.py, App.tsx
    - static/js/game.js
    - "game.js fájlban"
    - `game.js`
    """
    patterns = [
        # Backtick-kel körülvett fájlok: `game.js`
        r'`([^`]+\.(?:js|ts|tsx|py|css|html|json|txt|md|jsx))`',
        # Útvonalak: static/js/game.js, backend/app/main.py
        r'((?:[\w\-]+/)+[\w\-]+\.(?:js|ts|tsx|py|css|html|json|txt|md|jsx))',
        # Egyszerű fájlnevek: game.js, main.py
        r'\b([\w\-]+\.(?:js|ts|tsx|py|css|html|json|txt|md|jsx))\b',
    ]
    
    mentions = []
    for pattern in patterns:
        matches = re.findall(pattern, message, re.IGNORECASE)
        mentions.extend(matches)
    
    # Normalize and dedupe
    normalized = []
    for m in mentions:
        m = m.replace('\\', '/').strip()
        if m and m not in normalized:
            normalized.append(m)
    
    return normalized


def find_file_in_project(project_root: str, file_mention: str) -> Optional[str]:
    """
    Find a file in project based on mention.
    Handles partial paths and fuzzy matching.
    
    Returns absolute path if found, None otherwise.
    """
    if not project_root or not file_mention:
        return None
    
    project_root = os.path.abspath(project_root)
    
    # 1. Try exact relative path
    exact_path = os.path.join(project_root, file_mention)
    if os.path.isfile(exact_path):
        return exact_path
    
    # 2. Try as filename only - search recursively
    filename = os.path.basename(file_mention)
    for dirpath, _, filenames in os.walk(project_root):
        # Skip common junk directories
        if any(skip in dirpath for skip in ['node_modules', '.git', '__pycache__', 'venv', '.venv']):
            continue
        
        if filename in filenames:
            full_path = os.path.join(dirpath, filename)
            return full_path
    
    # 3. Try partial path matching
    mention_parts = file_mention.replace('\\', '/').split('/')
    for dirpath, _, filenames in os.walk(project_root):
        if any(skip in dirpath for skip in ['node_modules', '.git', '__pycache__', 'venv', '.venv']):
            continue
        
        rel_dir = os.path.relpath(dirpath, project_root).replace('\\', '/')
        dir_parts = rel_dir.split('/')
        
        for fname in filenames:
            full_parts = dir_parts + [fname] if dir_parts != ['.'] else [fname]
            
            # Check if mention_parts is a suffix of full_parts
            if len(mention_parts) <= len(full_parts):
                if full_parts[-len(mention_parts):] == mention_parts:
                    return os.path.join(dirpath, fname)
    
    return None


def read_file_content(file_path: str, max_chars: int = MAX_FILE_CONTENT_CHARS) -> Optional[str]:
    """Read file content with size limit"""
    try:
        with open(file_path, 'r', encoding='utf-8', errors='replace') as f:
            content = f.read(max_chars)
            if len(content) == max_chars:
                content += "\n... [FÁJL CSONKOLVA - túl nagy] ..."
            return content
    except Exception as e:
        print(f"[Context] Error reading file {file_path}: {e}")
        return None


def resolve_and_load_files(
    project_root: str,
    file_mentions: List[str]
) -> List[Dict[str, str]]:
    """
    Resolve file mentions and load their content.
    
    Returns list of dicts: [{"path": "...", "content": "...", "rel_path": "..."}]
    """
    results = []
    total_chars = 0
    
    for mention in file_mentions[:MAX_FILES_TO_INCLUDE]:
        abs_path = find_file_in_project(project_root, mention)
        if not abs_path:
            print(f"[Context] File not found: {mention}")
            continue
        
        # Check total size limit
        if total_chars >= MAX_TOTAL_FILE_CHARS:
            print(f"[Context] Total file chars limit reached")
            break
        
        remaining_chars = MAX_TOTAL_FILE_CHARS - total_chars
        content = read_file_content(abs_path, min(MAX_FILE_CONTENT_CHARS, remaining_chars))
        
        if content:
            rel_path = os.path.relpath(abs_path, project_root).replace('\\', '/')
            results.append({
                "path": abs_path,
                "rel_path": rel_path,
                "content": content,
                "mention": mention,
            })
            total_chars += len(content)
    
    return results


# ===================================
# PROJECT MEMORY
# ===================================

def store_project_fact(
    project_id: int,
    fact_type: str,
    fact_key: str,
    fact_value: str,
    confidence: float = 1.0
):
    """Store or update a fact about a project"""
    conn = get_memory_conn()
    now = datetime.utcnow().isoformat()
    
    try:
        conn.execute("""
            INSERT INTO project_memory 
            (project_id, fact_type, fact_key, fact_value, confidence, created_at, last_accessed_at, access_count)
            VALUES (?, ?, ?, ?, ?, ?, ?, 1)
            ON CONFLICT(project_id, fact_key) DO UPDATE SET
                fact_value = excluded.fact_value,
                confidence = excluded.confidence,
                last_accessed_at = excluded.last_accessed_at,
                access_count = access_count + 1
        """, (project_id, fact_type, fact_key, fact_value, confidence, now, now))
        conn.commit()
    finally:
        conn.close()


def get_project_facts(project_id: int, fact_types: Optional[List[str]] = None) -> List[Dict]:
    """Get all facts about a project, optionally filtered by type"""
    conn = get_memory_conn()
    
    try:
        if fact_types:
            placeholders = ','.join('?' * len(fact_types))
            query = f"""
                SELECT fact_type, fact_key, fact_value, confidence, access_count
                FROM project_memory
                WHERE project_id = ? AND fact_type IN ({placeholders})
                ORDER BY access_count DESC, confidence DESC
            """
            cursor = conn.execute(query, [project_id] + fact_types)
        else:
            cursor = conn.execute("""
                SELECT fact_type, fact_key, fact_value, confidence, access_count
                FROM project_memory
                WHERE project_id = ?
                ORDER BY access_count DESC, confidence DESC
                LIMIT 50
            """, (project_id,))
        
        results = []
        for row in cursor.fetchall():
            results.append({
                "type": row[0],
                "key": row[1],
                "value": row[2],
                "confidence": row[3],
                "access_count": row[4],
            })
        return results
    finally:
        conn.close()


def search_project_memory(project_id: int, search_text: str) -> List[Dict]:
    """Search project memory for relevant facts"""
    conn = get_memory_conn()
    
    try:
        # Simple text search - can be enhanced with FTS later
        search_pattern = f"%{search_text}%"
        cursor = conn.execute("""
            SELECT fact_type, fact_key, fact_value, confidence
            FROM project_memory
            WHERE project_id = ? 
            AND (fact_key LIKE ? OR fact_value LIKE ?)
            ORDER BY confidence DESC
            LIMIT 10
        """, (project_id, search_pattern, search_pattern))
        
        return [
            {"type": r[0], "key": r[1], "value": r[2], "confidence": r[3]}
            for r in cursor.fetchall()
        ]
    finally:
        conn.close()


# ===================================
# ACTIVE FILES TRACKING
# ===================================

def track_active_file(project_id: int, session_id: str, file_path: str, relevance: float = 1.0):
    """Track a file as active in the current conversation"""
    conn = get_memory_conn()
    now = datetime.utcnow().isoformat()
    
    try:
        conn.execute("""
            INSERT INTO active_files (project_id, session_id, file_path, relevance_score, mentioned_at)
            VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(project_id, session_id, file_path) DO UPDATE SET
                relevance_score = MAX(relevance_score, excluded.relevance_score),
                mentioned_at = excluded.mentioned_at
        """, (project_id, session_id, file_path, relevance, now))
        conn.commit()
    finally:
        conn.close()


def get_active_files(project_id: int, session_id: str) -> List[str]:
    """Get list of active files for a session"""
    conn = get_memory_conn()
    
    try:
        cursor = conn.execute("""
            SELECT file_path FROM active_files
            WHERE project_id = ? AND session_id = ?
            ORDER BY relevance_score DESC, mentioned_at DESC
            LIMIT 20
        """, (project_id, session_id))
        return [r[0] for r in cursor.fetchall()]
    finally:
        conn.close()


def clear_session_files(project_id: int, session_id: str):
    """Clear active files for a session"""
    conn = get_memory_conn()
    try:
        conn.execute(
            "DELETE FROM active_files WHERE project_id = ? AND session_id = ?",
            (project_id, session_id)
        )
        conn.commit()
    finally:
        conn.close()


# ===================================
# STALE CONTEXT FILTERING
# ===================================

def is_stale_terminal_output(text: str) -> bool:
    """
    Ellenőrzi, hogy a szöveg régi terminal output-e.
    Ezeket szűrjük, mert nem relevánsak az új kérdésre.
    """
    for pattern in STALE_OUTPUT_PATTERNS:
        if re.search(pattern, text, re.IGNORECASE | re.DOTALL):
            return True
    return False


def detect_topic_change(message: str) -> bool:
    """
    Detektálja, ha a felhasználó témát vált.
    Ilyenkor a korábbi kontextust kevésbé kell figyelembe venni.
    """
    msg_lower = message.lower()
    return any(keyword in msg_lower for keyword in TOPIC_CHANGE_KEYWORDS)


def filter_relevant_history(
    history: List[Dict],
    current_message: str,
    max_messages: int = MAX_HISTORY_MESSAGES,
) -> List[Dict]:
    """
    Szűri a chat history-t, hogy csak a releváns üzenetek maradjanak.
    
    Szűrési szabályok:
    1. Terminal output-ok törlése (régi parancsok eredményei)
    2. Témaváltás után korábbi kontextus csökkentése
    3. Túl hosszú üzenetek csonkolása
    4. Csak az utolsó N üzenet megtartása
    """
    filtered = []
    topic_changed = detect_topic_change(current_message)
    
    for msg in history:
        text = msg.get("text", "") or msg.get("content", "")
        role = msg.get("role", "")
        
        # Skip empty messages
        if not text.strip():
            continue
        
        # Ha téma váltott, csak az utolsó 5 üzenetet tartjuk meg
        if topic_changed and len(filtered) >= 5:
            continue
        
        # Régi terminal outputok szűrése az assistant üzenetekből
        if role == "assistant" and is_stale_terminal_output(text):
            # Csak az első 500 karaktert tartjuk meg összefoglalásként
            summary = text[:500]
            if len(text) > 500:
                summary += "\n... [régi terminal output csonkolva] ..."
            filtered.append({"role": role, "text": summary, "content": summary})
            continue
        
        # Normál üzenet - hossz limitálás
        if len(text) > MAX_HISTORY_CHARS_PER_MSG:
            text = text[:MAX_HISTORY_CHARS_PER_MSG] + "\n... [csonkolva]"
        
        filtered.append({"role": role, "text": text, "content": text})
    
    # Csak az utolsó N üzenet
    return filtered[-max_messages:]


def clean_llm_response_for_history(response: str) -> str:
    """
    Tisztítja az LLM válaszát mielőtt a history-ba kerülne.
    Eltávolítja a nagy kódblokkokat és terminal outputokat.
    """
    # Terminal blokkok eltávolítása
    cleaned = re.sub(
        r'\[TERMINAL_COMMAND\][\s\S]*?\[/TERMINAL_COMMAND\]',
        '[TERMINAL parancs volt itt]',
        response
    )
    
    # Nagy kódblokkok csonkolása
    def truncate_code_block(match):
        content = match.group(1)
        if len(content) > 500:
            return f"```\n{content[:500]}\n... [kód csonkolva]\n```"
        return match.group(0)
    
    cleaned = re.sub(r'```[\s\S]*?```', truncate_code_block, cleaned)
    
    # Terminal output blokkok csonkolása
    cleaned = re.sub(
        r'(✅ Terminal SIKERES:|❌ Terminal HIBA:)[\s\S]{500,}?(?=\n\n|\Z)',
        r'\1 [output csonkolva]',
        cleaned
    )
    
    return cleaned


# ===================================
# SMART CONTEXT BUILDER
# ===================================

def extract_keywords_for_memory_search(message: str) -> List[str]:
    """Extract keywords from message for memory search"""
    # Remove common words and extract meaningful terms
    stop_words = {
        'a', 'az', 'és', 'vagy', 'de', 'hogy', 'nem', 'is', 'ez', 'azt',
        'the', 'a', 'an', 'and', 'or', 'but', 'is', 'are', 'was', 'were',
        'be', 'been', 'being', 'have', 'has', 'had', 'do', 'does', 'did',
        'will', 'would', 'could', 'should', 'may', 'might', 'must',
        'mi', 'mit', 'hol', 'hogyan', 'miért', 'mikor', 'ki', 'kinek',
        'what', 'where', 'how', 'why', 'when', 'who', 'which',
    }
    
    # Extract words
    words = re.findall(r'\b\w{3,}\b', message.lower())
    keywords = [w for w in words if w not in stop_words]
    
    return keywords[:10]  # Max 10 keywords


def build_smart_context(
    project_id: int,
    project_root: str,
    message: str,
    session_id: str,
    chat_history: List[Dict],
    source_code: Optional[str] = None,
    projected_code: Optional[str] = None,
) -> Dict:
    """
    Build intelligent context for LLM.
    
    Returns:
    {
        "file_mentions": [...],  # Parsed @file mentions
        "loaded_files": [...],   # Loaded file contents
        "memory_facts": [...],   # Relevant project memory
        "active_files": [...],   # Currently active files in conversation
        "enhanced_history": [...],  # Enhanced chat history
        "context_summary": "...",  # Summary for system prompt
        "project_structure": {...}  # Teljes projekt struktúra
    }
    """
    result = {
        "file_mentions": [],
        "loaded_files": [],
        "memory_facts": [],
        "active_files": [],
        "enhanced_history": [],
        "context_summary": "",
        "project_structure": None,
    }
    
    # 0. PROJEKT STRUKTÚRA - MINDIG betöltjük!
    if project_root:
        result["project_structure"] = get_project_file_structure(project_root)
        print(f"[CONTEXT] Project structure: {result['project_structure']['summary']}")
    
    # 1. Parse @file mentions (explicit)
    file_mentions = parse_file_mentions(message)
    
    # 2. AUTO-DETECT fájlok a szövegben (@ nélkül is!)
    auto_detected = auto_detect_file_mentions(message)
    
    # 3. INTELLIGENS fájl detektálás kulcsszavak alapján
    if result["project_structure"]:
        intelligent_files = detect_relevant_files_from_message(
            message, 
            result["project_structure"]["code_files"]
        )
        print(f"[CONTEXT] Intelligently detected files: {intelligent_files}")
    else:
        intelligent_files = []
    
    # Kombináljuk - explicit mentions előnyt élveznek
    all_mentions = file_mentions.copy()
    for f in auto_detected:
        if f not in all_mentions:
            all_mentions.append(f)
    for f in intelligent_files:
        if f not in all_mentions:
            all_mentions.append(f)
    
    result["file_mentions"] = all_mentions
    
    print(f"[CONTEXT] Explicit @mentions: {file_mentions}")
    print(f"[CONTEXT] Auto-detected files: {auto_detected}")
    print(f"[CONTEXT] All files to load: {all_mentions}")
    
    # 4. Load mentioned files
    if project_root and all_mentions:
        loaded = resolve_and_load_files(project_root, all_mentions)
        result["loaded_files"] = loaded
        
        print(f"[CONTEXT] Loaded {len(loaded)} files automatically")
        
        # Track as active files
        for f in loaded:
            track_active_file(project_id, session_id, f["rel_path"], relevance=1.0)
    
    # 3. Get relevant memory facts
    keywords = extract_keywords_for_memory_search(message)
    for keyword in keywords[:5]:
        facts = search_project_memory(project_id, keyword)
        for fact in facts:
            if fact not in result["memory_facts"]:
                result["memory_facts"].append(fact)
    
    # Also get general project facts
    general_facts = get_project_facts(project_id, ['architecture', 'file_purpose', 'important'])
    for fact in general_facts[:10]:
        if fact not in result["memory_facts"]:
            result["memory_facts"].append(fact)
    
    # 4. Get active files from this session
    result["active_files"] = get_active_files(project_id, session_id)
    
    # 5. Enhance chat history - SZŰRÉSSEL a releváns üzenetekre
    # Új: filter_relevant_history használata a régi context szűrésére
    filtered_history = filter_relevant_history(
        chat_history, 
        message, 
        max_messages=MAX_HISTORY_MESSAGES
    )
    
    enhanced_history = []
    for h in filtered_history:
        role = h.get("role", "user")
        text = h.get("text", "") or h.get("content", "")
        enhanced_history.append({"role": role, "content": text})
    
    result["enhanced_history"] = enhanced_history
    
    # Log ha szűrtünk
    if len(chat_history) != len(enhanced_history):
        print(f"[CONTEXT] History filtered: {len(chat_history)} -> {len(enhanced_history)} messages")
    
    # 6. Build context summary
    summary_parts = []
    
    if result["loaded_files"]:
        files_list = ", ".join(f["rel_path"] for f in result["loaded_files"])
        summary_parts.append(f"EXPLICIT FÁJLOK BETÖLTVE: {files_list}")
    
    if result["memory_facts"]:
        facts_summary = "; ".join(f"{f['key']}: {f['value'][:100]}" for f in result["memory_facts"][:5])
        summary_parts.append(f"PROJEKT MEMÓRIA: {facts_summary}")
    
    if result["active_files"]:
        active_list = ", ".join(result["active_files"][:5])
        summary_parts.append(f"AKTÍV FÁJLOK A BESZÉLGETÉSBEN: {active_list}")
    
    result["context_summary"] = "\n".join(summary_parts)
    
    return result


def format_loaded_files_for_prompt(loaded_files: List[Dict]) -> str:
    """Format loaded files for inclusion in prompt"""
    if not loaded_files:
        return ""
    
    parts = ["=" * 50, "EXPLICIT BETÖLTÖTT FÁJLOK (a felhasználó @file hivatkozásai alapján):", "=" * 50]
    
    for f in loaded_files:
        parts.append(f"\n[FILE: {f['rel_path']}]")
        parts.append("-" * 40)
        parts.append(f["content"])
        parts.append("-" * 40)
    
    return "\n".join(parts)


def format_memory_facts_for_prompt(facts: List[Dict]) -> str:
    """Format memory facts for inclusion in prompt"""
    if not facts:
        return ""
    
    parts = ["=" * 50, "PROJEKT MEMÓRIA (korábbi beszélgetésekből tanult tények):", "=" * 50]
    
    for f in facts:
        parts.append(f"- {f['key']}: {f['value']}")
    
    return "\n".join(parts)


def format_project_structure_for_prompt(structure: Dict) -> str:
    """Format project structure for inclusion in prompt"""
    if not structure:
        return ""
    
    parts = [
        "=" * 60,
        "📁 PROJEKT FÁJL STRUKTÚRA",
        "=" * 60,
        f"Összesen: {structure['summary']}",
        "",
        structure["tree"],
        "",
        "=" * 60,
        "Kód fájlok listája (módosíthatók):",
        ", ".join(structure["code_files"][:30]),  # Max 30 fájl
        "=" * 60,
    ]
    
    return "\n".join(parts)


# ===================================
# FILE REQUEST PROTOCOL
# ===================================

def parse_file_requests_from_response(response: str) -> List[str]:
    """
    Parse file requests from LLM response.
    
    The LLM can request files using:
    [FILE_REQUEST: path/to/file.js]
    
    This allows multi-turn file discovery.
    """
    pattern = r'\[FILE_REQUEST:\s*([^\]]+)\]'
    matches = re.findall(pattern, response)
    return [m.strip() for m in matches]


def extract_learned_facts_from_response(response: str) -> List[Dict]:
    """
    Extract facts the LLM learned and wants to remember.
    
    The LLM can store facts using:
    [REMEMBER: key=value, type=architecture]
    """
    pattern = r'\[REMEMBER:\s*([^\]]+)\]'
    matches = re.findall(pattern, response)
    
    facts = []
    for match in matches:
        parts = dict(item.split('=', 1) for item in match.split(',') if '=' in item)
        if 'key' in parts and 'value' in parts:
            facts.append({
                "key": parts['key'].strip(),
                "value": parts['value'].strip(),
                "type": parts.get('type', 'general').strip(),
            })
    
    return facts



