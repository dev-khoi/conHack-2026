from __future__ import annotations

import math
import re
import uuid
from datetime import UTC, datetime
from typing import Any

from fastapi import APIRouter, HTTPException
from langchain_text_splitters import RecursiveCharacterTextSplitter
from pydantic import BaseModel, Field

from app.database.memory_chroma import (
    chunks_collection,
    summaries_collection,
    upsert_documents,
)
from app.database.memory_mongo import insert_memory_entry, list_memory_entries
from app.database.mongo import screenshots_collection
from app.llm.openrouter_client import OpenRouterClient
from app.llm.routing import DEFAULT_ENDPOINTS

router = APIRouter()


def _require_llm() -> OpenRouterClient:
    client = OpenRouterClient.from_env()
    if client is None:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not configured. Set it in backend/.env and restart backend.",
        )
    return client


def _iso_now() -> str:
    return datetime.now(UTC).isoformat()


def _clean_tag(s: str) -> str:
    s = s.strip().lower()
    s = re.sub(r"[^a-z0-9\-\s_]", "", s)
    s = re.sub(r"\s+", "-", s)
    return s.strip("-")


def _parse_tags(text: str) -> list[str]:
    # Accept formats like:
    # - "tag1, tag2, tag3"
    # - "1. tag1\n2. tag2"
    # - "- tag1\n- tag2"
    raw = re.split(r"[\n,]", text)
    out: list[str] = []
    for r in raw:
        r = re.sub(r"^\s*(?:[-*]|\d+\.)\s*", "", r).strip()
        t = _clean_tag(r)
        if not t:
            continue
        if t not in out:
            out.append(t)
        if len(out) >= 5:
            break
    return out[:5]


def _generate_tags(*, client: OpenRouterClient, text: str) -> list[str]:
    prompt = (
        "Generate 3-5 short topic tags for the following text.\n"
        "Rules: return only tags, no explanations. Use 1-3 words per tag.\n\n"
        f"{text.strip()[:4000]}"
    )
    resp = client.invoke(
        endpoint_name=DEFAULT_ENDPOINTS.tag_inference,
        payload={"prompt": prompt, "task_type": "tag_generation", "streaming": False},
    )
    tags = _parse_tags(resp)
    return tags if tags else ["general"]


def _generate_title(*, client: OpenRouterClient, text: str) -> str:
    prompt = (
        "Write a short title (max 8 words) for this capture.\n"
        "Return only the title.\n\n"
        f"{text.strip()[:2000]}"
    )
    title = client.invoke(
        endpoint_name=DEFAULT_ENDPOINTS.fast_inference,
        payload={"prompt": prompt, "task_type": "summarize", "streaming": False},
    ).strip()
    title = re.sub(r'^["\']|["\']$', "", title).strip()
    return title[:120] if title else "Memory"


def _cosine(a: list[float], b: list[float]) -> float:
    if not a or not b or len(a) != len(b):
        return 0.0
    dot = 0.0
    na = 0.0
    nb = 0.0
    for x, y in zip(a, b, strict=False):
        dot += float(x) * float(y)
        na += float(x) * float(x)
        nb += float(y) * float(y)
    if na <= 0.0 or nb <= 0.0:
        return 0.0
    return dot / (math.sqrt(na) * math.sqrt(nb))


class IngestRequest(BaseModel):
    text: str = Field(min_length=1)
    summary: str | None = None
    metadata: dict[str, Any] = Field(default_factory=dict)


class IngestResponse(BaseModel):
    status: str
    memory_id: str
    title: str
    topic_tags: list[str]
    chunks_written: int


