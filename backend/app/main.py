# -*- coding: utf-8 -*-
import os
import sys
import time
import shutil
import json

# --- Könyvtár útvonalak ---
CURRENT_DIR = os.path.dirname(__file__)               # .../backend/app
BACKEND_DIR = os.path.dirname(CURRENT_DIR)            # .../backend
ROOT_DIR = os.path.dirname(BACKEND_DIR)               # .../llm_dev_env (projekt gyökér)

# Backend mappa hozzáadása a path-hoz (vector_store.py miatt)
if BACKEND_DIR not in sys.path:
    sys.path.insert(0, BACKEND_DIR)

from typing import List, Optional

from pathlib import Path

SYSTEM_PROMPT_PATH = Path(__file__).parent /  "system_prompt.txt"
SYSTEM_PROMPT = SYSTEM_PROMPT_PATH.read_text(encoding="utf-8")


from fastapi import Depends, FastAPI, HTTPException, status, BackgroundTasks, Query, WebSocket, WebSocketDisconnect
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from . import models, schemas
from .database import SessionLocal, engine
from .config import OPENAI_API_KEY, OPENAI_MODEL, FRONTEND_ORIGINS, RAG_ENABLED, RAG_AUTO_INDEX_ON_SAVE
from .crypto import encrypt_api_key, decrypt_api_key, is_encrypted


from openai import OpenAI
from vector_store import index_project, query_project, find_files_by_name, get_all_project_files
from datetime import datetime
from threading import Lock
import uuid

# Smart Context System import
from .context_manager import (
    build_smart_context,
    format_loaded_files_for_prompt,
    format_memory_facts_for_prompt,
    format_project_structure_for_prompt,
    parse_file_requests_from_response,
    extract_learned_facts_from_response,
    store_project_fact,
    MAX_HISTORY_MESSAGES,
    MAX_HISTORY_CHARS_PER_MSG,
    clean_llm_response_for_history,
)

# Mode Manager import
from .mode_manager import (
    mode_manager,
    get_mode_system_prompt_addition,
    OperationMode,
    ActionType,
)

# =====================================
#   REINDEX STÁTUSZ KÖVETÉS
# =====================================

# In-memory státusz tároló
reindex_status_store: dict = {}
reindex_status_lock = Lock()

class ReindexStatus:
    def __init__(self, project_id: int):
        self.project_id = project_id
        self.status = "running"  # running, completed, error
        self.started_at = datetime.utcnow().isoformat()
        self.finished_at = None
        self.progress = 0  # 0-100
        self.current_file = None
        self.total_files = 0
        self.indexed_files = 0
        self.skipped_unchanged = 0
        self.deleted_files = 0
        self.total_chunks = 0
        self.error_message = None
    
    def to_dict(self):
        return {
            "project_id": self.project_id,
            "status": self.status,
            "started_at": self.started_at,
            "finished_at": self.finished_at,
            "progress": self.progress,
            "current_file": self.current_file,
            "total_files": self.total_files,
            "indexed_files": self.indexed_files,
            "skipped_unchanged": self.skipped_unchanged,
            "deleted_files": self.deleted_files,
            "total_chunks": self.total_chunks,
            "error_message": self.error_message,
        }

def update_reindex_status(project_id: int, **kwargs):
    with reindex_status_lock:
        if project_id in reindex_status_store:
            status = reindex_status_store[project_id]
            for key, value in kwargs.items():
                if hasattr(status, key):
                    setattr(status, key, value)


# Debug log a modellhez / API key-hez
print(f"[LLM DEV ENV] OPENAI_MODEL = {OPENAI_MODEL!r}")
if OPENAI_API_KEY:
    print("[LLM DEV ENV] OPENAI_API_KEY betöltve.")
else:
    print("[LLM DEV ENV] NINCS OPENAI_API_KEY, /chat nem fog működni.")


# =====================================
#   DB INIT + FASTAPI APP + CORS
# =====================================

# Táblák létrehozása (idempotens)
models.Base.metadata.create_all(bind=engine)

# Ha nincs FRONTEND_ORIGINS az env-ben, fallback localhostra
# --- FastAPI példány létrehozása ---
app = FastAPI()

# --- CORS beállítás ---
# Development módban engedélyezzük az összes origin-t
# MEGJEGYZÉS: allow_origins=["*"] csak allow_credentials=False-val működik!
# Ha credentials kell, explicit origin listát kell használni

app.add_middleware(
    CORSMiddleware,
    allow_origins=["*"],  # Minden origin engedélyezve
    allow_credentials=False,  # Nem kell credentials, így működik a ["*"]
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"[CORS] Development mód: minden origin engedélyezve (allow_origins=['*'], allow_credentials=False)")

# --- DB session dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# =====================================
#   HEALTH / ROOT
# =====================================

@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "LLM Dev Environment backend is running"}


# =====================================
#   FÁJLRENDSZER MODELLEK + HELPER
# =====================================

class FileNode(BaseModel):
    name: str
    path: str          # projekt gyökeréhez képesti relatív útvonal (always "/")
    is_dir: bool
    children: Optional[List["FileNode"]] = None


FileNode.model_rebuild()


class FileContentResponse(BaseModel):
  path: str
  encoding: str
  content: str


SKIP_DIRS = {
    ".git",
    ".idea",
    ".vscode",
    "__pycache__",
    "node_modules",
    "venv",
    ".venv",
    ".mypy_cache",
    ".pytest_cache",
}


def get_project_root_or_404(project_id: int, db: Session) -> str:
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    if not project.root_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A projekthez nincs root mappa megadva.",
        )

    root_abs = os.path.abspath(project.root_path)
    if not os.path.isdir(root_abs):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A megadott root mappa nem létezik vagy nem mappa.",
        )
    return root_abs

def get_vector_project_key(project: models.Project) -> str:
    """
    Vektor store-beli azonosító. Ha később átnevezed a projektet,
    akkor is stabil marad, mert az ID-re épít.
    """
    return f"project_{project.id}"



def build_file_tree(
    root_path: str, max_depth: int = 3, max_entries: int = 500
) -> List[FileNode]:
    root_abs = os.path.abspath(root_path)
    entries_count = 0

    def _walk(current_abs: str, depth: int) -> List[FileNode]:
        nonlocal entries_count
        if depth > max_depth:
            return []
        try:
            entries = list(os.scandir(current_abs))
        except PermissionError:
            return []

        nodes: List[FileNode] = []
        entries.sort(key=lambda e: (not e.is_dir(), e.name.lower()))

        for entry in entries:
            if entries_count >= max_entries:
                break

            if entry.is_dir() and entry.name in SKIP_DIRS:
                continue

            rel_path = os.path.relpath(entry.path, root_abs).replace(os.sep, "/")
            node = FileNode(
                name=entry.name,
                path=rel_path,
                is_dir=entry.is_dir(),
            )
            entries_count += 1

            if entry.is_dir():
                node.children = _walk(entry.path, depth + 1)

            nodes.append(node)

        return nodes

    return _walk(root_abs, depth=0)


# =====================================
#   PROJEKTEK API
# =====================================

@app.get("/projects", response_model=List[schemas.ProjectRead])
def list_projects(db: Session = Depends(get_db)):
    """Összes projekt listázása (legújabb elöl)."""
    projects = (
        db.query(models.Project)
        .order_by(models.Project.created_at.desc())
        .all()
    )
    return projects


@app.post(
    "/projects",
    response_model=schemas.ProjectRead,
    status_code=status.HTTP_201_CREATED,
)
def create_project(
    project: schemas.ProjectCreate,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    existing = (
        db.query(models.Project)
        .filter(models.Project.name == project.name)
        .first()
    )
    if existing:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Már létezik ilyen nevű projekt.",
        )

    db_project = models.Project(
        name=project.name,
        description=project.description,
        root_path=project.root_path,
    )
    db.add(db_project)
    db.commit()
    db.refresh(db_project)

    if db_project.root_path:
        vector_key = get_vector_project_key(db_project)
        background_tasks.add_task(
            index_project,
            vector_key,
            db_project.root_path,
        )

    return db_project


@app.put("/projects/{project_id}", response_model=schemas.ProjectRead)
def update_project(
    project_id: int,
    payload: schemas.ProjectUpdate,
    db: Session = Depends(get_db),
):
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )

    if payload.name is not None and payload.name != project.name:
        existing = (
            db.query(models.Project)
            .filter(
                models.Project.name == payload.name,
                models.Project.id != project_id,
            )
            .first()
        )
        if existing:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Már létezik ilyen nevű projekt.",
            )
        project.name = payload.name

    if payload.description is not None:
        project.description = payload.description

    if payload.root_path is not None:
        project.root_path = payload.root_path

    db.commit()
    db.refresh(project)
    return project


@app.delete("/projects/{project_id}")
def delete_project(project_id: int, db: Session = Depends(get_db)):
    """
    Projekt törlése az adatbázisból.
    (A vektoros index jelenleg külön nem törlődik, csak „árván” marad,
    de nem lesz többé használva, mert a projekt ID eltűnik.)
    """
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )

    db.delete(project)
    db.commit()

    return {"status": "ok", "message": "Projekt törölve."}


def run_reindex_with_status(project_id: int, vector_key: str, root_path: str):
    """Reindex futtatása státusz követéssel."""
    try:
        result = index_project(vector_key, root_path)
        
        with reindex_status_lock:
            if project_id in reindex_status_store:
                status_obj = reindex_status_store[project_id]
                status_obj.status = "completed"
                status_obj.finished_at = datetime.utcnow().isoformat()
                status_obj.progress = 100
                status_obj.total_files = result.get("total_files", 0)
                status_obj.indexed_files = result.get("indexed_files", 0)
                status_obj.skipped_unchanged = result.get("skipped_unchanged", 0)
                status_obj.deleted_files = result.get("deleted_files", 0)
                status_obj.total_chunks = result.get("total_chunks", 0)
                
    except Exception as e:
        with reindex_status_lock:
            if project_id in reindex_status_store:
                status_obj = reindex_status_store[project_id]
                status_obj.status = "error"
                status_obj.finished_at = datetime.utcnow().isoformat()
                status_obj.error_message = str(e)
        print(f"[ERROR] Reindex hiba (projekt {project_id}): {e}")


@app.post("/projects/{project_id}/reindex")
def reindex_project_endpoint(
    project_id: int,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """Teljes újraindexelés a vector_store-ban (háttérben fut)."""
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )

    if not project.root_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="Ehhez a projekthez még nincs root_path beállítva.",
        )

    # Ellenőrizzük, fut-e már reindex erre a projektre
    with reindex_status_lock:
        if project_id in reindex_status_store:
            existing = reindex_status_store[project_id]
            if existing.status == "running":
                return {
                    "status": "already_running",
                    "message": "A reindexelés már fut erre a projektre.",
                }
        
        # Új státusz létrehozása
        reindex_status_store[project_id] = ReindexStatus(project_id)

    vector_key = get_vector_project_key(project)

    background_tasks.add_task(
        run_reindex_with_status,
        project_id,
        vector_key,
        project.root_path,
    )

    return {
        "status": "ok",
        "message": f"Reindexelés elindítva a háttérben (projekt_id={project_id}).",
    }


