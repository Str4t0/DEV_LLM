"""
Model Router - Intelligens modell választás feladattípus alapján

Költség + teljesítmény optimalizálás:
- gpt-4o: komplex gondolkodás, döntések
- gpt-4o-mini: összefoglalás, routing, egyszerű feladatok
- text-embedding-3-large: embedding
"""

from typing import Optional, Literal
from dataclasses import dataclass
from enum import Enum


class TaskType(Enum):
    """Feladat típusok"""
    # Komplex - gpt-4o kell
    CODE_GENERATION = "code_generation"
    CODE_REVIEW = "code_review"
    DEBUGGING = "debugging"
    ARCHITECTURE = "architecture"
    COMPLEX_REASONING = "complex_reasoning"
    AGENTIC_EXECUTION = "agentic_execution"
    
    # Közepes - mindkettő jó
    CODE_EXPLANATION = "code_explanation"
    DOCUMENTATION = "documentation"
    TRANSLATION = "translation"
    
    # Egyszerű - gpt-4o-mini elég
    SUMMARIZATION = "summarization"
    ROUTING = "routing"
    CLASSIFICATION = "classification"
    SIMPLE_QA = "simple_qa"
    FORMATTING = "formatting"
    TOOL_SELECTION = "tool_selection"


@dataclass
class ModelConfig:
    """Model konfiguráció"""
    name: str
    max_tokens: int
    cost_per_1k_input: float  # USD
    cost_per_1k_output: float
    strengths: list


# Model definíciók
MODELS = {
    "gpt-4o": ModelConfig(
        name="gpt-4o",
        max_tokens=128000,
        cost_per_1k_input=0.005,
        cost_per_1k_output=0.015,
        strengths=["reasoning", "code", "complex tasks", "agentic"]
    ),
    "gpt-4o-mini": ModelConfig(
        name="gpt-4o-mini",
        max_tokens=128000,
        cost_per_1k_input=0.00015,
        cost_per_1k_output=0.0006,
        strengths=["speed", "cost", "simple tasks", "summaries"]
    ),
    "gpt-4-turbo": ModelConfig(
        name="gpt-4-turbo",
        max_tokens=128000,
        cost_per_1k_input=0.01,
        cost_per_1k_output=0.03,
        strengths=["reasoning", "code", "legacy"]
    ),
}

# Feladat -> Model mapping
TASK_MODEL_MAP = {
    # Komplex feladatok - mindig gpt-4o
    TaskType.CODE_GENERATION: "gpt-4o",
    TaskType.CODE_REVIEW: "gpt-4o",
    TaskType.DEBUGGING: "gpt-4o",
    TaskType.ARCHITECTURE: "gpt-4o",
    TaskType.COMPLEX_REASONING: "gpt-4o",
    TaskType.AGENTIC_EXECUTION: "gpt-4o",
    
    # Közepes - alapból gpt-4o, de mini is működhet
    TaskType.CODE_EXPLANATION: "gpt-4o",
    TaskType.DOCUMENTATION: "gpt-4o-mini",
    TaskType.TRANSLATION: "gpt-4o-mini",
    
    # Egyszerű - gpt-4o-mini
    TaskType.SUMMARIZATION: "gpt-4o-mini",
    TaskType.ROUTING: "gpt-4o-mini",
    TaskType.CLASSIFICATION: "gpt-4o-mini",
    TaskType.SIMPLE_QA: "gpt-4o-mini",
    TaskType.FORMATTING: "gpt-4o-mini",
    TaskType.TOOL_SELECTION: "gpt-4o-mini",
}


