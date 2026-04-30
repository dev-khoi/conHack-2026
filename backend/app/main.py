from __future__ import annotations

import os

from dotenv import load_dotenv
from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware

from app.routers import asr, auth, execution_engine, llm, memory, screenshots, skill_compiler, tool_router
from app.startup import preload_builtin_skills

load_dotenv()


def _parse_allowed_origins(raw: str | None) -> list[str]:
    if not raw:
        return []
    return [v.strip() for v in raw.split(",") if v.strip()]


def create_app() -> FastAPI:
    app = FastAPI(title="AURA Backend", version="0.1.0")

    allowed_origins = _parse_allowed_origins(os.getenv("BACKEND_ALLOWED_ORIGINS"))
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
    app.include_router(memory.router, prefix="/memory", tags=["memory"])
    app.include_router(llm.router, prefix="/llm", tags=["llm"])
    app.include_router(tool_router.router, prefix="/router", tags=["router"])
    app.include_router(screenshots.router, prefix='/screenshots', tags=['screenshots'])

    @app.on_event('startup')
    def _startup() -> None:
        preload_builtin_skills()

    return app


app = create_app()


def _run() -> None:
    """Run a local dev server.

    This exists so `python -m app.main` works during development.
    Prefer `python -m uvicorn app.main:app --reload` when you want auto-reload.
    """

    import uvicorn

    uvicorn.run('app.main:app', host='127.0.0.1', port=8000, reload=False)


if __name__ == '__main__':
    _run()
