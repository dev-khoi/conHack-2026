from __future__ import annotations

from datetime import UTC, datetime

from app.database.chroma import upsert_skill_docs
from app.database.mongo import skills_collection
from app.skills.builtin_skills import BUILTIN_SKILLS


def preload_builtin_skills() -> None:
    """Ensure built-in skills exist in MongoDB and ChromaDB."""

    try:
        col = skills_collection()
    except Exception:
        return

    names = [skill.name for skill in BUILTIN_SKILLS]
    existing = {doc.get("name") for doc in col.find({"name": {"$in": names}}, {"name": 1})}

    now = datetime.now(UTC)
    to_upsert: list[dict] = []
    for skill in BUILTIN_SKILLS:
        if skill.name in existing:
            continue

        doc = {
            "name": skill.name,
            "trigger": skill.trigger,
            "steps": [step.model_dump() for step in skill.steps],
            "json": skill.model_dump_json(by_alias=True),
            "created_at": now,
            "updated_at": now,
        }
        result = col.insert_one(doc)
        to_upsert.append({"_id": result.inserted_id, **doc})

    if to_upsert:
        upsert_skill_docs(skills=to_upsert)
