from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.llm.openrouter_client import OpenRouterClient
from app.llm.routing import DEFAULT_ENDPOINTS, TaskType, endpoint_for_task_type
from app.llm.structured import StructuredError, structured_with_retries


router = APIRouter()


class GenerateRequest(BaseModel):
    prompt: str = Field(min_length=1)
    task_type: TaskType
    streaming: bool = False


class GenerateResponse(BaseModel):
    task_type: TaskType
    endpoint: str
    text: str


class StructuredSchema(BaseModel):
    name: str = Field(default='StructuredOutput')
    fields: dict[str, Any]


class StructuredRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(min_length=1)
    task_type: TaskType
    output_schema: StructuredSchema = Field(alias='schema')


class StructuredSuccessResponse(BaseModel):
    task_type: TaskType
    endpoint: str
    data: dict[str, Any]
    attempts: int


class StructuredFailureResponse(BaseModel):
    task_type: TaskType
    endpoint: str
    error: StructuredError


class EmbeddingRequest(BaseModel):
    text: str = Field(min_length=1)


class EmbeddingResponse(BaseModel):
    endpoint: str
    vector: list[float]


_client = OpenRouterClient.from_env()


def _require_client() -> OpenRouterClient:
    if _client is None:
        raise HTTPException(
            status_code=500,
            detail='OPENROUTER_API_KEY is not configured. Set it in .env and restart backend.',
        )
    return _client


@router.post('/generate', response_model=GenerateResponse)
def generate(req: GenerateRequest):
    client = _require_client()
    endpoint = endpoint_for_task_type(req.task_type, DEFAULT_ENDPOINTS)

    if not req.streaming:
        text = client.invoke(endpoint_name=endpoint, payload=req.model_dump())
        return GenerateResponse(task_type=req.task_type, endpoint=endpoint, text=text)

    async def event_stream() -> AsyncGenerator[str, None]:
        for delta in client.invoke_stream(endpoint_name=endpoint, payload=req.model_dump()):
            payload = json.dumps({'type': 'delta', 'delta': delta})
            yield f'data: {payload}\n\n'
        yield 'data: {"type":"done"}\n\n'

    return StreamingResponse(
        event_stream(),
        media_type='text/event-stream',
        headers={
            'Cache-Control': 'no-cache',
            'Connection': 'keep-alive',
            'X-Accel-Buffering': 'no',
        },
    )


@router.post('/structured', response_model=StructuredSuccessResponse | StructuredFailureResponse)
def structured(req: StructuredRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.reasoning_inference

    parsed, err, attempts = structured_with_retries(
        client_invoke=client.invoke,
        endpoint_name=endpoint,
        prompt=req.prompt,
        schema_name=req.output_schema.name,
        schema_fields=req.output_schema.fields,
        max_attempts=3,
    )

    if err is not None:
        return StructuredFailureResponse(task_type=req.task_type, endpoint=endpoint, error=err)

    if parsed is None:
        raise HTTPException(status_code=500, detail='Structured generation failed unexpectedly')

    return StructuredSuccessResponse(
        task_type=req.task_type,
        endpoint=endpoint,
        data=parsed.model_dump(),
        attempts=attempts,
    )


@router.post('/embedding', response_model=EmbeddingResponse)
def embedding(req: EmbeddingRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.embedding_inference
    vector = client.embed(endpoint_name=endpoint, text=req.text)
    return EmbeddingResponse(endpoint=endpoint, vector=vector)
