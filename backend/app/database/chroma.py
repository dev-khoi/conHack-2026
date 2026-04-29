from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection

from app.llm.openrouter_client import OpenRouterClient
from app.llm.routing import DEFAULT_ENDPOINTS


def chroma_enabled() -> bool:
    return bool(os.getenv('CHROMA_API_KEY') or os.getenv('CHROMA_PERSIST_DIR'))


def _required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f'{name} is not configured')
    return v


def get_chroma_client() -> ClientAPI:
    """Return a real Chroma client.

    Priority:
    1) Chroma Cloud via `CHROMA_API_KEY` + `CHROMA_TENANT` + `CHROMA_DATABASE`
    2) Local persistent Chroma via `CHROMA_PERSIST_DIR`
    """

    import chromadb  # type: ignore

    api_key = os.getenv('CHROMA_API_KEY')
    if api_key:
        tenant = _required_env('CHROMA_TENANT')
        database = _required_env('CHROMA_DATABASE')
        if not hasattr(chromadb, 'CloudClient'):
            raise RuntimeError('chromadb.CloudClient is not available in this chromadb version.')

        return chromadb.CloudClient(
            api_key=api_key,
            tenant=tenant,
            database=database,
        )

    persist_dir = os.getenv('CHROMA_PERSIST_DIR')
    if persist_dir:
        return chromadb.PersistentClient(path=persist_dir)

    raise RuntimeError('Chroma is not configured. Set CHROMA_API_KEY (cloud) or CHROMA_PERSIST_DIR (local).')


def get_chroma_collection() -> Collection:
    client = get_chroma_client()
    name = os.getenv('CHROMA_SKILLS_COLLECTION', 'skills')
    return client.get_or_create_collection(name=name, metadata={'source': 'aura'})


def _embed_texts(texts: list[str]) -> list[list[float]]:
    """Embed texts using the configured OpenRouter embedding model."""

    client = OpenRouterClient.from_env()
    if client is None:
        raise RuntimeError('OPENROUTER_API_KEY is not configured (required for Chroma embeddings).')

    vectors: list[list[float]] = []
    for t in texts:
        vectors.append(client.embed(endpoint_name=DEFAULT_ENDPOINTS.embedding_inference, text=t))
    return vectors


def upsert_skill_docs(*, skills: list[dict[str, Any]]) -> None:
    """Upsert skill docs into Chroma (Cloud or local).

    If Chroma is not configured, this is a no-op.
    """

    if not chroma_enabled():
        return

    try:
        collection = get_chroma_collection()
    except Exception:
        return

    ids: list[str] = []
    docs: list[str] = []
    metas: list[dict[str, Any]] = []
    for s in skills:
        sid = str(s.get('_id') or s.get('id') or s.get('name'))
        ids.append(sid)
        docs.append(f"{s.get('name', '')}\ntrigger={s.get('trigger', '')}\n{s.get('json', '')}")
        metas.append({'name': s.get('name'), 'trigger': s.get('trigger')})

    try:
        embeddings = _embed_texts(docs)
        collection.upsert(ids=ids, documents=docs, metadatas=metas, embeddings=embeddings)
        return
    except Exception:
        # Fall back to server-side embeddings if the collection supports it.
        # (Some Chroma deployments require client-side embeddings; in that case this may fail.)
        try:
            collection.upsert(ids=ids, documents=docs, metadatas=metas)
        except Exception:
            return
