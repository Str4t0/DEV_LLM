#Használat:
#python vector_store.py --mode index --project-name llm_ide --root-dir "D:\Programozas\Progs\DevAPI\Install\llm_dev_env"
#Majd tesztelés:
#python vector_store.py --mode query --project-name llm_ide --query "chat endpoint ami az LLM-nek küld üzenetet" --top-k 3
#!/usr/bin/env python
import os
import argparse
import hashlib
import json
import math
import sqlite3
from datetime import datetime

from openai import OpenAI

# -----------------------------------------
# Konfiguráció
# -----------------------------------------

OPENAI_MODEL = os.getenv("EMBED_MODEL", "text-embedding-3-small")

DB_PATH = os.getenv("VECTOR_DB_PATH", "vector_store.db")

ALLOWED_EXTS = {
    ".py", ".ts", ".tsx", ".js", ".jsx",
    ".json", ".yml", ".yaml",
    ".md", ".txt",
    ".sql",
    ".pli", ".pl1", ".jcl",
}

MAX_CHARS_PER_CHUNK = 1800
BATCH_SIZE = 8


# -----------------------------------------
# DB init
# -----------------------------------------

def get_conn():
    conn = sqlite3.connect(DB_PATH)
    conn.execute("PRAGMA journal_mode=WAL;")
    conn.execute("PRAGMA synchronous=NORMAL;")
    return conn


def init_db(conn):
    conn.executescript(
        """
        CREATE TABLE IF NOT EXISTS projects (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            name TEXT NOT NULL UNIQUE,
            root_dir TEXT NOT NULL,
            created_at TEXT NOT NULL
        );

        CREATE TABLE IF NOT EXISTS documents (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            project_id INTEGER NOT NULL,
            file_path TEXT NOT NULL,
            file_hash TEXT NOT NULL,
            language TEXT,
            last_indexed_at TEXT NOT NULL,
            UNIQUE(project_id, file_path),
            FOREIGN KEY (project_id) REFERENCES projects(id) ON DELETE CASCADE
        );

        CREATE TABLE IF NOT EXISTS chunks (
            id INTEGER PRIMARY KEY AUTOINCREMENT,
            document_id INTEGER NOT NULL,
            chunk_index INTEGER NOT NULL,
            content TEXT NOT NULL,
            embedding_json TEXT NOT NULL,
            created_at TEXT NOT NULL,
            FOREIGN KEY (document_id) REFERENCES documents(id) ON DELETE CASCADE
        );

        CREATE INDEX IF NOT EXISTS idx_documents_project
            ON documents(project_id);

        CREATE INDEX IF NOT EXISTS idx_chunks_document
            ON chunks(document_id, chunk_index);
        """
    )
    conn.commit()


# -----------------------------------------
# Segédfüggvények
# -----------------------------------------

def sha256_file(path: str) -> str:
    h = hashlib.sha256()
    with open(path, "rb") as f:
        for block in iter(lambda: f.read(65536), b""):
            h.update(block)
    return h.hexdigest()


def get_language_from_ext(ext: str) -> str:
    ext = ext.lower()
    mapping = {
        ".py": "python",
        ".ts": "typescript",
        ".tsx": "tsx",
        ".js": "javascript",
        ".jsx": "jsx",
        ".json": "json",
        ".yml": "yaml",
        ".yaml": "yaml",
        ".md": "markdown",
        ".txt": "text",
        ".sql": "sql",
        ".pli": "pli",
        ".pl1": "pli",
        ".jcl": "jcl",
    }
    return mapping.get(ext, ext.strip("."))


def chunk_text_by_lines(text: str, max_chars: int = MAX_CHARS_PER_CHUNK):
    lines = text.splitlines(keepends=True)
    chunk = []
    length = 0
    for line in lines:
        line_len = len(line)
        if line_len >= max_chars:
            if chunk:
                yield "".join(chunk)
                chunk = []
                length = 0
            yield line
            continue

        if length + line_len > max_chars and chunk:
            yield "".join(chunk)
            chunk = [line]
            length = line_len
        else:
            chunk.append(line)
            length += line_len

    if chunk:
        yield "".join(chunk)


