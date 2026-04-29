from __future__ import annotations

from fastapi import APIRouter


router = APIRouter()


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"module": "execution_engine", "status": "ok"}
