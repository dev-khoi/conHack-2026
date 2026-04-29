# AGENTS.md

Repository guide for agentic coding tools operating in this repo.

## Scope / Layout
- Backend (Python/FastAPI): `backend/app/`
- Frontend (Electron + Vite + React + Tailwind v4): `frontend/`
- Frontend UI kit: shadcn/ui configuration in `frontend/components.json`

Do not commit local artifacts: `backend/.venv/`, `**/__pycache__/`, `**/*.pyc`, `frontend/node_modules/`, `frontend/dist/`, `frontend/dist-electron/`.

Do not commit secrets: prefer `backend/.env.example` (backend) and a local `frontend/.env.local` (frontend) when adding sensitive values.

If you add or change tooling, update the commands in this file (agents will rely on it).

## Build / Lint / Test Commands

### Backend (Python / FastAPI)
Current state: FastAPI app under `backend/app/` with a small `unittest` suite under `backend/tests/` (Python 3.12-compatible).

- Install deps (from repo root): `python -m pip install -r backend/requirements.txt`
- Run API (from `backend/`): `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- Run API (alt, from `backend/`): `python -m app.main`
- Health check (anywhere): `curl http://127.0.0.1:8000/health`

Useful env vars:
- `BACKEND_ALLOWED_ORIGINS` (comma-separated) controls CORS in `backend/app/main.py`; see `backend/.env.example` for Mongo/Auth0/OpenRouter/Chroma settings.

Testing (unittest):
- All tests (from `backend/`): `python -m unittest discover -s tests -p "test_*.py" -v`
- Single file: `python -m unittest -v tests/test_asr_audio_validation.py`
- Single test (method): `python -m unittest -v tests.test_asr_audio_validation.TestAsrAudioValidation.test_sniff_wav`
- Filter by substring: `python -m unittest discover -s tests -p "test_*.py" -k "structured" -v`
- Single module/class: `python -m unittest -v tests.test_llm_routing` or `python -m unittest -v tests.test_llm_routing.TestLlmRouting`

Lint/format/type-check (not configured yet):
- No `ruff`, `black`, or `mypy` config files are present.
- If/when added, keep commands in this doc aligned with actual configs.

### Frontend (Electron / Vite / React / Tailwind / shadcn)
All commands run from `frontend/` unless stated otherwise.

- Install deps: `npm install`
- Dev (Vite + Electron via `vite-plugin-electron`): `npm run dev`
- Lint (ESLint): `npm run lint`
- Lint a single file: `npx eslint src/app/App.tsx`
- Typecheck only: `npx tsc -p tsconfig.json --noEmit`
- Build (typecheck + Vite build + electron-builder): `npm run build`
- Preview (web build only): `npm run preview`

Useful env vars:
- `VITE_BACKEND_URL` is read in `frontend/src/main.tsx`.
- `VITE_DEV_SERVER_URL` is read in `frontend/electron/main.ts` (dev-only).
- Auth0 (renderer): `VITE_AUTH0_DOMAIN`, `VITE_AUTH0_CLIENT_ID`, `VITE_AUTH0_AUDIENCE`.

Testing (not configured yet):
- No `test` script exists in `frontend/package.json`.
- If you add Vitest later, document: all tests, single file, and `-t` single test name.

shadcn/ui usage:
- Config lives in `frontend/components.json`; add components with `npx shadcn@latest add <name>` (or standardize on `npx shadcn add <name>`).

## Code Style Guidelines

### General
- Prefer small, composable modules; avoid hidden global state.
- Keep side effects at the edges (API handlers, Electron main/preload, data-fetching hooks).
- Make failures explicit: validate early, return/raise structured errors.
- Avoid drive-by reformatting; limit changes to the task.

### Project Structure
- Backend code lives under `backend/app/` (package name is `app`).
- Frontend renderer code lives under `frontend/src/`.
- Electron main/preload live under `frontend/electron/`.
- shadcn/ui primitives should live under `frontend/src/components/ui/`.

Keep cross-boundary dependencies clean:
- Renderer code must not import Node/Electron APIs directly (use preload IPC).
- Backend routers should avoid importing infrastructure at import-time when possible (prefer lazy init or startup hooks).

