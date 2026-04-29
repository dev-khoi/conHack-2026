# LLM Tool Test Guide

This file provides a quick, repeatable checklist to test all LLM-related tools and routes in this project.

## 0) Prerequisites

- Backend env is configured in `backend/.env`:
  - `OPENROUTER_API_KEY`
  - `OPENROUTER_BASE_URL` (optional; default is fine)
  - `CHROMA_API_KEY` + `CHROMA_TENANT` + `CHROMA_DATABASE` (or local `CHROMA_PERSIST_DIR`)
- Backend is running from `backend/`:

```bash
python -m app.main
```

## 1) Health checks

```bash
curl http://127.0.0.1:8000/health
curl http://127.0.0.1:8000/llm/ping
curl http://127.0.0.1:8000/execute/ping
```

Expected: HTTP 200 and JSON status payloads.

## 2) Core LLM generate tools

Test each supported task type mapped by routing (OpenRouter models).

### 2.1 summarize

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Summarize: AURA records multimodal context and executes deterministic tool graphs.\",\"task_type\":\"summarize\",\"streaming\":false}"
```

### 2.2 explain

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Explain what deterministic tool routing means in one paragraph.\",\"task_type\":\"explain\",\"streaming\":false}"
```

### 2.3 rewrite

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Rewrite this: The build failed because env vars were missing.\",\"task_type\":\"rewrite\",\"streaming\":false}"
```

### 2.4 tag_generation

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Generate 3-5 short topic tags for: FastAPI app with Chroma Cloud memory retrieval and SSE execution.\",\"task_type\":\"tag_generation\",\"streaming\":false}"
```

### 2.5 rag_synthesis

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Compare two notes: one says use cloud chroma first; another says fallback to local persistence.\",\"task_type\":\"rag_synthesis\",\"streaming\":false}"
```

### 2.6 skill_compile

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Design a 2-step skill for summarizing and storing text.\",\"task_type\":\"skill_compile\",\"streaming\":false}"
```

### 2.7 complex_explain

```bash
curl -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Explain how SSE, queueing, and step dependencies interact in the execution engine.\",\"task_type\":\"complex_explain\",\"streaming\":false}"
```

## 3) Streaming generate test

```bash
curl -N -X POST "http://127.0.0.1:8000/llm/generate" -H "Content-Type: application/json" -d "{\"prompt\":\"Write a short paragraph about AURA.\",\"task_type\":\"summarize\",\"streaming\":true}"
```

Expected: SSE lines containing `{"type":"delta"...}` and final `{"type":"done"}`.

## 4) Structured output test

```bash
curl -X POST "http://127.0.0.1:8000/llm/structured" -H "Content-Type: application/json" -d "{\"prompt\":\"Return an intent and confidence for: summarize this error log\",\"task_type\":\"skill_compile\",\"schema\":{\"name\":\"IntentSchema\",\"fields\":{\"intent\":\"string\",\"confidence\":\"number\"}}}"
```

Expected: `data` object matching schema or `error` payload with retry details.

## 5) Embedding test

```bash
curl -X POST "http://127.0.0.1:8000/llm/embedding" -H "Content-Type: application/json" -d "{\"text\":\"AURA memory embedding smoke test\"}"
```

Expected: JSON with `vector` array and endpoint name.

## 6) Tool router test (voice + context -> graph)

```bash
curl -X POST "http://127.0.0.1:8000/router/plan" -H "Content-Type: application/json" -d "{\"voice\":\"summarize what I copied\",\"clipboard\":\"FastAPI app with SSE and Chroma Cloud\",\"screenshot_analysis\":\"Editor showing execution_engine.py and an exception trace\",\"metadata\":{\"source\":[\"voice\",\"clipboard\",\"screen\"]}}"
```

Expected: strict JSON with `intent` and `tool_graph` only.

## 7) Execute graph test (LLM tool chain)

Use the `tool_graph` from step 6 and run:

```bash
curl -N -X POST "http://127.0.0.1:8000/execute/graph" -H "Content-Type: application/json" -d "{\"intent\":\"summarize\",\"tool_graph\":[{\"id\":\"1\",\"tool\":\"summarize\",\"input\":\"trigger_output\",\"depends_on\":[]},{\"id\":\"2\",\"tool\":\"store_memory\",\"input\":\"step_1_output\",\"depends_on\":[\"1\"]},{\"id\":\"3\",\"tool\":\"notify_user\",\"input\":\"done\",\"depends_on\":[\"1\"]}],\"payload\":{\"text\":\"Summarize this note about deterministic routing and memory ingestion.\"}}"
```

Expected: SSE deltas + final result + done event.

## 8) Analyze image path test

This validates `analyze_image` accepts `screenshot_base64`.

1. Capture a base64 screenshot from Electron overlay, or use any valid PNG base64.
2. Replace `<BASE64_PNG>` below.

```bash
curl -N -X POST "http://127.0.0.1:8000/execute/graph" -H "Content-Type: application/json" -d "{\"intent\":\"image_explain\",\"tool_graph\":[{\"id\":\"1\",\"tool\":\"analyze_image\",\"input\":\"screenshot_base64\",\"depends_on\":[]},{\"id\":\"2\",\"tool\":\"explain\",\"input\":\"step_1_output\",\"depends_on\":[\"1\"]}],\"payload\":{\"text\":\"What is on this screen?\",\"screenshot_base64\":\"<BASE64_PNG>\"}}"
```

Expected: no `analyze_image requires image_base64 or bytes` error.

## 9) Memory-assisted LLM flow checks

### 9.1 Ingest

```bash
curl -X POST "http://127.0.0.1:8000/memory/ingest" -H "Content-Type: application/json" -d "{\"text\":\"AURA now routes voice intent and fuses clipboard plus screenshot context.\",\"summary\":\"Voice-first multimodal routing in AURA\",\"metadata\":{\"source_type\":\"voice\",\"skill_name\":\"router-test\",\"session_id\":\"manual-test-1\"}}"
```

### 9.2 Similarity

```bash
curl -X POST "http://127.0.0.1:8000/memory/similarity" -H "Content-Type: application/json" -d "{\"text\":\"voice and screenshot routing\",\"threshold\":0.82}"
```

### 9.3 Recall

```bash
curl -X POST "http://127.0.0.1:8000/memory/recall" -H "Content-Type: application/json" -d "{\"query\":\"How does AURA route voice with clipboard and screenshots?\"}"
```

## 10) Pass criteria

- All `/llm/*` routes return 200 with valid JSON/SSE format.
- `/router/plan` always returns strict JSON (`intent`, `tool_graph`).
- `/execute/graph` streams events and ends with `done`.
- `analyze_image` path runs without type errors when given base64.
- Memory routes ingest/retrieve/recall successfully against configured Chroma backend.
