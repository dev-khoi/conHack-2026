## Project Architecture (Current State)

### Monorepo layout
- `backend/`: FastAPI services for ASR, LLM routing, skill execution, memory/RAG, and auth sync.
- `frontend/`: Electron + Vite + React renderer (main window + overlay UX).

### Runtime topology
- Electron renderer calls FastAPI at `VITE_BACKEND_URL` (default `http://127.0.0.1:8000`).
- FastAPI exposes modular routers: `/asr`, `/auth`, `/llm`, `/skill`, `/execute`, `/memory`.
- Execution flow is API-first: overlay/main-window -> `/execute` SSE -> execution engine -> internal calls to `/llm/*` and `/memory/*`.
- Voice-first flow (overlay): stop recording -> capture clipboard + screenshot -> `/router/plan` -> `/execute/graph` SSE.

### Backend service modules
- `app/main.py`: app bootstrap, CORS config, router registration, startup preload of built-in skills.
- `app/routers/auth.py`: Auth0 JWT validation via JWKS, user sync/upsert to MongoDB, `whoami` diagnostics.
- `app/routers/llm.py`: generation, structured generation, embeddings.
- `app/routers/skill_compiler.py`: save/list/delete skills in MongoDB; compile endpoint currently stubbed.
- `app/routers/execution_engine.py`: streaming `/execute` endpoint (SSE).
- `app/routers/memory.py`: ingest, similarity, recall, timeline.
- `app/routers/tool_router.py`: deterministic multimodal router; converts voice+clipboard+screen context into strict tool graph JSON.
- `app/execution/engine.py`: step runner with dependency resolution, timeouts, and task handlers.

### Data stores
- **MongoDB**
  - `skills` collection: persisted user and built-in skills.
  - `users` collection: Auth0 user profiles (`auth0_sub` unique).
- **ChromaDB**
  - Skills indexing (existing helper).
  - Memory vectors:
    - `memory_chunks`
    - `memory_summaries`
  - Client strategy: Chroma Cloud first (`CHROMA_API_KEY` + `CHROMA_TENANT` + `CHROMA_DATABASE`), fallback to local `CHROMA_PERSIST_DIR`.
- **SQLite**
  - `memory_entries` table for timeline UI metadata (title/tags/source/timestamp/session).

### Memory/RAG pipeline
- Ingest (`POST /memory/ingest`):
  - Accepts raw text + optional summary + metadata.
  - Splits text with LangChain `RecursiveCharacterTextSplitter` (chunk size 512, overlap 64).
  - Generates topic tags via `task_type=tag_generation`.
  - Embeds chunks via `/llm/embedding` endpoint model mapping.
  - Writes chunks and optional summary docs to Chroma with rich metadata.
  - Writes timeline entry (title + topic tags + context metadata) to SQLite.
- Similarity (`POST /memory/similarity`):
  - Embeds incoming text, queries Chroma candidates, computes cosine, returns match if score >= 0.82.
- Recall (`POST /memory/recall`):
  - Multi-query expansion (3 variants), top-k retrieval per variant, deduplication, synthesis answer with citations.
- Timeline (`GET /memory/timeline`): paginated metadata feed ordered by timestamp desc.

### Model routing (LLM)
- Fast inference: lightweight generation tasks.
- Tag generation: routed to `openai/gpt-4o-mini`.
- RAG synthesis: routed to `openai/gpt-4o`.
- Embeddings: routed to `bge-large` class model via `/llm/embedding`.

### Frontend architecture
- `src/main.tsx`: app bootstrap, Auth0 provider setup.
- `src/app/App.tsx`: auth gating, user sync orchestration, route split between main window and overlay mode.
- `src/features/main-window/*`: desktop main experience.
- `src/features/overlay/components/OverlayShell.tsx`: command input + `/execute` SSE consumption + streamed result rendering.
- Overlay voice activation path:
  - Uses browser SpeechRecognition to capture transcript.
  - On stop: reads clipboard and screenshot via preload IPC.
  - Calls `/router/plan`, then executes returned graph through `/execute/graph`.
- Electron boundary:
  - `electron/main.ts`: app/window lifecycle and overlay behavior.
  - `electron/preload.ts`: typed, minimal IPC surface for renderer (`getClipboardText`, `captureScreenshotBase64`).

### Security and boundary rules
- Renderer does not directly access Node APIs; preload mediates capabilities.
- Auth0 access tokens are validated server-side (issuer/audience/signature checks).
- CORS defaults to local Vite origins when not explicitly configured.

### Status snapshot
- Implemented: Auth0 integration, Mongo skill/user persistence, execution SSE, memory ingest/similarity/recall/timeline, Chroma Cloud/local client selection.
- In progress: full skill compile logic, richer overlay/main-window memory UI, backup automation, broader e2e validation.
