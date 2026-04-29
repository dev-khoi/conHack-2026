from __future__ import annotations

import json
import os
import asyncio
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, Field

from app.execution.engine import SkillRunner, similarity_check
from app.skills.schema import SkillGraph
from app.database.mongo import skills_collection

router = APIRouter()


class ExecuteRequest(BaseModel):
    skill_name: str = Field(min_length=1)
    payload: dict[str, Any]


def _load_skill_from_mongo(*, name: str) -> SkillGraph:
    col = skills_collection()
    doc = col.find_one({"name": name})
    if not doc:
        raise HTTPException(status_code=404, detail="Skill not found")

    # Accept either stored dict or stored json string.
    if isinstance(doc.get("json"), str):
        raw = json.loads(doc["json"])
    else:
        raw = {
            "name": doc.get("name"),
            "trigger": doc.get("trigger"),
            "steps": doc.get("steps"),
        }
    return SkillGraph.model_validate(raw)


@router.post("/", response_class=StreamingResponse)
async def execute(req: ExecuteRequest):
    backend_base_url = os.getenv("BACKEND_BASE_URL", "http://127.0.0.1:8000")
    skill = _load_skill_from_mongo(name=req.skill_name)

    # Start similarity check early if we will store.
    similarity_task = None
    if any(s.action == "store" for s in skill.steps):
        text = ""
        if isinstance(req.payload, dict):
            text = str(req.payload.get("text") or req.payload.get("prompt") or "")
        similarity_task = asyncio.create_task(
            similarity_check(backend_base_url=backend_base_url, text=text)
        )

    runner = SkillRunner(backend_base_url=backend_base_url)

    queue: asyncio.Queue[dict[str, Any]] = asyncio.Queue()

    async def notify(event: dict[str, Any]) -> None:
        await queue.put(event)

    async def run_job() -> dict[str, Any]:
        return await runner.run(
            skill=skill,
            payload=req.payload,
            notify=notify,
            similarity_task=similarity_task,
        )

    job_task = asyncio.create_task(run_job())

    async def event_stream() -> AsyncGenerator[str, None]:
        # Stream notify events as they arrive, and send final payload at end.
        while True:
            if job_task.done() and queue.empty():
                break
            try:
                event = await asyncio.wait_for(queue.get(), timeout=0.25)
            except TimeoutError:
                continue

            yield f"data: {json.dumps(event)}\n\n"

        result = await job_task
        yield f'data: {json.dumps({"type": "final", "result": result})}\n\n'
        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type="text/event-stream",
        headers={
            "Cache-Control": "no-cache",
            "Connection": "keep-alive",
            "X-Accel-Buffering": "no",
        },
    )


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"module": "execution_engine", "status": "ok"}
