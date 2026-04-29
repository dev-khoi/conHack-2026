---

## On the development plan — you are right

The previous plan was a build plan organized by system layer, not by how a developer actually works. A real development plan is sequential and iterative — you build the smallest thing that runs, prove it works, then build on top of it. You do not set up all infrastructure before writing a single line of application code.

Here is the corrected plan:

---

# AURA — Development Plan

---

## Stage 1 — Local Development Environment

1. Set up a Python virtual environment locally with FastAPI, uvicorn, and the some sample as temporary placeholders to prove the backend structure works before touching AWS
2. Initialize the FastAPI project with four empty router files: `asr.py`, `skill_compiler.py`, `execution_engine.py`, `rag_memory.py`
3. Register all four routers on the main FastAPI app with URL prefixes and add a `/health` endpoint that returns 200
4. Initialize the Electron project with React and TailwindCSS
5. Confirm the Electron app can make a fetch request to the local FastAPI server and display the response — this is your first working vertical slice
6. Set up a `.env` file for all configuration values: backend URL, model endpoints, API keys — no hardcoded values anywhere from day one

---

## Stage 2 — Electron Overlay Shell

7. Configure the Electron main process for a frameless, always-on-top, transparent window
8. Register the global shortcut `Ctrl+Shift+Space` to show and hide the overlay
9. Implement the three panel states — compact, input, expanded — with CSS transitions between them
10. Implement window dragging so the overlay can be repositioned anywhere on screen
11. Build a static mock result panel that displays hardcoded text — just to confirm the UI shell renders correctly before any backend is connected
12. Style the overlay to match the design spec — dark glass aesthetic, compact typography, minimal chrome
13. Confirm the overlay works correctly on Windows: shortcut fires, window appears, dragging works, shortcut hides it

---

Here is the updated Stage 3 with the corrected voice implementation. Everything else in the plan stays the same.

---

## Stage 3 — Input Capture Layer

14. Build the clipboard monitor in the Electron main process — watch for clipboard change events and surface a "do something with this?" prompt in the overlay

15. Build the screenshot capture function using Electron's `desktopCapturer` API — on shortcut trigger, capture the screen and confirm the raw image data is accessible in the renderer

16. Build the selected text extraction — read from OS clipboard after the user highlights text and triggers the shortcut

17. Install Porcupine by Picovoice via their Node.js SDK in the Electron main process and generate a custom "Hey AURA" wake word through the Picovoice web console

18. Configure Porcupine to run passively in the Electron main process at all times with near-zero CPU usage — it listens only for the wake word and fires an event when detected

19. Install `@ricky0123/vad-web` in the Electron renderer for Voice Activity Detection — this handles automatically detecting when the user stops speaking so no manual stop is needed

20. Wire the wake word detection event from the main process to the renderer process via Electron IPC — when Porcupine fires, the renderer receives a signal to begin recording

21. On wake word detection: expand the overlay automatically, pulse the mic icon to signal active recording, and begin capturing audio via the Web Audio API in the renderer

22. Wire VAD to monitor the incoming audio stream — when silence is detected after speech, VAD fires an end-of-speech event that stops the recording and packages the audio as a blob

23. Send the audio blob to `/asr/transcribe` on the FastAPI backend and pipe the returned transcript directly into the execution pipeline as if the user had typed it

24. Implement the double-tap shortcut fallback — double-tapping `Ctrl+Shift+Space` starts recording manually via the same Web Audio API path, VAD still handles the stop, and the blob follows the same send flow to `/asr/transcribe`

25. Confirm both voice trigger paths — wake word and double-tap shortcut — produce a transcript and surface the correct prompt in the overlay UI

26. Test all four input types locally (clipboard, screenshot, selected text, voice) and confirm each one surfaces the correct prompt in the overlay UI

## Stage 4 — AWS Infrastructure

