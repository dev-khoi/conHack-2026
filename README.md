# AURA

Desktop AI overlay assistant built with Electron + React (frontend) and FastAPI (backend).

## What It Does

AURA is an always-on-top desktop overlay that lets you:

- Capture input from voice, clipboard, and screenshots
- Run deterministic skill-based AI workflows (summarize, rewrite, explain, etc.)
- Stream model output back to the UI in real time
- Store and retrieve memory with semantic similarity + recall

The app is split into two local services:

- `frontend/`: Electron shell + React renderer
- `backend/`: FastAPI API, execution engine, LLM gateway, memory services

## Tech Stack

- **Desktop/UI**: Electron, React 18, TypeScript, Vite, Tailwind v4, shadcn/ui
- **Backend API**: FastAPI, Pydantic, Python
- **LLM Provider**: OpenRouter (OpenAI-compatible client), task-based model routing
- **Embeddings/Memory**: ChromaDB + embedding model via OpenRouter
- **Auth**: Auth0 (backend verification + frontend client)
- **Storage**: MongoDB (metadata), optional S3 for screenshots

## Repository Structure

```text
backend/
  app/
    routers/         # API endpoints
    execution/       # skill execution engine
    llm/             # model routing + provider client
    database/        # storage adapters
  tests/             # unittest suite

frontend/
  electron/          # Electron main + preload
  src/               # React renderer app
```

## Prerequisites

- Python 3.11+
- Node.js 18+ and npm
- MongoDB (running locally or reachable remotely)
- OpenRouter API key

Optional depending on features used:

- Auth0 tenant configuration
- Chroma Cloud credentials (or local Chroma persistence)
- AWS credentials for screenshot upload endpoint

## Environment Setup

### Backend

1. Copy `backend/.env.example` to `backend/.env`
2. Fill in required values (at minimum):
   - `OPENROUTER_API_KEY`
   - `MONGODB_URI`
   - `MONGODB_DB_NAME`

Commonly used backend env vars:

- `BACKEND_ALLOWED_ORIGINS`
- `AUTH0_DOMAIN`, `AUTH0_AUDIENCE`
- `OPENROUTER_API_KEY`, `OPENROUTER_BASE_URL`
- `CHROMA_*`
- `STABILITY_API_KEY`
- `AWS_ACCESS_KEY_ID`, `AWS_SECRET_ACCESS_KEY`, `AWS_REGION`, `S3_BUCKET_NAME`

### Frontend

Create/update `frontend/.env` with values such as:

- `VITE_BACKEND_URL` (example: `http://127.0.0.1:8000`)
- `VITE_AUTH0_DOMAIN`
- `VITE_AUTH0_CLIENT_ID`
- `VITE_AUTH0_AUDIENCE`

## Install

From repository root:

```bash
python -m pip install -r backend/requirements.txt
```

From `frontend/`:

```bash
npm install
```

## Run in Development

Start backend (from `backend/`):

```bash
python -m uvicorn app.main:app --reload --host 127.0.0.1 --port 8000
```

Start frontend + Electron (from `frontend/`):

```bash
npm run dev
```

Health check:

```bash
curl http://127.0.0.1:8000/health
```

## Build, Lint, Type-check, Test

### Backend

Run all tests (from `backend/`):

```bash
python -m unittest discover -s tests -p "test_*.py" -v
```

Run a single test file:

```bash
python -m unittest -v tests/test_llm_routing.py
```

Run a single test method:

```bash
python -m unittest -v tests.test_llm_routing.TestLlmRouting.test_routes_to_fast_model
```

### Frontend

From `frontend/`:

```bash
npm run lint
npx tsc -p tsconfig.json --noEmit
npm run build
```

Note: no dedicated frontend test runner is currently configured.

## API Overview

Main backend routes (prefixes):

- `/asr`: transcription endpoints
- `/auth`: auth sync + identity
- `/skill`: skill compile/save/list/delete
- `/execute`: execution engine streaming endpoints
- `/memory`: ingest/similarity/recall/timeline
- `/llm`: generate/structured/embedding/vision endpoints
- `/router`: planning endpoint
- `/screenshots`: screenshot upload endpoint

## LLM Routing Defaults

Task types are mapped in `backend/app/llm/routing.py`.

Current defaults:

- Fast tasks: `google/gemini-2.5-flash`
- Reasoning tasks: `google/gemini-2.5-pro`
- Vision tasks: `google/gemini-2.5-flash`
- Embeddings: `BAAI/bge-large-en-v1.5`

## Desktop Behavior Notes

- Overlay window is managed in `frontend/electron/main.ts`
- Recording shortcut is currently `Shift+Space`
- Renderer does not directly access Node APIs; preload IPC is the boundary

## Common Troubleshooting

- `OPENROUTER_API_KEY is not configured`: set it in `backend/.env` and restart backend
- CORS errors: verify `BACKEND_ALLOWED_ORIGINS`
- Frontend cannot reach backend: confirm `VITE_BACKEND_URL`
- Build issues on frontend: run `npm run lint` + `npx tsc -p tsconfig.json --noEmit`

## Security + Hygiene

- Never commit secrets or tokens
- Do not commit generated artifacts:
  - `backend/.venv/`, `backend/__pycache__/`, `**/*.pyc`
  - `frontend/node_modules/`, `frontend/dist/`, `frontend/dist-electron/`, `frontend/release/`

## Additional Docs

- `AGENTS.md`: coding-agent operating guide and commands
- `ARCHITECTURE.md`: module boundaries and architectural conventions
