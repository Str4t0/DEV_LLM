# -*- coding: utf-8 -*-
"""
Mode Manager - Tiszta működési módok kezelése

MÓD HIERARCHIA:
┌────────────────────────────────────────────────────────────┐
│                       USER REQUEST                          │
└─────────────────────────────┬──────────────────────────────┘
                              │
              ┌───────────────┼───────────────┐
              ▼               ▼               ▼
    ┌─────────────────┐ ┌─────────────────┐ ┌─────────────────┐
    │   MANUAL MODE   │ │   AUTO MODE     │ │  AGENTIC MODE   │
    │   (default)     │ │   (one-shot)    │ │  (multi-step)   │
    └────────┬────────┘ └────────┬────────┘ └────────┬────────┘
             │                   │                   │
             ▼                   ▼                   ▼
    - Ask permission     - Auto-apply code   - Think first
    - Show proposals     - Auto-run terminal - Plan steps
    - Wait for confirm   - No questions      - Execute & verify

DÖNTÉSI FA:
1. Ha MANUAL MODE → Minden művelet előtt KÉRJ ENGEDÉLYT
2. Ha AUTO MODE → Egyszerű műveletek automatikusan
3. Ha AGENTIC MODE → Komplex feladatok többlépésben
"""

from enum import Enum
from typing import List, Dict, Optional, Any
from dataclasses import dataclass, field
from datetime import datetime


class OperationMode(str, Enum):
    """Működési módok"""
    MANUAL = "manual"       # Minden engedélyköteles
    AUTO = "auto"           # Automatikus végrehajtás
    AGENTIC = "agentic"     # Többlépéses agent


class ActionType(str, Enum):
    """Lehetséges műveletek típusai"""
    CODE_MODIFY = "code_modify"         # Meglévő kód módosítása
    CODE_CREATE = "code_create"         # Új fájl létrehozása
    CODE_DELETE = "code_delete"         # Fájl törlése
    TERMINAL_EXEC = "terminal_exec"     # Terminal parancs futtatás
    TERMINAL_DANGEROUS = "terminal_dangerous"  # Veszélyes parancs
    FILE_RENAME = "file_rename"         # Fájl átnevezése
    AGENT_START = "agent_start"         # Agent folyamat indítása
    SUGGESTION_ONLY = "suggestion"      # Csak javaslat


@dataclass
class PendingAction:
    """Függőben lévő művelet, amire engedélyt kell kérni"""
    id: str
    action_type: ActionType
    description: str
    details: Dict[str, Any]
    created_at: str = field(default_factory=lambda: datetime.utcnow().isoformat())
    approved: Optional[bool] = None
    
    def to_dict(self) -> Dict:
        return {
            "id": self.id,
            "action_type": self.action_type.value,
            "description": self.description,
            "details": self.details,
            "created_at": self.created_at,
            "approved": self.approved,
        }