class ModelRouter:
    """
    Intelligens model router - automatikusan választja a megfelelő modellt
    """
    
    def __init__(self, default_model: str = "gpt-4o", force_model: str = None):
        """
        Args:
            default_model: Alapértelmezett model ha nem tudjuk eldönteni
            force_model: Ha megadva, mindig ezt használja (override)
        """
        self.default_model = default_model
        self.force_model = force_model
        self.usage_stats = {
            "gpt-4o": {"calls": 0, "input_tokens": 0, "output_tokens": 0},
            "gpt-4o-mini": {"calls": 0, "input_tokens": 0, "output_tokens": 0},
        }
    
    def get_model_for_task(self, task_type: TaskType) -> str:
        """Modell választás feladat típus alapján"""
        if self.force_model:
            return self.force_model
        return TASK_MODEL_MAP.get(task_type, self.default_model)
    
    def classify_task(self, user_message: str, context: str = "") -> TaskType:
        """
        Feladat típus automatikus felismerése az üzenet alapján.
        
        Ez egy egyszerű heurisztikus megközelítés - később LLM-mel is lehetne.
        """
        message_lower = user_message.lower()
        
        # Kód generálás jelzők
        code_gen_keywords = [
            "írj", "write", "create", "implement", "add", "hozz létre",
            "készíts", "make", "build", "generate", "új funkció", "new function",
            "add function", "új osztály", "new class"
        ]
        if any(kw in message_lower for kw in code_gen_keywords):
            return TaskType.CODE_GENERATION
        
        # Debugging jelzők
        debug_keywords = [
            "hiba", "error", "bug", "fix", "javít", "debug", "nem működik",
            "doesn't work", "broken", "issue", "problem", "wrong"
        ]
        if any(kw in message_lower for kw in debug_keywords):
            return TaskType.DEBUGGING
        
        # Code review jelzők
        review_keywords = [
            "review", "ellenőriz", "check", "nézd meg", "look at",
            "véleményez", "mit gondolsz", "what do you think",
            "javaslat", "suggestion", "improve", "fejleszt"
        ]
        if any(kw in message_lower for kw in review_keywords):
            return TaskType.CODE_REVIEW
        
        # Összefoglalás jelzők
        summary_keywords = [
            "összefoglal", "summarize", "summary", "foglald össze",
            "röviden", "briefly", "kivonat", "tl;dr"
        ]
        if any(kw in message_lower for kw in summary_keywords):
            return TaskType.SUMMARIZATION
        
        # Fordítás jelzők (komment fordítás, stb.)
        translate_keywords = [
            "fordít", "translate", "hungarian", "english", "magyar",
            "angol", "komment", "comment"
        ]
        if any(kw in message_lower for kw in translate_keywords):
            return TaskType.TRANSLATION
        
        # Magyarázat jelzők
        explain_keywords = [
            "magyaráz", "explain", "mi ez", "what is", "how does",
            "hogyan működik", "explain this", "mit csinál"
        ]
        if any(kw in message_lower for kw in explain_keywords):
            return TaskType.CODE_EXPLANATION
        
        # Egyszerű kérdés jelzők
        simple_qa_keywords = [
            "mi a", "what is the", "hány", "how many", "melyik",
            "which", "hol van", "where is"
        ]
        if any(kw in message_lower for kw in simple_qa_keywords):
            return TaskType.SIMPLE_QA
        
        # Default: komplex reasoning (biztonságos választás)
        return TaskType.COMPLEX_REASONING
    
    def route(self, user_message: str, context: str = "", prefer_cheap: bool = False) -> str:
        """
        Automatikus model routing.
        
        Args:
            user_message: Felhasználó üzenete
            context: Opcionális kontextus
            prefer_cheap: Ha True, olcsóbb modellt preferál ha lehetséges
        
        Returns:
            Model neve
        """
        if self.force_model:
            return self.force_model
        
        task_type = self.classify_task(user_message, context)
        model = self.get_model_for_task(task_type)
        
        # Ha olcsóbb modellt preferálunk és nem kritikus a feladat
        if prefer_cheap and task_type not in [
            TaskType.CODE_GENERATION,
            TaskType.DEBUGGING,
            TaskType.AGENTIC_EXECUTION
        ]:
            model = "gpt-4o-mini"
        
        print(f"[MODEL ROUTER] Task: {task_type.value} -> Model: {model}")
        return model
    
    def record_usage(self, model: str, input_tokens: int, output_tokens: int):
        """Használat rögzítése költség követéshez"""
        if model in self.usage_stats:
            self.usage_stats[model]["calls"] += 1
            self.usage_stats[model]["input_tokens"] += input_tokens
            self.usage_stats[model]["output_tokens"] += output_tokens
    
    def get_cost_estimate(self) -> dict:
        """Becsült költség lekérdezése"""
        total_cost = 0.0
        breakdown = {}
        
        for model_name, stats in self.usage_stats.items():
            if model_name in MODELS:
                config = MODELS[model_name]
                input_cost = (stats["input_tokens"] / 1000) * config.cost_per_1k_input
                output_cost = (stats["output_tokens"] / 1000) * config.cost_per_1k_output
                model_cost = input_cost + output_cost
                total_cost += model_cost
                breakdown[model_name] = {
                    "calls": stats["calls"],
                    "input_tokens": stats["input_tokens"],
                    "output_tokens": stats["output_tokens"],
                    "cost_usd": round(model_cost, 4)
                }
        
        return {
            "total_cost_usd": round(total_cost, 4),
            "breakdown": breakdown
        }


