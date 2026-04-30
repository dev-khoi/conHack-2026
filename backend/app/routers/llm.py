from __future__ import annotations

import base64
import io
import json
from collections.abc import AsyncGenerator
from typing import Any

from fastapi import APIRouter, HTTPException
from fastapi.responses import StreamingResponse
from PIL import Image, ImageDraw, ImageFont
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
    name: str = Field(default="StructuredOutput")
    fields: dict[str, Any]


class StructuredRequest(BaseModel):
    model_config = ConfigDict(populate_by_name=True)

    prompt: str = Field(min_length=1)
    task_type: TaskType
    output_schema: StructuredSchema = Field(alias="schema")


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


class AnalyzeImageRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    prompt: str = Field(
        default="Describe this image briefly and accurately. If applicable explain it, for example a dad joke like 'what do you call a shoe made out of a banana? a slipper'",
        min_length=1,
    )


class AnalyzeImageResponse(BaseModel):
    endpoint: str
    text: str


class EditImageRequest(BaseModel):
    image_base64: str = Field(min_length=1)
    instruction: str = Field(
        default='Add text "Going to a hackathon" on the top area of this image.',
        min_length=1,
    )


class EditImageResponse(BaseModel):
    endpoint: str
    applied_text: str
    image_base64: str
    mime_type: str = "image/png"


_client = OpenRouterClient.from_env()

_CONCISE_RULE = (
    "General rule: keep responses concise, short, and direct. "
    "Do not over-explain unless explicitly asked."
)


def _apply_concise_rule(prompt: str) -> str:
    return f"{_CONCISE_RULE}\n\n{prompt}"


def _decode_base64_image(raw: str) -> bytes:
    value = raw.strip()
    if value.startswith("data:"):
        value = value.split(",", 1)[-1]
    try:
        return base64.b64decode(value)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail="Invalid base64 image payload."
        ) from exc


def _extract_overlay_text(client: OpenRouterClient, instruction: str) -> str:
    endpoint = DEFAULT_ENDPOINTS.fast_inference
    prompt = (
        "Extract only the exact overlay text the user wants on an image. "
        "Return plain text only, no quotes, max 8 words.\n\n"
        f"User instruction: {instruction}"
    )
    text = client.invoke(endpoint_name=endpoint, payload={"prompt": prompt}).strip()
    text = text.strip('"').strip("'")
    if not text:
        return "Going to a hackathon"
    return text[:120]


def _resolve_text_position(instruction: str) -> str:
    v = instruction.lower()
    if any(k in v for k in ("middle", "center", "centre")):
        return "middle"
    return "top"


def _draw_text_overlay(image_bytes: bytes, text: str, *, position: str) -> bytes:
    with Image.open(io.BytesIO(image_bytes)) as img:
        canvas = img.convert("RGBA")

    draw = ImageDraw.Draw(canvas, "RGBA")
    width, height = canvas.size
    band_height = max(52, int(height * 0.14))

    font_size = max(20, int(height * 0.06))
    font = ImageFont.load_default()
    try:
        font = ImageFont.truetype("arial.ttf", font_size)
    except Exception:
        pass

    left, top, right, bottom = draw.textbbox((0, 0), text, font=font)
    text_width = right - left
    text_height = bottom - top
    x = max(10, (width - text_width) // 2)
    if position == "middle":
        y = max(8, (height - text_height) // 2)
    else:
        y = max(8, (band_height - text_height) // 2)

    # Pure text overlay: no background and no shadow.
    draw.text((x, y), text, fill=(255, 255, 255, 255), font=font)

    out = io.BytesIO()
    canvas.convert("RGB").save(out, format="PNG")
    return out.getvalue()


def _require_client() -> OpenRouterClient:
    if _client is None:
        raise HTTPException(
            status_code=500,
            detail="OPENROUTER_API_KEY is not configured. Set it in .env and restart backend.",
        )
    return _client


@router.post("/generate", response_model=GenerateResponse)
def generate(req: GenerateRequest):
    client = _require_client()
    endpoint = endpoint_for_task_type(req.task_type, DEFAULT_ENDPOINTS)
    payload = req.model_dump()
    payload["prompt"] = _apply_concise_rule(req.prompt)

    if not req.streaming:
        text = client.invoke(endpoint_name=endpoint, payload=payload)
        return GenerateResponse(task_type=req.task_type, endpoint=endpoint, text=text)

    async def event_stream() -> AsyncGenerator[str, None]:
        for delta in client.invoke_stream(endpoint_name=endpoint, payload=payload):
            event_payload = json.dumps({"type": "delta", "delta": delta})
            yield f"data: {event_payload}\n\n"
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


@router.post(
    "/structured", response_model=StructuredSuccessResponse | StructuredFailureResponse
)
def structured(req: StructuredRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.reasoning_inference

    parsed, err, attempts = structured_with_retries(
        client_invoke=client.invoke,
        endpoint_name=endpoint,
        prompt=_apply_concise_rule(req.prompt),
        schema_name=req.output_schema.name,
        schema_fields=req.output_schema.fields,
        max_attempts=3,
    )

    if err is not None:
        return StructuredFailureResponse(
            task_type=req.task_type, endpoint=endpoint, error=err
        )

    if parsed is None:
        raise HTTPException(
            status_code=500, detail="Structured generation failed unexpectedly"
        )

    return StructuredSuccessResponse(
        task_type=req.task_type,
        endpoint=endpoint,
        data=parsed.model_dump(),
        attempts=attempts,
    )


@router.post("/embedding", response_model=EmbeddingResponse)
def embedding(req: EmbeddingRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.embedding_inference
    vector = client.embed(endpoint_name=endpoint, text=req.text)
    return EmbeddingResponse(endpoint=endpoint, vector=vector)


@router.post("/analyze-image", response_model=AnalyzeImageResponse)
def analyze_image(req: AnalyzeImageRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.vision_inference

    raw = req.image_base64.strip()
    if raw.startswith("data:"):
        raw = raw.split(",", 1)[-1]

    import base64

    try:
        image_bytes = base64.b64decode(raw)
    except Exception as exc:
        raise HTTPException(
            status_code=400, detail="Invalid base64 image payload."
        ) from exc

    text = client.invoke_vision(
        endpoint_name=endpoint,
        prompt=_apply_concise_rule(req.prompt),
        image_bytes=image_bytes,
    )
    return AnalyzeImageResponse(endpoint=endpoint, text=text)


@router.post("/edit-image-overlay", response_model=EditImageResponse)
def edit_image_overlay(req: EditImageRequest):
    client = _require_client()
    endpoint = DEFAULT_ENDPOINTS.fast_inference

    image_bytes = _decode_base64_image(req.image_base64)
    overlay_text = _extract_overlay_text(client, req.instruction)
    position = _resolve_text_position(req.instruction)
    edited = _draw_text_overlay(image_bytes, overlay_text, position=position)
    edited_b64 = base64.b64encode(edited).decode("ascii")

    return EditImageResponse(
        endpoint=endpoint,
        applied_text=overlay_text,
        image_base64=edited_b64,
    )
