from __future__ import annotations

import json
from datetime import UTC, datetime

from fastapi import APIRouter
from fastapi import HTTPException
from pydantic import BaseModel, ConfigDict, Field

from app.llm.structured import StructuredError
from app.database.chroma import upsert_skill_docs
from app.database.mongo import skills_collection

router = APIRouter()


class SkillStepSchema(BaseModel):
    id: str = Field(min_length=1)
    action: str = Field(min_length=1)
    input: str = Field(min_length=1)
    model_hint: str | None = None


class SkillGraphSchema(BaseModel):
    name: str = Field(min_length=1)
    trigger: str = Field(min_length=1)
    steps: list[SkillStepSchema] = Field(min_length=1)


class SkillCompileRequest(BaseModel):
    instruction: str = Field(min_length=1)


class SkillCompileResponse(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    skill: SkillGraphSchema
    attempts: int
    endpoint: str


class SkillCompileFailureResponse(BaseModel):
    error: StructuredError
    endpoint: str


class SkillSaveRequest(BaseModel):
    skill: SkillGraphSchema


class SkillSaveResponse(BaseModel):
    id: str
    created_at: str


class SkillListItem(BaseModel):
    id: str
    name: str
    trigger: str
    step_count: int
    created_at: str


def _skill_to_doc(skill: SkillGraphSchema) -> dict:
    now = datetime.now(UTC)
    return {
        'name': skill.name,
        'trigger': skill.trigger,
        'steps': [s.model_dump() for s in skill.steps],
        'json': json.dumps(skill.model_dump(), ensure_ascii=True, separators=(',', ':'), sort_keys=True),
        'created_at': now,
        'updated_at': now,
    }


@router.post('/compile', response_model=SkillCompileResponse | SkillCompileFailureResponse)
def compile_skill(_req: SkillCompileRequest):
    # Stage 7 compiler not implemented yet in this repo.
    # This stub exists so the Electron UI can be built against the real routes.
    return SkillCompileFailureResponse(
        endpoint='n/a',
        error=StructuredError(
            code='NOT_IMPLEMENTED',
            message='Skill compiler is not implemented yet. Implement Stage 7 steps 47-51.',
            attempts=0,
            validation_errors=[],
        ),
    )


@router.post('/save', response_model=SkillSaveResponse)
def save_skill(req: SkillSaveRequest) -> SkillSaveResponse:
    col = skills_collection()
    doc = _skill_to_doc(req.skill)

    try:
        result = col.insert_one(doc)
    except Exception as exc:
        # Duplicate name is common.
        raise HTTPException(status_code=409, detail='Skill with this name already exists.') from exc

    upsert_skill_docs(skills=[{'_id': result.inserted_id, **doc}])
    return SkillSaveResponse(id=str(result.inserted_id), created_at=doc['created_at'].isoformat())


@router.get('/list', response_model=list[SkillListItem])
def list_skills() -> list[SkillListItem]:
    col = skills_collection()
    docs = list(col.find({}, {'name': 1, 'trigger': 1, 'steps': 1, 'created_at': 1}).sort('created_at', -1))
    out: list[SkillListItem] = []
    for d in docs:
        steps = d.get('steps') or []
        out.append(
            SkillListItem(
                id=str(d.get('_id')),
                name=str(d.get('name', '')),
                trigger=str(d.get('trigger', '')),
                step_count=len(steps) if isinstance(steps, list) else 0,
                created_at=d.get('created_at').isoformat() if d.get('created_at') else '',
            )
        )
    return out


@router.delete('/{skill_id}')
def delete_skill(skill_id: str) -> dict[str, str]:
    col = skills_collection()
    res = col.delete_one({'_id': _coerce_object_id(skill_id)})
    if res.deleted_count == 0:
        raise HTTPException(status_code=404, detail='Skill not found.')
    return {'status': 'ok'}


def _coerce_object_id(value: str):
    try:
        from bson import ObjectId  # type: ignore

        return ObjectId(value)
    except Exception:
        # Fall back: allow deleting by custom ids if ever used.
        return value


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"module": "skill_compiler", "status": "ok"}