# Singleton instance
_router: Optional[ModelRouter] = None

def get_model_router(default_model: str = "gpt-4o", force_model: str = None) -> ModelRouter:
    """Singleton router lekérése"""
    global _router
    if _router is None:
        _router = ModelRouter(default_model, force_model)
    return _router


# =====================================
#   CONVENIENCE FUNCTIONS
# =====================================

def route_model(user_message: str, context: str = "") -> str:
    """Egyszerű model routing wrapper"""
    router = get_model_router()
    return router.route(user_message, context)


def get_summary_model() -> str:
    """Összefoglaláshoz használandó model"""
    return "gpt-4o-mini"


def get_reasoning_model() -> str:
    """Komplex gondolkodáshoz használandó model"""
    return "gpt-4o"


def get_embedding_model() -> str:
    """Embedding-hez használandó model"""
    return "text-embedding-3-large"


# =====================================
#   DUAL-AGENT ARCHITECTURE
# =====================================
"""
🧠 FŐAGENT (GPT-4o): Gondolkodás, döntés, kód írás, elemzés
🧩 HÁTTÉRAGENT (GPT-4o-mini): Összefoglalás, memória, kontextus tömörítés

Ez biztosítja:
- 128K token limit sosem lesz túllépve
- Költséghatékony működés
- Gyors háttérműveletek
"""

# Model nevek konstansok - DUAL AGENT ARCHITEKTÚRA
# THINKING: komplex feladatok (kódolás, agentic, döntések) - okosabb, lassabb
# WORKER: egyszerű feladatok (összefoglalás, memória) - gyorsabb, olcsóbb
THINKING_MODEL = "gpt-4o"      # Főagent - gondolkodás, agentic mód
WORKER_MODEL = "gpt-4o-mini"   # Háttéragent - összefoglalás, memória

# Kontextus limitek
MAX_MAIN_CONTEXT = 60000  # 60K token a főagentnek (van hely válaszra)
MAX_SUMMARY_CONTEXT = 20000  # 20K összefoglalásra
SUMMARY_TRIGGER_TOKENS = 40000  # Ennél több token esetén tömörítünk