@app.get("/projects/{project_id}/reindex/status")
def get_reindex_status(project_id: int):
    """Reindex státusz lekérdezése."""
    with reindex_status_lock:
        if project_id not in reindex_status_store:
            return {
                "status": "not_found",
                "message": "Nincs aktív vagy korábbi reindexelés ehhez a projekthez.",
            }
        
        return reindex_status_store[project_id].to_dict()


# =====================================
#   FÁJLRENDSZER ENDPOINTOK
# =====================================

@app.get("/projects/{project_id}/files", response_model=List[FileNode])
def list_project_files(
    project_id: int,
    db: Session = Depends(get_db),
    max_depth: int = 3,
):
    root_abs = get_project_root_or_404(project_id, db)
    tree = build_file_tree(root_abs, max_depth=max_depth)
    return tree


@app.get("/projects/{project_id}/file", response_model=FileContentResponse)
def read_project_file(
    project_id: int,
    rel_path: str,
    encoding: str = "utf-8",
    db: Session = Depends(get_db),
):
    root_abs = get_project_root_or_404(project_id, db)

    target_abs = os.path.abspath(os.path.join(root_abs, rel_path))

    if not (target_abs == root_abs or target_abs.startswith(root_abs + os.sep)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A megadott elérési út érvénytelen.",
        )

    if not os.path.isfile(target_abs):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A fájl nem létezik.",
        )

    try:
        with open(target_abs, "r", encoding=encoding, errors="replace") as f:
            content = f.read()
    except LookupError:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail=f"Ismeretlen kódolás: {encoding}",
        )

    rel_norm = os.path.relpath(target_abs, root_abs).replace(os.sep, "/")

    return FileContentResponse(
        path=rel_norm,
        encoding=encoding,
        content=content,
    )


class FileSaveRequest(BaseModel):
    rel_path: str
    content: str
    encoding: str = "utf-8"


class FileSaveResponse(BaseModel):
    status: str
    message: str
    backup_path: Optional[str] = None


@app.post("/projects/{project_id}/file/save", response_model=FileSaveResponse)
def save_project_file(
    project_id: int,
    payload: FileSaveRequest,
    background_tasks: BackgroundTasks,
    db: Session = Depends(get_db),
):
    """
    Fájl mentése backup készítéssel + automatikus index frissítés.
    A backup a ROOT_DIR/backup/{project_name}/ mappába kerül.
    """
    import shutil
    from datetime import datetime
    
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    
    if not project.root_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A projekthez nincs root mappa beállítva.",
        )
    
    root_abs = os.path.abspath(project.root_path)
    target_abs = os.path.abspath(os.path.join(root_abs, payload.rel_path))
    
    # Biztonsági ellenőrzés - ne engedjünk a projekt mappán kívülre írni
    if not (target_abs == root_abs or target_abs.startswith(root_abs + os.sep)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A megadott elérési út érvénytelen.",
        )
    
    # Backup készítése
    backup_path = None
    if os.path.isfile(target_abs):
        # Backup mappa: ROOT_DIR/backup/{project_name}/
        backup_dir = os.path.join(ROOT_DIR, "backup", project.name)
        os.makedirs(backup_dir, exist_ok=True)
        
        # Backup fájlnév: eredeti_nev.YYYYMMDD_HHMMSS.ext
        original_name = os.path.basename(target_abs)
        name_part, ext_part = os.path.splitext(original_name)
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        backup_filename = f"{name_part}.{timestamp}{ext_part}"
        backup_full_path = os.path.join(backup_dir, backup_filename)
        
        try:
            shutil.copy2(target_abs, backup_full_path)
            backup_path = backup_full_path
            print(f"[BACKUP] Létrehozva: {backup_full_path}")
        except Exception as e:
            print(f"[BACKUP] Hiba: {e}")
            # Folytatjuk a mentést akkor is ha a backup nem sikerült
    
    # Fájl mentése
    try:
        # Győződjünk meg róla, hogy a könyvtár létezik
        os.makedirs(os.path.dirname(target_abs), exist_ok=True)
        
        with open(target_abs, "w", encoding=payload.encoding, newline="\n") as f:
            f.write(payload.content)
        
        # ✅ AUTOMATIKUS INDEX FRISSÍTÉS - háttérben (ha be van kapcsolva)
        if RAG_ENABLED and RAG_AUTO_INDEX_ON_SAVE:
            try:
                from vector_store import index_single_file
                vector_key = get_vector_project_key(project)
                background_tasks.add_task(
                    index_single_file,
                    vector_key,
                    project.root_path,
                    payload.rel_path,
                )
                print(f"[AUTO-INDEX] Fájl index frissítése háttérben: {payload.rel_path}")
            except Exception as e:
                # Ha az indexelés nem sikerül, a mentés akkor is sikeres
                print(f"[AUTO-INDEX] Hiba (nem kritikus): {e}")
        
        return FileSaveResponse(
            status="ok",
            message=f"Fájl sikeresen mentve: {payload.rel_path}",
            backup_path=backup_path,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hiba a fájl mentésekor: {str(e)}",
        )


# =====================================
#   BACKUP LISTÁZÁS ÉS VISSZAÁLLÍTÁS
# =====================================

class BackupFile(BaseModel):
    filename: str
    original_name: str
    timestamp: str
    timestamp_formatted: str
    size_bytes: int
    full_path: str


class BackupListResponse(BaseModel):
    project_name: str
    backups: List[BackupFile]


@app.get("/projects/{project_id}/backups", response_model=BackupListResponse)
def list_project_backups(
    project_id: int,
    file_filter: Optional[str] = Query(None, description="Szűrés fájlnévre"),
    db: Session = Depends(get_db),
):
    """
    Projekt backup fájljainak listázása.
    Opcionális file_filter paraméterrel szűrhető egy adott fájlra.
    """
    import re
    from datetime import datetime
    
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    
    backup_dir = os.path.join(ROOT_DIR, "backup", project.name)
    
    # Agentic backup mappa is
    agentic_backup_dir = os.path.join(ROOT_DIR, "backup", "agentic")
    
    if not os.path.isdir(backup_dir) and not os.path.isdir(agentic_backup_dir):
        return BackupListResponse(project_name=project.name, backups=[])
    
    backups = []
    # Pattern: filename.YYYYMMDD_HHMMSS.ext vagy filename_timestamp.bak
    pattern = re.compile(r'^(.+)\.(\d{8}_\d{6})(\.[^.]+)?$')
    pattern_agentic = re.compile(r'^(.+)_(\d+)\.bak$')
    
    # Szűrő érték (fájlnév alapú)
    filter_basename = None
    if file_filter:
        filter_basename = os.path.basename(file_filter)
    
    # Projekt backupok
    if os.path.isdir(backup_dir):
        for filename in os.listdir(backup_dir):
            full_path = os.path.join(backup_dir, filename)
            if not os.path.isfile(full_path):
                continue
            
            match = pattern.match(filename)
            if match:
                name_part = match.group(1)
                timestamp_str = match.group(2)
                ext_part = match.group(3) or ""
                original_name = name_part + ext_part
                
                # Szűrés fájlnévre ha van filter
                if filter_basename and filter_basename not in original_name:
                    continue
                
                # Parse timestamp for formatted display
                try:
                    dt = datetime.strptime(timestamp_str, "%Y%m%d_%H%M%S")
                    formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
                except ValueError:
                    formatted = timestamp_str
                
                backups.append(BackupFile(
                    filename=filename,
                    original_name=original_name,
                    timestamp=timestamp_str,
                    timestamp_formatted=formatted,
                    size_bytes=os.path.getsize(full_path),
                    full_path=full_path,
                ))
    
    # Agentic backupok (unix timestamp alapú)
    if os.path.isdir(agentic_backup_dir):
        for filename in os.listdir(agentic_backup_dir):
            full_path = os.path.join(agentic_backup_dir, filename)
            if not os.path.isfile(full_path):
                continue
            
            match = pattern_agentic.match(filename)
            if match:
                name_part = match.group(1)
                timestamp_unix = match.group(2)
                original_name = name_part
                
                # Szűrés fájlnévre ha van filter
                if filter_basename and filter_basename not in original_name:
                    continue
                
                # Parse unix timestamp
                try:
                    dt = datetime.fromtimestamp(int(timestamp_unix))
                    formatted = dt.strftime("%Y-%m-%d %H:%M:%S")
                    timestamp_str = dt.strftime("%Y%m%d_%H%M%S")
                except (ValueError, OSError):
                    formatted = timestamp_unix
                    timestamp_str = timestamp_unix
                
                backups.append(BackupFile(
                    filename=filename,
                    original_name=f"{original_name} (agentic)",
                    timestamp=timestamp_str,
                    timestamp_formatted=f"{formatted} (agentic)",
                    size_bytes=os.path.getsize(full_path),
                    full_path=full_path,
                ))
    
    # Sort by timestamp, newest first
    backups.sort(key=lambda x: x.timestamp, reverse=True)
    
    return BackupListResponse(project_name=project.name, backups=backups)


class ManualBackupRequest(BaseModel):
    rel_path: str


class ManualBackupResponse(BaseModel):
    status: str
    message: str
    backup_path: Optional[str] = None


@app.post("/projects/{project_id}/backup/create", response_model=ManualBackupResponse)
def create_manual_backup(
    project_id: int,
    payload: ManualBackupRequest,
    db: Session = Depends(get_db),
):
    """
    Manuális backup készítése egy fájlról.
    """
    import shutil
    from datetime import datetime
    
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    
    if not project.root_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A projekthez nincs root mappa beállítva.",
        )
    
    root_abs = os.path.abspath(project.root_path)
    target_abs = os.path.abspath(os.path.join(root_abs, payload.rel_path))
    
    # Biztonsági ellenőrzés
    if not (target_abs == root_abs or target_abs.startswith(root_abs + os.sep)):
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A megadott elérési út érvénytelen.",
        )
    
    if not os.path.isfile(target_abs):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A fájl nem található.",
        )
    
    # Backup mappa és fájlnév
    backup_dir = os.path.join(ROOT_DIR, "backup", project.name)
    os.makedirs(backup_dir, exist_ok=True)
    
    original_name = os.path.basename(target_abs)
    name_part, ext_part = os.path.splitext(original_name)
    timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
    backup_filename = f"{name_part}.{timestamp}{ext_part}"
    backup_full_path = os.path.join(backup_dir, backup_filename)
    
    try:
        shutil.copy2(target_abs, backup_full_path)
        
        # Meta fájl az eredeti útvonallal
        meta_path = backup_full_path + ".meta"
        with open(meta_path, "w", encoding="utf-8") as mf:
            mf.write(payload.rel_path)
        
        print(f"[MANUAL BACKUP] Létrehozva: {backup_full_path}")
        return ManualBackupResponse(
            status="ok",
            message=f"Backup létrehozva: {backup_filename}",
            backup_path=backup_full_path
        )
    except Exception as e:
        print(f"[MANUAL BACKUP ERROR] {e}")
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Backup hiba: {str(e)}"
        )


