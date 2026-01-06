"""
RAG Helper - Smart Retrieval-Augmented Generation

Intelligens nagy fájl kezelés:
1. Automatikusan dönt: teljes fájl vs RAG
2. Token-aware chunking
3. Relevancia alapú context építés
"""

import os
import sys
from typing import List, Dict, Optional, Tuple

# Backend path hozzáadása
BACKEND_DIR = os.path.dirname(os.path.dirname(__file__))
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

try:
    from vector_store import query_project, index_single_file, find_files_by_name, get_all_project_files
    HAS_VECTOR_STORE = True
except ImportError:
    HAS_VECTOR_STORE = False
    print("[RAG] Vector store not available")

try:
    from .token_manager import get_token_manager, TokenManager
    HAS_TOKEN_MANAGER = True
except ImportError:
    HAS_TOKEN_MANAGER = False


# =====================================
#   CONSTANTS
# =====================================

# Token thresholds
SMALL_FILE_TOKENS = 2000      # < 2k token: teljes fájl
MEDIUM_FILE_TOKENS = 10000    # 2k-10k token: összefoglalás + részletek
LARGE_FILE_TOKENS = 30000     # 10k-30k token: csak RAG
HUGE_FILE_TOKENS = 50000      # > 50k token: figyelmeztető

# Context budget allocation
MAX_CONTEXT_TOKENS = 60000    # Max ~60k token a kontextusra (marad ~60k+ output-ra)
FILE_CONTEXT_RATIO = 0.6      # 60% a fájl kontextusra
RAG_CONTEXT_RATIO = 0.3       # 30% RAG részletekre
HISTORY_RATIO = 0.1           # 10% chat history-ra