def get_or_create_project(conn, name: str, root_dir: str) -> int:
    cur = conn.cursor()
    cur.execute("SELECT id FROM projects WHERE name = ?", (name,))
    row = cur.fetchone()
    if row:
        return row[0]

    now = datetime.utcnow().isoformat()
    cur.execute(
        "INSERT INTO projects (name, root_dir, created_at) VALUES (?, ?, ?)",
        (name, root_dir, now),
    )
    conn.commit()
    return cur.lastrowid


def get_project(conn, name: str):
    cur = conn.cursor()
    cur.execute(
        "SELECT id, root_dir FROM projects WHERE name = ?",
        (name,),
    )
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Nincs ilyen projekt: {name}")
    return {"id": row[0], "root_dir": row[1]}


def upsert_document(conn, project_id: int, rel_path: str, file_hash: str, language: str):
    """
    Visszatér: (document_id, changed_bool)
    """
    cur = conn.cursor()
    cur.execute(
        "SELECT id, file_hash FROM documents WHERE project_id = ? AND file_path = ?",
        (project_id, rel_path),
    )
    row = cur.fetchone()
    now = datetime.utcnow().isoformat()

    if row:
        doc_id, old_hash = row
        if old_hash == file_hash:
            return doc_id, False  # nem változott
        # frissítjük és töröljük a régi chunkokat
        cur.execute(
            """
            UPDATE documents
            SET file_hash = ?, language = ?, last_indexed_at = ?
            WHERE id = ?
            """,
            (file_hash, language, now, doc_id),
        )
        cur.execute("DELETE FROM chunks WHERE document_id = ?", (doc_id,))
        conn.commit()
        return doc_id, True

    # új dokumentum
    cur.execute(
        """
        INSERT INTO documents (project_id, file_path, file_hash, language, last_indexed_at)
        VALUES (?, ?, ?, ?, ?)
        """,
        (project_id, rel_path, file_hash, language, now),
    )
    doc_id = cur.lastrowid
    conn.commit()
    return doc_id, True


def cosine_sim(v1, v2):
    dot = 0.0
    n1 = 0.0
    n2 = 0.0
    for a, b in zip(v1, v2):
        dot += a * b
        n1 += a * a
        n2 += b * b
    if n1 == 0 or n2 == 0:
        return 0.0
    return dot / (math.sqrt(n1) * math.sqrt(n2))


# -----------------------------------------
# Indexelés
# -----------------------------------------