| Layer | Component | Service | Purpose |
| --- | --- | --- | --- |
| Client | Electron App | Windows Desktop | Overlay UI, input capture (voice, clipboard, screenshots), streaming display |
| API / Orchestration | FastAPI Backend | EC2 (t3.large) | Request routing, skill execution engine, RAG orchestration, system coordination |
| Inference (Fast) | OpenRouter API | Managed API | openai/gpt-4o-mini (summarization, tagging, rewriting, explain) |
| Inference (Reasoning) | OpenRouter API | Managed API | openai/gpt-4o or anthropic/claude-3.5-sonnet (skill compilation, RAG synthesis, complex reasoning) |
| Inference (Vision) | OpenRouter API | Managed API | openai/gpt-4o (image/screenshot analysis) |
| Embeddings | OpenRouter API (or local CPU fallback) | Managed API | text-embedding-3-small or bge-small-en-v1.5 embeddings |
| Vector + Memory DB | ChromaDB | EC2 + EBS | Semantic search, embeddings storage, similarity matching |
| Storage / Backup | AWS S3 | Object Storage | Backups for ChromaDB snapshots and MongoDB exports |

Below is your **updated architecture + Stage 5 replacement**, aligned with your new **3B / 7B / VL / small embedding + single-instance strategy**.

I only changed what is necessary.

---

# ✅ UPDATED COMPONENT TABLE (minimal changes only)

## Component | Service | Purpose

| Component | Service | Purpose |
| --- | --- | --- |
| Fast inference | OpenRouter API | `openai/gpt-4o-mini` (fast tasks: summarize, rewrite, tag, explain) |
| Reasoning inference | OpenRouter API | `openai/gpt-4o` or `anthropic/claude-3.5-sonnet` (skill compile, RAG synthesis, complex explain) |
| Vision inference | OpenRouter API | `openai/gpt-4o` (image/screenshot understanding) |
| Embeddings | OpenRouter API (or local CPU if preferred) | `text-embedding-3-small` or `bge-small-en-v1.5` |
| Backend | EC2 t3.large (dont worry about it) | FastAPI orchestration + execution engine |
| Cache | ElastiCache Redis | LLM response caching + dedup |
| Vector DB | ChromaDB (EC2/EBS) | RAG storage + similarity search |
| Metadata | SQLite | Skills, sessions, memory index |
| Backups | S3 | Periodic snapshots (Chroma + SQLite) |

---

## Key change summary

## ⚙️ UPDATED STAGE 5 — LLM INFERENCE LAYER (REVISED FOR OPENCODE + OPENROUTER ONLY)

---

## 31. Model routing middleware (UNCHANGED LOGIC, UPDATED TARGETS)

Build CPU-side router that maps:

- `summarize` → `openai/gpt-4o-mini` via OpenRouter API

- `rewrite` → `openai/gpt-4o-mini` via OpenRouter API

- `tag_generation` → `openai/gpt-4o-mini` via OpenRouter API

- `explain` → `openai/gpt-4o-mini` via OpenRouter API

- `skill_compile` → `openai/gpt-4o` (or `anthropic/claude-3.5-sonnet`) via OpenRouter API

- `rag_synthesis` → `openai/gpt-4o` (or `anthropic/claude-3.5-sonnet`) via OpenRouter API

- `complex_explain` → `openai/gpt-4o` (or `anthropic/claude-3.5-sonnet`) via OpenRouter API

- `analyze_image` → `openai/gpt-4o` via OpenRouter API

All routes call **OpenRouter API only (no local or SageMaker inference layer)**.

---

## 32. Task mapping definition (UPDATED ONLY)

Define:

```text
FAST PATH:
summarize, rewrite, tag_generation, explain
→ openai/gpt-4o-mini

REASONING PATH:
skill_compile, rag_synthesis, complex_explain
→ openai/gpt-4o or anthropic/claude-3.5-sonnet

VISION PATH:
analyze_image
→ openai/gpt-4o
```