class RestoreRequest(BaseModel):
    backup_filename: str
    encoding: str = "utf-8"


class RestoreResponse(BaseModel):
    status: str
    message: str
    restored_to: str
    backup_of_current: Optional[str] = None


@app.post("/projects/{project_id}/backups/restore", response_model=RestoreResponse)
def restore_backup(
    project_id: int,
    payload: RestoreRequest,
    db: Session = Depends(get_db),
):
    """
    Backup fájl visszaállítása.
    A jelenlegi fájlról is készül backup a visszaállítás előtt.
    """
    import shutil
    import re
    from datetime import datetime
    
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    
    if not project.root_path:
        raise HTTPException(
            status_code=status.HTTP_400_BAD_REQUEST,
            detail="A projekthez nincs root mappa beállítva.",
        )
    
    backup_dir = os.path.join(ROOT_DIR, "backup", project.name)
    agentic_backup_dir = os.path.join(ROOT_DIR, "backup", "agentic")
    backup_file_path = os.path.join(backup_dir, payload.backup_filename)
    
    # Ha nincs a projekt mappában, keressük az agentic mappában
    if not os.path.isfile(backup_file_path):
        backup_file_path = os.path.join(agentic_backup_dir, payload.backup_filename)
    
    if not os.path.isfile(backup_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A backup fájl nem található.",
        )
    
    # Parse original filename from backup filename
    # Standard format: name.YYYYMMDD_HHMMSS.ext
    # Agentic format: name_timestamp.bak
    pattern = re.compile(r'^(.+)\.(\d{8}_\d{6})(\.[^.]+)?$')
    pattern_agentic = re.compile(r'^(.+?)_(\d+)\.bak$')
    match = pattern.match(payload.backup_filename)
    
    if not match:
        # Try agentic format
        match = pattern_agentic.match(payload.backup_filename)
        if match:
            name_part = match.group(1)
            ext_part = ""
            original_name = name_part
        else:
            raise HTTPException(
                status_code=status.HTTP_400_BAD_REQUEST,
                detail="Érvénytelen backup fájlnév formátum.",
            )
    else:
        name_part = match.group(1)
        ext_part = match.group(3) or ""
        original_name = name_part + ext_part
    
    # Check for meta file with original relative path
    meta_file_path = backup_file_path + ".meta"
    original_rel_path = None
    if os.path.isfile(meta_file_path):
        try:
            with open(meta_file_path, "r", encoding="utf-8") as mf:
                original_rel_path = mf.read().strip()
                print(f"[RESTORE] Meta fájlból: {original_rel_path}")
        except Exception as e:
            print(f"[RESTORE] Meta fájl olvasási hiba: {e}")
    
    # Target path in the project
    root_abs = os.path.abspath(project.root_path)
    if original_rel_path:
        target_abs = os.path.join(root_abs, original_rel_path)
        original_name = original_rel_path
    else:
        target_abs = os.path.join(root_abs, original_name)
    
    # Ensure target directory exists
    target_dir = os.path.dirname(target_abs)
    if target_dir:
        os.makedirs(target_dir, exist_ok=True)
    
    # Backup current file before restoring (if exists)
    current_backup_path = None
    if os.path.isfile(target_abs):
        os.makedirs(backup_dir, exist_ok=True)  # Ensure backup dir exists
        timestamp = datetime.now().strftime("%Y%m%d_%H%M%S")
        current_backup_filename = f"{name_part}.{timestamp}{ext_part}"
        current_backup_path = os.path.join(backup_dir, current_backup_filename)
        
        try:
            shutil.copy2(target_abs, current_backup_path)
            print(f"[RESTORE] Jelenlegi fájl mentve: {current_backup_path}")
        except Exception as e:
            print(f"[RESTORE] Jelenlegi fájl mentése sikertelen: {e}")
    
    # Restore the backup
    try:
        shutil.copy2(backup_file_path, target_abs)
        print(f"[RESTORE] Visszaállítva: {backup_file_path} -> {target_abs}")
        
        return RestoreResponse(
            status="ok",
            message=f"Backup sikeresen visszaállítva: {original_name}",
            restored_to=original_name,
            backup_of_current=current_backup_path,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hiba a visszaállítás során: {str(e)}",
        )


@app.get("/projects/{project_id}/backups/{backup_filename}/preview")
def preview_backup(
    project_id: int,
    backup_filename: str,
    encoding: str = "utf-8",
    db: Session = Depends(get_db),
):
    """
    Backup fájl tartalmának előnézete.
    """
    project = (
        db.query(models.Project)
        .filter(models.Project.id == project_id)
        .first()
    )
    if not project:
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A projekt nem található.",
        )
    
    backup_dir = os.path.join(ROOT_DIR, "backup", project.name)
    backup_file_path = os.path.join(backup_dir, backup_filename)
    
    if not os.path.isfile(backup_file_path):
        raise HTTPException(
            status_code=status.HTTP_404_NOT_FOUND,
            detail="A backup fájl nem található.",
        )
    
    try:
        with open(backup_file_path, "r", encoding=encoding, errors="replace") as f:
            content = f.read()
        
        return {
            "filename": backup_filename,
            "content": content,
            "encoding": encoding,
        }
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hiba a fájl olvasásakor: {str(e)}",
        )


# =====================================
#   MAPPÁK BÖNGÉSZÉSE
# =====================================

@app.get("/api/browse", response_model=schemas.BrowseResponse)
def browse_directories(path: Optional[str] = None):
    """
    Mappák böngészése a fájlrendszerben.
    Ha nincs path megadva, akkor a ROOT_DIR-t használja alapértelmezetten.
    """
    import os
    
    # Alapértelmezett könyvtár: ROOT_DIR (DEV_LLM bázis könyvtár)
    default_base = ROOT_DIR
    
    if not path:
        browse_path = default_base
    else:
        # Biztonsági ellenőrzés: csak abszolút útvonalak, és csak a rendszeren belüliek
        browse_path = os.path.abspath(path)
        
        # Biztonsági korlátozás: ne engedjük ki a rendszer könyvtárait
        # Windows esetén csak meghajtók és a ROOT_DIR alatt lévő mappák
        if os.name == 'nt':  # Windows
            # Csak C: és D: stb. meghajtók, vagy a ROOT_DIR alatt lévő mappák
            root_abs = os.path.abspath(default_base)
            if not (browse_path.startswith(root_abs) or 
                    (len(browse_path) >= 2 and browse_path[1] == ':' and browse_path[0].isalpha())):
                browse_path = default_base
        else:  # Unix/Linux
            root_abs = os.path.abspath(default_base)
            if not browse_path.startswith(root_abs):
                browse_path = default_base
    
    if not os.path.isdir(browse_path):
        browse_path = default_base
    
    # Szülő könyvtár
    parent_path = None
    parent_abs = os.path.dirname(browse_path)
    if parent_abs and parent_abs != browse_path and os.path.isdir(parent_abs):
        # Biztonsági ellenőrzés: csak ha a szülő könyvtár is biztonságos
        parent_abs_safe = os.path.abspath(parent_abs)
        if os.name == 'nt':  # Windows
            root_abs = os.path.abspath(default_base)
            if (parent_abs_safe.startswith(root_abs) or 
                (len(parent_abs_safe) >= 2 and parent_abs_safe[1] == ':' and parent_abs_safe[0].isalpha())):
                parent_path = parent_abs
        else:  # Unix/Linux
            root_abs = os.path.abspath(default_base)
            if parent_abs_safe.startswith(root_abs):
                parent_path = parent_abs
    
    # Mappák és fájlok listázása
    items = []
    try:
        for item_name in sorted(os.listdir(browse_path)):
            item_path = os.path.join(browse_path, item_name)
            
            # Csak mappákat mutassunk, fájlokat ne
            if os.path.isdir(item_path):
                items.append(schemas.DirectoryItem(
                    name=item_name,
                    path=item_path,
                    is_directory=True
                ))
    except PermissionError:
        raise HTTPException(
            status_code=status.HTTP_403_FORBIDDEN,
            detail="Nincs jogosultság a könyvtár olvasásához."
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_500_INTERNAL_SERVER_ERROR,
            detail=f"Hiba a könyvtár olvasásakor: {str(e)}"
        )
    
    return schemas.BrowseResponse(
        current_path=browse_path,
        parent_path=parent_path,
        items=items
    )


# =====================================
#   LLM CLIENT + /chat
# =====================================

client: Optional[OpenAI] = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)

class TerminalExecutionResult(BaseModel):
    command: str
    description: str
    success: bool
    output: Optional[str] = None
    error: Optional[str] = None

class CodeChangeResult(BaseModel):
    """Egy kódmódosítás eredménye"""
    file_path: str
    action: str
    original_code: Optional[str] = None
    new_code: Optional[str] = None
    anchor_code: Optional[str] = None
    explanation: str = ""
    is_valid: bool = True
    validation_error: Optional[str] = None

class ChatResponse(BaseModel):
    reply: str
    terminal_results: Optional[List[TerminalExecutionResult]] = None
    code_changes: Optional[List[CodeChangeResult]] = None  # Strukturált kódmódosítások
    had_errors: bool = False
    retry_attempted: bool = False


