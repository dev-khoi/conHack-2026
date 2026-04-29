from __future__ import annotations

import os
from functools import lru_cache

from pymongo import MongoClient
from pymongo.collection import Collection


@lru_cache(maxsize=1)
def _mongo_client() -> MongoClient:
    uri = os.getenv('MONGODB_URI')
    if not uri:
        raise RuntimeError('MONGODB_URI is not configured')
    return MongoClient(uri)


def _db_name() -> str:
    return os.getenv('MONGODB_DB_NAME', 'aura')


@lru_cache(maxsize=1)
def skills_collection() -> Collection:
    col = _mongo_client()[_db_name()]['skills']
    col.create_index('name', unique=True)
    col.create_index('trigger')
    col.create_index('created_at')
    return col


@lru_cache(maxsize=1)
def screenshots_collection() -> Collection:
    col = _mongo_client()[_db_name()]['screenshots']
    col.create_index('created_at')
    col.create_index('source')
    col.create_index('session_id')
    col.create_index('owner_sub')
    return col


@lru_cache(maxsize=1)
def memory_entries_collection() -> Collection:
    col = _mongo_client()[_db_name()]['memory_entries']
    col.create_index('created_at')
    col.create_index('source_type')
    col.create_index('session_id')
    return col