@router.post("/ingest", response_model=IngestResponse)
def ingest(req: IngestRequest) -> IngestResponse:
    client = _require_llm()

    text = req.text.strip()
    if not text:
        raise HTTPException(status_code=400, detail="text is required")

    created_at = str(
        req.metadata.get("timestamp") or req.metadata.get("created_at") or _iso_now()
    )
    source_type = str(req.metadata.get("source_type") or "manual")
    skill_name = str(req.metadata.get("skill_name") or "") or None
    session_id = str(req.metadata.get("session_id") or "") or None
    screenshot_url = str(req.metadata.get("screenshot_url") or "") or None

    title = str(req.metadata.get("title") or "").strip() or _generate_title(
        client=client, text=text
    )
    topic_tags = req.metadata.get("topic_tags")
    if isinstance(topic_tags, list) and all(isinstance(t, str) for t in topic_tags):
        tags = [_clean_tag(t) for t in topic_tags if _clean_tag(t)]
        topic_tags = tags[:5]
    else:
        topic_tags = _generate_tags(client=client, text=text)

    memory_id = str(req.metadata.get("id") or uuid.uuid4().hex)

    splitter = RecursiveCharacterTextSplitter.from_tiktoken_encoder(
        chunk_size=512,
        chunk_overlap=64,
    )
    chunks = splitter.split_text(text)
    if not chunks:
        chunks = [text]

    # Embed and write chunks
    chunk_ids: list[str] = []
    chunk_docs: list[str] = []
    chunk_metas: list[dict[str, Any]] = []
    chunk_vecs: list[list[float]] = []

    for i, ch in enumerate(chunks):
        chunk_id = f"{memory_id}:chunk:{i}"
        chunk_ids.append(chunk_id)
        chunk_docs.append(ch)
        chunk_metas.append(
            {
                "memory_id": memory_id,
                "chunk_index": i,
                "title": title,
                "source_type": source_type,
                "timestamp": created_at,
                "skill_name": skill_name,
                "session_id": session_id,
                "screenshot_url": screenshot_url,
                "topic_tags": topic_tags,
            }
        )
        chunk_vecs.append(
            client.embed(endpoint_name=DEFAULT_ENDPOINTS.embedding_inference, text=ch)
        )

    try:
        upsert_documents(
            collection=chunks_collection(),
            ids=chunk_ids,
            documents=chunk_docs,
            embeddings=chunk_vecs,
            metadatas=chunk_metas,
        )
    except Exception as exc:
        raise HTTPException(
            status_code=500,
            detail=(
                f"Failed to write chunks to Chroma: {exc}. "
                "If using Chroma Cloud, set CHROMA_API_KEY, CHROMA_TENANT, CHROMA_DATABASE. "
                "If using local Chroma, set CHROMA_PERSIST_DIR."
            ),
        ) from exc

    # Write summary as a separate doc for fast matching
    summary_text = (req.summary or "").strip()
    if summary_text:
        sid = f"{memory_id}:summary"
        svec = client.embed(
            endpoint_name=DEFAULT_ENDPOINTS.embedding_inference, text=summary_text
        )
        smeta = {
            "memory_id": memory_id,
            "title": title,
            "source_type": source_type,
            "timestamp": created_at,
            "skill_name": skill_name,
            "session_id": session_id,
            "screenshot_url": screenshot_url,
            "topic_tags": topic_tags,
            "kind": "summary",
        }
        try:
            upsert_documents(
                collection=summaries_collection(),
                ids=[sid],
                documents=[summary_text],
                embeddings=[svec],
                metadatas=[smeta],
            )
        except Exception as exc:
            raise HTTPException(
                status_code=500, detail=f"Failed to write summary to Chroma: {exc}"
            ) from exc

    insert_memory_entry(
        entry_id=memory_id,
        title=title,
        created_at=created_at,
        source_type=source_type,
        skill_name=skill_name,
        session_id=session_id,
        screenshot_url=screenshot_url,
        topic_tags=topic_tags,
    )

    return IngestResponse(
        status="ok",
        memory_id=memory_id,
        title=title,
        topic_tags=topic_tags,
        chunks_written=len(chunks),
    )


class SimilarityRequest(BaseModel):
    text: str = Field(min_length=1)
    threshold: float = 0.82


class SimilarityMatch(BaseModel):
    score: float
    title: str
    source_type: str
    timestamp: str
    topic_tags: list[str]
    excerpt: str
    memory_id: str


class SimilarityResponse(BaseModel):
    match: SimilarityMatch | None


@router.post("/similarity", response_model=SimilarityResponse)
def similarity(req: SimilarityRequest) -> SimilarityResponse:
    client = _require_llm()
    q = req.text.strip()
    qvec = client.embed(endpoint_name=DEFAULT_ENDPOINTS.embedding_inference, text=q)

    # Query by vector to get candidates; compute cosine locally for a consistent threshold.
    col = chunks_collection()
    res = col.query(
        query_embeddings=[qvec],
        n_results=10,
        include=["documents", "metadatas", "embeddings"],
    )

    best: dict[str, Any] | None = None
    best_score = 0.0

    docs = (res.get("documents") or [[]])[0]
    metas = (res.get("metadatas") or [[]])[0]
    embs = (res.get("embeddings") or [[]])[0]

    for doc, meta, emb in zip(docs, metas, embs, strict=False):
        if not isinstance(emb, list):
            continue
        score = _cosine(qvec, [float(x) for x in emb])
        if score > best_score:
            best_score = score
            best = {
                "doc": str(doc or ""),
                "meta": meta or {},
            }

    if best is None or best_score < float(req.threshold):
        return SimilarityResponse(match=None)

    meta = best["meta"] if isinstance(best["meta"], dict) else {}
    excerpt = str(best["doc"]).strip().replace("\n", " ")
    if len(excerpt) > 220:
        excerpt = excerpt[:217] + "..."

    return SimilarityResponse(
        match=SimilarityMatch(
            score=float(best_score),
            title=str(meta.get("title") or "Memory"),
            source_type=str(meta.get("source_type") or "unknown"),
            timestamp=str(meta.get("timestamp") or ""),
            topic_tags=list(meta.get("topic_tags") or []),
            excerpt=excerpt,
            memory_id=str(meta.get("memory_id") or ""),
        )
    )


