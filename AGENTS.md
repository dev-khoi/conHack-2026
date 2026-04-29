# AGENTS.md

Repository guide for agentic coding tools operating in this repo.

## Scope / Layout
- Backend (Python/FastAPI): `backend/app/`
- Frontend (Electron + Vite + React + Tailwind v4): `frontend/`
- Frontend UI kit: shadcn/ui configuration in `frontend/components.json`

Do not commit local artifacts: `backend/.venv/`, `frontend/node_modules/`, `frontend/dist/`, `frontend/dist-electron/`.

If you add or change tooling, update the commands in this file (agents will rely on it).

## Build / Lint / Test Commands

### Backend (Python / FastAPI)
Current state: `backend/requirements.txt` only includes runtime deps (FastAPI/Uvicorn/dotenv). No linter/test runner is configured yet.

- Install deps (from repo root): `python -m pip install -r backend/requirements.txt`
- Run API (from `backend/`): `python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000`
- Health check (anywhere): `curl http://127.0.0.1:8000/health`

Useful env vars:
- `BACKEND_ALLOWED_ORIGINS` (comma-separated) controls CORS in `backend/app/main.py`.

Testing (not configured yet):
- There is no `backend/tests/` directory and `pytest` is not declared in requirements.
- If/when `pytest` is added, use:
  - All tests (from `backend/`): `python -m pytest`
  - Single file: `python -m pytest tests/test_something.py`
  - Single test: `python -m pytest tests/test_something.py -k "test_name"`

Lint/format/type-check (not configured yet):
- No `ruff`, `black`, or `mypy` config files are present.
- If/when added, keep commands in this doc aligned with actual configs.

### Frontend (Electron / Vite / React / Tailwind / shadcn)
All commands run from `frontend/` unless stated otherwise.

- Install deps: `npm install`
- Dev (Vite + Electron): `npm run dev`
- Lint (ESLint): `npm run lint`
- Typecheck only: `npx tsc -p tsconfig.json --noEmit`
- Build (typecheck + Vite build + electron-builder): `npm run build`
- Preview (web build only): `npm run preview`

Useful env vars:
- `VITE_BACKEND_URL` is read in `frontend/src/main.tsx`.

Testing (not configured yet):
- No `test` script exists in `frontend/package.json`.
- If you add Vitest later, recommended scripts:
  - All tests: `npm test`
  - Single file: `npm test -- path/to/file.test.ts`
  - Single test name (Vitest): `npm test -- -t "test name"`

shadcn/ui usage:
- Config lives in `frontend/components.json`.
- Adding components typically uses the shadcn CLI (pick one and standardize):
  - `npx shadcn@latest add button`
  - or `npx shadcn add button` (if your setup supports it)

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

### Imports
Python:
- Order imports: stdlib, third-party, local.
- Prefer explicit imports; avoid `import *`.
- Use absolute imports inside the backend package (e.g. `from app.routers import ...`).

TypeScript:
- Prefer `@/` aliases over deep relative paths (configured in `frontend/tsconfig.json` and `frontend/vite.config.ts`).
- Keep type-only imports as `import type { ... } from '...'`.

### Formatting
- Python: follow PEP8; 4-space indent; keep functions small.
- TypeScript/React: keep components readable; avoid overly clever one-liners.
- Quotes: the repo is currently mixed; prefer single quotes for new TS/JS, but do not churn shadcn-generated files.
- No Prettier config is present; rely on ESLint + TypeScript and keep diffs tight.

### Types
Python:
- Keep `from __future__ import annotations` at the top of new modules (matches existing backend files).
- Annotate FastAPI route return types and public helpers.

TypeScript:
- `strict` is enabled (`frontend/tsconfig.json`): keep it green.
- Avoid `any`; use unions, generics, and narrowing. Use `unknown` for catch blocks and validate.
- Prefer deriving types from runtime schemas when introduced (e.g. Zod) to prevent drift.
- In public component props, prefer explicit prop types over inline object types when they get non-trivial.

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
- When adding a test framework, document how to run: all tests, a single test file, and a single test by name.
- Test naming: prefer `*.test.ts(x)` (Vitest/Jest conventions).

## Cursor / Copilot Rules
- No Cursor rules found (`.cursor/rules/` or `.cursorrules`).
- No Copilot rules found (`.github/copilot-instructions.md`).

## Project Notes
- Product/architecture notes live in `info.md` and `stepsToCompleteTheProject.md`.
- Frontend build bundles Electron main/preload from `frontend/electron/` via `vite-plugin-electron`.