(All served via OpenRouter API)

---

## 33. `/llm/generate` (UNCHANGED FUNCTION, UPDATED MODEL TARGETS)

- Accepts:
  - prompt
  - task_type
  - streaming flag

- Routes to:
  - correct model via OpenRouter API

- Uses:
  - OpenAI-compatible HTTP request (OpenRouter endpoint)
  - no boto3, no SageMaker runtime

---

## 34. Streaming (UNCHANGED)

- SSE streaming remains identical
- Token forwarding depends on OpenRouter streaming support
- Backend handles chunk relay to client

---

## 35. `/llm/structured` (UPDATED ONLY IN MODEL USE)

Now uses:

- `openai/gpt-4o` (or `anthropic/claude-3.5-sonnet`) via OpenRouter API ONLY

Reason:

- structured JSON generation does not require larger model

---

## 36. Structured enforcement layer (UNCHANGED)

- Validate via Pydantic
- Return parsed JSON only

---

## 37. Retry logic (UNCHANGED)

- 3 attempts max
- second pass includes validation errors
- third pass fallback error object

---

## 38. Auto-repair prompt (UNCHANGED LOGIC, SIMPLIFIED)

Now optimized for OpenRouter-hosted models:

- strict JSON-only instruction
- schema embedded in prompt
- reduced verbosity for consistency

---

## 39. Failure handling (UNCHANGED)

- never return partial JSON
- always return structured error envelope

---

## 40. `/llm/embedding` (UPDATED)

Now calls:

- `text-embedding-3-small` via OpenRouter-compatible embedding endpoint (or optional `bge-small-en-v1.5` local CPU fallback)

Returns:

- vector embedding
- no GPU or SageMaker dependency

---

## 41. Unit tests (UNCHANGED BUT SIMPLIFIED)

Still test:

- routing correctness
- schema validation
- retry loop stability

Removed:

- distributed inference tests
- GPU endpoint validation tests
- SageMaker integration tests

---

## FINAL ARCHITECTURAL CHANGE SUMMARY

- ❌ Removed SageMaker completely
- ❌ Removed all local model hosting assumptions
- ✔ All LLM calls now go through OpenRouter API
- ✔ Backend is pure orchestration layer (OpenCode-style architecture)
- ✔ No infrastructure beyond EC2 + storage services

---

If you want next step, I can convert this into:

- a **clean OpenCode folder structure**
- or a **LangChain + OpenRouter production router**
- or a **single-file FastAPI LLM gateway template**

## Stage 6 — ASR Service

42. Install `faster-whisper` on the CPU instance and download the `whisper-base` model
43. Implement `POST /asr/transcribe` — accepts audio blob, runs faster-whisper, returns plain text transcript
44. Add audio format validation — reject anything that is not WAV or WebM before attempting transcription
45. Add a maximum audio duration limit of 60 seconds
46. Wire the Electron voice recorder from Stage 3 to this endpoint — confirm a recorded voice command transcribes correctly end to end

---

Below is your **Stage 7 rewritten with ONLY storage layer changes applied** (SQLite → MongoDB + ChromaDB where appropriate). No logic changes, no structure changes, no prompt changes, no model changes.

---

## Stage 7 — Skill Compiler

---

## 47. Define the Pydantic schema for a valid skill graph — name, trigger type, and steps array with id, action, input, and model_hint fields

_(unchanged)_

---

## 48. Write the Stage 1 planner prompt — instructs Mixtral-8x7B to identify trigger, step count, action types, and data dependency chain from the user's natural language instruction

_(unchanged)_

---

## 49. Write the Stage 2 compiler prompt — takes planner output and instructs the model to produce the final JSON skill graph conforming exactly to the Pydantic schema at temperature 0

_(unchanged)_

---

## 50. Implement `POST /skill/compile` — runs Stage 1 then Stage 2 sequentially, both via `/llm/structured`, with the enforcement layer active on both