class ModeManager:
    """
    Központi mód- és engedélykezelő.
    
    Felelős:
    1. Az aktuális mód meghatározása
    2. Annak eldöntése, hogy egy művelet engedélyköteles-e
    3. Függőben lévő műveletek tárolása
    """
    
    # Műveletek, amik MINDIG engedélyköteles (még AUTO módban is!)
    ALWAYS_ASK_PERMISSION = {
        ActionType.CODE_DELETE,
        ActionType.TERMINAL_DANGEROUS,
    }
    
    # Veszélyes terminal parancs minták
    DANGEROUS_PATTERNS = [
        "rm -rf", "del /s /q", "format", "rmdir /s",
        "Remove-Item -Recurse -Force", ":(){:|:&};:",
        "drop database", "truncate table",
    ]
    
    def __init__(self):
        self.pending_actions: Dict[str, PendingAction] = {}
    
    def get_effective_mode(
        self,
        auto_mode: bool = False,
        agentic_mode: bool = False,
    ) -> OperationMode:
        """
        Meghatározza az effektív működési módot.
        
        Prioritás: AGENTIC > AUTO > MANUAL
        """
        if agentic_mode:
            return OperationMode.AGENTIC
        elif auto_mode:
            return OperationMode.AUTO
        else:
            return OperationMode.MANUAL
    
    def requires_permission(
        self,
        action_type: ActionType,
        mode: OperationMode,
        details: Optional[Dict] = None,
    ) -> bool:
        """
        Eldönti, hogy egy művelet engedélyköteles-e.
        
        Returns:
            True ha engedélyt kell kérni, False ha automatikus
        """
        # MINDIG engedélyköteles műveletek
        if action_type in self.ALWAYS_ASK_PERMISSION:
            return True
        
        # Terminal parancs veszélyesség ellenőrzése
        if action_type == ActionType.TERMINAL_EXEC and details:
            command = details.get("command", "")
            if self._is_dangerous_command(command):
                return True
        
        # MANUAL mód: minden engedélyköteles
        if mode == OperationMode.MANUAL:
            return True
        
        # AUTO mód: automatikus (kivéve a MINDIG engedélyköteles)
        if mode == OperationMode.AUTO:
            return False
        
        # AGENTIC mód: automatikus végrehajtás lépéseken belül
        if mode == OperationMode.AGENTIC:
            return False
        
        return True  # Biztonságos default
    
    def _is_dangerous_command(self, command: str) -> bool:
        """Ellenőrzi, hogy egy parancs veszélyes-e"""
        cmd_lower = command.lower()
        return any(pattern.lower() in cmd_lower for pattern in self.DANGEROUS_PATTERNS)
    
    def create_pending_action(
        self,
        action_type: ActionType,
        description: str,
        details: Dict[str, Any],
    ) -> PendingAction:
        """Létrehoz egy függőben lévő műveletet"""
        import uuid
        action_id = f"action_{uuid.uuid4().hex[:8]}"
        
        action = PendingAction(
            id=action_id,
            action_type=action_type,
            description=description,
            details=details,
        )
        
        self.pending_actions[action_id] = action
        return action
    
    def approve_action(self, action_id: str) -> Optional[PendingAction]:
        """Jóváhagy egy műveletet"""
        if action_id in self.pending_actions:
            action = self.pending_actions[action_id]
            action.approved = True
            return action
        return None
    
    def reject_action(self, action_id: str) -> Optional[PendingAction]:
        """Elutasít egy műveletet"""
        if action_id in self.pending_actions:
            action = self.pending_actions.pop(action_id)
            action.approved = False
            return action
        return None
    
    def get_pending_actions(self) -> List[PendingAction]:
        """Visszaadja az összes függőben lévő műveletet"""
        return list(self.pending_actions.values())
    
    def clear_pending_actions(self):
        """Törli az összes függőben lévő műveletet"""
        self.pending_actions.clear()
    
    def get_mode_instructions(self, mode: OperationMode) -> str:
        """
        Visszaadja a módhoz tartozó instrukciókat az LLM számára.
        Ez bekerül a system prompt-ba.
        """
        if mode == OperationMode.MANUAL:
            return """
🔒 MANUAL MÓD - ENGEDÉLYKÖTELES

MINDEN módosítás előtt KÉRJ ENGEDÉLYT a felhasználótól!

Formátum:
```
[PERMISSION_REQUEST]
TYPE: code_modify | code_create | terminal_exec | file_delete
DESCRIPTION: Mit szeretnél csinálni
FILE: érintett fájl (ha van)
PREVIEW: Rövid előnézet a változásról
[/PERMISSION_REQUEST]
```

MAJD VÁRD MEG a felhasználó válaszát!
NE hajtsd végre a műveletet amíg nincs jóváhagyás!

Ha a felhasználó jóváhagyja (pl. "OK", "igen", "csináld"), 
AKKOR add meg a [CODE_CHANGE] vagy [TERMINAL_COMMAND] blokkot.
"""
        
        elif mode == OperationMode.AUTO:
            return """
🤖 AUTO MÓD - AUTOMATIKUS VÉGREHAJTÁS

Automatikusan hajtsd végre a műveleteket:
- [CODE_CHANGE] blokkokat a frontend feldolgozza
- [TERMINAL_COMMAND] parancsokat a backend végrehajtja

NE kérdezz, cselekedj!
DE: Figyelj a biztonsági szabályokra (pl. ne törölj fontos fájlokat).
"""
        
        elif mode == OperationMode.AGENTIC:
            return """
🔧 AGENTIC MÓD - TÖBBLÉPÉSES VÉGREHAJTÁS

Komplex feladatokat többlépésben old meg:

1. [THINK] - Tervezd meg a lépéseket
2. [TERMINAL] / [CODE] - Hajtsd végre
3. [VERIFY] - Ellenőrizd az eredményt
4. [DONE] - Zárd le a feladatot

Minden lépés után ellenőrizd a hibákat és reagálj rájuk!
"""
        
        return ""


# Globális példány
mode_manager = ModeManager()


def get_mode_system_prompt_addition(
    auto_mode: bool = False,
    agentic_mode: bool = False,
) -> str:
    """
    Visszaadja a system prompt kiegészítését az aktuális módhoz.
    Ezt a main.py build_llm_messages függvénye használja.
    """
    mode = mode_manager.get_effective_mode(auto_mode, agentic_mode)
    return mode_manager.get_mode_instructions(mode)