def build_llm_messages(db: Session, payload: schemas.ChatRequest) -> list[dict]:
    """
    Összerakja az OpenAI messages listát:
    - system prompt (globális + opcionális projektspecifikus)
    - SMART CONTEXT: @file mentions, project memory, active files
    - RAG kontextus a vector_store-ból (ha van project_id)
    - user üzenet + extra kontextus (kódrészletek)
    """
    user_parts: list[str] = [payload.message]

    project: Optional[models.Project] = None
    vector_key: Optional[str] = None
    smart_context = None
    
    # Session ID for active file tracking (use from payload or generate)
    session_id = getattr(payload, 'session_id', None) or str(uuid.uuid4())[:8]

    # --- Projekt betöltése, ha van project_id ---
    if payload.project_id is not None:
        project = (
            db.query(models.Project)
            .filter(models.Project.id == payload.project_id)
            .first()
        )
        if project:
            user_parts.append(
                f"\n[Aktív projekt: {project.name} (ID: {project.id})]"
            )
            if project.root_path:
                vector_key = get_vector_project_key(project)
                
                # ========================================
                # SMART CONTEXT SYSTEM - ÚJ!
                # ========================================
                try:
                    hist = getattr(payload, "history", None) or []
                    history_dicts = [
                        {"role": getattr(h, "role", None) or h.get("role"),
                         "text": getattr(h, "text", None) or h.get("text")}
                        for h in hist if h
                    ]
                    
                    smart_context = build_smart_context(
                        project_id=project.id,
                        project_root=project.root_path,
                        message=payload.message,
                        session_id=session_id,
                        chat_history=history_dicts,
                        source_code=payload.source_code,
                        projected_code=payload.projected_code,
                    )
                    
                    print(f"[SMART CONTEXT] File mentions: {smart_context['file_mentions']}")
                    print(f"[SMART CONTEXT] Loaded files: {len(smart_context['loaded_files'])}")
                    print(f"[SMART CONTEXT] Memory facts: {len(smart_context['memory_facts'])}")
                    print(f"[SMART CONTEXT] Active files: {smart_context['active_files']}")
                except Exception as e:
                    print(f"[SMART CONTEXT] Error: {e}")
                    import traceback
                    traceback.print_exc()
        else:
            user_parts.append(
                f"\n[Figyelem: A megadott projekt (ID={payload.project_id}) "
                "nem található az adatbázisban.]"
            )

    # --- KRITIKUS: Az aktív fájl TELJES tartalma ---
    # Ez a legfontosabb kontextus - az LLM-nek látnia kell az egész fájlt!
    MAX_ACTIVE_FILE = 50000  # 50KB - ez elég nagy fájlokhoz is
    
    if payload.source_code:
        source_len = len(payload.source_code)
        if source_len <= MAX_ACTIVE_FILE:
            user_parts.append(
                f"\n========== AKTÍV FÁJL TELJES TARTALMA ({source_len} karakter) ==========\n"
                f"{payload.source_code}\n"
                f"========== FÁJL VÉGE ==========\n"
            )
        else:
            # Ha túl nagy, csonkoljuk de jelezzük
            user_parts.append(
                f"\n========== AKTÍV FÁJL (első {MAX_ACTIVE_FILE} karakter, összesen {source_len}) ==========\n"
                f"{payload.source_code[:MAX_ACTIVE_FILE]}\n"
                f"... [CSONKOLVA - a fájl túl nagy] ...\n"
                f"========== FÁJL VÉGE ==========\n"
            )
        print(f"[CONTEXT] Active file: {source_len} chars")

    if payload.projected_code:
        user_parts.append(
            "\n[Módosított verzió - ha van]\n" + payload.projected_code[:MAX_ACTIVE_FILE]
        )

    user_text = "\n".join(user_parts)

    # --- RAG: releváns részletek a vector_store-ból ---
    rag_context = ""
    is_project_overview_request = False
    
    # Általános projektáttekintő kérdések felismerése
    message_lower = payload.message.lower()
    project_overview_keywords = [
        "nézd meg a projektet", "nézd meg ezt a projektet", "nézd át a projektet",
        "adj javaslatokat", "adj javaslatot", "javaslatok", "javaslat",
        "elemezd a projektet", "elemzés", "elemez", "elemz",
        "nézd át az összes fájlt", "nézd át minden fájlt", "összes fájl",
        "projekt áttekintés", "projekt áttekint", "áttekintés",
        "refaktorál", "refaktoring", "refaktor",
        "fejlesztési javaslat", "fejlesztési javaslatok", "fejlesztés",
        "review", "code review", "projekt review",
        "teljes projekt", "egész projekt", "összes fájl"
    ]
    is_project_overview_request = any(keyword in message_lower for keyword in project_overview_keywords)
    
    if project and project.root_path and vector_key:
        try:
            # Fájlnevek automatikus felismerése a felhasználó üzenetéből
            # Keresünk olyan kifejezéseket, amelyek fájlnevekre utalhatnak
            explicit_file_patterns = []
            
            # Gyakori kifejezések, amelyek fájlnevekre utalhatnak
            file_patterns = [
                "struktúra", "structure", "program struktúra", "program structure",
                "readme", "read me", "dokumentáció", "documentation", "doc",
                "gyökérben", "gyökér", "root", "főkönyvtár", "fő könyvtár",
                "program_structure", "programstructure", "struktúra fájl"
            ]
            
            # Automatikus dokumentációs fájlok hozzáadása, ha a felhasználó struktúráról vagy dokumentációról kérdez
            doc_keywords = ["struktúra", "structure", "dokumentáció", "documentation", "gyökérben", "gyökér", "root"]
            if any(keyword in message_lower for keyword in doc_keywords):
                # Gyakori dokumentációs fájlnevek
                common_doc_files = [
                    "program_structure", "programstructure", "structure",
                    "readme", "readme.md", "readme.txt",
                    "doc", "documentation", "docs"
                ]
                explicit_file_patterns.extend(common_doc_files)
            
            for pattern in file_patterns:
                if pattern in message_lower:
                    explicit_file_patterns.append(pattern)
            
            # Keresünk explicit fájlneveket is (pl. "program_structure.txt", "README.md")
            import re
            file_name_pattern = r'\b([a-zA-Z0-9_\-]+\.(txt|md|json|yml|yaml|py|js|ts|tsx))\b'
            explicit_files = re.findall(file_name_pattern, payload.message, re.IGNORECASE)
            for file_match in explicit_files:
                explicit_file_patterns.append(file_match[0].split('.')[0])  # csak a név, kiterjesztés nélkül
            
            # Ha általános projektáttekintő kérés van, kérjük le az összes fontos fájlt
            chunks = []
            if is_project_overview_request:
                try:
                    print(f"[RAG] Projektáttekintő kérés észlelve - összes fontos fájl betöltése...")
                    all_files_chunks = get_all_project_files(vector_key, max_files=50, prioritize_main=True)
                    chunks = all_files_chunks
                    print(f"[RAG] Projektáttekintés: {len(chunks)} chunk, {len(set(c['file_path'] for c in chunks))} különböző fájlból")
                except Exception as e:
                    print(f"[RAG] Hiba a projektáttekintésnél: {e}")
                    # Fallback: normál keresés
            
            # Explicit fájlkeresés, ha találtunk mintákat
            explicit_file_chunks = []
            if explicit_file_patterns and project.root_path and not is_project_overview_request:
                try:
                    explicit_file_chunks = find_files_by_name(
                        vector_key, 
                        explicit_file_patterns, 
                        project.root_path
                    )
                    if explicit_file_chunks:
                        print(f"[RAG] Explicit fájlkeresés: {len(explicit_file_chunks)} chunk {len(set(c['file_path'] for c in explicit_file_chunks))} fájlból")
                except Exception as e:
                    print(f"[RAG] Hiba az explicit fájlkeresésnél: {e}")
            
            # Normál RAG keresés, ha nincs projektáttekintő kérés
            if not chunks:
                # Keressünk a kérdés + kódkörnyezet kombinációjára
                search_text_parts = [payload.message]

                if payload.source_code:
                    search_text_parts.append(payload.source_code[:1500])   # 2000 helyett kevesebb
                if payload.projected_code:
                    search_text_parts.append(payload.projected_code[:1000])  # szintén

                search_text = "\n\n".join(search_text_parts)

                # Növelt top_k, hogy több fájlból is kapjon kontextust
                chunks = query_project(vector_key, search_text, top_k=20)
                
                # Explicit fájl chunk-ok hozzáadása a lista elejéhez (magas prioritás)
                if explicit_file_chunks:
                    chunks = explicit_file_chunks + chunks

            if chunks:
                parts: list[str] = []
                max_chunks_per_file = 3  # Maximum 3 chunk fájlonként
                
                # Csoportosítjuk a chunk-okat fájlok szerint
                file_groups: dict[str, list] = {}
                for c in chunks:
                    file_path = c.get("file_path", "?")
                    if file_path not in file_groups:
                        file_groups[file_path] = []
                    file_groups[file_path].append(c)
                
                # Rendezzük a fájlokat relevancia szerint (a legjobb chunk pontszámának alapján)
                sorted_files = sorted(file_groups.keys(), 
                                     key=lambda f: max(c.get("score", 0) for c in file_groups[f]), 
                                     reverse=True)
                
                # Minden fájlból maximum max_chunks_per_file chunk-ot tartalmazunk
                for file_path in sorted_files:
                    file_chunks = file_groups[file_path]
                    chunks_to_include = file_chunks[:max_chunks_per_file]
                    
                    for c in chunks_to_include:
                        content = c.get("content", "")

                        # --- path normalizálás: projekt root-hoz viszonyított, előre perjeles útvonal ---
                        try:
                            if project and project.root_path and file_path not in ("", "?"):
                                rel = os.path.relpath(file_path, start=project.root_path)
                                rel = rel.replace("\\", "/")
                                # ha valamiért kilóg (..), inkább csak a fájlnév
                                if rel.startswith(".."):
                                    rel = Path(file_path).name
                                norm_path = rel
                            else:
                                norm_path = Path(file_path).name if file_path else "?"
                        except Exception:
                            norm_path = Path(file_path).name if file_path else "?"

                        # --- chunk tartalom limitálása, hogy ne fusson ki a kontextus ---
                        MAX_CHUNK_CHARS = 1800
                        snippet = content[:MAX_CHUNK_CHARS]

                        parts.append(f"[FILE: {norm_path}]\n{snippet}")
                
                rag_context = "\n\n".join(parts)
                
                # Debug információ
                print(f"[RAG] {len(parts)} chunk, {len(file_groups)} különböző fájlból")
        except Exception as e:
            print(f"[RAG] Hiba a vektoros lekérdezésnél: {e}")

    # --- System prompt összeállítása (globális + projektspecifikus) ---
    # Alap: a system_prompt.txt tartalma
    system_prompt = SYSTEM_PROMPT

    # Ha a projekt leírásában van szöveg, azt projektspecifikus kiegészítésként hozzáfűzzük
    if project and project.description:
        extra = project.description.strip()
        if extra:
            system_prompt = (
                SYSTEM_PROMPT
                + "\n\nPROJEKT SPECIFIKUS ÚTMUTATÁS:\n"
                + extra
            )

    # --- messages összeállítása ---
    messages: list[dict] = []

    # 1) Globális rendszerprompt
    messages.append({"role": "system", "content": system_prompt})

    # ========================================
    # 1.5) PROJEKT STRUKTÚRA - MINDIG BEKERÜL!
    # ========================================
    if smart_context and smart_context.get("project_structure"):
        project_structure_content = format_project_structure_for_prompt(smart_context["project_structure"])
        messages.append({
            "role": "system",
            "content": (
                "PROJEKT STRUKTÚRA - Ezek a fájlok léteznek a projektben:\n"
                "Használd ezt a struktúrát, hogy tudd milyen fájlokat módosíthatsz!\n"
                "Ha több fájlt kell módosítani, adj TÖBB [CODE_CHANGE] blokkot!\n\n"
                + project_structure_content
            ),
        })
        print(f"[CONTEXT] Project structure included: {smart_context['project_structure']['summary']}")

    # ========================================
    # 2) SMART CONTEXT - EXPLICIT FÁJLOK (@file mentions)
    # ========================================
    # Ez a LEGMAGASABB prioritás - ha a user explicit kéri egy fájlt!
    if smart_context and smart_context.get("loaded_files"):
        explicit_files_content = format_loaded_files_for_prompt(smart_context["loaded_files"])
        messages.append({
            "role": "system",
            "content": (
                "KRITIKUS: Az alábbi fájlok TELJES TARTALMA explicit be lett töltve, "
                "mert a felhasználó @file hivatkozással kérte őket.\n"
                "EZEKET A FÁJLOKAT HASZNÁLD ELSŐDLEGESEN a válaszadáshoz!\n"
                "Ha kódmódosítást javasolsz, PONTOSAN ezekből a fájlokból idézz.\n\n"
                + explicit_files_content
            ),
        })
        print(f"[CONTEXT] Explicit files loaded: {[f['rel_path'] for f in smart_context['loaded_files']]}")

    # ========================================
    # 3) PROJEKT MEMÓRIA - Korábbi tények
    # ========================================
    if smart_context and smart_context.get("memory_facts"):
        memory_content = format_memory_facts_for_prompt(smart_context["memory_facts"])
        messages.append({
            "role": "system",
            "content": (
                "PROJEKT MEMÓRIA - Korábbi beszélgetésekből tanult fontos tények:\n"
                + memory_content
            ),
        })

    # ========================================
    # 4) RAG kontextus (szemantikus keresés)
    # ========================================
    if rag_context:
        # Speciális utasítás projektáttekintő kérésekhez
        overview_instruction = ""
        if is_project_overview_request:
            overview_instruction = (
                "\n\nFONTOS: Projektáttekintő kérés érkezett. "
                "A felhasználó azt kéri, hogy elemezd a projektet és adj fejlesztési javaslatokat.\n"
                "1. Nézd át az összes mellékelt fájlt.\n"
                "2. Adj konkrét, alkalmazható javaslatokat.\n"
                "3. MINDEN javaslatot írj kódblokkban (```...```), hogy a felhasználó alkalmazhassa.\n"
                "4. Minden javaslat után add meg, hogy melyik fájlban és hol kell alkalmazni.\n"
                "5. Rendezd a javaslatokat prioritás szerint (legfontosabbak először).\n"
            )
        
        messages.append({
            "role": "system",
            "content": (
                "Az alábbi részletek a projekt kódbázisából származnak (szemantikus keresés alapján). "
                "Válaszadáskor ezeket részesítsd előnyben, és amikor hivatkozol rájuk, "
                "használd a [FILE: relatív/útvonal] formátumot."
                + overview_instruction
                + "\n\n" + rag_context
            ),
        })
    elif not (smart_context and smart_context.get("loaded_files")):
        # Csak akkor írjuk ki, hogy nincs kontextus, ha explicit fájlok sincsenek
        messages.append({
            "role": "system",
            "content": (
                "Jelenleg nincs projektspecifikus kód-kontekstus. "
                "NE találj ki [FILE: ...] hivatkozásokat. "
                "Ha szükséges, kérj be pontos fájlnevet/kódrészletet.\n\n"
                "TIPP A FELHASZNÁLÓNAK: Használd az @fájlnév szintaxist "
                "hogy explicit betölts egy fájlt (pl. @static/js/game.js)"
            ),
        })

    # ========================================
    # 5) AKTÍV FÁJLOK emlékeztető
    # ========================================
    if smart_context and smart_context.get("active_files"):
        active_files_list = ", ".join(smart_context["active_files"][:10])
        messages.append({
            "role": "system",
            "content": (
                f"AKTÍV FÁJLOK ebben a beszélgetésben: {active_files_list}\n"
                "Ezek a fájlok korábban már szóba kerültek - tartsd őket szem előtt."
            ),
        })

    # ========================================
    # 6) Chat előzmények - MEGNÖVELT LIMIT
    # ========================================
    # Régi: max 8 üzenet, 1200 char
    # Új: max 25 üzenet, 3000 char (a context_manager-ből)
    if smart_context and smart_context.get("enhanced_history"):
        for h in smart_context["enhanced_history"]:
            if h.get("role") and h.get("content"):
                messages.append({"role": h["role"], "content": h["content"]})
    else:
        # Fallback régi logikára, de megnövelt limitekkel
        hist = getattr(payload, "history", None) or []
        for h in hist[-MAX_HISTORY_MESSAGES:]:
            role = getattr(h, "role", None) or (h.get("role") if isinstance(h, dict) else None)
            text = getattr(h, "text", None) or (h.get("text") if isinstance(h, dict) else None)
            if not role or not text:
                continue
            if len(text) > MAX_HISTORY_CHARS_PER_MSG:
                text = text[:MAX_HISTORY_CHARS_PER_MSG] + " ... [csonkolva]"
            messages.append({"role": role, "content": text})

    # ========================================
    # 7) Az AKTUÁLIS user üzenet a végére
    # ========================================
    messages.append({"role": "user", "content": user_text})

    # Debug: teljes kontextus mérete
    total_chars = sum(len(m.get("content", "")) for m in messages)
    print(f"[CONTEXT] Total context size: {total_chars} chars, {len(messages)} messages")

    return messages