_(unchanged)_

---

## 51. Implement the fallback logic — if all 3 retry attempts fail, return the nearest matching pre-built skill based on trigger type rather than an error

_(unchanged)_

---

## 52. Implement `POST /skill/save` — writes a validated skill graph to MongoDB with a unique ID and timestamp

---

## 53. Implement `GET /skill/list` — returns all saved skills from MongoDB

---

## 54. Implement `DELETE /skill/{id}` — removes a skill from MongoDB

---

## 55. Pre-load the three built-in skills into MongoDB and ChromaDB at server startup if they do not already exist: `summarize-and-store`, `explain-screenshot`, `rewrite-tone`

---

## 56. Build the skill creation UI in Electron — text field for natural language instruction, sends to `/skill/compile`, shows the compiled step list for user confirmation before saving

_(unchanged)_

---

## 57. Build the skill confirmation UI — human-readable step list, confirm and discard buttons

_(unchanged)_

---

## 58. Build the skill list panel in Electron — fetches from `/skill/list`, displays as cards showing name, trigger, and step count

_(unchanged)_

---

## 59. Test the two-stage compiler end to end with 10 varied natural language instructions and confirm all produce valid, saved skill graphs

_(unchanged)_

---

# ✔ Summary of ONLY changes made

- SQLite → **MongoDB** for skill storage (52–54)
- SQLite → **MongoDB + ChromaDB** for preloaded skills (55)
- Everything else unchanged exactly as requested

---

If you want next step, I can make Stage 8 Execution Engine consistent with:

- MongoDB skill retrieval
- ChromaDB optional semantic skill lookup (if needed)
- zero structural drift from your original plan

---

# Stage 8 — Execution Engine

60. Implement the core skill graph runner — a Python class that accepts a skill graph and an input payload and executes each step in defined order

61. Implement data dependency resolution — each step reads its input from the output of the step named in its input field, or from the original payload if input is trigger_output

62. Implement the summarize action handler — POST to /llm/generate with task_type summarize, openai/gpt-4o-mini, streamed

63. Implement the explain action handler — POST to /llm/generate with task_type explain, openai/gpt-4o-mini, streamed

64. Implement the rewrite action handler — POST to /llm/generate with task_type rewrite, openai/gpt-4o-mini, streamed, accepts tone and style params

65. Implement the analyze_image action handler — POST to the OpenRouter vision endpoint using openai/gpt-4o with the image payload

66. Implement the generate_image action handler — POST to Stability AI API with the text prompt

67. Implement the store action handler — POST to /memory/ingest with the step output and job metadata

68. Implement the notify action handler — sends an SSE event to the connected Electron client with the result payload

69. Implement parallel execution for steps with no data dependency on each other using asyncio.gather

70. Implement per-step timeout using asyncio.wait_for with a 5 second budget — return all completed step outputs on timeout rather than failing the whole job

71. Implement POST /execute — accepts skill name and input payload, loads skill graph from MongoDB, runs the execution engine, streams results back to the client via SSE

72. Implement the parallel similarity check — on any job with a store step, fire an async POST to /memory/similarity before the first LLM step begins and await the result alongside the final step output

73. Attach the similarity result to the job response if a match above 0.82 cosine similarity is found

74. Implement the SSE client in Electron — persistent connection to /execute, receives streamed tokens and event flags, updates the result panel token by token in real time

75. Build the related memory card component in Electron — appears alongside the main result when the backend attaches a similarity match, shows title, date, source tag, and excerpt

76. Implement error state rendering in Electron — partial results shown with a clear error indicator rather than a blank panel


## Stage 9 — RAG Memory Service

