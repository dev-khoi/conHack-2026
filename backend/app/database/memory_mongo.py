from __future__ import annotations

from typing import Any

from app.database.mongo import memory_entries_collection


def insert_memory_entry(
    *,
    entry_id: str,
    title: str,
    created_at: str,
    source_type: str,
    skill_name: str | None,
    session_id: str | None,
    screenshot_url: str | None,
    topic_tags: list[str],
) -> None:
    doc: dict[str, Any] = {
        'id': entry_id,
        'title': title,
        'created_at': created_at,
        'source_type': source_type,
        'topic_tags': topic_tags,
    }
    if skill_name:
        doc['skill_name'] = skill_name
    if session_id:
        doc['session_id'] = session_id
    if screenshot_url:
        doc['screenshot_url'] = screenshot_url

    memory_entries_collection().update_one({'id': entry_id}, {'$set': doc}, upsert=True)


def list_memory_entries(*, limit: int, offset: int) -> list[dict[str, Any]]:
    cursor = (
        memory_entries_collection()
        .find({}, {'_id': 0})
        .sort('created_at', -1)
        .skip(max(0, int(offset)))
        .limit(max(1, int(limit)))
    )
    return [dict(item) for item in cursor]