class DualAgentManager:
    """
    Dual-agent manager - koordinálja a fő és háttér agentet.
    
    🧠 FŐAGENT (GPT-4o):
    - Agentic tool calling
    - Kód generálás
    - Komplex döntések
    - Elemzés
    
    🧩 HÁTTÉRAGENT (GPT-4o-mini):
    - Rolling summary generálás
    - Kontextus tömörítés
    - Memória frissítés
    - Fact extraction
    """
    
    def __init__(self, openai_client):
        self.client = openai_client
        self.thinking_model = THINKING_MODEL
        self.worker_model = WORKER_MODEL
        self.context_summary = ""
        self.accumulated_facts = []
        
    def compress_context_with_worker(self, messages: list, max_tokens: int = MAX_SUMMARY_CONTEXT) -> str:
        """
        🧩 HÁTTÉRAGENT: Kontextus tömörítése összefoglalással
        
        A GPT-4o-mini gyorsan és olcsón készít összefoglalót a régebbi üzenetekből.
        """
        if not messages:
            return ""
        
        # Üzenetek szöveggé alakítása
        text_parts = []
        for msg in messages:
            role = msg.get("role", "unknown")
            content = msg.get("content", "")
            if content and role != "system":
                text_parts.append(f"[{role.upper()}]: {content[:2000]}")
        
        context_text = "\n\n".join(text_parts[-20:])  # Utolsó 20 üzenet
        
        if not context_text:
            return ""
        
        try:
            response = self.client.chat.completions.create(
                model=self.worker_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Te egy precíz összefoglaló AI vagy. "
                            "Készíts TÖMÖR összefoglalót a beszélgetésről. "
                            "Fókuszálj: mit kért a user, mit csinált az asszisztens, mi történt a fájlokkal. "
                            "Max 500 szó. Magyar nyelven."
                        )
                    },
                    {
                        "role": "user",
                        "content": f"Foglald össze ezt a beszélgetést:\n\n{context_text}"
                    }
                ],
                max_tokens=800,
                temperature=0.3
            )
            
            summary = response.choices[0].message.content
            print(f"[WORKER AGENT] Context compressed: {len(context_text)} chars -> {len(summary)} chars")
            return summary
            
        except Exception as e:
            print(f"[WORKER AGENT] Compression error: {e}")
            return ""
    
    def extract_facts_with_worker(self, conversation: str) -> list:
        """
        🧩 HÁTTÉRAGENT: Fontos tények kinyerése a beszélgetésből
        """
        try:
            response = self.client.chat.completions.create(
                model=self.worker_model,
                messages=[
                    {
                        "role": "system",
                        "content": (
                            "Nyerd ki a FONTOS TÉNYEKET a beszélgetésből. "
                            "Formátum: JSON lista [{\"fact\": \"...\", \"type\": \"file/decision/preference/bug\"}]. "
                            "Max 10 tény. Csak a legfontosabbak!"
                        )
                    },
                    {
                        "role": "user",
                        "content": conversation[:5000]  # Max 5000 char
                    }
                ],
                max_tokens=500,
                temperature=0.2
            )
            
            import json
            content = response.choices[0].message.content
            # Try to parse JSON
            if "[" in content and "]" in content:
                json_str = content[content.find("["):content.rfind("]")+1]
                facts = json.loads(json_str)
                print(f"[WORKER AGENT] Extracted {len(facts)} facts")
                return facts
            return []
            
        except Exception as e:
            print(f"[WORKER AGENT] Fact extraction error: {e}")
            return []
    
    def should_compress(self, token_count: int) -> bool:
        """Kell-e tömöríteni a kontextust?"""
        return token_count > SUMMARY_TRIGGER_TOKENS
    
    def get_thinking_model(self) -> str:
        """🧠 Főagent model neve"""
        return self.thinking_model
    
    def get_worker_model(self) -> str:
        """🧩 Háttéragent model neve"""
        return self.worker_model
    
    def build_optimized_context(
        self,
        system_prompt: str,
        history: list,
        user_message: str,
        token_manager=None
    ) -> list:
        """
        Optimalizált kontextus építés a dual-agent rendszerrel.
        
        Ha túl nagy a kontextus, a háttéragent tömöríti.
        """
        messages = [{"role": "system", "content": system_prompt}]
        
        # Token számolás
        if token_manager:
            history_tokens = token_manager.count_messages_tokens(
                [{"role": m.get("role", "user"), "content": m.get("content", "")} for m in history]
            )
            
            if self.should_compress(history_tokens):
                print(f"[DUAL AGENT] History too large ({history_tokens} tokens), compressing...")
                
                # Háttéragent tömöríti a régi üzeneteket
                old_messages = history[:-6]  # Régi üzenetek
                recent_messages = history[-6:]  # Utolsó 6 megtartása
                
                if old_messages:
                    summary = self.compress_context_with_worker(old_messages)
                    if summary:
                        messages.append({
                            "role": "system",
                            "content": f"[BESZÉLGETÉS ÖSSZEFOGLALÓ - korábbi üzenetek tömörítve]:\n{summary}"
                        })
                
                # Csak a friss üzenetek
                for msg in recent_messages:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", "")
                    })
            else:
                # Nincs tömörítés, minden üzenet megy
                for msg in history:
                    messages.append({
                        "role": msg.get("role", "user"),
                        "content": msg.get("content", "")
                    })
        else:
            # Nincs token manager, egyszerű hozzáadás
            for msg in history:
                messages.append({
                    "role": msg.get("role", "user"),
                    "content": msg.get("content", "")
                })
        
        # User üzenet mindig megy
        messages.append({"role": "user", "content": user_message})
        
        return messages


# Singleton instance
_dual_agent_manager: DualAgentManager = None


def get_dual_agent_manager(openai_client=None) -> DualAgentManager:
    """Singleton dual agent manager"""
    global _dual_agent_manager
    if _dual_agent_manager is None and openai_client:
        _dual_agent_manager = DualAgentManager(openai_client)
    return _dual_agent_manager


def init_dual_agent(openai_client) -> DualAgentManager:
    """Dual agent inicializálása"""
    global _dual_agent_manager
    _dual_agent_manager = DualAgentManager(openai_client)
    print(f"[DUAL AGENT] Initialized: THINKING={THINKING_MODEL}, WORKER={WORKER_MODEL}")
    return _dual_agent_manager