@app.post("/chat", response_model=ChatResponse)
def chat_with_llm(payload: schemas.ChatRequest, db: Session = Depends(get_db)):
    """
    LLM chat endpoint.

    Támogatja:
    - auto_mode: Ha True, az LLM automatikusan hajt végre műveleteket
    - agentic_mode: Ha True, többlépéses agentic végrehajtás
    """
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM nincs konfigurálva (OPENAI_API_KEY hiányzik).",
        )

    messages = build_llm_messages(db, payload)
    
    # Mode információ hozzáadása a system prompt-hoz - ÚJ MODE MANAGER
    mode_instruction = get_mode_system_prompt_addition(
        auto_mode=payload.auto_mode,
        agentic_mode=payload.agentic_mode
    )
    
    # Effektív mód meghatározása
    effective_mode = mode_manager.get_effective_mode(
        auto_mode=payload.auto_mode,
        agentic_mode=payload.agentic_mode
    )
    print(f"[MODE] Effective mode: {effective_mode.value}")
    
    # System message módosítása
    if messages and messages[0]["role"] == "system":
        messages[0]["content"] += mode_instruction

    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=messages,
        )
    except Exception as e:
        raise HTTPException(
            status_code=status.HTTP_502_BAD_GATEWAY,
            detail=f"LLM hívás sikertelen: {e}",
        )

    reply = completion.choices[0].message.content
    
    # Terminal parancsok kinyerése és végrehajtása auto módban
    if payload.auto_mode and reply:
        import re
        
        # [TERMINAL_COMMAND] blokkok keresése
        terminal_pattern = r'\[TERMINAL_COMMAND\]\s*COMMAND:\s*(.+?)\s*DESCRIPTION:\s*(.+?)\s*\[/TERMINAL_COMMAND\]'
        terminal_matches = re.findall(terminal_pattern, reply, re.DOTALL)
        
        if terminal_matches:
            # Projekt working directory
            working_dir = None
            if payload.project_id:
                project = db.query(models.Project).filter(models.Project.id == payload.project_id).first()
                if project and project.root_path:
                    working_dir = project.root_path
            
            terminal_results = []
            all_succeeded = True
            
            for cmd, desc in terminal_matches:
                cmd = cmd.strip()
                desc = desc.strip()
                try:
                    result = execute_terminal_command(TerminalRequest(
                        command=cmd,
                        working_dir=working_dir,
                        timeout=60,
                        shell_type="powershell"  # Mindig PowerShell Windows-on
                    ))
                    
                    if result.success:
                        terminal_results.append({
                            "cmd": cmd,
                            "desc": desc,
                            "success": True,
                            "output": result.stdout or "(sikeres, nincs kimenet)",
                            "error": None
                        })
                    else:
                        all_succeeded = False
                        terminal_results.append({
                            "cmd": cmd,
                            "desc": desc,
                            "success": False,
                            "output": result.stdout,
                            "error": result.stderr
                        })
                except Exception as e:
                    all_succeeded = False
                    terminal_results.append({
                        "cmd": cmd,
                        "desc": desc,
                        "success": False,
                        "output": None,
                        "error": str(e)
                    })
            
            # Eredmények formázása
            results_text = "\n\n---\n**🖥️ Automatikusan végrehajtott parancsok:**"
            for r in terminal_results:
                if r["success"]:
                    results_text += f"\n\n✅ **{r['desc']}:**\n```powershell\n{r['cmd']}\n```\n**Eredmény:**\n```\n{r['output']}\n```"
                else:
                    results_text += f"\n\n❌ **{r['desc']} - HIBA:**\n```powershell\n{r['cmd']}\n```\n**Hiba:**\n```\n{r['error']}\n```"
            
            reply += results_text
            
            # Ha volt hiba, küldjük vissza az LLM-nek elemzésre és újrapróbálkozásra
            if not all_succeeded and payload.agentic_mode:
                # Újra hívjuk az LLM-et a hibával
                retry_messages = messages.copy()
                retry_messages.append({"role": "assistant", "content": reply})
                retry_messages.append({
                    "role": "user", 
                    "content": (
                        "A fenti terminal parancs(ok) HIBÁVAL ZÁRULT(ak)! "
                        "Elemezd a hibát és adj JAVÍTOTT parancsot!\n\n"
                        "FONTOS:\n"
                        "- Windows PowerShell parancsot használj!\n"
                        "- Ellenőrizd a szintaxist!\n"
                        "- Ha a parancs nem létezik, használj alternatívát!\n\n"
                        "Adj új [TERMINAL_COMMAND] blokkot a javított paranccsal!"
                    )
                })
                
                try:
                    retry_completion = client.chat.completions.create(
                        model=OPENAI_MODEL,
                        messages=retry_messages,
                    )
                    retry_reply = retry_completion.choices[0].message.content
                    
                    # Újra próbáljuk a javított parancsot
                    retry_matches = re.findall(terminal_pattern, retry_reply, re.DOTALL)
                    if retry_matches:
                        reply += f"\n\n---\n**🔄 Automatikus újrapróbálkozás:**\n{retry_reply}"
                        
                        for cmd, desc in retry_matches:
                            cmd = cmd.strip()
                            desc = desc.strip()
                            try:
                                retry_result = execute_terminal_command(TerminalRequest(
                                    command=cmd,
                                    working_dir=working_dir,
                                    timeout=60,
                                    shell_type="powershell"
                                ))
                                if retry_result.success:
                                    reply += f"\n\n✅ **ÚJRAPRÓBÁLKOZÁS SIKERES ({desc}):**\n```\n{retry_result.stdout or '(sikeres)'}\n```"
                                else:
                                    reply += f"\n\n❌ **ÚJRAPRÓBÁLKOZÁS SIKERTELEN ({desc}):**\n```\n{retry_result.stderr}\n```"
                            except Exception as e:
                                reply += f"\n\n❌ **ÚJRAPRÓBÁLKOZÁS HIBA:** {e}"
                    else:
                        reply += f"\n\n---\n**🤔 LLM elemzés:**\n{retry_reply}"
                        
                except Exception as e:
                    reply += f"\n\n⚠️ Újrapróbálkozás hiba: {e}"
    
    # Parse code changes from response
    code_changes_list = None
    try:
        from .code_change_parser import parse_code_changes, format_code_changes_for_response
        parsed_changes = parse_code_changes(reply)
        if parsed_changes:
            code_changes_list = [
                CodeChangeResult(
                    file_path=c.file_path,
                    action=c.action,
                    original_code=c.original_code,
                    new_code=c.new_code,
                    anchor_code=c.anchor_code,
                    explanation=c.explanation,
                    is_valid=c.is_valid,
                    validation_error=c.validation_error
                ) for c in parsed_changes
            ]
            print(f"[CODE_CHANGES] Parsed {len(parsed_changes)} code change(s)")
    except Exception as e:
        print(f"[CODE_CHANGES] Parse error: {e}")
    
    return ChatResponse(
        reply=reply,
        terminal_results=[
            TerminalExecutionResult(
                command=r["cmd"],
                description=r["desc"],
                success=r["success"],
                output=r.get("output"),
                error=r.get("error")
            ) for r in terminal_results
        ] if 'terminal_results' in dir() and terminal_results else None,
        code_changes=code_changes_list,
        had_errors=not all_succeeded if 'all_succeeded' in dir() else False,
        retry_attempted='retry_reply' in dir()
    )


