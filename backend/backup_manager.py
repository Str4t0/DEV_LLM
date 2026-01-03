# backend/backup_manager.py
# Gyors backup/revert rendszer - memória-alapú + opcionális fájl perzisztencia

import os
import time
import hashlib
from typing import Dict, Optional, List
from dataclasses import dataclass, field
from datetime import datetime
from pathlib import Path
import shutil
import json

@dataclass
class FileBackup:
    """Egyetlen fájl backup-ja"""
    file_path: str
    original_content: str
    modified_content: str
    timestamp: float
    description: str = ""
    
    @property
    def timestamp_formatted(self) -> str:
        return datetime.fromtimestamp(self.timestamp).strftime("%Y-%m-%d %H:%M:%S")
    
    @property
    def original_hash(self) -> str:
        return hashlib.md5(self.original_content.encode()).hexdigest()[:8]
    
    @property
    def modified_hash(self) -> str:
        return hashlib.md5(self.modified_content.encode()).hexdigest()[:8]


@dataclass 
class BackupEntry:
    """Backup bejegyzés a pending listához"""
    id: str
    file_path: str
    original_content: str
    modified_content: str
    timestamp: float
    description: str
    status: str = "pending"  # pending, kept, reverted
    
    def to_dict(self) -> dict:
        return {
            "id": self.id,
            "file_path": self.file_path,
            "timestamp": self.timestamp,
            "timestamp_formatted": datetime.fromtimestamp(self.timestamp).strftime("%H:%M:%S"),
            "description": self.description,
            "status": self.status,
            "original_size": len(self.original_content),
            "modified_size": len(self.modified_content),
            "original_lines": self.original_content.count('\n') + 1,
            "modified_lines": self.modified_content.count('\n') + 1,
        }


class BackupManager:
    """
    Gyors memória-alapú backup kezelő.
    
    Használat:
        manager = BackupManager()
        
        # Módosítás előtt backup készítése
        backup_id = manager.create_backup(file_path, original_content, new_content, "LLM javaslat")
        
        # Fájl írása...
        
        # Ha a user revert-elni akar
        original = manager.revert(backup_id)
        
        # Ha a user megtartja
        manager.keep(backup_id)
    """
    
    def __init__(self, max_pending: int = 50, max_history: int = 100):
        """
        Args:
            max_pending: Maximum pending backup-ok száma
            max_history: Maximum history méret
        """
        self.max_pending = max_pending
        self.max_history = max_history
        
        # Aktív (pending) backup-ok - még nem véglegesítettek
        self.pending: Dict[str, BackupEntry] = {}
        
        # History - véglegesített vagy revert-elt backup-ok
        self.history: List[BackupEntry] = []
        
        # Fájl-specifikus utolsó backup (gyors lookup)
        self.last_backup_by_file: Dict[str, str] = {}
    
    def create_backup(
        self, 
        file_path: str, 
        original_content: str, 
        modified_content: str,
        description: str = ""
    ) -> str:
        """
        Backup létrehozása egy fájl módosítás előtt.
        
        Returns:
            backup_id: Egyedi azonosító a backup-hoz
        """
        # Egyedi ID generálás
        backup_id = f"backup_{int(time.time() * 1000)}_{hashlib.md5(file_path.encode()).hexdigest()[:6]}"
        
        entry = BackupEntry(
            id=backup_id,
            file_path=file_path,
            original_content=original_content,
            modified_content=modified_content,
            timestamp=time.time(),
            description=description,
            status="pending"
        )
        
        self.pending[backup_id] = entry
        self.last_backup_by_file[file_path] = backup_id
        
        # Pending limit ellenőrzés
        self._cleanup_pending()
        
        return backup_id
    
    def revert(self, backup_id: str) -> Optional[str]:
        """
        Visszaállítja az eredeti tartalmat.
        
        Returns:
            Az eredeti fájl tartalom, vagy None ha nem található
        """
        if backup_id not in self.pending:
            return None
        
        entry = self.pending.pop(backup_id)
        entry.status = "reverted"
        
        # History-ba mozgatás
        self._add_to_history(entry)
        
        # File lookup frissítése
        if self.last_backup_by_file.get(entry.file_path) == backup_id:
            del self.last_backup_by_file[entry.file_path]
        
        return entry.original_content
    
    def keep(self, backup_id: str) -> bool:
        """
        Megtartja a módosítást (törli a backup-ot a pending-ből).
        
        Returns:
            True ha sikeres, False ha nem található
        """
        if backup_id not in self.pending:
            return False
        
        entry = self.pending.pop(backup_id)
        entry.status = "kept"
        
        # History-ba mozgatás
        self._add_to_history(entry)
        
        # File lookup frissítése
        if self.last_backup_by_file.get(entry.file_path) == backup_id:
            del self.last_backup_by_file[entry.file_path]
        
        return True
    
    def revert_file(self, file_path: str) -> Optional[str]:
        """
        Visszaállítja egy fájl utolsó backup-ját.
        
        Returns:
            Az eredeti tartalom, vagy None
        """
        backup_id = self.last_backup_by_file.get(file_path)
        if backup_id:
            return self.revert(backup_id)
        return None
    
    def get_pending(self) -> List[dict]:
        """Visszaadja a pending backup-ok listáját"""
        return [entry.to_dict() for entry in self.pending.values()]
    
    def get_pending_for_file(self, file_path: str) -> Optional[dict]:
        """Visszaadja egy fájl pending backup-ját"""
        backup_id = self.last_backup_by_file.get(file_path)
        if backup_id and backup_id in self.pending:
            return self.pending[backup_id].to_dict()
        return None
    
    def get_history(self, limit: int = 20) -> List[dict]:
        """Visszaadja a history utolsó N elemét"""
        return [entry.to_dict() for entry in self.history[-limit:]]
    
    def revert_all(self) -> List[tuple]:
        """
        Visszaállítja az összes pending backup-ot.
        
        Returns:
            Lista (file_path, original_content) tuple-ökből
        """
        results = []
        for backup_id in list(self.pending.keys()):
            entry = self.pending[backup_id]
            results.append((entry.file_path, entry.original_content))
            self.revert(backup_id)
        return results
    
    def keep_all(self) -> int:
        """
        Megtartja az összes pending módosítást.
        
        Returns:
            Megtartott backup-ok száma
        """
        count = len(self.pending)
        for backup_id in list(self.pending.keys()):
            self.keep(backup_id)
        return count
    
    def clear_pending(self) -> int:
        """Törli az összes pending backup-ot (nem revert-el!)"""
        count = len(self.pending)
        self.pending.clear()
        self.last_backup_by_file.clear()
        return count
    
    def _add_to_history(self, entry: BackupEntry) -> None:
        """Entry hozzáadása a history-hoz"""
        self.history.append(entry)
        
        # History limit
        if len(self.history) > self.max_history:
            self.history = self.history[-self.max_history:]
    
    def _cleanup_pending(self) -> None:
        """Régi pending backup-ok törlése ha túl sok van"""
        if len(self.pending) <= self.max_pending:
            return
        
        # Legrégebbi törlése
        sorted_entries = sorted(self.pending.items(), key=lambda x: x[1].timestamp)
        to_remove = len(self.pending) - self.max_pending
        
        for backup_id, _ in sorted_entries[:to_remove]:
            entry = self.pending.pop(backup_id)
            entry.status = "expired"
            self._add_to_history(entry)


