import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

# RAG (Vector Store) beállítások
# Ha False, a fájl mentéskor nem fut automatikus indexelés
RAG_ENABLED = os.getenv("RAG_ENABLED", "true").lower() in ("true", "1", "yes")
RAG_AUTO_INDEX_ON_SAVE = os.getenv("RAG_AUTO_INDEX_ON_SAVE", "true").lower() in ("true", "1", "yes")

def _parse_csv_env(name: str) -> list[str]:
    """ENV változó vesszővel elválasztott listává alakítása"""
    raw = os.getenv(name, "")
    if raw.strip() == "*":
        return ["*"]
    return [x.strip() for x in raw.split(",") if x.strip()]

FRONTEND_ORIGINS = _parse_csv_env("FRONTEND_ORIGINS")