# =====================================
#   PERMISSION MANAGEMENT ENDPOINTS
# =====================================

@app.get("/api/mode/info")
def get_mode_info():
    """Aktuális mód információ és függőben lévő műveletek"""
    pending = mode_manager.get_pending_actions()
    return {
        "pending_actions": [a.to_dict() for a in pending],
        "pending_count": len(pending),
    }


@app.post("/api/permission/approve/{action_id}")
def approve_pending_action(action_id: str):
    """Függőben lévő művelet jóváhagyása"""
    action = mode_manager.approve_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Művelet nem található")
    return {
        "status": "approved",
        "action": action.to_dict(),
    }


@app.post("/api/permission/reject/{action_id}")
def reject_pending_action(action_id: str):
    """Függőben lévő művelet elutasítása"""
    action = mode_manager.reject_action(action_id)
    if not action:
        raise HTTPException(status_code=404, detail="Művelet nem található")
    return {
        "status": "rejected",
        "action": action.to_dict(),
    }


@app.delete("/api/permission/clear")
def clear_all_pending_actions():
    """Összes függőben lévő művelet törlése"""
    mode_manager.clear_pending_actions()
    return {"status": "ok", "message": "Minden függőben lévő művelet törölve"}


# =====================================
#   SZINTAXIS HIBA JAVÍTÁS
# =====================================

class ErrorFixRequest(BaseModel):
    project_id: Optional[str] = None
    file_path: str
    code: str
    error_line: int
    error_message: str

class ErrorFixResponse(BaseModel):
    fixed_code: Optional[str] = None
    explanation: Optional[str] = None
    success: bool = False

ERROR_FIX_PROMPT = """Te egy kód javító asszisztens vagy. A felhasználó egy szintaxis hibát talált a kódjában.

HIBA INFORMÁCIÓ:
- Sor: {error_line}
- Üzenet: {error_message}

A HIBÁS KÓD RÉSZLET (a hiba környezete):
```
{code_context}
```

FELADATOD:
1. Azonosítsd a hibát a megadott sorban
2. Javítsd ki a hibát
3. Add vissza a TELJES JAVÍTOTT KÓDOT (ne csak a részletet!)

FONTOS SZABÁLYOK:
- Csak a hibát javítsd, ne változtass semmi mást!
- Ha a hiba hiányzó zárójelekre/pontosvesszőre vonatkozik, add hozzá
- Ha a hiba szintaktikai, javítsd a szintaxist
- Ne adj magyarázatot, CSAK a javított kódot add vissza
- A válaszod legyen CSAK a javított teljes kód, semmi más szöveg!

JAVÍTOTT KÓD:"""

@app.post("/api/fix-error", response_model=ErrorFixResponse)
def fix_code_error(request: ErrorFixRequest):
    """Szintaxis hiba javítása LLM segítségével."""
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM nincs konfigurálva",
        )

    # Kontextus kinyerése a hiba körül
    lines = request.code.split('\n')
    error_idx = request.error_line - 1  # 0-indexed
    
    # 10 sor előtte és utána
    start = max(0, error_idx - 10)
    end = min(len(lines), error_idx + 11)
    
    code_context = '\n'.join(
        f"{i+1:4d} | {lines[i]}" 
        for i in range(start, end)
    )

    prompt = ERROR_FIX_PROMPT.format(
        error_line=request.error_line,
        error_message=request.error_message,
        code_context=code_context,
    )

    try:
        completion = client.chat.completions.create(
            model=OPENAI_MODEL,
            messages=[
                {"role": "system", "content": "Te egy precíz kód javító vagy. Csak a javított kódot add vissza, semmi mást."},
                {"role": "user", "content": prompt},
            ],
            temperature=0.1,  # Alacsony hőmérséklet a pontosabb javításhoz
        )
        
        reply = completion.choices[0].message.content.strip()
        
        # Kódblokkból kinyerés ha van
        if "```" in reply:
            import re
            code_match = re.search(r'```(?:\w+)?\n([\s\S]*?)```', reply)
            if code_match:
                reply = code_match.group(1).strip()
        
        # Ha a válasz csak a javított sor, akkor beillesztjük
        reply_lines = reply.split('\n')
        
        # Ha nagyon rövid a válasz, lehet hogy csak a javított sort adta vissza
        if len(reply_lines) < len(lines) // 2:
            # Próbáljuk beilleszteni a javított sort
            if len(reply_lines) <= 3:
                # Csak néhány sort adott vissza - beillesztjük a megfelelő helyre
                new_lines = lines.copy()
                for i, new_line in enumerate(reply_lines):
                    target_idx = error_idx + i
                    if target_idx < len(new_lines):
                        new_lines[target_idx] = new_line.lstrip('0123456789 |')  # Sorszám eltávolítása ha van
                return ErrorFixResponse(
                    fixed_code='\n'.join(new_lines),
                    success=True,
                )
        
        return ErrorFixResponse(
            fixed_code=reply,
            success=True,
        )
        
    except Exception as e:
        print(f"[FIX ERROR] Hiba: {e}")
        return ErrorFixResponse(
            fixed_code=None,
            explanation=str(e),
            success=False,
        )


# =====================================
#   FÁJL MŰVELETEK
# =====================================

class FileRenameRequest(BaseModel):
    old_path: str
    new_path: str

class FileDeleteRequest(BaseModel):
    path: str

@app.post("/projects/{project_id}/file/rename")
def rename_project_file(
    project_id: int, 
    request: FileRenameRequest, 
    db: Session = Depends(get_db)
):
    """Fájl vagy mappa átnevezése."""
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nem található")
    
    if not project.root_path:
        raise HTTPException(status_code=400, detail="Projekt root_path nincs beállítva")
    
    old_full_path = os.path.join(project.root_path, request.old_path)
    new_full_path = os.path.join(project.root_path, request.new_path)
    
    # Biztonsági ellenőrzés
    if not os.path.abspath(old_full_path).startswith(os.path.abspath(project.root_path)):
        raise HTTPException(status_code=400, detail="Érvénytelen forrás útvonal")
    if not os.path.abspath(new_full_path).startswith(os.path.abspath(project.root_path)):
        raise HTTPException(status_code=400, detail="Érvénytelen cél útvonal")
    
    if not os.path.exists(old_full_path):
        raise HTTPException(status_code=404, detail="Fájl nem található")
    
    if os.path.exists(new_full_path):
        raise HTTPException(status_code=400, detail="A cél már létezik")
    
    try:
        # Biztosítjuk hogy a cél könyvtár létezik
        os.makedirs(os.path.dirname(new_full_path), exist_ok=True)
        os.rename(old_full_path, new_full_path)
        return {"status": "ok", "message": f"Átnevezve: {request.old_path} -> {request.new_path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


@app.post("/projects/{project_id}/file/delete")
def delete_project_file(
    project_id: int, 
    request: FileDeleteRequest, 
    db: Session = Depends(get_db)
):
    """Fájl vagy mappa törlése."""
    import shutil
    
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nem található")
    
    if not project.root_path:
        raise HTTPException(status_code=400, detail="Projekt root_path nincs beállítva")
    
    full_path = os.path.join(project.root_path, request.path)
    
    # Biztonsági ellenőrzés
    if not os.path.abspath(full_path).startswith(os.path.abspath(project.root_path)):
        raise HTTPException(status_code=400, detail="Érvénytelen útvonal")
    
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail="Fájl nem található")
    
    try:
        if os.path.isdir(full_path):
            shutil.rmtree(full_path)
        else:
            os.remove(full_path)
        return {"status": "ok", "message": f"Törölve: {request.path}"}
    except Exception as e:
        raise HTTPException(status_code=500, detail=str(e))


# =====================================
#   LLM PROVIDER KEZELÉS
# =====================================

@app.get("/api/llm-providers", response_model=List[schemas.LLMProviderRead])
def list_llm_providers(db: Session = Depends(get_db)):
    """Összes LLM provider listázása."""
    providers = db.query(models.LLMProvider).all()
    
    # API kulcsot ne adjuk vissza, csak jelezzük hogy van-e
    result = []
    for p in providers:
        result.append(schemas.LLMProviderRead(
            id=p.id,
            name=p.name,
            provider_type=p.provider_type,
            api_key=None,  # Soha nem adjuk vissza
            api_base_url=p.api_base_url,
            model_name=p.model_name,
            max_tokens=p.max_tokens,
            temperature=p.temperature,
            is_active=p.is_active,
            is_default=p.is_default,
            api_key_set=bool(p.api_key),
            created_at=p.created_at,
        ))
    return result


@app.post("/api/llm-providers", response_model=schemas.LLMProviderRead)
def create_llm_provider(provider: schemas.LLMProviderCreate, db: Session = Depends(get_db)):
    """Új LLM provider létrehozása."""
    # API kulcs titkosítása
    encrypted_key = encrypt_api_key(provider.api_key) if provider.api_key else None
    
    db_provider = models.LLMProvider(
        name=provider.name,
        provider_type=provider.provider_type,
        api_key=encrypted_key,
        api_base_url=provider.api_base_url,
        model_name=provider.model_name,
        max_tokens=provider.max_tokens,
        temperature=provider.temperature,
        is_active=False,
        is_default=False,
    )
    
    db.add(db_provider)
    db.commit()
    db.refresh(db_provider)
    
    return schemas.LLMProviderRead(
        id=db_provider.id,
        name=db_provider.name,
        provider_type=db_provider.provider_type,
        api_key=None,
        api_base_url=db_provider.api_base_url,
        model_name=db_provider.model_name,
        max_tokens=db_provider.max_tokens,
        temperature=db_provider.temperature,
        is_active=db_provider.is_active,
        is_default=db_provider.is_default,
        api_key_set=bool(db_provider.api_key),
        created_at=db_provider.created_at,
    )


