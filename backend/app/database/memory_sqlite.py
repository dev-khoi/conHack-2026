from __future__ import annotations

import os
import sqlite3
from datetime import UTC, datetime
from functools import lru_cache


def _db_path() -> str:
    return os.getenv('MEMORY_SQLITE_PATH', os.path.join(os.path.dirname(__file__), '..', '..', 'memory.db'))


@lru_cache(maxsize=1)
def _connect() -> sqlite3.Connection:
    path = os.path.abspath(_db_path())
    conn = sqlite3.connect(path, check_same_thread=False)
    conn.row_factory = sqlite3.Row
    _init_schema(conn)
    return conn


def _init_schema(conn: sqlite3.Connection) -> None:
    conn.execute(
        """
        CREATE TABLE IF NOT EXISTS memory_entries (
          id TEXT PRIMARY KEY,
          title TEXT NOT NULL,
          created_at TEXT NOT NULL,
          source_type TEXT NOT NULL,
          skill_name TEXT,
          session_id TEXT,
          topic_tags TEXT NOT NULL
        )
        """
    )
    conn.execute('CREATE INDEX IF NOT EXISTS idx_memory_entries_created_at ON memory_entries(created_at)')
    conn.commit()


def now_iso() -> str:
    return datetime.now(UTC).isoformat()


def insert_memory_entry(
    *,
    entry_id: str,
    title: str,
    created_at: str,
    source_type: str,
    skill_name: str | None,
    session_id: str | None,
    topic_tags: list[str],
) -> None:
    conn = _connect()
    conn.execute(
        """
        INSERT OR REPLACE INTO memory_entries
          (id, title, created_at, source_type, skill_name, session_id, topic_tags)
        VALUES (?, ?, ?, ?, ?, ?, ?)
        """,
        (
            entry_id,
            title,
            created_at,
            source_type,
            skill_name,
            session_id,
            ','.join(topic_tags),
        ),
    )
    conn.commit()


def list_memory_entries(*, limit: int, offset: int) -> list[dict[str, object]]:
    conn = _connect()
    cur = conn.execute(
        """
        SELECT id, title, created_at, source_type, skill_name, session_id, topic_tags
        FROM memory_entries
        ORDER BY created_at DESC
        LIMIT ? OFFSET ?
        """,
        (int(limit), int(offset)),
    )

    rows = cur.fetchall()
    out: list[dict[str, object]] = []
    for r in rows:
        tags_raw = str(r['topic_tags'] or '')
        tags = [t for t in (x.strip() for x in tags_raw.split(',')) if t]
        out.append(
            {
                'id': r['id'],
                'title': r['title'],
                'created_at': r['created_at'],
                'source_type': r['source_type'],
                'skill_name': r['skill_name'],
                'session_id': r['session_id'],
                'topic_tags': tags,
            }
        )
    return out