class RecallRequest(BaseModel):
    query: str = Field(min_length=1)


class Citation(BaseModel):
    title: str
    capture_date: str
    source_type: str
    topic_tags: list[str]


class RecallResponse(BaseModel):
    answer: str
    citations: list[Citation]


def _dedupe_docs(
    items: list[tuple[str, dict[str, Any]]],
) -> list[tuple[str, dict[str, Any]]]:
    seen: set[str] = set()
    out: list[tuple[str, dict[str, Any]]] = []
    for doc, meta in items:
        key = (meta.get("memory_id") or "") + "|" + (doc[:80] if doc else "")
        if key in seen:
            continue
        seen.add(key)
        out.append((doc, meta))
    return out


@router.post("/recall", response_model=RecallResponse)
def recall(req: RecallRequest) -> RecallResponse:
    client = _require_llm()

    q = req.query.strip()
    if not q:
        raise HTTPException(status_code=400, detail="query is required")

    # MultiQueryRetriever-like behavior: generate 3 query variants.
    prompt = (
        "Rewrite the user query into 3 alternative search queries that could retrieve relevant past notes.\n"
        "Return exactly 3 lines, no numbering.\n\n"
        f"User query: {q}"
    )
    variants_text = client.invoke(
        endpoint_name=DEFAULT_ENDPOINTS.rag_inference,
        payload={"prompt": prompt, "task_type": "rag_synthesis", "streaming": False},
    )
    variants = [v.strip() for v in variants_text.splitlines() if v.strip()][:3]
    if not variants:
        variants = [q]

    col = chunks_collection()
    retrieved: list[tuple[str, dict[str, Any]]] = []
    for v in variants:
        vvec = client.embed(endpoint_name=DEFAULT_ENDPOINTS.embedding_inference, text=v)
        res = col.query(
            query_embeddings=[vvec], n_results=5, include=["documents", "metadatas"]
        )
        docs = (res.get("documents") or [[]])[0]
        metas = (res.get("metadatas") or [[]])[0]
        for doc, meta in zip(docs, metas, strict=False):
            retrieved.append((str(doc or ""), meta or {}))

    retrieved = _dedupe_docs(retrieved)
    retrieved = retrieved[:12]

    context_blocks: list[str] = []
    citations: list[Citation] = []
    seen_mem: set[str] = set()
    for doc, meta in retrieved:
        title = str(meta.get("title") or "Memory")
        ts = str(meta.get("timestamp") or "")
        source_type = str(meta.get("source_type") or "unknown")
        tags = list(meta.get("topic_tags") or [])
        mem_id = str(meta.get("memory_id") or "")
        context_blocks.append(
            f"[title={title} | date={ts} | source={source_type} | tags={', '.join(tags)}]\n{doc}".strip()
        )
        if mem_id and mem_id not in seen_mem:
            seen_mem.add(mem_id)
            citations.append(
                Citation(
                    title=title,
                    capture_date=ts,
                    source_type=source_type,
                    topic_tags=tags,
                )
            )

    synth_prompt = (
        "You are the user's memory recall assistant. Answer the query using ONLY the provided documents.\n"
        "If multiple documents are relevant, explicitly compare them.\n"
        "If nothing matches, say you could not find relevant past captures.\n\n"
        f"Query: {q}\n\nDocuments:\n" + "\n\n".join(context_blocks)
    )

    answer = client.invoke(
        endpoint_name=DEFAULT_ENDPOINTS.rag_inference,
        payload={
            "prompt": synth_prompt,
            "task_type": "rag_synthesis",
            "streaming": False,
        },
    ).strip()

    return RecallResponse(answer=answer, citations=citations)


class TimelineResponse(BaseModel):
    items: list[dict[str, object]]
    limit: int
    offset: int


@router.get("/timeline", response_model=TimelineResponse)
def timeline(limit: int = 50, offset: int = 0) -> TimelineResponse:
    limit = max(1, min(int(limit), 200))
    offset = max(0, int(offset))
    items = list_memory_entries(limit=limit, offset=offset)

    session_ids = sorted(
        {
            str(item.get('session_id') or '').strip()
            for item in items
            if str(item.get('session_id') or '').strip()
        }
    )
    by_session: dict[str, str] = {}
    if session_ids:
        try:
            docs = list(
                screenshots_collection()
                .find({'session_id': {'$in': session_ids}}, {'session_id': 1, 'url': 1, 'created_at': 1})
                .sort('created_at', -1)
            )
            for d in docs:
                sid = str(d.get('session_id') or '').strip()
                url = str(d.get('url') or '').strip()
                if sid and url and sid not in by_session:
                    by_session[sid] = url
        except Exception:
            by_session = {}

    for item in items:
        sid = str(item.get('session_id') or '').strip()
        if sid and sid in by_session:
            item['screenshot_url'] = by_session[sid]

    return TimelineResponse(items=items, limit=limit, offset=offset)
