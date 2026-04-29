from __future__ import annotations

import os
from functools import lru_cache
from typing import Any

from chromadb.api import ClientAPI
from chromadb.api.models.Collection import Collection


def _required_env(name: str) -> str:
    v = os.getenv(name)
    if not v:
        raise RuntimeError(f'{name} is not configured')
    return v


@lru_cache(maxsize=1)
def get_chroma_client() -> ClientAPI:
    """Return a real Chroma client for memory storage.

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
        return chromadb.CloudClient(api_key=api_key, tenant=tenant, database=database)

    persist_dir = os.getenv('CHROMA_PERSIST_DIR')
    if persist_dir:
        return chromadb.PersistentClient(path=persist_dir)

    raise RuntimeError(
        'Chroma is not configured. Set CHROMA_API_KEY (cloud) or CHROMA_PERSIST_DIR (local) in backend/.env.'
    )


def chunks_collection() -> Collection:
    name = os.getenv('CHROMA_MEMORY_CHUNKS_COLLECTION', 'memory_chunks')
    return get_chroma_client().get_or_create_collection(name=name, metadata={'source': 'aura.memory'})


def summaries_collection() -> Collection:
    name = os.getenv('CHROMA_MEMORY_SUMMARIES_COLLECTION', 'memory_summaries')
    return get_chroma_client().get_or_create_collection(name=name, metadata={'source': 'aura.memory'})


def upsert_documents(
    *,
    collection: Collection,
    ids: list[str],
    documents: list[str],
    embeddings: list[list[float]],
    metadatas: list[dict[str, Any]],
) -> None:
    collection.upsert(
        ids=ids,
        documents=documents,
        embeddings=embeddings,
        metadatas=metadatas,
    )
