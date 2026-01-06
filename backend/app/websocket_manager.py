# -*- coding: utf-8 -*-
"""
WebSocket Manager - Real-time szinkronizáció eszközök között

Funkciók:
1. Chat üzenetek szinkronizálása (ADATBÁZISBÓL)
2. Log üzenetek broadcast
3. Kód változások értesítése
4. Aktív projekt/fájl szinkronizálása - PER-CLIENT!
5. Beállítások szinkronizálása (ADATBÁZISBÓL)
6. State persistence shutdown-kor
"""

import json
import asyncio
import os
from typing import Dict, Set, Optional, Any, List
from datetime import datetime
from fastapi import WebSocket
from dataclasses import dataclass, asdict
import uuid

# State file path a perzisztens mentéshez
STATE_FILE = os.path.join(os.path.dirname(__file__), "..", "..", "server_state.json")


@dataclass
class SyncMessage:
    """Szinkronizációs üzenet"""
    type: str  # 'chat', 'log', 'code_change', 'state_sync', 'ping', 'pong', 'setting_change'
    data: Any
    timestamp: str
    sender_id: str
    project_id: Optional[int] = None


class ConnectionManager:
    """WebSocket kapcsolatok kezelése - ADATBÁZIS ALAPÚ szinkronizációval"""
    
    def __init__(self):
        # Aktív kapcsolatok: {client_id: WebSocket}
        self.active_connections: Dict[str, WebSocket] = {}
        # Projekt szobák: {project_id: set of client_ids}
        self.project_rooms: Dict[int, Set[str]] = {}
        # Kliens állapotok: {client_id: state_dict} - PER-CLIENT aktív projekt!
        self.client_states: Dict[str, Dict] = {}
        # Memória cache logs (nem DB-ben)
        self.logs: List[Dict] = []
        # Globális utolsó aktív projekt (fallback/restore esetére)
        self.last_active_project_id: Optional[int] = None
        self.last_active_file_path: Optional[str] = None
        # Max log méret
        self.MAX_LOGS = 200
        
        # Induláskor töltsd be az előző state-et
        self._load_persisted_state()
    
    def _load_persisted_state(self):
        """Előző mentett state betöltése (server restart után)"""
        try:
            if os.path.exists(STATE_FILE):
                with open(STATE_FILE, 'r', encoding='utf-8') as f:
                    state = json.load(f)
                self.last_active_project_id = state.get("last_active_project_id")
                self.last_active_file_path = state.get("last_active_file_path")
                self.logs = state.get("logs", [])[-self.MAX_LOGS:]
                print(f"[WS] State betöltve: project={self.last_active_project_id}, file={self.last_active_file_path}")
        except Exception as e:
            print(f"[WS] State betöltési hiba: {e}")
    
    def save_state(self):
        """State mentése shutdown előtt"""
        try:
            state = {
                "last_active_project_id": self.last_active_project_id,
                "last_active_file_path": self.last_active_file_path,
                "logs": self.logs[-50:],  # Utolsó 50 log
                "saved_at": datetime.utcnow().isoformat(),
            }
            with open(STATE_FILE, 'w', encoding='utf-8') as f:
                json.dump(state, f, ensure_ascii=False, indent=2)
            print(f"[WS] State mentve: {STATE_FILE}")
        except Exception as e:
            print(f"[WS] State mentési hiba: {e}")
    
    def _get_db_session(self):
        """Database session lekérése - lazy import circular import elkerülésére"""
        from .database import SessionLocal
        return SessionLocal()
    
    def _load_chat_from_db(self, limit: int = 100, project_id: Optional[int] = None) -> List[Dict]:
        """Chat history betöltése az adatbázisból, opcionálisan projekt szerint szűrve"""
        try:
            from . import models
            db = self._get_db_session()
            
            query = db.query(models.ChatMessage)
            
            # Ha van project_id, szűrjük arra VAGY a None-ra (globális üzenetek)
            if project_id:
                query = query.filter(
                    (models.ChatMessage.project_id == project_id) | 
                    (models.ChatMessage.project_id.is_(None))
                )
            
            messages = query.order_by(models.ChatMessage.id.desc()).limit(limit).all()
            db.close()
            
            return [
                {
                    "id": m.id,
                    "role": m.role,
                    "text": m.content,  # DB-ben 'content', API-ban 'text'
                    "project_id": m.project_id,
                }
                for m in reversed(messages)  # Időrendben
            ]
        except Exception as e:
            print(f"[WS] DB chat betöltési hiba: {e}")
            return []
    
    def _save_chat_to_db(self, message: Dict):
        """Chat üzenet mentése az adatbázisba"""
        try:
            from . import models
            db = self._get_db_session()
            
            # Ellenőrizzük, létezik-e már
            existing = db.query(models.ChatMessage).filter(models.ChatMessage.id == message.get("id")).first()
            if not existing:
                new_msg = models.ChatMessage(
                    id=message.get("id"),
                    role=message.get("role"),
                    content=message.get("text"),  # API-ban 'text', DB-ben 'content'
                    project_id=message.get("project_id")
                )
                db.add(new_msg)
                db.commit()
            
            db.close()
        except Exception as e:
            print(f"[WS] DB chat mentési hiba: {e}")
    
    def _load_settings_from_db(self) -> Dict[str, str]:
        """Beállítások betöltése az adatbázisból"""
        try:
            from . import models
            db = self._get_db_session()
            settings = db.query(models.UserSettings).all()
            db.close()
            return {s.key: s.value for s in settings}
        except Exception as e:
            print(f"[WS] DB settings betöltési hiba: {e}")
            return {}
    
    async def connect(self, websocket: WebSocket, client_id: str, project_id: Optional[int] = None):
        """Új kliens csatlakoztatása"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        # Per-client projekt státusz
        self.client_states[client_id] = {
            "connected_at": datetime.utcnow().isoformat(),
            "project_id": project_id or self.last_active_project_id,  # Restore előző session
            "file_path": self.last_active_file_path if not project_id else None,
        }
        print(f"[WS] Kliens csatlakozott: {client_id} (project={project_id}, összesen: {len(self.active_connections)})")
        
        # Küldj kezdeti állapotot - ADATBÁZISBÓL
        await self.send_initial_state(client_id)
    
    def disconnect(self, client_id: str):
        """Kliens leválasztása"""
        if client_id in self.active_connections:
            del self.active_connections[client_id]
        if client_id in self.client_states:
            del self.client_states[client_id]
        # Projekt szobákból is töröljük
        for room in self.project_rooms.values():
            room.discard(client_id)
        print(f"[WS] Kliens lecsatlakozott: {client_id} (maradt: {len(self.active_connections)})")
    
    async def send_initial_state(self, client_id: str):
        """Kezdeti állapot küldése új kliensnek - ADATBÁZISBÓL, per-client projekt"""
        # Kliens aktív projektje
        client_project_id = None
        client_file_path = None
        if client_id in self.client_states:
            client_project_id = self.client_states[client_id].get("project_id")
            client_file_path = self.client_states[client_id].get("file_path")
        
        # Chat history betöltése DB-ből - projekt-specifikus!
        chat_messages = self._load_chat_from_db(limit=100, project_id=client_project_id)
        # Settings betöltése DB-ből
        settings = self._load_settings_from_db()
        
        state_message = SyncMessage(
            type="state_sync",
            data={
                "chat_messages": chat_messages[-50:],  # Utolsó 50 üzenet
                "logs": self.logs[-30:],  # Utolsó 30 log (memóriából)
                "active_project_id": client_project_id or self.last_active_project_id,
                "active_file_path": client_file_path or self.last_active_file_path,
                "connected_clients": len(self.active_connections),
                "settings": settings,  # Beállítások is
            },
            timestamp=datetime.utcnow().isoformat(),
            sender_id="server",
            project_id=client_project_id,
        )
        await self.send_personal(client_id, state_message)
    
    async def send_personal(self, client_id: str, message: SyncMessage):
        """Üzenet küldése egy kliensnek"""
        if client_id in self.active_connections:
            websocket = self.active_connections[client_id]
            try:
                # JSON küldés UTF-8 encoding-al (emojik támogatása)
                json_str = json.dumps(asdict(message), ensure_ascii=False)
                await websocket.send_text(json_str)
            except Exception as e:
                print(f"[WS] Küldési hiba ({client_id}): {e}")
                self.disconnect(client_id)
    
    async def broadcast(self, message: SyncMessage, exclude_sender: bool = True):
        """Üzenet broadcast minden kliensnek"""
        disconnected = []
        # JSON előre elkészítése UTF-8 encoding-al
        json_str = json.dumps(asdict(message), ensure_ascii=False)
        for client_id, websocket in self.active_connections.items():
            if exclude_sender and client_id == message.sender_id:
                continue
            try:
                await websocket.send_text(json_str)
            except Exception as e:
                print(f"[WS] Broadcast hiba ({client_id}): {e}")
                disconnected.append(client_id)
        
        # Leválasztott kliensek törlése
        for client_id in disconnected:
            self.disconnect(client_id)
    
    async def broadcast_to_project(self, project_id: int, message: SyncMessage, exclude_sender: bool = True):
        """Üzenet broadcast egy projekt szobájába"""
        if project_id not in self.project_rooms:
            return
        
        for client_id in self.project_rooms[project_id]:
            if exclude_sender and client_id == message.sender_id:
                continue
            await self.send_personal(client_id, message)
    
    def join_project_room(self, client_id: str, project_id: int):
        """Kliens csatlakoztatása projekt szobához"""
        if project_id not in self.project_rooms:
            self.project_rooms[project_id] = set()
        self.project_rooms[project_id].add(client_id)
        if client_id in self.client_states:
            self.client_states[client_id]["project_id"] = project_id
    
    def leave_project_room(self, client_id: str, project_id: int):
        """Kliens eltávolítása projekt szobából"""
        if project_id in self.project_rooms:
            self.project_rooms[project_id].discard(client_id)
    
    # === Állapot kezelő metódusok ===
    
    async def add_chat_message(self, message: Dict, sender_id: str, project_id: Optional[int] = None):
        """Chat üzenet hozzáadása ADATBÁZISBA és broadcast projekt-specifikusan"""
        # Project ID hozzáadása
        if project_id:
            message["project_id"] = project_id
        
        # Mentés adatbázisba
        self._save_chat_to_db(message)
        
        print(f"[WS] Chat üzenet (DB): {message.get('role', '?')} project={project_id} - broadcast...")
        
        sync_msg = SyncMessage(
            type="chat",
            data=message,
            timestamp=datetime.utcnow().isoformat(),
            sender_id=sender_id,
            project_id=project_id,
        )
        
        # Csak azoknak a klienseknek broadcast, akik ugyanazon a projekten vannak
        # VAGY ha nincs project_id, akkor mindenkinek (globális üzenet)
        if project_id:
            # Projekt-specifikus broadcast
            targets = []
            for client_id, state in self.client_states.items():
                if state.get("project_id") == project_id:
                    targets.append(client_id)
            
            print(f"[WS] Projekt {project_id} broadcast: {len(targets)} kliens")
            for client_id in targets:
                await self.send_personal(client_id, sync_msg)
        else:
            # Globális broadcast (nincs projekt filter)
            await self.broadcast(sync_msg)
    
    async def add_log(self, log_entry: Dict, sender_id: str):
        """Log bejegyzés hozzáadása és broadcast (memória, nem DB)"""
        self.logs.append(log_entry)
        if len(self.logs) > self.MAX_LOGS:
            self.logs = self.logs[-self.MAX_LOGS:]
        
        sync_msg = SyncMessage(
            type="log",
            data=log_entry,
            timestamp=datetime.utcnow().isoformat(),
            sender_id=sender_id,
        )
        await self.broadcast(sync_msg)
    
    async def update_active_file(self, project_id: int, file_path: str, sender_id: str):
        """Aktív fájl frissítése - PER-CLIENT, nem globális broadcast!"""
        # Frissítjük a kliens saját állapotát
        if sender_id in self.client_states:
            self.client_states[sender_id]["project_id"] = project_id
            self.client_states[sender_id]["file_path"] = file_path
        
        # Globális utolsó aktív mentése (perzisztencia)
        self.last_active_project_id = project_id
        self.last_active_file_path = file_path
        
        # NEM broadcast-olunk másoknak - minden kliens saját projektjén dolgozik!
        # Csak visszajelzés a küldőnek
        sync_msg = SyncMessage(
            type="state_sync",
            data={
                "active_project_id": project_id,
                "active_file_path": file_path,
                "source": "self",  # Jelzi hogy saját frissítés
            },
            timestamp=datetime.utcnow().isoformat(),
            sender_id="server",
            project_id=project_id,
        )
        await self.send_personal(sender_id, sync_msg)
    
    async def handle_message(self, client_id: str, data: Dict):
        """Bejövő üzenet feldolgozása"""
        msg_type = data.get("type")
        
        if msg_type == "ping":
            # Pong válasz
            await self.send_personal(client_id, SyncMessage(
                type="pong",
                data={},
                timestamp=datetime.utcnow().isoformat(),
                sender_id="server",
            ))
        
        elif msg_type == "join_project":
            project_id = data.get("project_id")
            if project_id:
                self.join_project_room(client_id, project_id)
        
        elif msg_type == "leave_project":
            project_id = data.get("project_id")
            if project_id:
                self.leave_project_room(client_id, project_id)
        
        elif msg_type == "select_project":
            # Kliens kiválaszt egy projektet - PER-CLIENT!
            project_id = data.get("project_id")
            if client_id in self.client_states:
                old_project = self.client_states[client_id].get("project_id")
                self.client_states[client_id]["project_id"] = project_id
                self.client_states[client_id]["file_path"] = None
                self.last_active_project_id = project_id
                print(f"[WS] Kliens {client_id} projekt váltás: {old_project} -> {project_id}")
            # Küldünk projekt-specifikus chat historyt
            await self.send_initial_state(client_id)
        
        elif msg_type == "chat":
            # Chat üzenethez csatoljuk a kliens aktuális projektjét
            chat_data = data.get("data", {})
            project_id = data.get("project_id")
            # Ha nincs explicit project_id, használjuk a kliens aktuálisát
            if not project_id and client_id in self.client_states:
                project_id = self.client_states[client_id].get("project_id")
            await self.add_chat_message(chat_data, client_id, project_id)
        
        elif msg_type == "log":
            await self.add_log(data.get("data", {}), client_id)
        
        elif msg_type == "file_change":
            project_id = data.get("project_id")
            file_path = data.get("file_path")
            if project_id and file_path:
                await self.update_active_file(project_id, file_path, client_id)
        
        elif msg_type == "request_state":
            await self.send_initial_state(client_id)
        
        elif msg_type == "sync_history":
            # Kliens küldi a saját chat historyját - összefésüljük
            incoming_messages = data.get("data", {}).get("chat_messages", [])
            if incoming_messages:
                await self.merge_chat_history(incoming_messages, client_id)
    
    async def merge_chat_history(self, incoming_messages: List[Dict], sender_id: str):
        """Összefésüli a bejövő chat historyt az ADATBÁZISSAL és broadcast-olja"""
        # Adatbázisból betöltjük a meglévő ID-kat
        try:
            from . import models
            db = self._get_db_session()
            
            incoming_ids = [msg.get("id") for msg in incoming_messages if msg.get("id")]
            existing_ids = {
                m.id for m in db.query(models.ChatMessage.id).filter(
                    models.ChatMessage.id.in_(incoming_ids)
                ).all()
            }
            
            new_messages = []
            for msg in incoming_messages:
                msg_id = msg.get("id")
                if msg_id and msg_id not in existing_ids:
                    new_messages.append(msg)
                    # Mentés DB-be
                    new_db_msg = models.ChatMessage(
                        id=msg_id,
                        role=msg.get("role"),
                        content=msg.get("text"),  # API-ban 'text', DB-ben 'content'
                        project_id=msg.get("project_id")
                    )
                    db.add(new_db_msg)
            
            if new_messages:
                db.commit()
                print(f"[WS] {len(new_messages)} új üzenet szinkronizálva az adatbázisba")
            
            db.close()
            
            # Frissített lista betöltése és broadcast
            if new_messages:
                all_messages = self._load_chat_from_db(limit=100)
                
                sync_msg = SyncMessage(
                    type="state_sync",
                    data={
                        "chat_messages": all_messages,
                        "connected_clients": len(self.active_connections),
                    },
                    timestamp=datetime.utcnow().isoformat(),
                    sender_id="server",
                )
                await self.broadcast(sync_msg, exclude_sender=False)
                
        except Exception as e:
            print(f"[WS] Chat merge hiba: {e}")


# Globális manager instance
manager = ConnectionManager()

