import os
import sys

# --- Projekt gyökér felvétele a sys.path-re, hogy elérjük a vector_store.py-t ---
CURRENT_DIR = os.path.dirname(__file__)               # .../backend/app
BACKEND_DIR = os.path.dirname(CURRENT_DIR)            # .../backend
ROOT_DIR = os.path.dirname(BACKEND_DIR)               # .../llm_dev_env (projekt gyökér)

if ROOT_DIR not in sys.path:
    sys.path.insert(0, ROOT_DIR)

from typing import List, Optional

from fastapi import Depends, FastAPI, HTTPException, status, BackgroundTasks
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session
from pydantic import BaseModel

from . import models, schemas
from .database import SessionLocal, engine
from .config import OPENAI_API_KEY, OPENAI_MODEL, FRONTEND_ORIGINS


from openai import OpenAI
from vector_store import index_project, query_project


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
origins = FRONTEND_ORIGINS or ["http://localhost:5173"]

app.add_middleware(
    CORSMiddleware,
    allow_origins=origins if origins != ["*"] else ["*"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

print(f"[CORS] Engedélyezett origin-ek: {origins}")

print(f"[CORS] Engedélyezett origin-ek: {origins}")



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


@app.post("/projects/{project_id}/reindex")
def reindex_project(
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

    vector_key = get_vector_project_key(project)

    background_tasks.add_task(
        index_project,
        vector_key,
        project.root_path,
    )

    return {
        "status": "ok",
        "message": f"Reindexelés elindítva a háttérben (projekt_id={project_id}).",
    }


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


# =====================================
#   LLM CLIENT + /chat
# =====================================

client: Optional[OpenAI] = None
if OPENAI_API_KEY:
    client = OpenAI(api_key=OPENAI_API_KEY)


class ChatRequest(BaseModel):
    message: str
    project_id: Optional[int] = None
    source_code: Optional[str] = None
    projected_code: Optional[str] = None


class ChatResponse(BaseModel):
    reply: str


def build_llm_messages(db: Session, payload: ChatRequest) -> list[dict]:
    """
    Összerakja az OpenAI messages listát:
    - system prompt (fejlesztői asszisztens)
    - RAG kontextus a vector_store-ból (ha van project_id)
    - user üzenet + extra kontextus (kódrészletek)
    """
    system_prompt = (
        "Te egy fejlesztői asszisztens vagy. "
        "Segítesz kódot átnézni, refaktorálni, magyarázni. "
        "Röviden, célzottan válaszolj, konkrét kódrészletekkel, ha lehetséges. "
        "Ha a kontextusban fájlnevek vagy chunk információk szerepelnek, "
        "a válaszban hivatkozz rájuk (FILE: path, chunk #)."
    )

    user_parts: list[str] = [payload.message]

    project: Optional[models.Project] = None
    vector_key: Optional[str] = None

    # --- Projekt betöltése, ha van project_id ---
    if payload.project_id is not None:
        project = (
            db.query(models.Project)
            .filter(models.Project.id == payload.project_id)
            .first()
        )
        user_parts.append(f"\n[Projekt ID: {payload.project_id}]")

        if project:
            vector_key = get_vector_project_key(project)

    # --- Extra: forráskód + módosított kód részlet ---
    if payload.source_code:
        user_parts.append(
            "\n[Forráskód részlet]\n" + payload.source_code[:4000]
        )

    if payload.projected_code:
        user_parts.append(
            "\n[Módosított kód részlet]\n" + payload.projected_code[:4000]
        )

    user_text = "\n".join(user_parts)

    # --- RAG: releváns chunkok a vector_store-ból ---
    rag_context = ""
    if project and project.root_path and vector_key:
        try:
            # Keressünk a kérdés + kódkörnyezet kombinációjára
            search_text_parts = [payload.message]
            if payload.source_code:
                search_text_parts.append(payload.source_code[:2000])
            if payload.projected_code:
                search_text_parts.append(payload.projected_code[:2000])

            search_text = "\n\n".join(search_text_parts)

            chunks = query_project(vector_key, search_text, top_k=5)

            if chunks:
                parts: list[str] = []
                for c in chunks:
                    file_path = c.get("file_path", "?")
                    idx = c.get("chunk_index", 0)
                    content = c.get("content", "")

                    parts.append(
                        f"[FILE: {file_path} | chunk #{idx}]\n{content}"
                    )

                rag_context = "\n\n".join(parts)
        except Exception as e:
            print(f"[RAG] Hiba a vektoros lekérdezésnél: {e}")

    # --- messages összeállítása ---
    messages: list[dict] = []
    messages.append({"role": "system", "content": system_prompt})

    if rag_context:
        messages.append(
            {
                "role": "system",
                "content": (
                    "Az alábbi részletek a projekt kódbázisából származnak. "
                    "Válaszadáskor ezeket részesítsd előnyben:\n\n"
                    f"{rag_context}"
                ),
            }
        )

    messages.append({"role": "user", "content": user_text})
    return messages


@app.post("/chat", response_model=ChatResponse)
def chat_with_llm(payload: ChatRequest, db: Session = Depends(get_db)):
    if client is None:
        raise HTTPException(
            status_code=status.HTTP_503_SERVICE_UNAVAILABLE,
            detail="LLM nincs konfigurálva (OPENAI_API_KEY hiányzik).",
        )

    messages = build_llm_messages(db, payload)

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
    return ChatResponse(reply=reply)