# ═══════════════════════════════════════════════════════════════
# FÁJL-ALAPÚ PERZISZTENCIA (opcionális)
# ═══════════════════════════════════════════════════════════════

class PersistentBackupManager(BackupManager):
    """
    Backup manager fájl perzisztenciával.
    A backup-okat .llm-backups mappába menti.
    """
    
    def __init__(
        self, 
        backup_dir: str = ".llm-backups",
        max_pending: int = 50,
        max_history: int = 100
    ):
        super().__init__(max_pending, max_history)
        self.backup_dir = Path(backup_dir)
        self.backup_dir.mkdir(exist_ok=True)
        (self.backup_dir / "pending").mkdir(exist_ok=True)
        (self.backup_dir / "history").mkdir(exist_ok=True)
    
    def create_backup(
        self, 
        file_path: str, 
        original_content: str, 
        modified_content: str,
        description: str = ""
    ) -> str:
        backup_id = super().create_backup(file_path, original_content, modified_content, description)
        
        # Fájlba mentés
        self._save_to_disk(backup_id, self.pending[backup_id])
        
        return backup_id
    
    def _save_to_disk(self, backup_id: str, entry: BackupEntry) -> None:
        """Backup mentése fájlba"""
        backup_file = self.backup_dir / "pending" / f"{backup_id}.json"
        
        data = {
            "id": entry.id,
            "file_path": entry.file_path,
            "original_content": entry.original_content,
            "modified_content": entry.modified_content,
            "timestamp": entry.timestamp,
            "description": entry.description,
            "status": entry.status,
        }
        
        with open(backup_file, 'w', encoding='utf-8') as f:
            json.dump(data, f, ensure_ascii=False, indent=2)
    
    def _load_from_disk(self) -> None:
        """Pending backup-ok betöltése induláskor"""
        pending_dir = self.backup_dir / "pending"
        
        for backup_file in pending_dir.glob("*.json"):
            try:
                with open(backup_file, 'r', encoding='utf-8') as f:
                    data = json.load(f)
                
                entry = BackupEntry(
                    id=data["id"],
                    file_path=data["file_path"],
                    original_content=data["original_content"],
                    modified_content=data["modified_content"],
                    timestamp=data["timestamp"],
                    description=data.get("description", ""),
                    status=data.get("status", "pending"),
                )
                
                self.pending[entry.id] = entry
                self.last_backup_by_file[entry.file_path] = entry.id
                
            except Exception as e:
                print(f"[BackupManager] Failed to load {backup_file}: {e}")


# Globális instance
_backup_manager: Optional[BackupManager] = None

def get_backup_manager() -> BackupManager:
    """Globális backup manager instance"""
    global _backup_manager
    if _backup_manager is None:
        _backup_manager = BackupManager()
    return _backup_manager

def init_backup_manager(persistent: bool = False, backup_dir: str = ".llm-backups") -> BackupManager:
    """Backup manager inicializálása"""
    global _backup_manager
    if persistent:
        _backup_manager = PersistentBackupManager(backup_dir)
    else:
        _backup_manager = BackupManager()
    return _backup_manager
