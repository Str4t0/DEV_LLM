from typing import List

from fastapi import Depends, FastAPI, HTTPException, status
from fastapi.middleware.cors import CORSMiddleware
from sqlalchemy.orm import Session

from . import models, schemas
from .database import SessionLocal, engine

# Táblák létrehozása (idempotens)
models.Base.metadata.create_all(bind=engine)

app = FastAPI()

# --- CORS beállítás a frontendhez ---
app.add_middleware(
    CORSMiddleware,
    allow_origins=["http://localhost:5173"],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


# --- DB session dependency ---
def get_db():
    db = SessionLocal()
    try:
        yield db
    finally:
        db.close()


# --- Health check az Online/Offline jelzéshez ---
@app.get("/health")
def health_check():
    return {"status": "ok"}


@app.get("/")
def root():
    return {"message": "LLM Dev Environment backend is running"}


# --- Projektek API ---


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
def create_project(project: schemas.ProjectCreate, db: Session = Depends(get_db)):
    """Új projekt létrehozása névvel + opcionális leírással/gyökér mappával."""
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
    return db_project