def index_project(project_name: str, root_dir: str):
    root_dir = os.path.abspath(root_dir)
    print(f"[info] Projekt: {project_name}")
    print(f"[info] Root dir: {root_dir}")

    client = OpenAI()
    conn = get_conn()
    init_db(conn)

    project_id = get_or_create_project(conn, project_name, root_dir)

    total_files = 0
    indexed_files = 0
    skipped_unchanged = 0
    total_chunks = 0

    chunks_batch = []

    for dirpath, dirnames, filenames in os.walk(root_dir):
        # NAGY, FELESLEGES KÖNYVTÁRAK KIHAGYÁSA
        dirnames[:] = [
            d for d in dirnames
            if d not in (
                "node_modules",
                ".git",
                ".venv",
                "venv",
                "__pycache__",
                "dist",
                "build"
            )
        ]

        for filename in filenames:
            full_path = os.path.join(dirpath, filename)
            ext = os.path.splitext(filename)[1].lower()
            if ext not in ALLOWED_EXTS:
                continue

            total_files += 1
            rel_path = os.path.relpath(full_path, root_dir)

            try:
                file_hash = sha256_file(full_path)
            except Exception as e:
                print(f"[warn] Nem tudom olvasni (hash): {full_path} ({e})")
                continue

            language = get_language_from_ext(ext)
            doc_id, changed = upsert_document(conn, project_id, rel_path, file_hash, language)

            if not changed:
                skipped_unchanged += 1
                continue

            indexed_files += 1

            try:
                with open(full_path, "r", encoding="utf-8", errors="ignore") as f:
                    text = f.read()
            except Exception as e:
                print(f"[warn] Nem tudom olvasni szövegként: {full_path} ({e})")
                continue

            chunk_index = 0
            for chunk in chunk_text_by_lines(text, MAX_CHARS_PER_CHUNK):
                if not chunk.strip():
                    continue

                chunks_batch.append(
                    {
                        "document_id": doc_id,
                        "chunk_index": chunk_index,
                        "content": chunk,
                    }
                )
                chunk_index += 1
                total_chunks += 1

                if len(chunks_batch) >= BATCH_SIZE:
                    flush_batch(conn, client, chunks_batch)
                    chunks_batch = []

    if chunks_batch:
        flush_batch(conn, client, chunks_batch)

    print(f"[done] Összes fájl (megengedett ext): {total_files}")
    print(f"[done] Indexelt (új / változott): {indexed_files}")
    print(f"[done] Változatlanul kihagyva: {skipped_unchanged}")
    print(f"[done] Összes chunk: {total_chunks}")
    
    return {
        "total_files": total_files,
        "indexed_files": indexed_files,
        "skipped_unchanged": skipped_unchanged,
        "deleted_files": 0,
        "total_chunks": total_chunks,
    }


def index_single_file(project_name: str, root_dir: str, rel_path: str):
    """
    Egyetlen fájl indexelése/frissítése.
    Mentéskor automatikusan hívódik - gyors, mert csak egy fájlt dolgoz fel.
    """
    root_dir = os.path.abspath(root_dir)
    full_path = os.path.join(root_dir, rel_path)
    
    # Ellenőrzések
    if not os.path.isfile(full_path):
        print(f"[single-index] Fájl nem létezik: {full_path}")
        return {"status": "skipped", "reason": "file_not_found"}
    
    _, ext = os.path.splitext(rel_path)
    ext = ext.lower()
    
    if ext not in ALLOWED_EXTS:
        print(f"[single-index] Nem támogatott kiterjesztés: {ext}")
        return {"status": "skipped", "reason": "unsupported_extension"}
    
    try:
        client = OpenAI()
        conn = get_conn()
        init_db(conn)
        
        # Projekt lekérése/létrehozása
        project_id = get_or_create_project(conn, project_name, root_dir)
        
        # Fájl hash
        file_hash = sha256_file(full_path)
        language = get_language_from_ext(ext)
        
        # Dokumentum frissítése
        doc_id, changed = upsert_document(conn, project_id, rel_path, file_hash, language)
        
        if not changed:
            print(f"[single-index] Változatlan: {rel_path}")
            return {"status": "unchanged"}
        
        # Fájl beolvasása és chunkolása
        with open(full_path, "r", encoding="utf-8", errors="replace") as f:
            content = f.read()
        
        chunks_content = chunk_text(content)
        
        if not chunks_content:
            print(f"[single-index] Üres fájl: {rel_path}")
            return {"status": "empty"}
        
        # Embedding generálás
        chunks_batch = []
        for idx, chunk in enumerate(chunks_content):
            chunks_batch.append({
                "document_id": doc_id,
                "chunk_index": idx,
                "content": chunk,
            })
        
        # Batch embedding
        flush_batch(conn, client, chunks_batch)
        
        print(f"[single-index] Indexelve: {rel_path} ({len(chunks_content)} chunk)")
        return {
            "status": "indexed",
            "chunks": len(chunks_content),
        }
        
    except Exception as e:
        print(f"[single-index] Hiba: {rel_path} - {e}")
        return {"status": "error", "error": str(e)}


