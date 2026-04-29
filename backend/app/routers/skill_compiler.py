from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"module": "skill_compiler", "status": "ok"}
