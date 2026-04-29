from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import asr, auth, execution_engine, llm, rag_memory, skill_compiler

load_dotenv()


def _parse_allowed_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [v.strip() for v in raw.split(",") if v.strip()]


app = FastAPI(title="AURA Backend", version="0.1.0")

allowed_origins = _parse_allowed_origins(os.getenv("BACKEND_ALLOWED_ORIGINS"))

# If CORS isn't configured explicitly, default to local dev origins.
# This prevents browser preflight (OPTIONS) failures when calling the API from Vite.
if not allowed_origins:
    allowed_origins = [
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ]

app.add_middleware(
    CORSMiddleware,
    allow_origins=allowed_origins,
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)


@app.get("/health")
def health() -> dict[str, str]:
    return {"status": "ok"}


app.include_router(asr.router, prefix="/asr", tags=["asr"])
app.include_router(auth.router, prefix='/auth', tags=['auth'])
app.include_router(skill_compiler.router, prefix="/skill", tags=["skill"])
app.include_router(execution_engine.router, prefix="/execute", tags=["execute"])
app.include_router(rag_memory.router, prefix="/memory", tags=["memory"])
app.include_router(llm.router, prefix="/llm", tags=["llm"])


def _run() -> None:
    """Run a local dev server.

    This exists so `python -m app.main` works during development.
    Prefer `python -m uvicorn app.main:app --reload` when you want auto-reload.
    """

    import uvicorn

    uvicorn.run('app.main:app', host='127.0.0.1', port=8000, reload=False)


if __name__ == '__main__':
    _run()
