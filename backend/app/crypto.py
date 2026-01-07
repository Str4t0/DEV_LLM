# -*- coding: utf-8 -*-
"""
API kulcs titkosítás AES-256 (Fernet) használatával.
A titkosító kulcs egy fájlból vagy környezeti változóból származik.
"""

import os
import base64
from pathlib import Path

try:
    from cryptography.fernet import Fernet
    CRYPTO_AVAILABLE = True
except ImportError:
    CRYPTO_AVAILABLE = False
    print("[CRYPTO] WARNING: cryptography modul nem elérhető, titkosítás kikapcsolva")

# Titkosító kulcs tárolási helye
SECRET_KEY_FILE = Path(__file__).parent.parent / ".secret_key"
ENV_SECRET_KEY_VAR = "LLM_DEV_ENV_SECRET_KEY"

# Prefix ami jelzi hogy titkosított érték
ENCRYPTED_PREFIX = "ENCRYPTED:"

_fernet = None


def _init_fernet():
    """Inicializálja a Fernet titkosítót."""
    global _fernet
    
    if not CRYPTO_AVAILABLE:
        return None
    
    if _fernet is not None:
        return _fernet
    
    key = None
    
    # 1. Próbáljuk a környezeti változóból
    env_key = os.getenv(ENV_SECRET_KEY_VAR)
    if env_key:
        try:
            # Ha base64 formátumú
            key = env_key.encode('utf-8')
            Fernet(key)  # Validálás
            print(f"[CRYPTO] Kulcs betöltve környezeti változóból: {ENV_SECRET_KEY_VAR}")
        except Exception:
            key = None
    
    # 2. Próbáljuk a fájlból
    if key is None and SECRET_KEY_FILE.exists():
        try:
            key = SECRET_KEY_FILE.read_bytes().strip()
            Fernet(key)  # Validálás
            print(f"[CRYPTO] Kulcs betöltve fájlból: {SECRET_KEY_FILE}")
        except Exception as e:
            print(f"[CRYPTO] Hibás kulcs a fájlban: {e}")
            key = None
    
    # 3. Generálunk új kulcsot
    if key is None:
        key = Fernet.generate_key()
        try:
            SECRET_KEY_FILE.write_bytes(key)
            print(f"[CRYPTO] Új titkosító kulcs generálva és mentve: {SECRET_KEY_FILE}")
        except Exception as e:
            print(f"[CRYPTO] Nem sikerült menteni a kulcsot: {e}")
    
    _fernet = Fernet(key)
    return _fernet


def encrypt_api_key(api_key: str) -> str:
    """
    Titkosítja az API kulcsot.
    
    Args:
        api_key: A titkosítandó API kulcs
        
    Returns:
        Titkosított string ENCRYPTED: prefixszel, vagy az eredeti ha nem elérhető a titkosítás
    """
    if not api_key:
        return ""
    
    # Ha már titkosított, ne titkosítsuk újra
    if api_key.startswith(ENCRYPTED_PREFIX):
        return api_key
    
    fernet = _init_fernet()
    if fernet is None:
        print("[CRYPTO] Titkosítás nem elérhető, eredeti kulcs visszaadva")
        return api_key
    
    try:
        encrypted = fernet.encrypt(api_key.encode('utf-8'))
        return ENCRYPTED_PREFIX + encrypted.decode('utf-8')
    except Exception as e:
        print(f"[CRYPTO] Titkosítási hiba: {e}")
        return api_key


def decrypt_api_key(encrypted_key: str) -> str:
    """
    Visszafejti a titkosított API kulcsot.
    
    Args:
        encrypted_key: A titkosított API kulcs (ENCRYPTED: prefixszel)
        
    Returns:
        Az eredeti API kulcs, vagy üres string hiba esetén
    """
    if not encrypted_key:
        return ""
    
    # Ha nem titkosított, visszaadjuk ahogy van
    if not encrypted_key.startswith(ENCRYPTED_PREFIX):
        return encrypted_key
    
    fernet = _init_fernet()
    if fernet is None:
        print("[CRYPTO] Visszafejtés nem elérhető")
        return ""
    
    try:
        # Levágjuk a prefixet
        encrypted_data = encrypted_key[len(ENCRYPTED_PREFIX):]
        decrypted = fernet.decrypt(encrypted_data.encode('utf-8'))
        return decrypted.decode('utf-8')
    except Exception as e:
        print(f"[CRYPTO] Visszafejtési hiba: {e}")
        return ""


def is_encrypted(value: str) -> bool:
    """Ellenőrzi hogy az érték titkosított-e."""
    return value.startswith(ENCRYPTED_PREFIX) if value else False


def is_crypto_available() -> bool:
    """Ellenőrzi hogy elérhető-e a titkosítás."""
    return CRYPTO_AVAILABLE








