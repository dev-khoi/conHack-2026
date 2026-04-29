from __future__ import annotations

import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from pydantic import BaseModel, ConfigDict, Field

from app.llm.mock_client import MockInferenceClient
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
    mock: bool = True


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
    mock: bool = True


class StructuredFailureResponse(BaseModel):
    task_type: TaskType
    endpoint: str
    error: StructuredError
    mock: bool = True


class EmbeddingRequest(BaseModel):
    text: str = Field(min_length=1)


class EmbeddingResponse(BaseModel):
    endpoint: str
    vector: list[float]
    mock: bool = True


_client = MockInferenceClient()


@router.post('/generate', response_model=GenerateResponse)
def generate(req: GenerateRequest):
    endpoint = endpoint_for_task_type(req.task_type, DEFAULT_ENDPOINTS)

    if not req.streaming:
        text = _client.invoke(endpoint_name=endpoint, payload=req.model_dump())
        return GenerateResponse(task_type=req.task_type, endpoint=endpoint, text=text)

    async def event_stream() -> AsyncGenerator[str, None]:
        for delta in _client.invoke_stream(endpoint_name=endpoint, payload=req.model_dump()):
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
    endpoint = DEFAULT_ENDPOINTS.qwen_72b_instruct

    def invoke_for_structured(*, endpoint_name: str, payload: dict) -> str:
        prompt = str(payload.get('prompt', ''))

        # Simulate repair: if the retry prompt is used, return valid JSON.
        if 'You MUST return JSON only' in prompt or 'Validation errors to fix' in prompt:
            data: dict[str, Any] = {}
            for k, spec_any in req.output_schema.fields.items():
                if not isinstance(spec_any, dict):
                    data[k] = None
                    continue
                t = spec_any.get('type')
                if t == 'string':
                    data[k] = 'mock'
                elif t == 'integer':
                    data[k] = 1
                elif t == 'number':
                    data[k] = 1.0
                elif t == 'boolean':
                    data[k] = True
                elif t == 'array':
                    data[k] = []
                else:
                    data[k] = {}
            return json.dumps(data)

        # First attempt returns invalid JSON to exercise retry loop.
        return '{"not_json": '

    parsed, err, attempts = structured_with_retries(
        client_invoke=invoke_for_structured,
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
    endpoint = DEFAULT_ENDPOINTS.embedding_bge_large_en_v15
    vector = _client.embed(endpoint_name=endpoint, text=req.text)
    return EmbeddingResponse(endpoint=endpoint, vector=vector)