@app.put("/api/llm-providers/{provider_id}", response_model=schemas.LLMProviderRead)
def update_llm_provider(provider_id: int, update: schemas.LLMProviderUpdate, db: Session = Depends(get_db)):
    """LLM provider frissítése."""
    db_provider = db.query(models.LLMProvider).filter(models.LLMProvider.id == provider_id).first()
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider nem található")
    
    # Mezők frissítése
    if update.name is not None:
        db_provider.name = update.name
    if update.provider_type is not None:
        db_provider.provider_type = update.provider_type
    if update.api_key is not None:
        db_provider.api_key = encrypt_api_key(update.api_key)
    if update.api_base_url is not None:
        db_provider.api_base_url = update.api_base_url
    if update.model_name is not None:
        db_provider.model_name = update.model_name
    if update.max_tokens is not None:
        db_provider.max_tokens = update.max_tokens
    if update.temperature is not None:
        db_provider.temperature = update.temperature
    
    # Aktiválás kezelése - csak egy lehet aktív
    if update.is_active is not None:
        if update.is_active:
            # Minden mást inaktiválunk
            db.query(models.LLMProvider).update({models.LLMProvider.is_active: False})
        db_provider.is_active = update.is_active
    
    db.commit()
    db.refresh(db_provider)
    
    return schemas.LLMProviderRead(
        id=db_provider.id,
        name=db_provider.name,
        provider_type=db_provider.provider_type,
        api_key=None,
        api_base_url=db_provider.api_base_url,
        model_name=db_provider.model_name,
        max_tokens=db_provider.max_tokens,
        temperature=db_provider.temperature,
        is_active=db_provider.is_active,
        is_default=db_provider.is_default,
        api_key_set=bool(db_provider.api_key),
        created_at=db_provider.created_at,
    )


@app.delete("/api/llm-providers/{provider_id}")
def delete_llm_provider(provider_id: int, db: Session = Depends(get_db)):
    """LLM provider törlése."""
    db_provider = db.query(models.LLMProvider).filter(models.LLMProvider.id == provider_id).first()
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider nem található")
    
    db.delete(db_provider)
    db.commit()
    
    return {"status": "ok", "message": "Provider törölve"}


@app.post("/api/llm-providers/{provider_id}/activate")
def activate_llm_provider(provider_id: int, db: Session = Depends(get_db)):
    """LLM provider aktiválása (csak egy lehet aktív)."""
    db_provider = db.query(models.LLMProvider).filter(models.LLMProvider.id == provider_id).first()
    if not db_provider:
        raise HTTPException(status_code=404, detail="Provider nem található")
    
    # Minden mást inaktiválunk
    db.query(models.LLMProvider).update({models.LLMProvider.is_active: False})
    
    # Ezt aktiváljuk
    db_provider.is_active = True
    db.commit()
    
    # Frissítjük a globális OpenAI klienst
    global client
    if db_provider.provider_type == "openai" and db_provider.api_key:
        decrypted_key = decrypt_api_key(db_provider.api_key)
        if decrypted_key:
            client = OpenAI(api_key=decrypted_key)
            print(f"[LLM] Aktív provider: {db_provider.name} ({db_provider.model_name})")
    
    return {"status": "ok", "message": f"Provider aktiválva: {db_provider.name}"}


# =====================================
#   PROJEKT EXPORT / IMPORT
# =====================================

from fastapi.responses import FileResponse
import zipfile
import tempfile
import io

@app.get("/projects/{project_id}/export")
def export_project(project_id: int, mode: str = "light", db: Session = Depends(get_db)):
    """Projekt exportálása ZIP fájlba.
    
    mode: "light" (csak forrásfájlok) vagy "full" (minden)
    """
    from datetime import datetime as dt
    from fastapi.responses import StreamingResponse
    
    project = db.query(models.Project).filter(models.Project.id == project_id).first()
    if not project:
        raise HTTPException(status_code=404, detail="Projekt nem található")
    
    if not project.root_path:
        raise HTTPException(status_code=400, detail="Projekt root_path nincs beállítva")
    
    root_path = os.path.abspath(project.root_path)
    if not os.path.exists(root_path):
        raise HTTPException(status_code=400, detail=f"Projekt mappa nem található: {root_path}")
    
    is_full = mode.lower() == "full"
    print(f"[EXPORT] Mode: {mode}, Full: {is_full}")
    
    try:
        # ZIP fájl létrehozása
        zip_buffer = io.BytesIO()
        
        with zipfile.ZipFile(zip_buffer, 'w', zipfile.ZIP_DEFLATED) as zf:
            # Projekt metaadatok
            metadata = {
                "name": project.name,
                "description": project.description or "",
                "exported_at": dt.utcnow().isoformat(),
                "root_path": root_path,
                "export_mode": mode,
            }
            zf.writestr("__project_meta__.json", json.dumps(metadata, indent=2, ensure_ascii=False))
            
            # Fájlok hozzáadása
            file_count = 0
            skipped_size = 0
            
            if is_full:
                # FULL mód: csak a legszükségesebb kihagyások
                skip_dirs = {'node_modules', '.git'}
                skip_extensions = set()  # Nem hagyunk ki kiterjesztést
                max_file_size = 100 * 1024 * 1024  # 100MB limit
            else:
                # LIGHT mód: optimalizált export
                skip_dirs = {'node_modules', '__pycache__', 'venv', '.git', 'backup', 'target', 'build', 'dist', '.venv', 'env'}
                skip_extensions = {'.db', '.sqlite', '.sqlite3', '.rlib', '.rmeta', '.dll', '.so', '.dylib', '.exe', '.o', '.a', '.lib', '.pdb', '.wasm', '.zip', '.tar', '.gz', '.7z', '.rar'}
                max_file_size = 10 * 1024 * 1024  # 10MB limit
            
            for root, dirs, files in os.walk(root_path):
                # Kihagyjuk a rejtett mappákat és build könyvtárakat
                dirs[:] = [d for d in dirs if not d.startswith('.') and d.lower() not in skip_dirs]
                
                for file in files:
                    if file.startswith('.'):
                        continue
                    
                    # Light módban kihagyjuk a build/binary fájlokat
                    if not is_full:
                        _, ext = os.path.splitext(file.lower())
                        if ext in skip_extensions:
                            continue
                    
                    file_path = os.path.join(root, file)
                    try:
                        file_size = os.path.getsize(file_path)
                        if file_size > max_file_size:
                            skipped_size += file_size
                            continue
                    except:
                        continue
                        
                    arc_name = os.path.relpath(file_path, root_path)
                    
                    try:
                        zf.write(file_path, arc_name)
                        file_count += 1
                    except Exception as e:
                        print(f"[EXPORT] Nem sikerült: {file_path} - {e}")
            
            skipped_mb = round(skipped_size / (1024 * 1024), 1)
            print(f"[EXPORT] {file_count} fájl hozzáadva (kihagyva: {skipped_mb} MB)")
        
        zip_buffer.seek(0)
        
        # Biztonságos fájlnév
        safe_name = "".join(c for c in project.name if c.isalnum() or c in "._- ").strip()
        if not safe_name:
            safe_name = f"project_{project_id}"
        
        return StreamingResponse(
            zip_buffer,
            media_type="application/zip",
            headers={
                "Content-Disposition": f'attachment; filename="{safe_name}.zip"',
                "Access-Control-Expose-Headers": "Content-Disposition"
            }
        )
    except Exception as e:
        import traceback
        print(f"[EXPORT ERROR] {e}")
        print(f"[EXPORT TRACEBACK] {traceback.format_exc()}")
        raise HTTPException(status_code=500, detail=f"Export hiba: {str(e)}")


class ProjectImportRequest(BaseModel):
    name: str
    target_path: str


@app.post("/projects/import")
async def import_project(
    file: bytes = None,
    name: str = None,
    target_path: str = None,
    db: Session = Depends(get_db)
):
    """Projekt importálása ZIP fájlból."""
    # Ez egy egyszerűsített verzió - a frontend külön kezeli a fájl feltöltést
    # Valójában a teljes implementációhoz UploadFile kellene
    
    if not name or not target_path:
        raise HTTPException(status_code=400, detail="Név és cél útvonal kötelező")
    
    # Ellenőrizzük hogy létezik-e már ilyen nevű projekt
    existing = db.query(models.Project).filter(models.Project.name == name).first()
    if existing:
        raise HTTPException(status_code=400, detail="Már létezik ilyen nevű projekt")
    
    # Projekt létrehozása
    db_project = models.Project(
        name=name,
        description=f"Importált projekt",
        root_path=target_path,
    )
    
    db.add(db_project)
    db.commit()
    db.refresh(db_project)
    
    return {"status": "ok", "project_id": db_project.id, "message": f"Projekt importálva: {name}"}


# =====================================
#   TERMINAL VÉGREHAJTÁS
# =====================================

import subprocess

class TerminalRequest(BaseModel):
    command: str
    working_dir: Optional[str] = None
    timeout: int = 30
    shell_type: str = "powershell"  # "powershell", "cmd", "bash" - alapértelmezett: PowerShell

class TerminalResponse(BaseModel):
    stdout: str
    stderr: str
    return_code: int
    success: bool

@app.post("/api/terminal/execute", response_model=TerminalResponse)
def execute_terminal_command(request: TerminalRequest):
    """
    Terminal parancs végrehajtása.
    Windows-on PowerShell-t használ, Linux/Mac-en bash-t.
    """
    import platform
    import shutil
    
    try:
        # Biztonsági ellenőrzések
        dangerous_commands = ['rm -rf /', 'format c:', 'del /s /q c:', ':(){:|:&};:', 'Remove-Item -Recurse -Force C:']
        if any(dc in request.command.lower() for dc in dangerous_commands):
            return TerminalResponse(
                stdout="",
                stderr="⚠️ Veszélyes parancs blokkolva!",
                return_code=1,
                success=False
            )
        
        is_windows = platform.system() == "Windows"
        shell_type = request.shell_type.lower() if request.shell_type else "powershell"
        
        # Shell típus meghatározása
        if shell_type == "cmd" or (not is_windows and shell_type == "powershell"):
            # CMD kényszerítése vagy Linux-on bash használata
            if is_windows:
                cmd = f"chcp 65001 >nul && {request.command}"
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    timeout=request.timeout,
                    cwd=request.working_dir,
                    encoding='utf-8',
                    errors='replace',
                )
                return TerminalResponse(
                    stdout=result.stdout[:10000] if result.stdout else "",
                    stderr=result.stderr[:5000] if result.stderr else "",
                    return_code=result.returncode,
                    success=result.returncode == 0
                )
        
        if is_windows:
            # Windows: PowerShell használata (támogatja a modern parancsokat)
            # Keressük meg a PowerShell-t
            pwsh_path = shutil.which("pwsh")  # PowerShell 7+
            if not pwsh_path:
                pwsh_path = shutil.which("powershell")  # Windows PowerShell 5.1
            
            if pwsh_path:
                # PowerShell végrehajtás
                # -NoProfile: gyorsabb indítás
                # -ExecutionPolicy Bypass: script futtatás engedélyezése
                # -Command: parancs végrehajtása
                result = subprocess.run(
                    [pwsh_path, "-NoProfile", "-ExecutionPolicy", "Bypass", "-Command", request.command],
                    capture_output=True,
                    timeout=request.timeout,
                    cwd=request.working_dir,
                    encoding='utf-8',
                    errors='replace',
                )
            else:
                # Fallback: CMD ha nincs PowerShell (ritka)
                cmd = f"chcp 65001 >nul && {request.command}"
                result = subprocess.run(
                    cmd,
                    shell=True,
                    capture_output=True,
                    timeout=request.timeout,
                    cwd=request.working_dir,
                    encoding='utf-8',
                    errors='replace',
                )
        else:
            # Linux/Mac: bash
            result = subprocess.run(
                request.command,
                shell=True,
                capture_output=True,
                timeout=request.timeout,
                cwd=request.working_dir,
                encoding='utf-8',
                errors='replace',
            )
        
        return TerminalResponse(
            stdout=result.stdout[:10000] if result.stdout else "",
            stderr=result.stderr[:5000] if result.stderr else "",
            return_code=result.returncode,
            success=result.returncode == 0
        )
        
    except subprocess.TimeoutExpired:
        return TerminalResponse(
            stdout="",
            stderr=f"⏱️ Időtúllépés ({request.timeout}s)",
            return_code=-1,
            success=False
        )
    except Exception as e:
        return TerminalResponse(
            stdout="",
            stderr=f"❌ Hiba: {str(e)}",
            return_code=-1,
            success=False
        )