def flush_batch(conn, client, chunks_batch):
    texts = [c["content"] for c in chunks_batch]
    resp = client.embeddings.create(
        model=OPENAI_MODEL,
        input=texts,
    )
    embs = [d.embedding for d in resp.data]

    now = datetime.utcnow().isoformat()
    cur = conn.cursor()
    for c, emb in zip(chunks_batch, embs):
        cur.execute(
            """
            INSERT INTO chunks (document_id, chunk_index, content, embedding_json, created_at)
            VALUES (?, ?, ?, ?, ?)
            """,
            (
                c["document_id"],
                c["chunk_index"],
                c["content"],
                json.dumps(emb),
                now,
            ),
        )
    conn.commit()
    print(f"[info] {len(chunks_batch)} chunk beszúrva.")


# -----------------------------------------
# Lekérdezés
# -----------------------------------------

def query_project(project_name: str, query: str, top_k: int = 5):
    client = OpenAI()
    conn = get_conn()
    init_db(conn)

    # Projekt azonosítás
    cur = conn.cursor()
    cur.execute("SELECT id FROM projects WHERE name = ?", (project_name,))
    row = cur.fetchone()
    if not row:
        raise ValueError(f"Nincs ilyen projekt: {project_name}")
    project_id = row[0]

    # Lekérdezés embedding
    q_emb = client.embeddings.create(
        model=OPENAI_MODEL,
        input=[query],
    ).data[0].embedding

    # Összes chunk betöltése adott projekthez
    cur.execute(
        """
        SELECT c.content, c.embedding_json, d.file_path, c.chunk_index
        FROM chunks c
        JOIN documents d ON c.document_id = d.id
        WHERE d.project_id = ?
        """,
        (project_id,),
    )
    rows = cur.fetchall()

    scored = []
    for content, emb_json, file_path, chunk_index in rows:
        emb = json.loads(emb_json)
        score = cosine_sim(q_emb, emb)
        scored.append(
            {
                "content": content,
                "file_path": file_path,
                "chunk_index": chunk_index,
                "score": score,
            }
        )

    scored.sort(key=lambda x: x["score"], reverse=True)
    return scored[:top_k]


# -----------------------------------------
# Fájlkeresés név alapján
# -----------------------------------------

def find_files_by_name(project_name: str, file_patterns: list, root_dir: str = None) -> list:
    """
    Fájlok keresése név/minta alapján a projekt indexben.
    
    Args:
        project_name: A projekt neve a vector store-ban
        file_patterns: Lista a keresendő fájlnév mintákból
        root_dir: Opcionális root directory (nem használjuk, de kompatibilitás miatt van)
    
    Returns:
        Lista chunk dict-ekből: [{"content": ..., "file_path": ..., "chunk_index": ..., "score": 1.0}]
    """
    conn = get_conn()
    init_db(conn)
    
    cur = conn.cursor()
    cur.execute("SELECT id FROM projects WHERE name = ?", (project_name,))
    row = cur.fetchone()
    if not row:
        print(f"[find_files_by_name] Nincs ilyen projekt: {project_name}")
        return []
    
    project_id = row[0]
    
    results = []
    for pattern in file_patterns:
        pattern_lower = pattern.lower()
        # Keresés a fájlnevekben
        cur.execute(
            """
            SELECT c.content, d.file_path, c.chunk_index
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE d.project_id = ?
            AND LOWER(d.file_path) LIKE ?
            ORDER BY c.chunk_index
            """,
            (project_id, f"%{pattern_lower}%"),
        )
        
        for content, file_path, chunk_index in cur.fetchall():
            results.append({
                "content": content,
                "file_path": file_path,
                "chunk_index": chunk_index,
                "score": 1.0,  # Explicit keresés, magas relevancia
            })
    
    # Duplikátumok eltávolítása (fájl + chunk_index alapján)
    seen = set()
    unique_results = []
    for r in results:
        key = (r["file_path"], r["chunk_index"])
        if key not in seen:
            seen.add(key)
            unique_results.append(r)
    
    return unique_results