class RAGHelper:
    """
    Smart RAG kezelő - automatikusan dönt a fájl mérete alapján
    """
    
    def __init__(self, project_name: str, project_root: str, model: str = "gpt-4o"):
        self.project_name = project_name
        self.project_root = project_root
        self.model = model
        
        if HAS_TOKEN_MANAGER:
            self.token_manager = get_token_manager(model)
        else:
            self.token_manager = None
    
    def count_tokens(self, text: str) -> int:
        """Token számolás"""
        if self.token_manager:
            return self.token_manager.count_tokens(text)
        # Fallback: ~4 karakter = 1 token
        return len(text) // 4
    
    def get_file_strategy(self, content: str) -> Dict:
        """
        Meghatározza a fájl kezelési stratégiáját a méret alapján.
        
        Returns:
            {
                "strategy": "full" | "summary_plus_rag" | "rag_only" | "warning",
                "tokens": int,
                "recommendation": str
            }
        """
        tokens = self.count_tokens(content)
        
        if tokens < SMALL_FILE_TOKENS:
            return {
                "strategy": "full",
                "tokens": tokens,
                "recommendation": "Teljes fájl betölthető"
            }
        elif tokens < MEDIUM_FILE_TOKENS:
            return {
                "strategy": "summary_plus_rag",
                "tokens": tokens,
                "recommendation": "Összefoglalás + RAG keresés ajánlott"
            }
        elif tokens < LARGE_FILE_TOKENS:
            return {
                "strategy": "rag_only",
                "tokens": tokens,
                "recommendation": "Csak RAG keresés - túl nagy a teljes betöltéshez"
            }
        else:
            return {
                "strategy": "warning",
                "tokens": tokens,
                "recommendation": f"⚠️ NAGYON NAGY FÁJL ({tokens} token) - chunked processing szükséges"
            }
    
    def build_smart_context(
        self,
        query: str,
        active_file_path: Optional[str] = None,
        active_file_content: Optional[str] = None,
        max_tokens: int = MAX_CONTEXT_TOKENS
    ) -> Dict:
        """
        Intelligens kontextus építés.
        
        Returns:
            {
                "context": str,          # A végső kontextus szöveg
                "tokens_used": int,
                "strategy_used": str,
                "files_included": List[str],
                "rag_chunks": int
            }
        """
        context_parts = []
        files_included = []
        rag_chunks_count = 0
        tokens_used = 0
        strategy_used = "none"
        
        # Budget kiszámítása
        file_budget = int(max_tokens * FILE_CONTEXT_RATIO)
        rag_budget = int(max_tokens * RAG_CONTEXT_RATIO)
        
        # 1. Aktív fájl kezelése
        if active_file_content:
            strategy = self.get_file_strategy(active_file_content)
            strategy_used = strategy["strategy"]
            
            if strategy["strategy"] == "full":
                # Teljes fájl
                context_parts.append(f"=== AKTÍV FÁJL: {active_file_path} ===\n{active_file_content}\n")
                tokens_used += strategy["tokens"]
                files_included.append(active_file_path)
                
            elif strategy["strategy"] == "summary_plus_rag":
                # Eleje + vége + RAG
                lines = active_file_content.split('\n')
                summary = self._create_file_summary(lines, active_file_path, file_budget // 2)
                context_parts.append(summary)
                tokens_used += self.count_tokens(summary)
                files_included.append(active_file_path)
                
                # RAG search a részletekért
                if HAS_VECTOR_STORE:
                    rag_results = self._rag_search(query, rag_budget // 2)
                    if rag_results:
                        context_parts.append("\n=== RELEVÁNS KÓDRÉSZLETEK (RAG) ===\n")
                        context_parts.append(rag_results["context"])
                        tokens_used += rag_results["tokens"]
                        rag_chunks_count += rag_results["chunk_count"]
                        
            elif strategy["strategy"] in ("rag_only", "warning"):
                # Csak struktúra + RAG
                lines = active_file_content.split('\n')
                structure = self._extract_structure(lines, active_file_path)
                context_parts.append(structure)
                tokens_used += self.count_tokens(structure)
                files_included.append(f"{active_file_path} (struktúra)")
                
                # RAG search
                if HAS_VECTOR_STORE:
                    rag_results = self._rag_search(query, rag_budget)
                    if rag_results:
                        context_parts.append("\n=== RELEVÁNS KÓDRÉSZLETEK (RAG) ===\n")
                        context_parts.append(rag_results["context"])
                        tokens_used += rag_results["tokens"]
                        rag_chunks_count += rag_results["chunk_count"]
        
        else:
            # Nincs aktív fájl - csak RAG
            if HAS_VECTOR_STORE:
                rag_results = self._rag_search(query, rag_budget)
                if rag_results:
                    context_parts.append("=== RELEVÁNS KÓDRÉSZLETEK (RAG) ===\n")
                    context_parts.append(rag_results["context"])
                    tokens_used += rag_results["tokens"]
                    rag_chunks_count += rag_results["chunk_count"]
                    strategy_used = "rag_only"
        
        return {
            "context": "\n".join(context_parts),
            "tokens_used": tokens_used,
            "strategy_used": strategy_used,
            "files_included": files_included,
            "rag_chunks": rag_chunks_count
        }
    
    def _create_file_summary(self, lines: List[str], file_path: str, max_tokens: int) -> str:
        """Fájl összefoglalás: eleje + vége + statisztika"""
        total_lines = len(lines)
        
        # Számítsuk ki hány sort férünk bele
        tokens_per_line = 10  # Becslés
        available_lines = max_tokens // tokens_per_line
        
        head_lines = min(available_lines // 2, 100)
        tail_lines = min(available_lines // 2, 50)
        
        summary_parts = [
            f"=== FÁJL ÖSSZEFOGLALÁS: {file_path} ===",
            f"Összesen: {total_lines} sor",
            "",
            f"--- ELEJE ({head_lines} sor) ---",
            "\n".join(lines[:head_lines]),
            "",
            f"... [{total_lines - head_lines - tail_lines} sor kihagyva] ...",
            "",
            f"--- VÉGE ({tail_lines} sor) ---",
            "\n".join(lines[-tail_lines:]),
        ]
        
        return "\n".join(summary_parts)
    
    def _extract_structure(self, lines: List[str], file_path: str) -> str:
        """Kód struktúra kinyerése (függvények, osztályok)"""
        structure_lines = [
            f"=== FÁJL STRUKTÚRA: {file_path} ({len(lines)} sor) ===",
            ""
        ]
        
        # Python/JS/TS struktúra elemzés
        for i, line in enumerate(lines, 1):
            stripped = line.strip()
            
            # Python
            if stripped.startswith(('def ', 'class ', 'async def ')):
                structure_lines.append(f"L{i}: {stripped}")
            # JavaScript/TypeScript
            elif stripped.startswith(('function ', 'const ', 'export ', 'class ')):
                if 'function' in stripped or '=>' in stripped or 'class ' in stripped:
                    structure_lines.append(f"L{i}: {stripped[:100]}")
            # Comments that look like section headers
            elif stripped.startswith(('# ===', '// ===', '/* ===', '# ---', '// ---')):
                structure_lines.append(f"L{i}: {stripped}")
        
        if len(structure_lines) <= 2:
            structure_lines.append("(Nem találtam explicit struktúra elemeket)")
        
        return "\n".join(structure_lines)
    
    def _rag_search(self, query: str, max_tokens: int) -> Optional[Dict]:
        """RAG keresés végrehajtása"""
        if not HAS_VECTOR_STORE:
            return None
        
        try:
            # Semantic search
            results = query_project(self.project_name, query, top_k=10)
            
            if not results:
                return None
            
            context_parts = []
            tokens_used = 0
            chunks_included = 0
            
            for r in results:
                chunk_text = f"[{r['file_path']}:{r['chunk_index']}] (relevancia: {r['score']:.2f})\n{r['content']}\n---\n"
                chunk_tokens = self.count_tokens(chunk_text)
                
                if tokens_used + chunk_tokens > max_tokens:
                    break
                
                context_parts.append(chunk_text)
                tokens_used += chunk_tokens
                chunks_included += 1
            
            if not context_parts:
                return None
            
            return {
                "context": "\n".join(context_parts),
                "tokens": tokens_used,
                "chunk_count": chunks_included
            }
            
        except Exception as e:
            print(f"[RAG] Search error: {e}")
            return None
    
    def search_relevant_code(self, query: str, top_k: int = 5) -> List[Dict]:
        """
        Releváns kód keresése a projektben.
        Használható az agentic tools-ból.
        """
        if not HAS_VECTOR_STORE:
            return []
        
        try:
            return query_project(self.project_name, query, top_k=top_k)
        except Exception as e:
            print(f"[RAG] Search error: {e}")
            return []
    
    def index_file(self, rel_path: str) -> Dict:
        """Egyetlen fájl indexelése (mentés után)"""
        if not HAS_VECTOR_STORE:
            return {"status": "skipped", "reason": "no_vector_store"}
        
        try:
            return index_single_file(self.project_name, self.project_root, rel_path)
        except Exception as e:
            return {"status": "error", "error": str(e)}


def get_rag_helper(project_name: str, project_root: str, model: str = "gpt-4o") -> RAGHelper:
    """Factory function for RAGHelper"""
    return RAGHelper(project_name, project_root, model)


# =====================================
#   CONVENIENCE FUNCTIONS
# =====================================

def should_use_rag(content: str, model: str = "gpt-4o") -> bool:
    """Egyszerű döntés: kell-e RAG a fájlhoz?"""
    if HAS_TOKEN_MANAGER:
        tm = get_token_manager(model)
        tokens = tm.count_tokens(content)
    else:
        tokens = len(content) // 4
    
    return tokens > SMALL_FILE_TOKENS


def get_file_handling_recommendation(content: str, model: str = "gpt-4o") -> str:
    """Ajánlás a fájl kezelésére"""
    if HAS_TOKEN_MANAGER:
        tm = get_token_manager(model)
        tokens = tm.count_tokens(content)
    else:
        tokens = len(content) // 4
    
    if tokens < SMALL_FILE_TOKENS:
        return f"✅ Kis fájl ({tokens} token) - teljes betöltés OK"
    elif tokens < MEDIUM_FILE_TOKENS:
        return f"⚠️ Közepes fájl ({tokens} token) - összefoglalás + RAG ajánlott"
    elif tokens < LARGE_FILE_TOKENS:
        return f"🔶 Nagy fájl ({tokens} token) - csak RAG keresés"
    else:
        return f"🔴 NAGYON NAGY ({tokens} token) - chunked processing szükséges!"

