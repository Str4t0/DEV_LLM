# backend/backup_routes.py
# FastAPI routes a backup/revert rendszerhez

from fastapi import APIRouter, HTTPException, Body
from pydantic import BaseModel
from typing import Optional, List
import os

from backup_manager import get_backup_manager, init_backup_manager

router = APIRouter(prefix="/api/backup", tags=["backup"])


# ═══════════════════════════════════════════════════════════════
# REQUEST/RESPONSE MODELS
# ═══════════════════════════════════════════════════════════════

class ApplyEditRequest(BaseModel):
    """Fájl módosítás kérés"""
    project_id: int
    file_path: str
    new_content: str
    description: Optional[str] = "LLM suggestion"


class ApplyEditResponse(BaseModel):
    """Fájl módosítás válasz"""
    success: bool
    backup_id: str
    file_path: str
    message: str


class RevertRequest(BaseModel):
    """Revert kérés"""
    backup_id: str


class RevertResponse(BaseModel):
    """Revert válasz"""
    success: bool
    file_path: str
    content: str
    message: str


class PendingBackup(BaseModel):
    """Pending backup info"""
    id: str
    file_path: str
    timestamp: float
    timestamp_formatted: str
    description: str
    status: str
    original_size: int
    modified_size: int
    original_lines: int
    modified_lines: int


# ═══════════════════════════════════════════════════════════════
# ENDPOINTS
# ═══════════════════════════════════════════════════════════════

@router.post("/apply-edit", response_model=ApplyEditResponse)
async def apply_edit(request: ApplyEditRequest):
    """
    Fájl módosítás alkalmazása backup-pal.
    
    1. Beolvassa az eredeti fájlt
    2. Létrehoz egy backup-ot
    3. Felülírja a fájlt az új tartalommal
    4. Visszaadja a backup ID-t a revert-hez
    """
    manager = get_backup_manager()
    
    # Fájl teljes útvonal (project root + relative path)
    # TODO: Ez a projekt root_path-ból jön majd
    full_path = request.file_path
    
    # Ellenőrzés hogy létezik-e
    if not os.path.exists(full_path):
        raise HTTPException(status_code=404, detail=f"File not found: {full_path}")
    
    try:
        # Eredeti tartalom beolvasása
        with open(full_path, 'r', encoding='utf-8') as f:
            original_content = f.read()
        
        # Backup készítése
        backup_id = manager.create_backup(
            file_path=full_path,
            original_content=original_content,
            modified_content=request.new_content,
            description=request.description or "LLM suggestion"
        )
        
        # Fájl felülírása
        with open(full_path, 'w', encoding='utf-8') as f:
            f.write(request.new_content)
        
        return ApplyEditResponse(
            success=True,
            backup_id=backup_id,
            file_path=full_path,
            message=f"File modified. Use backup_id '{backup_id}' to revert."
        )
        
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to apply edit: {str(e)}")


@router.post("/revert/{backup_id}", response_model=RevertResponse)
async def revert_backup(backup_id: str):
    """
    Visszaállítja egy backup eredeti tartalmát.
    """
    manager = get_backup_manager()
    
    # Backup info lekérése
    pending = manager.pending.get(backup_id)
    if not pending:
        raise HTTPException(status_code=404, detail=f"Backup not found: {backup_id}")
    
    file_path = pending.file_path
    
    try:
        # Eredeti tartalom visszaállítása
        original_content = manager.revert(backup_id)
        
        if original_content is None:
            raise HTTPException(status_code=404, detail="Backup not found or already processed")
        
        # Fájl visszaírása
        with open(file_path, 'w', encoding='utf-8') as f:
            f.write(original_content)
        
        return RevertResponse(
            success=True,
            file_path=file_path,
            content=original_content,
            message="File reverted successfully"
        )
        
    except HTTPException:
        raise
    except Exception as e:
        raise HTTPException(status_code=500, detail=f"Failed to revert: {str(e)}")


@router.post("/keep/{backup_id}")
async def keep_backup(backup_id: str):
    """
    Megtartja a módosítást (törli a backup-ot a pending-ből).
    """
    manager = get_backup_manager()
    
    success = manager.keep(backup_id)
    
    if not success:
        raise HTTPException(status_code=404, detail=f"Backup not found: {backup_id}")
    
    return {"success": True, "message": "Changes kept, backup cleared"}


@router.get("/pending", response_model=List[PendingBackup])
async def get_pending_backups():
    """
    Visszaadja az összes pending backup-ot.
    """
    manager = get_backup_manager()
    return manager.get_pending()


@router.get("/pending/{file_path:path}")
async def get_pending_for_file(file_path: str):
    """
    Visszaadja egy fájl pending backup-ját.
    """
    manager = get_backup_manager()
    backup = manager.get_pending_for_file(file_path)
    
    if not backup:
        return {"has_pending": False}
    
    return {"has_pending": True, "backup": backup}


@router.post("/revert-all")
async def revert_all_backups():
    """
    Visszaállítja az összes pending backup-ot.
    """
    manager = get_backup_manager()
    
    results = manager.revert_all()
    
    # Fájlok visszaírása
    reverted_files = []
    for file_path, content in results:
        try:
            with open(file_path, 'w', encoding='utf-8') as f:
                f.write(content)
            reverted_files.append(file_path)
        except Exception as e:
            print(f"[Backup] Failed to revert {file_path}: {e}")
    
    return {
        "success": True,
        "reverted_count": len(reverted_files),
        "reverted_files": reverted_files
    }


@router.post("/keep-all")
async def keep_all_backups():
    """
    Megtartja az összes pending módosítást.
    """
    manager = get_backup_manager()
    count = manager.keep_all()
    
    return {
        "success": True,
        "kept_count": count
    }


@router.get("/history")
async def get_backup_history(limit: int = 20):
    """
    Visszaadja a backup history-t.
    """
    manager = get_backup_manager()
    return manager.get_history(limit)


# ═══════════════════════════════════════════════════════════════
# INITIALIZATION
# ═══════════════════════════════════════════════════════════════

def setup_backup_routes(app, persistent: bool = False):
    """
    Backup routes hozzáadása az app-hoz.
    
    Használat a main.py-ban:
        from backup_routes import setup_backup_routes, router as backup_router
        
        app.include_router(backup_router)
        setup_backup_routes(app, persistent=False)
    """
    init_backup_manager(persistent=persistent)
    print(f"[Backup] Manager initialized (persistent={persistent})")