def get_all_project_files(project_name: str, max_files: int = 50, prioritize_main: bool = True) -> list:
    """
    Az összes (vagy legfontosabb) projektfájl chunk-jainak lekérdezése.
    
    Args:
        project_name: A projekt neve
        max_files: Maximum hány fájlból kérjünk chunk-okat
        prioritize_main: Ha True, a "fő" fájlokat (main.py, index.ts, App.tsx, stb.) előre veszi
    
    Returns:
        Lista chunk dict-ekből
    """
    conn = get_conn()
    init_db(conn)
    
    cur = conn.cursor()
    cur.execute("SELECT id FROM projects WHERE name = ?", (project_name,))
    row = cur.fetchone()
    if not row:
        print(f"[get_all_project_files] Nincs ilyen projekt: {project_name}")
        return []
    
    project_id = row[0]
    
    # Fájlok lekérdezése
    cur.execute(
        """
        SELECT DISTINCT d.file_path
        FROM documents d
        WHERE d.project_id = ?
        """,
        (project_id,),
    )
    
    all_files = [r[0] for r in cur.fetchall()]
    
    # Prioritizálás: fontosabb fájlok előre
    if prioritize_main:
        priority_patterns = [
            "main.py", "app.py", "index.ts", "index.js", "App.tsx", "App.jsx",
            "readme", "README", "config", "settings",
            "routes", "api", "views", "models", "schemas",
        ]
        
        def file_priority(path):
            path_lower = path.lower()
            for i, pattern in enumerate(priority_patterns):
                if pattern.lower() in path_lower:
                    return i
            return len(priority_patterns) + 1
        
        all_files.sort(key=file_priority)
    
    # Limitálás
    selected_files = all_files[:max_files]
    
    # Chunk-ok lekérdezése a kiválasztott fájlokhoz
    results = []
    for file_path in selected_files:
        cur.execute(
            """
            SELECT c.content, d.file_path, c.chunk_index
            FROM chunks c
            JOIN documents d ON c.document_id = d.id
            WHERE d.project_id = ? AND d.file_path = ?
            ORDER BY c.chunk_index
            LIMIT 3  -- Max 3 chunk per fájl
            """,
            (project_id, file_path),
        )
        
        for content, fp, chunk_index in cur.fetchall():
            results.append({
                "content": content,
                "file_path": fp,
                "chunk_index": chunk_index,
                "score": 0.8,  # Általános keresés, közepes relevancia
            })
    
    return results


# -----------------------------------------
# CLI
# -----------------------------------------

def main():
    parser = argparse.ArgumentParser(description="Saját vektoros store (SQLite) kódbázis indexeléshez és kereséshez.")
    parser.add_argument("--mode", choices=["index", "query"], required=True, help="index vagy query")
    parser.add_argument("--project-name", required=True, help="Projekt neve")
    parser.add_argument("--root-dir", help="Projekt root mappa (index módnál kötelező)")
    parser.add_argument("--query", help="Lekérdezés szövege (query módban kötelező)")
    parser.add_argument("--top-k", type=int, default=5, help="Találatok száma query módban")
    args = parser.parse_args()

    if args.mode == "index":
        if not args.root_dir:
            print("index módhoz kell a --root-dir")
            raise SystemExit(1)
        index_project(args.project_name, args.root_dir)
    else:
        if not args.query:
            print("query módhoz kell a --query")
            raise SystemExit(1)
        results = query_project(args.project_name, args.query, top_k=args.top_k)
        for r in results:
            print(f"[{r['file_path']}#{r['chunk_index']}] score={r['score']:.4f}")
            print(r["content"])
            print("-" * 60)


if __name__ == "__main__":
    main()
