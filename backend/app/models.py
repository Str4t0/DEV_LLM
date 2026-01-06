# -*- coding: utf-8 -*-
from sqlalchemy import Column, Integer, String, DateTime, Boolean, Text, BigInteger, ForeignKey
from sqlalchemy.sql import func

from .database import Base


class Project(Base):
    __tablename__ = "projects"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(255), nullable=False, unique=True, index=True)
    description = Column(String(1024), nullable=True)
    root_path = Column(String(1024), nullable=True)
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class LLMProvider(Base):
    """LLM szolgáltató konfiguráció."""
    __tablename__ = "llm_providers"

    id = Column(Integer, primary_key=True, index=True)
    name = Column(String(100), nullable=False)  # pl. "OpenAI", "Anthropic", "Local"
    provider_type = Column(String(50), nullable=False)  # openai, anthropic, ollama, custom
    api_key = Column(String(512), nullable=True)  # Titkosítva tárolva
    api_base_url = Column(String(512), nullable=True)  # Custom endpoint
    model_name = Column(String(100), nullable=False)  # pl. "gpt-4o-mini", "claude-3-sonnet"
    is_active = Column(Boolean, default=False)  # Csak egy lehet aktív
    is_default = Column(Boolean, default=False)
    max_tokens = Column(Integer, default=4096)
    temperature = Column(String(10), default="0.7")
    created_at = Column(DateTime(timezone=True), server_default=func.now())
    updated_at = Column(DateTime(timezone=True), onupdate=func.now())


class ChatMessage(Base):
    """Chat üzenetek - eszközök közötti szinkronizáláshoz."""
    __tablename__ = "chat_messages"

    id = Column(BigInteger, primary_key=True, index=True)  # Frontend generált ID
    project_id = Column(Integer, ForeignKey("projects.id"), nullable=True, index=True)
    role = Column(String(20), nullable=False)  # user, assistant, system
    content = Column(Text, nullable=False)  # 'content' mert így van a létező DB-ben
    created_at = Column(DateTime(timezone=True), server_default=func.now())


class UserSettings(Base):
    """Felhasználói beállítások - eszközök közötti szinkronizáláshoz."""
    __tablename__ = "user_settings"

    id = Column(Integer, primary_key=True, index=True)
    key = Column(String(100), nullable=False, unique=True, index=True)  # pl. "auto_mode", "theme"
    value = Column(Text, nullable=True)  # JSON string
    updated_at = Column(DateTime(timezone=True), server_default=func.now(), onupdate=func.now())
