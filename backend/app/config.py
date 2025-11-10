import os
from dotenv import load_dotenv

load_dotenv()

OPENAI_API_KEY = os.getenv("OPENAI_API_KEY")
OPENAI_MODEL = os.getenv("OPENAI_MODEL", "gpt-4o-mini")

def _parse_csv_env(name: str) -> list[str]:
    """ENV változó vesszővel elválasztott listává alakítása"""
    raw = os.getenv(name, "")
    if raw.strip() == "*":
        return ["*"]
    return [x.strip() for x in raw.split(",") if x.strip()]

FRONTEND_ORIGINS = _parse_csv_env("FRONTEND_ORIGINS")
