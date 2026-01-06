# -*- coding: utf-8 -*-
from datetime import datetime
from typing import List, Optional, Literal

from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    root_path: Optional[str] = None


class ChatHistMsg(BaseModel):
    role: Literal["user", "assistant"]
    text: str

class ChatRequest(BaseModel):
    message: str
    project_id: Optional[int] = None
    source_code: Optional[str] = None
    projected_code: Optional[str] = None
    history: Optional[List[ChatHistMsg]] = None
    session_id: Optional[str] = None  # Session tracking for active files
    auto_mode: bool = False  # Ha True, az LLM automatikusan végrehajtja a műveleteket
    agentic_mode: bool = False  # Ha True, többlépéses agentic végrehajtás

class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime

    class Config:
        extra = "ignore"  # ha a frontend netán többet küld, ne dőljön el


class ProjectUpdate(BaseModel):
    # mind opcionális, PATCH-szerű update-hez
    name: Optional[str] = None
    description: Optional[str] = None
    root_path: Optional[str] = None


class DirectoryItem(BaseModel):
    name: str
    path: str
    is_directory: bool


class BrowseResponse(BaseModel):
    current_path: str
    parent_path: Optional[str] = None
    items: List[DirectoryItem]


# =====================================
#   LLM PROVIDER SCHEMAS
# =====================================

class LLMProviderBase(BaseModel):
    name: str
    provider_type: str  # openai, anthropic, ollama, custom
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model_name: str
    max_tokens: int = 4096
    temperature: str = "0.7"


class LLMProviderCreate(LLMProviderBase):
    pass


class LLMProviderUpdate(BaseModel):
    name: Optional[str] = None
    provider_type: Optional[str] = None
    api_key: Optional[str] = None
    api_base_url: Optional[str] = None
    model_name: Optional[str] = None
    max_tokens: Optional[int] = None
    temperature: Optional[str] = None
    is_active: Optional[bool] = None


class LLMProviderRead(LLMProviderBase):
    id: int
    is_active: bool
    is_default: bool
    api_key_set: bool  # Csak azt jelezzük hogy van-e kulcs, nem adjuk vissza
    created_at: datetime

    class Config:
        from_attributes = True


# =====================================
#   PERMISSION SCHEMAS
# =====================================

class PendingActionSchema(BaseModel):
    """Egy függőben lévő művelet, amire engedélyt kell kérni"""
    id: str
    action_type: str  # code_modify, code_create, terminal_exec, etc.
    description: str
    details: dict
    created_at: str
    approved: Optional[bool] = None


class PermissionRequestSchema(BaseModel):
    """Engedélykérés az LLM-től"""
    action_type: str
    description: str
    file_path: Optional[str] = None
    preview: Optional[str] = None  # Előnézet a változásról


class PermissionResponseSchema(BaseModel):
    """Válasz egy engedélykérésre"""
    action_id: str
    approved: bool
    comment: Optional[str] = None


class ModeInfoSchema(BaseModel):
    """Aktuális mód információ"""
    mode: str  # manual, auto, agentic
    auto_mode: bool
    agentic_mode: bool
    pending_actions_count: int