### Imports
Python:
- Order imports: stdlib, third-party, local.
- Prefer explicit imports; avoid `import *`.
- Use absolute imports inside the backend package (e.g. `from app.routers import ...`).
- Avoid importing infrastructure into pure modules; keep side effects at the edges.

TypeScript:
- Prefer `@/` aliases over deep relative paths (configured in `frontend/tsconfig.json` and `frontend/vite.config.ts`).
- Keep type-only imports as `import type { ... } from '...'`.
- Keep shadcn/ui files close to upstream; avoid large rewrites unless necessary.

### Formatting
- Python: follow PEP8; 4-space indent; keep functions small.
- TypeScript/React: keep components readable; avoid overly clever one-liners.
- Quotes: the repo is currently mixed; prefer single quotes for new TS/JS, but do not churn shadcn-generated files.
- No Prettier config is present; rely on ESLint + TypeScript and keep diffs tight.

### Types
Python:
- Keep `from __future__ import annotations` at the top of new modules (matches existing backend files).
- Annotate FastAPI route return types and public helpers.
- Prefer Pydantic models for request/response payloads; keep `dict[str, Any]` at the edges.

TypeScript:
- `strict` is enabled (`frontend/tsconfig.json`): keep it green.
- Avoid `any`; use unions, generics, and narrowing. Use `unknown` for catch blocks and validate.
- Prefer deriving types from runtime schemas when introduced (e.g. Zod) to prevent drift.
- In public component props, prefer explicit prop types over inline object types when they get non-trivial.
- IPC surface: keep `window.overlay` typed in `frontend/electron/electron-env.d.ts` and expose only minimal methods in `frontend/electron/preload.ts`.

### Naming
Python:
- `snake_case` for vars/functions, `PascalCase` for classes.
- Private helpers start with `_`.

TypeScript/React:
- `camelCase` for vars/functions, `PascalCase` for components/types.
- Event handlers: `handleX`, callbacks: `onX`.
- Files: components `PascalCase.tsx` (or existing convention in folder), utilities `kebab-case.ts` or `camelCase.ts` (be consistent per folder).

### Config / Generated Files
- Do not edit files under `frontend/node_modules/`.
- Keep shadcn-generated component code close to upstream; avoid large rewrites unless necessary.

### Error Handling
Backend:
- Raise meaningful HTTP errors (FastAPI `HTTPException`) with consistent `detail` shape when you add real endpoints.
- Do not swallow exceptions; add context and re-raise when appropriate.
- Do not log secrets/tokens; if you log auth failures, log only safe metadata.
- For user-input validation, fail fast (e.g. reject unsupported audio formats before expensive work).

Frontend:
- Treat network errors as user-facing states; keep `error` values as strings or typed error objects (no raw `unknown`).
- Keep Electron boundary safe: only expose minimal APIs from `frontend/electron/preload.ts`.

Electron security defaults:
- Keep `contextIsolation` on and avoid enabling `nodeIntegration` in renderer unless you have a strong reason.
- Expose narrow, typed IPC methods; do not expose raw `ipcRenderer` channels broadly.

### UI (shadcn/ui + Tailwind v4)
- Follow shadcn conventions:
  - UI primitives under `@/components/ui`.
  - Use `cn()` from `frontend/src/lib/utils.ts` for className merging.
- Tailwind v4 is CSS-first (`@import "tailwindcss"` in `frontend/src/main.css`); prefer tokens via CSS variables.
- Avoid one-off colors when a token exists; add new tokens in `frontend/src/main.css` if needed.

### Testing Guidelines
- Keep tests deterministic; avoid real network calls.
- When adding a test framework, document: all tests, single file, single test by name.

## Cursor / Copilot Rules
- No Cursor rules found (`.cursor/rules/` or `.cursorrules`).
- No Copilot rules found (`.github/copilot-instructions.md`).

## Project Notes
- Product/architecture notes live in `info.md` and `stepsToCompleteTheProject.md`.
- Frontend build bundles Electron main/preload from `frontend/electron/` via `vite-plugin-electron`.
