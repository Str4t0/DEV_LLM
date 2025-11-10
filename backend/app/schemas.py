from datetime import datetime
from typing import Optional

from pydantic import BaseModel


class ProjectBase(BaseModel):
    name: str
    description: Optional[str] = None
    root_path: Optional[str] = None


class ProjectCreate(ProjectBase):
    pass


class ProjectRead(ProjectBase):
    id: int
    created_at: datetime

    class Config:
        orm_mode = True


class ProjectUpdate(BaseModel):
    # mind opcionális, PATCH-szerű update-hez
    name: Optional[str] = None
    description: Optional[str] = None
    root_path: Optional[str] = None