78. Install LangChain and `langchain-community` on the CPU instance
79. Initialize ChromaDB with persistence to the configured local directory on the CPU instance
80. Implement `POST /memory/ingest` — accepts raw text, summary, and metadata
81. Wire LangChain `RecursiveCharacterTextSplitter` into ingestion — 512 token chunk size, 64 token overlap
82. Implement topic tag generation inside ingestion — POST to `/llm/generate` with task_type `tag_generation` → Mistral-7B, parse the 3-5 returned tags
83. Implement embedding inside ingestion — POST to `/llm/embedding` to get vectors from bge-large
84. Write all chunks to ChromaDB with full metadata: source type, timestamp, skill name, session ID, topic tags, and auto-generated title
85. Write the summary as a separate single document in ChromaDB for fast surface-level matching
86. Write memory title and topic tags to SQLite for the timeline UI
87. Implement `POST /memory/similarity` — accepts raw incoming text, embeds it via `/llm/embedding`, runs cosine similarity search against all stored chunks in Chroma, returns match details if score exceeds 0.82
88. Implement `POST /memory/recall` — accepts a natural language query
89. Wire LangChain `MultiQueryRetriever` into recall — generates 3 query variants via Mixtral-8x7B through `/llm/generate`
90. Embed each query variant via `/llm/embedding`, run Chroma search for top 5 chunks per variant
91. Implement deduplication of retrieved chunks before passing to synthesis
92. Wire LangChain `RetrievalQA` chain into recall — synthesizes answer across deduplicated chunks via Mixtral-8x7B, instructs model to compare documents explicitly when multiple past captures match
93. Return synthesized answer with full source citations: title, capture date, source type, topic tags
94. Implement `GET /memory/timeline` — returns paginated memory entries from SQLite ordered by timestamp
95. Build the memory panel in Electron — fetches timeline from `/memory/timeline`, renders entries as a scrollable list with source tags and topic tags
96. Build the memory search bar in Electron — sends queries to `/memory/recall`, renders synthesized answer with citations
97. Set up the S3 backup cron job — runs every 30 minutes, compresses ChromaDB and SQLite, uploads to S3 with a timestamped key
98. Test ingestion, passive similarity detection, and active recall end to end — confirm match found, no match, and multi-document synthesis all behave correctly

---

## Stage 10 — Full Integration and Polish

99. Run end-to-end Flow 1: clipboard capture → streaming summary → store → passive similarity card appears in overlay
100. Run end-to-end Flow 2: second related document → passive similarity fires above threshold → related memory card renders automatically without user action
101. Run end-to-end Flow 3: memory panel recall query → multi-query retrieval → synthesized answer with citations renders correctly
102. Run end-to-end Flow 4: natural language skill creation → two-stage compiler → skill saved → skill executes correctly on next trigger
103. Run end-to-end voice flow: hold to record → ASR transcribes → execution pipeline runs → result streamed to overlay
104. Run end-to-end screenshot flow: shortcut triggers capture → image sent to LLaVA → explanation streamed to overlay
105. Fix all integration issues found across all four flows
106. Add copy, save, and share action buttons to every result card in the overlay
107. Polish all loading states — every async operation should show a clear in-progress indicator in the overlay so the demo never looks frozen
108. Polish all error states — every failure should show a readable message, never a raw exception or blank screen

---

## Stage 11 — Demo Preparation

109. Pre-load 5 semantically related document pairs into ChromaDB so the passive similarity feature fires reliably during the demo without depending on live user captures
110. Pre-compile and save the three built-in skills to SQLite so they are available instantly at demo time
111. Write and rehearse the 90-second primary demo script: clipboard capture → streaming summary → related memory card appears → recall query → skill creation
112. Record a full screen capture of the complete working demo as a fallback in case of live infrastructure failure during the presentation
113. Deploy final versions of both EC2 instances, confirm all services are running, and lock instance state so no accidental changes can occur before the demo
114. Prepare a one-page technical summary covering the inference layer, model routing, RAG pipeline, and LangChain role — written plainly enough for non-technical judges to follow
