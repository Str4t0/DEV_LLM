"""
Token Manager - Token számlálás és kontextus kezelés

Funkciók:
1. Token számlálás (tiktoken)
2. Rolling summary generálás
3. Kontextus méret ellenőrzés
4. Automatikus csonkolás ha szükséges
"""

import tiktoken
from typing import List, Dict, Optional, Tuple
from dataclasses import dataclass
import json

# Model token limitek
MODEL_LIMITS = {
    "gpt-4o": 128000,
    "gpt-4o-mini": 128000,
    "gpt-4-turbo": 128000,
    "gpt-4": 8192,
    "gpt-3.5-turbo": 16385,
}

# Ajánlott output tartalék (válaszra hagyott tokenek)
OUTPUT_RESERVE = {
    "gpt-4o": 16000,
    "gpt-4o-mini": 8000,
    "gpt-4-turbo": 4096,
    "gpt-4": 2048,
    "gpt-3.5-turbo": 2048,
}


@dataclass
class TokenStats:
    """Token statisztikák"""
    total_tokens: int
    system_tokens: int
    history_tokens: int
    context_tokens: int  # kód, fájlok
    user_tokens: int
    available_for_output: int
    model_limit: int
    is_over_limit: bool
    

class TokenManager:
    """Token kezelő osztály"""
    
    def __init__(self, model: str = "gpt-4o"):
        self.model = model
        self.encoding = tiktoken.encoding_for_model(model)
        self.limit = MODEL_LIMITS.get(model, 128000)
        self.output_reserve = OUTPUT_RESERVE.get(model, 8000)
        
    def count_tokens(self, text: str) -> int:
        """Szöveg token számának meghatározása"""
        if not text:
            return 0
        return len(self.encoding.encode(text))
    
    def count_messages_tokens(self, messages: List[Dict]) -> int:
        """OpenAI üzenetlista token számának meghatározása"""
        # Minden üzenethez ~4 token overhead (role, content separators)
        tokens = 0
        for msg in messages:
            tokens += 4  # overhead
            if "content" in msg and msg["content"]:
                tokens += self.count_tokens(msg["content"])
            if "role" in msg:
                tokens += 1
            if "name" in msg:
                tokens += self.count_tokens(msg["name"]) + 1
        tokens += 2  # priming tokens
        return tokens
    
    def analyze_context(
        self,
        system_prompt: str,
        history: List[Dict],
        code_context: str,
        user_message: str
    ) -> TokenStats:
        """Teljes kontextus elemzése"""
        system_tokens = self.count_tokens(system_prompt)
        history_tokens = self.count_messages_tokens(history)
        context_tokens = self.count_tokens(code_context)
        user_tokens = self.count_tokens(user_message)
        
        total = system_tokens + history_tokens + context_tokens + user_tokens
        available = self.limit - total - self.output_reserve
        
        return TokenStats(
            total_tokens=total,
            system_tokens=system_tokens,
            history_tokens=history_tokens,
            context_tokens=context_tokens,
            user_tokens=user_tokens,
            available_for_output=max(0, available),
            model_limit=self.limit,
            is_over_limit=total > (self.limit - self.output_reserve)
        )
    
    def truncate_history(
        self,
        history: List[Dict],
        max_tokens: int,
        keep_last_n: int = 4
    ) -> List[Dict]:
        """
        History csonkolása token limitre.
        Mindig megtartja az utolsó N üzenetet.
        """
        if not history:
            return []
        
        # Utolsó N üzenet mindig marad
        protected = history[-keep_last_n:] if len(history) >= keep_last_n else history
        protected_tokens = self.count_messages_tokens(protected)
        
        if protected_tokens >= max_tokens:
            # Még a védett üzenetek is túl nagyok, vissza kell vágnunk
            return protected[-2:]  # Csak utolsó 2 marad
        
        remaining_budget = max_tokens - protected_tokens
        older = history[:-keep_last_n] if len(history) > keep_last_n else []
        
        # Régebbi üzenetek közül annyit tartunk meg, amennyi belefér
        kept_older = []
        for msg in reversed(older):
            msg_tokens = self.count_messages_tokens([msg])
            if msg_tokens <= remaining_budget:
                kept_older.insert(0, msg)
                remaining_budget -= msg_tokens
            else:
                break
        
        return kept_older + protected
    
    def truncate_code(self, code: str, max_tokens: int, keep_start: int = 50, keep_end: int = 50) -> str:
        """
        Kód csonkolása token limitre.
        Megtartja az elejét és végét, középen jelzi a kihagyást.
        """
        current_tokens = self.count_tokens(code)
        if current_tokens <= max_tokens:
            return code
        
        lines = code.split('\n')
        total_lines = len(lines)
        
        if total_lines <= keep_start + keep_end:
            # Túl rövid a karakterenkénti csonkoláshoz
            return code[:max_tokens * 4]  # ~4 karakter/token becslés
        
        start_lines = lines[:keep_start]
        end_lines = lines[-keep_end:]
        
        middle_marker = f"\n\n// ... [{total_lines - keep_start - keep_end} sor kihagyva - túl nagy fájl] ...\n\n"
        
        truncated = '\n'.join(start_lines) + middle_marker + '\n'.join(end_lines)
        
        # Ellenőrizzük, hogy belefér-e
        if self.count_tokens(truncated) > max_tokens:
            # Még mindig túl nagy, csökkentsük tovább
            return self.truncate_code(code, max_tokens, keep_start // 2, keep_end // 2)
        
        return truncated


class RollingSummary:
    """
    Rolling summary kezelő - összefoglalja a korábbi beszélgetést
    hogy ne kelljen a teljes history-t átadni
    """
    
    def __init__(self, summarize_fn=None):
        """
        summarize_fn: async függvény ami LLM-mel összefoglal
        Ha nincs megadva, egyszerű csonkolást használ
        """
        self.summarize_fn = summarize_fn
        self.current_summary = ""
        self.message_count = 0
        self.summarize_every_n = 10  # N üzenetenként újra összefoglal
        
    async def update(self, new_messages: List[Dict], force: bool = False) -> str:
        """
        Frissíti az összefoglalót ha szükséges.
        Visszaadja az aktuális összefoglalót.
        """
        self.message_count += len(new_messages)
        
        should_summarize = force or (self.message_count >= self.summarize_every_n)
        
        if should_summarize and self.summarize_fn:
            # LLM-mel összefoglalunk
            conversation_text = self._messages_to_text(new_messages)
            
            prompt = f"""Foglald össze TÖMÖREN az alábbi beszélgetés lényegét,
hogy egy LLM később folytatni tudja a munkát.

KORÁBBI ÖSSZEFOGLALÓ:
{self.current_summary or "(nincs)"}

ÚJ BESZÉLGETÉS:
{conversation_text}

ÖSSZEFOGLALÓ (max 500 szó):"""

            self.current_summary = await self.summarize_fn(prompt)
            self.message_count = 0
            
        return self.current_summary
    
    def _messages_to_text(self, messages: List[Dict]) -> str:
        """Üzenetek szöveggé alakítása"""
        lines = []
        for msg in messages:
            role = msg.get("role", "unknown").upper()
            content = msg.get("content", "")[:500]  # Max 500 karakter üzenetenként
            lines.append(f"{role}: {content}")
        return "\n".join(lines)
    
    def get_system_context(self) -> str:
        """Visszaadja a system promptba illeszthető összefoglalót"""
        if not self.current_summary:
            return ""
        return f"""
KORÁBBI BESZÉLGETÉS ÖSSZEFOGLALÓJA:
{self.current_summary}
"""


def estimate_file_tokens(file_path: str, content: str) -> dict:
    """
    Fájl token becslése és ajánlás
    """
    manager = TokenManager()
    tokens = manager.count_tokens(content)
    lines = content.count('\n') + 1
    
    # Ajánlások
    recommendations = []
    
    if tokens > 50000:
        recommendations.append("⚠️ NAGYON NAGY FÁJL - használj RAG-ot vagy chunkolást")
    elif tokens > 20000:
        recommendations.append("⚠️ Nagy fájl - fontold meg a részleges betöltést")
    elif tokens > 10000:
        recommendations.append("ℹ️ Közepes fájl - figyelj a többi kontextusra")
    
    return {
        "file": file_path,
        "tokens": tokens,
        "lines": lines,
        "tokens_per_line": round(tokens / lines, 1) if lines > 0 else 0,
        "recommendations": recommendations,
        "suggested_max_context": min(tokens, 30000),  # Max 30k token egy fájlra
    }


# Singleton instance
_token_manager: Optional[TokenManager] = None

def get_token_manager(model: str = "gpt-4o") -> TokenManager:
    """Singleton token manager lekérése"""
    global _token_manager
    if _token_manager is None or _token_manager.model != model:
        _token_manager = TokenManager(model)
    return _token_manager



