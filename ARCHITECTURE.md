# AURA Architecture Guide

## Purpose
This document defines module boundaries and where to add new code so the backend and frontend can evolve without heavy rewrites.

## Repo Layout
- `backend/app/`: FastAPI application package.
- `frontend/src/`: React renderer code.
- `frontend/electron/`: Electron main/preload boundary.

## Frontend Boundaries
- `frontend/src/app/`: thin application orchestration only (routing mode, top-level shell, auth gating).
- `frontend/src/features/<feature>/`: feature-owned UI, hooks, and API adapters.
- `frontend/src/components/ui/`: shared shadcn/ui primitives.
- `frontend/src/lib/`: cross-feature utilities.

### Frontend Rules
- New domain logic belongs in `features/*`, not `app/*`.
- Keep `App.tsx` focused on composition; move behavior into dedicated hooks/components.
- Avoid duplicate domain entry points (for example voice recording hooks in multiple folders).
- Renderer must not access Node APIs directly; use `frontend/electron/preload.ts` contracts.

## Backend Boundaries
- `backend/app/main.py`: app factory and router wiring.
- `backend/app/startup.py`: startup-only services (skill preload, startup probes).
- `backend/app/routers/`: HTTP API layer only (validation, response shaping).
- `backend/app/execution/`: execution orchestration and step runtime.
- `backend/app/llm/`: model routing and provider clients.
- `backend/app/database/`: persistence adapters.

### Backend Rules
- Keep side effects out of imports; use startup hooks or explicit service calls.
- Routers should delegate to services/helpers for non-trivial logic.
- Prefer small modules with explicit responsibilities over large multipurpose files.

## API Contracts
- Keep request/response payloads typed close to the boundary.
- Backend: Pydantic models for non-trivial payloads.
- Frontend: feature-local DTO types for API calls; avoid `any`.

## Runtime Hygiene
- Never commit local runtime state (`backend/memory.db`, virtual environments, caches, build artifacts).
- Keep `.env` values local; only commit example files.

## Validation Checklist
Run before merging structural changes:
- Backend tests: `python -m unittest discover -s tests -p "test_*.py" -v` (from `backend/`)
- Frontend lint: `npm run lint` (from `frontend/`)
- Frontend typecheck: `npx tsc -p tsconfig.json --noEmit` (from `frontend/`)
- Frontend build: `npm run build` (from `frontend/`)
