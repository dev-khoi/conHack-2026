    AURA — Full App Architecture (Production LLM Edition)

    Core concept
    A Windows desktop AI assistant living as a floating overlay. It captures anything — voice, clipboard, screenshots, selected text — runs it through a deterministic skill execution engine, and builds a persistent memory of everything the user has processed. Over time, AURA connects the dots between documents the user has never explicitly linked, surfacing related memories passively as they work.
    Critically, AURA is not an app that calls an LLM API. It is a modular AI system with its own inference layer, its own execution engine, and its own persistent memory. Every LLM call is routed through a centralized inference service running open-source Hugging Face models on AWS GPU infrastructure, with model routing, structured output enforcement, streaming, and caching built in at the infrastructure level.

    Client — Electron App
    Floating overlay window

    Frameless, always-on-top Electron window
    Triggered via global shortcut Ctrl+Shift+Space
    Three panel states: compact (icon only), input (active query), expanded (result + memory view)
    Transparent background, docks to screen edge or floats freely

    Input capture module

    Clipboard monitor: watches for changes, auto-surfaces "do something with this?" prompt
    Screenshot capture: triggered on shortcut, sent to vision pipeline
    Selected text extraction: reads from OS clipboard after user highlights anything
    Voice input: records via Web Audio API, streams to ASR endpoint

    Result panel

    Renders execution output in real time via streaming — tokens appear as the LLM generates them, not after
    If a related memory is found during processing, renders a side-by-side "you captured something similar" card automatically
    Copy, save, and share actions on every result

    Memory panel

    Separate overlay tab showing capture history and stored insights
    Search bar for active recall queries
    Timeline view with source tags and auto-generated topic tags
    Related memory cards linkable — user can open the full stored summary from any reference


    LLM Inference Layer — the new core
    Before describing the backend modules, this layer must be understood because every module depends on it.
    Infrastructure: One dedicated GPU EC2 instance (g4dn.xlarge or g5.xlarge) running vLLM as the inference server. vLLM is chosen for its PagedAttention memory management, continuous batching, and native OpenAI-compatible API — meaning the rest of the backend talks to it exactly like it would talk to any OpenAI-spec endpoint, making it trivially swappable.
    Two hosted models, not one:
    Fast model — Mistral-7B-Instruct-v0.2
    Used for all latency-sensitive tasks where speed matters more than depth. Handles summarization, rewriting, tone adjustment, and topic tag generation. At 7B parameters it fits comfortably on a single A10G GPU and returns responses in under 800ms for typical payloads.
    Reasoning model — Mixtral-8x7B-Instruct-v0.1
    Used for tasks requiring higher quality, multi-step thinking, or structured output precision. Handles skill compilation, RAG answer synthesis, and complex explanations. Slower but significantly more capable for tasks where output quality directly affects downstream behavior.
    Three exposed endpoints (OpenAI-compatible):
    POST /llm/generate — standard text generation, accepts model routing hint, supports streaming via SSE
    POST /llm/structured — generation with JSON schema enforcement built in, retry loop, auto-repair prompt on invalid output
    POST /llm/embedding — embedding generation via a dedicated local embedding model (BAAI/bge-large-en-v1.5), used by the RAG layer
    Model routing layer:
    A lightweight routing middleware sits in front of vLLM. Every request carries a task_type field. The router maps task types to models:
    summarize      → fast model   (Mistral-7B)
    rewrite        → fast model   (Mistral-7B)
    tag_generation → fast model   (Mistral-7B)
    explain        → fast model   (Mistral-7B)
    skill_compile  → reasoning model (Mixtral-8x7B)
    rag_synthesis  → reasoning model (Mixtral-8x7B)
    complex_explain → reasoning model (Mixtral-8x7B)
    The router is a simple Python dict lookup — no ML involved in routing. Fast, deterministic, and easy to update.
    Redis caching layer:
    Redis sits between the FastAPI backend and the LLM inference server. Before any /llm/generate or /llm/structured call, the backend checks Redis for a cached response keyed on a hash of the prompt and model. Cache TTL is 1 hour for summarization and tagging tasks. This prevents redundant inference calls for repeated or near-identical inputs, which is common when users process similar documents. Cache is bypassed for streaming requests and all skill compilation calls (which must always be fresh).

    Backend — FastAPI (Python, CPU EC2)
    Single FastAPI service on a separate CPU EC2 instance (t3.large) with four internal modules. The CPU instance handles all orchestration, routing, and business logic. The GPU instance handles only inference. This separation means the backend scales independently of the inference layer.

    Module 1 — ASR Service
    Responsibility: Convert voice audio to text

    Receives audio blob from Electron client
    Transcribes using faster-whisper running locally on the CPU instance (whisper-base model)
    Returns plain text transcript
    Transcript passed into the normal execution pipeline like any other text input
    No LLM inference call involved — Whisper handles this entirely locally


    Module 2 — Skill Compiler
    Responsibility: Convert natural language instructions into validated, structured executable skill graphs
    This module has been significantly upgraded from a single LLM call to a two-stage compilation pipeline with strict output enforcement.
    Stage 1 — Planner
    Sends the user's natural language instruction to /llm/structured with task_type: skill_compile (routes to Mixtral-8x7B). The planner prompt asks the model to identify: what the trigger is, how many steps are needed, what action type each step is, and what the data dependency chain looks like. Returns a high-level plan object.
    Stage 2 — Compiler
    Takes the planner output and sends a second call to /llm/structured asking the model to produce the final JSON skill graph conforming to the exact schema. Temperature is set to 0 for determinism.
    Structured output enforcement layer (sits between both stages and the LLM):
    Every call to /llm/structured goes through a validation loop before returning to the caller:

    Response parsed against Pydantic schema
    If valid: returned immediately
    If invalid (attempt 1): auto-repair prompt sent — "Your previous output had these validation errors: {errors}. Fix only the invalid fields and return corrected JSON." — retried against the same model
    If invalid (attempt 2): second repair attempt with a simpler fallback prompt
    If invalid (attempt 3): error returned to execution engine, which falls back to the nearest matching pre-built skill

    This enforcement layer means the execution engine never receives a malformed skill graph. The compiler either returns valid JSON or a clean error — never a partially valid structure that causes a silent runtime failure.
    Skill schema:
    json{
    "name": "explain-and-store",
    "trigger": "clipboard",
    "steps": [
        {"id": "1", "action": "explain", "input": "trigger_output", "model_hint": "fast"},
        {"id": "2", "action": "summarize", "input": "step_1_output", "model_hint": "fast"},
        {"id": "3", "action": "store", "input": "step_2_output"}
    ]
    }
    Three pre-built skills ship with the app and are stored in SQLite at deploy time: summarize-and-store, explain-screenshot, rewrite-tone. These require no compiler call and cover 80% of demo scenarios.

    Module 3 — Execution Engine
    Responsibility: Run skill graphs deterministically, coordinate with the RAG layer, and stream results to the client
    Execution model:

    Loads skill graph from SQLite (pre-built) or receives compiled graph from Module 2
    For any incoming document job, fires an async parallel task to the RAG similarity check before the first LLM step begins — so the similarity result is ready by the time execution completes
    Each step calls /llm/generate with the appropriate task_type field, which the model router maps to the correct model
    All calls use streaming via SSE — tokens are forwarded to the Electron client as they arrive, so the overlay feels responsive even for longer completions
    Steps with no data dependency on each other run in parallel using asyncio.gather
    Steps with dependencies run sequentially, passing step output as the next step's input
    5 second execution budget enforced per step with asyncio.wait_for — partial results returned on timeout

    Supported action types and their model routing:

    explain → /llm/generate, task_type: explain, fast model, streamed
    summarize → /llm/generate, task_type: summarize, fast model, streamed
    rewrite → /llm/generate, task_type: rewrite, fast model, streamed
    analyze_image → vision pipeline (separate, see below)
    generate_image → Stability AI API
    store → POST to RAG ingestion endpoint (no LLM call in engine)
    notify → SSE event to Electron client

    Vision handling:
    analyze_image actions route to a vision-capable model. For the hackathon, this uses a separate hosted endpoint running LLaVA-1.6 (also on the GPU instance, loaded on demand). In production this would be a dedicated vision model instance.
    No LangChain on this path. The execution engine is fully independent of the RAG layer and communicates with it only via HTTP POST for store and similarity check operations.

    Module 4 — RAG Memory Service (LangChain)
    Responsibility: Ingest everything the user captures, detect semantic similarity across documents over time, and synthesize answers to recall queries
    LangChain owns this layer completely. The upgrade here is replacing Claude with the LLM inference service for the two tasks that require LLM calls — tag generation and answer synthesis — while keeping all LangChain primitives intact.
    Ingestion flow:
    When the execution engine fires a store action:

    Raw text and generated summary received by the ingestion endpoint
    Topic tag generation: POST to /llm/generate with task_type: tag_generation → fast model (Mistral-7B) — cheap, fast, no reasoning needed for 3-5 topic tags
    LangChain RecursiveCharacterTextSplitter chunks the raw text (512 tokens, 64 overlap)
    Embedding: POST to /llm/embedding → BAAI/bge-large-en-v1.5 running on the GPU instance, or optionally run locally on CPU instance for lower latency on small payloads
    Chunks stored in ChromaDB with metadata: source type, timestamp, skill name, session ID, topic tags, auto-generated title
    Summary stored as a single separate document in Chroma for fast surface-level matching
    Memory title and topic tags written to SQLite for timeline UI

    Passive similarity detection flow:
    Fires in parallel with the execution engine for every incoming document:

    New document arrives for processing
    Execution engine fires async POST to /memory/similarity with the raw incoming text
    RAG service embeds the incoming text via /llm/embedding
    Chroma cosine similarity search against all stored chunks
    If any stored document scores above 0.82 similarity threshold, returns: matching document title, timestamp, source type, and a one-sentence excerpt from the matching chunk
    Execution engine attaches the flag to the job result
    Electron renders the related memory card alongside the new summary automatically

    Active recall flow:
    When the user types a recall query:

    LangChain MultiQueryRetriever generates 3 query variants via /llm/generate with task_type: rag_synthesis → reasoning model (Mixtral-8x7B), because generating diverse query variants benefits from higher capability
    Each variant embedded via /llm/embedding
    Chroma returns top 5 chunks per variant, deduplicated
    RetrievalQA chain calls /llm/generate with task_type: rag_synthesis → reasoning model to synthesize a coherent answer across all retrieved chunks
    If multiple past documents match, synthesis explicitly compares them
    Response returned with source citations: document title, capture date, source type, topic tags


    End-to-end data flows
    Flow 1 — User summarizes an unstructured document

    User copies long article → clipboard monitor detects change
    Overlay surfaces prompt: "Summarize this?"
    User confirms → Electron sends POST /execute with payload and skill summarize-and-store
    Execution engine loads pre-built skill graph from SQLite
    In parallel: async POST to /memory/similarity fires against RAG service
    Step 1: POST /llm/generate task_type summarize → router sends to Mistral-7B → streamed response forwarded to Electron overlay in real time
    Step 2: store action → POST to RAG ingestion endpoint
    RAG service: tag generation via Mistral-7B, LangChain chunks, embeds via bge-large, stores in Chroma with metadata
    Similarity check result returns: related memory found from 2 days ago (score 0.87)
    Electron overlay renders summary + "you captured something similar" card side by side
    Memory timeline updates with new entry, title, and topic tags
    Redis caches the summarization prompt hash for 1 hour

    Flow 2 — User encounters a related document later

    User copies a new document on a similar topic
    Same execution flow runs — summary streamed to overlay
    Passive similarity check scores 0.91 against the Day 1 document in Chroma
    Overlay renders new summary with related memory card automatically — no user action required
    User clicks the related memory card → full stored summary from Day 1 opens in expanded panel
    User compares both documents side by side without having searched for anything

    Flow 3 — User actively recalls a past capture

    User opens memory panel, types: "what did I read about token expiry?"
    Electron sends POST /memory/recall
    MultiQueryRetriever generates 3 query variants via Mixtral-8x7B
    Each variant embedded via bge-large, Chroma returns top chunks per variant, deduplicated
    RetrievalQA synthesizes answer via Mixtral-8x7B: "You captured two related documents — one about JWT expiry on Tuesday, one about OAuth2 session management on Thursday. Here's what they said about expiry handling..."
    Response rendered with source citations and timestamps
    User can open either full document from the citation

    Flow 4 — User creates a custom skill

    User types: "Whenever I copy code, explain it, check for bugs, then store a summary"
    Electron sends POST /skill/compile
    Stage 1 (planner): POST /llm/structured task_type skill_compile → Mixtral-8x7B → high-level plan returned
    Stage 2 (compiler): POST /llm/structured → Mixtral-8x7B, temperature 0 → JSON skill graph generated
    Pydantic validation runs — passes on first attempt
    Skill saved to SQLite
    Overlay confirms: "Skill saved — will activate automatically on code clipboard captures"


    Infrastructure
    ComponentServicePurposeGPU EC2 (g5.xlarge)vLLM inference serverHosts Mistral-7B, Mixtral-8x7B, bge-large, LLaVA-1.6CPU EC2 (t3.large)FastAPI backendAll orchestration, routing, business logicRedis (ElastiCache)Cache layerLLM response caching, execution queueChromaDBVector storePersisted to EC2 disk, backed up to S3SQLiteMetadata storeSkills, session data, memory titles, topic tagsS3BackupChromaDB snapshots and SQLite backups every 30 minutes

    Tech stack
    LayerTechnologyDesktop clientElectron + React + TailwindCSSGlobal shortcutElectron globalShortcut APIVoice captureWeb Audio API → faster-whisper (CPU)Backend frameworkFastAPI (Python, async)LLM inference servervLLM on GPU EC2Fast modelMistral-7B-Instruct-v0.2 (summarize, rewrite, tag, explain)Reasoning modelMixtral-8x7B-Instruct-v0.1 (skill compile, RAG synthesis)Vision modelLLaVA-1.6 (image analysis)Embedding modelBAAI/bge-large-en-v1.5Image generationStability AI APIStructured output enforcementPydantic + retry loop + auto-repair promptModel routerLightweight Python middleware on CPU EC2Skill compilerTwo-stage planner + compiler via /llm/structuredExecution engineCustom async Python runner with SSE streamingRAG ingestionLangChain + bge-large embeddings + ChromaDBPassive similarityLangChain embeddings + Chroma cosine searchActive recallLangChain MultiQueryRetriever + RetrievalQAVector storeChromaDB (persisted to disk)Skills + metadataSQLiteCacheRedis (ElastiCache)HostingAWS EC2 (GPU + CPU instances)BackupAWS S3

    Why this architecture is coherent
    Every layer has a single clear owner and a clear reason for its technology choice.
    The inference layer is centralized and modular. Nothing in the backend calls an external LLM API directly. Every LLM interaction goes through the inference service, which means model swaps, upgrades, and routing changes happen in one place without touching any product logic.
    Model routing is task-driven, not arbitrary. Fast model for tasks where speed matters and reasoning depth doesn't. Reasoning model for tasks where output quality directly affects downstream behavior. The boundary is clear and defensible.
    Structured output enforcement means the skill compiler never produces silent failures. The execution engine receives valid JSON or a clean error — never an ambiguous state that causes unpredictable behavior at runtime.
    LangChain owns memory and nothing else. It is powerful and expressive within that boundary because it is not being asked to do things it was not designed for. The execution engine remains fully independent, which is what keeps the hot path fast and deterministic.
    The passive similarity detection is the architectural detail that makes AURA feel intelligent rather than reactive. It runs in parallel, costs nothing extra in execution time, and produces the most compelling demo moment: AURA connecting two documents the user never explicitly linked, without being asked.
    The demo writes itself: capture a document, summarize it with tokens streaming live into the overlay, come back two days later with a related document, and watch AURA surface the connection automatically. Then ask a recall question and watch the reasoning model synthesize an answer across both. That is a modular AI system with its own inference layer — not an app calling an API.