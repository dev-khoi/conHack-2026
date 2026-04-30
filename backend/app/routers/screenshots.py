from __future__ import annotations

import uuid
from datetime import UTC, datetime

from fastapi import APIRouter, HTTPException
from pydantic import BaseModel, Field

from app.database.mongo import screenshots_collection

router = APIRouter()


class UploadBase64Request(BaseModel):
    screenshot_base64: str = Field(min_length=1)
    source: str = Field(default='overlay')
    session_id: str | None = None


class UploadBase64Response(BaseModel):
    id: str
    url: str


@router.post('/upload-base64', response_model=UploadBase64Response)
def upload_base64(req: UploadBase64Request) -> UploadBase64Response:
    raw = req.screenshot_base64.strip()
    if not raw:
        raise HTTPException(status_code=400, detail='screenshot_base64 is required')

    screenshot_id = uuid.uuid4().hex
    created_at = datetime.now(UTC).isoformat()

    doc = {
        'id': screenshot_id,
        'source': req.source,
        'session_id': req.session_id,
        'created_at': created_at,
        'data_url': raw,
        'url': '',
    }
    screenshots_collection().insert_one(doc)

    return UploadBase64Response(id=screenshot_id, url='')
