# -*- coding: utf-8 -*-
"""
WebSocket Manager - Real-time szinkronizáció eszközök között

Funkciók:
1. Chat üzenetek szinkronizálása
2. Log üzenetek broadcast
3. Kód változások értesítése
4. Aktív projekt/fájl szinkronizálása
"""

import json
import asyncio
from typing import Dict, Set, Optional, Any, List
from datetime import datetime
from fastapi import WebSocket
from dataclasses import dataclass, asdict
import uuid


@dataclass
class SyncMessage:
    """Szinkronizációs üzenet"""
    type: str  # 'chat', 'log', 'code_change', 'state_sync', 'ping', 'pong'
    data: Any
    timestamp: str
    sender_id: str
    project_id: Optional[int] = None


class ConnectionManager:
    """WebSocket kapcsolatok kezelése"""
    
    def __init__(self):
        # Aktív kapcsolatok: {client_id: WebSocket}
        self.active_connections: Dict[str, WebSocket] = {}
        # Projekt szobák: {project_id: set of client_ids}
        self.project_rooms: Dict[int, Set[str]] = {}
        # Kliens állapotok: {client_id: state_dict}
        self.client_states: Dict[str, Dict] = {}
        # Globális állapot (chat history, logs, etc.)
        self.global_state: Dict = {
            "chat_messages": [],
            "logs": [],
            "active_project_id": None,
            "active_file_path": None,
        }
        # Max chat history és log méret
        self.MAX_CHAT_HISTORY = 100
        self.MAX_LOGS = 200
    
    async def connect(self, websocket: WebSocket, client_id: str):
        """Új kliens csatlakoztatása"""
        await websocket.accept()
        self.active_connections[client_id] = websocket
        self.client_states[client_id] = {
            "connected_at": datetime.utcnow().isoformat(),
            "project_id": None,
        }
        print(f"[WS] Kliens csatlakozott: {client_id} (összesen: {len(self.active_connections)})")
        
        # Küldj kezdeti állapotot
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
        """Kezdeti állapot küldése új kliensnek"""
        state_message = SyncMessage(
            type="state_sync",
            data={
                "chat_messages": self.global_state["chat_messages"][-50:],  # Utolsó 50 üzenet
                "logs": self.global_state["logs"][-30:],  # Utolsó 30 log
                "active_project_id": self.global_state["active_project_id"],
                "active_file_path": self.global_state["active_file_path"],
                "connected_clients": len(self.active_connections),
            },
            timestamp=datetime.utcnow().isoformat(),
            sender_id="server",
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
        """Chat üzenet hozzáadása és GLOBÁLIS broadcast (minden kliensnek)"""
        # Tároljuk
        self.global_state["chat_messages"].append(message)
        if len(self.global_state["chat_messages"]) > self.MAX_CHAT_HISTORY:
            self.global_state["chat_messages"] = self.global_state["chat_messages"][-self.MAX_CHAT_HISTORY:]
        
        print(f"[WS] Chat üzenet: {message.get('role', '?')} - {len(self.active_connections)} kliensnek broadcast")
        
        # Broadcast - MINDIG GLOBÁLIS, hogy minden eszköz lássa
        sync_msg = SyncMessage(
            type="chat",
            data=message,
            timestamp=datetime.utcnow().isoformat(),
            sender_id=sender_id,
            project_id=project_id,
        )
        
        # Mindig minden kliensnek küldjük
        await self.broadcast(sync_msg)
    
    async def add_log(self, log_entry: Dict, sender_id: str):
        """Log bejegyzés hozzáadása és broadcast"""
        self.global_state["logs"].append(log_entry)
        if len(self.global_state["logs"]) > self.MAX_LOGS:
            self.global_state["logs"] = self.global_state["logs"][-self.MAX_LOGS:]
        
        sync_msg = SyncMessage(
            type="log",
            data=log_entry,
            timestamp=datetime.utcnow().isoformat(),
            sender_id=sender_id,
        )
        await self.broadcast(sync_msg)
    
    async def update_active_file(self, project_id: int, file_path: str, sender_id: str):
        """Aktív fájl frissítése és broadcast"""
        self.global_state["active_project_id"] = project_id
        self.global_state["active_file_path"] = file_path
        
        sync_msg = SyncMessage(
            type="state_sync",
            data={
                "active_project_id": project_id,
                "active_file_path": file_path,
            },
            timestamp=datetime.utcnow().isoformat(),
            sender_id=sender_id,
            project_id=project_id,
        )
        await self.broadcast(sync_msg)
    
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
        
        elif msg_type == "chat":
            await self.add_chat_message(
                data.get("data", {}),
                client_id,
                data.get("project_id")
            )
        
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
        """Összefésüli a bejövő chat historyt a globális állapottal és broadcast-olja"""
        existing_ids = {msg.get("id") for msg in self.global_state["chat_messages"]}
        
        new_messages = []
        for msg in incoming_messages:
            msg_id = msg.get("id")
            if msg_id and msg_id not in existing_ids:
                new_messages.append(msg)
                existing_ids.add(msg_id)
        
        if new_messages:
            # Hozzáadjuk az új üzeneteket
            self.global_state["chat_messages"].extend(new_messages)
            # Rendezés id szerint
            self.global_state["chat_messages"].sort(key=lambda m: m.get("id", 0))
            # Max 100 üzenet
            if len(self.global_state["chat_messages"]) > self.MAX_CHAT_HISTORY:
                self.global_state["chat_messages"] = self.global_state["chat_messages"][-self.MAX_CHAT_HISTORY:]
            
            print(f"[WS] {len(new_messages)} új üzenet szinkronizálva, összesen: {len(self.global_state['chat_messages'])}")
            
            # Broadcast az összefésült historyt minden kliensnek (kivéve a küldőt)
            sync_msg = SyncMessage(
                type="state_sync",
                data={
                    "chat_messages": self.global_state["chat_messages"],
                    "connected_clients": len(self.active_connections),
                },
                timestamp=datetime.utcnow().isoformat(),
                sender_id="server",
            )
            await self.broadcast(sync_msg, exclude_sender=False)


# Globális manager instance
manager = ConnectionManager()