# =====================================
#   AGENTIC MÓD
# =====================================

class AgenticRequest(BaseModel):
    message: str
    project_id: Optional[int] = None
    session_id: Optional[str] = None
    max_steps: int = 5

class AgenticStep(BaseModel):
    step: int
    action: str  # "think", "code", "terminal", "file", "done"
    content: str
    result: Optional[str] = None

class AgenticResponse(BaseModel):
    steps: List[AgenticStep]
    final_response: str
    success: bool

AGENTIC_SYSTEM_PROMPT = """Te egy agentic AI asszisztens vagy. WINDOWS környezet!

⚠️ KRITIKUS SZABÁLYOK:
1. CSAK PowerShell parancsokat használj!
2. BACKUP nélkül NE módosíts fájlokat!
3. Ellenőrizd az eredményt!

❌ TILOS: find, iconv, mv, rm, cat, grep, bash (Linux parancsok)
✅ HASZNÁLD: Get-ChildItem, Get-Content, Set-Content, Copy-Item

AKCIÓK:
1. [THINK] - Tervezés
2. [TERMINAL] - PowerShell parancs
3. [CODE] FILE:path - Kód írás
4. [READ] FILE:path - Fájl olvasás
5. [VERIFY] - Ellenőrzés
6. [DONE] - Befejezés

⚠️ ENCODING KONVERZIÓ - VESZÉLYES! ⚠️

Ha ilyen karaktereket látsz: "Ã¡", "Ã©", "Ã­" stb.
→ A fájl MÁR SÉRÜLT, NE próbálj újabb konverziót!
→ Mondd: "Állítsd vissza BACKUP-ból!"

Ha EREDETI fájlt kell konvertálni:
1. BACKUP: Copy-Item "file.js" "file.js.backup"
2. KONVERZIÓ: $c = Get-Content "file.js" -Encoding Default -Raw; Set-Content "file.js" -Value $c -Encoding UTF8
3. ELLENŐRZÉS: Get-Content "file.js" -Head 10
4. HA ROSSZ: Move-Item "file.js.backup" "file.js" -Force

FORMÁTUM:
[AKCIÓ]
tartalom
[/AKCIÓ]

SZABÁLYOK:
- [THINK]-kel kezdj!
- [VERIFY]-val ellenőrizd!
- [DONE]-nal zárd!
"""

@app.post("/api/agentic/execute")
async def execute_agentic(request: AgenticRequest, db: Session = Depends(get_db)):
    """Agentic mód - többlépéses feladat végrehajtás."""
    if client is None:
        raise HTTPException(status_code=503, detail="LLM nincs konfigurálva")
    
    steps: List[AgenticStep] = []
    working_dir = None
    
    # Ha van projekt, lekérjük a working directory-t
    if request.project_id:
        project = db.query(models.Project).filter(models.Project.id == request.project_id).first()
        if project and project.root_path:
            working_dir = project.root_path
    
    # Első lépés: LLM-től kérünk tervet
    messages = [
        {"role": "system", "content": AGENTIC_SYSTEM_PROMPT},
        {"role": "user", "content": request.message}
    ]
    
    for step_num in range(request.max_steps):
        try:
            completion = client.chat.completions.create(
                model=OPENAI_MODEL,
                messages=messages,
                temperature=0.3,
            )
            
            response = completion.choices[0].message.content
            messages.append({"role": "assistant", "content": response})
            
            # Akciók kinyerése
            import re
            
            # THINK
            think_match = re.search(r'\[THINK\]([\s\S]*?)\[/THINK\]', response)
            if think_match:
                steps.append(AgenticStep(
                    step=step_num + 1,
                    action="think",
                    content=think_match.group(1).strip()
                ))
            
            # TERMINAL - PowerShell végrehajtás
            terminal_match = re.search(r'\[TERMINAL\]([\s\S]*?)\[/TERMINAL\]', response)
            if terminal_match:
                cmd = terminal_match.group(1).strip()
                # Végrehajtás PowerShell-lel
                term_result = execute_terminal_command(TerminalRequest(
                    command=cmd,
                    working_dir=working_dir,
                    timeout=60,
                    shell_type="powershell"  # Mindig PowerShell!
                ))
                
                steps.append(AgenticStep(
                    step=step_num + 1,
                    action="terminal",
                    content=cmd,
                    result=term_result.stdout or term_result.stderr
                ))
                
                # Eredmény hozzáadása a kontextushoz - sikeres vagy hibás
                if term_result.success:
                    messages.append({
                        "role": "user",
                        "content": f"✅ Terminal SIKERES:\n```\n{term_result.stdout or '(nincs kimenet)'}\n```"
                    })
                else:
                    messages.append({
                        "role": "user",
                        "content": f"❌ Terminal HIBA:\n```\n{term_result.stderr}\n```\nPróbáld újra javított PowerShell paranccsal!"
                    })
            
            # VERIFY - Ellenőrzés végrehajtása
            verify_match = re.search(r'\[VERIFY\]([\s\S]*?)\[/VERIFY\]', response)
            if verify_match:
                verify_cmd = verify_match.group(1).strip()
                verify_result = execute_terminal_command(TerminalRequest(
                    command=verify_cmd,
                    working_dir=working_dir,
                    timeout=30,
                    shell_type="powershell"
                ))
                
                steps.append(AgenticStep(
                    step=step_num + 1,
                    action="verify",
                    content=verify_cmd,
                    result=verify_result.stdout or verify_result.stderr
                ))
                
                messages.append({
                    "role": "user",
                    "content": f"Ellenőrzés eredménye:\n```\n{verify_result.stdout or verify_result.stderr}\n```"
                })
            
            # READ - Fájl olvasás
            read_match = re.search(r'\[READ\]\s*FILE:(.+?)\[/READ\]', response)
            if read_match:
                file_path = read_match.group(1).strip()
                
                if working_dir:
                    full_path = os.path.join(working_dir, file_path)
                    try:
                        with open(full_path, 'r', encoding='utf-8', errors='replace') as f:
                            content = f.read(10000)  # Max 10KB
                        
                        steps.append(AgenticStep(
                            step=step_num + 1,
                            action="read",
                            content=f"FILE: {file_path}",
                            result=content[:2000] + ("..." if len(content) > 2000 else "")
                        ))
                        
                        messages.append({
                            "role": "user",
                            "content": f"Fájl tartalma ({file_path}):\n```\n{content[:3000]}\n```"
                        })
                    except Exception as e:
                        steps.append(AgenticStep(
                            step=step_num + 1,
                            action="read",
                            content=f"FILE: {file_path}",
                            result=f"Hiba: {e}"
                        ))
            
            # CODE - Fájl írás (BACKUP-pal!)
            code_match = re.search(r'\[CODE\]\s*FILE:(.+?)\n([\s\S]*?)\[/CODE\]', response)
            if code_match:
                file_path = code_match.group(1).strip()
                code_content = code_match.group(2).strip()
                
                steps.append(AgenticStep(
                    step=step_num + 1,
                    action="code",
                    content=f"FILE: {file_path}\n{code_content}"
                ))
                
                # Fájl mentése ha van working_dir
                if working_dir:
                    full_path = os.path.join(working_dir, file_path)
                    try:
                        # ⚠️ BACKUP létrehozása ELŐTT!
                        if os.path.exists(full_path):
                            backup_dir = os.path.join(ROOT_DIR, "backup", "agentic")
                            os.makedirs(backup_dir, exist_ok=True)
                            backup_filename = f"{os.path.basename(file_path)}_{int(time.time())}.bak"
                            backup_path = os.path.join(backup_dir, backup_filename)
                            shutil.copy2(full_path, backup_path)
                            steps[-1].result = f"📁 Backup: {backup_filename}"
                        
                        os.makedirs(os.path.dirname(full_path) if os.path.dirname(full_path) else ".", exist_ok=True)
                        with open(full_path, 'w', encoding='utf-8') as f:
                            f.write(code_content)
                        steps[-1].result = (steps[-1].result or "") + f"\n✅ Fájl mentve: {file_path}"
                        messages.append({
                            "role": "user",
                            "content": f"Fájl sikeresen mentve: {file_path}"
                        })
                    except Exception as e:
                        steps[-1].result = f"❌ Hiba: {e}"
                        messages.append({
                            "role": "user",
                            "content": f"Fájl mentési hiba ({file_path}): {e}"
                        })
            
            # DONE
            done_match = re.search(r'\[DONE\]([\s\S]*?)\[/DONE\]', response)
            if done_match:
                steps.append(AgenticStep(
                    step=step_num + 1,
                    action="done",
                    content=done_match.group(1).strip()
                ))
                break
                
        except Exception as e:
            steps.append(AgenticStep(
                step=step_num + 1,
                action="error",
                content=str(e)
            ))
            break
    
    # Final response - sikert a DONE akció jelenléte és a hibák hiánya alapján számoljuk
    has_done = any(s.action == "done" for s in steps)
    has_errors = any(s.action == "error" or (s.result and "❌" in s.result) for s in steps)
    
    final = steps[-1].content if steps else "Nem sikerült végrehajtani a feladatot."
    success = has_done and not has_errors
    
    return {
        "steps": [s.dict() for s in steps],
        "final_response": final,
        "success": success
    }


# =====================================
#   WEBSOCKET - REAL-TIME SYNC
# =====================================

from .websocket_manager import manager as ws_manager

@app.websocket("/ws/{client_id}")
async def websocket_endpoint(websocket: WebSocket, client_id: str):
    """
    WebSocket endpoint real-time szinkronizációhoz.
    
    Támogatott üzenet típusok:
    - ping/pong: Kapcsolat ellenőrzés
    - chat: Chat üzenet szinkronizálás
    - log: Log üzenet broadcast
    - file_change: Aktív fájl változás értesítés
    - join_project/leave_project: Projekt szoba kezelés
    - request_state: Teljes állapot lekérés
    """
    await ws_manager.connect(websocket, client_id)
    
    try:
        while True:
            # Üzenet fogadása
            data = await websocket.receive_json()
            # Feldolgozás
            await ws_manager.handle_message(client_id, data)
    except WebSocketDisconnect:
        ws_manager.disconnect(client_id)
    except Exception as e:
        print(f"[WS] Hiba: {e}")
        ws_manager.disconnect(client_id)


@app.get("/ws/clients/count")
def get_connected_clients():
    """Csatlakozott kliensek száma"""
    return {"count": len(ws_manager.active_connections)}

