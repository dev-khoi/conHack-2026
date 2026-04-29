from __future__ import annotations

import tempfile
from pathlib import Path

from fastapi import APIRouter, File, HTTPException, UploadFile

from app.asr.audio_validation import AudioValidationError, sniff_audio_kind, validate_audio_for_path
from app.asr.whisper_service import transcribe_path


router = APIRouter()


MAX_AUDIO_DURATION_SEC = 60.0


def _infer_kind_from_metadata(file: UploadFile) -> str | None:
    content_type = (file.content_type or '').lower()
    if content_type in {'audio/wav', 'audio/x-wav'}:
        return 'wav'
    if content_type in {'audio/webm', 'video/webm', 'audio/webm;codecs=opus'}:
        return 'webm'

    name = (file.filename or '').lower()
    if name.endswith('.wav'):
        return 'wav'
    if name.endswith('.webm'):
        return 'webm'

    return None


@router.post('/transcribe')
async def transcribe(file: UploadFile = File(...)) -> dict[str, str]:
    """Transcribe a short voice command.

    Accepts WAV or WebM. Reject other formats before attempting transcription.
    Enforces a max duration to keep latency + resources bounded.
    """

    # Validate based on bytes (not filename) to reject early.
    header = await file.read(64)
    kind = sniff_audio_kind(header)
    if kind is None:
        # Some browser-recorded blobs may have atypical leading bytes.
        # Use metadata fallback, then parse/validate the real file contents.
        kind = _infer_kind_from_metadata(file)
        if kind is None:
            raise HTTPException(status_code=415, detail='Unsupported audio format. Only WAV or WebM is allowed.')

    # Persist to a temp file so validators + whisper can open it.
    suffix = '.wav' if kind == 'wav' else '.webm'
    tmp_path: Path | None = None
    try:
        with tempfile.NamedTemporaryFile(delete=False, suffix=suffix) as tmp:
            tmp_path = Path(tmp.name)
            tmp.write(header)
            while True:
                chunk = await file.read(1024 * 1024)
                if not chunk:
                    break
                tmp.write(chunk)

        try:
            validate_audio_for_path(file_path=str(tmp_path), kind=kind, max_duration_sec=MAX_AUDIO_DURATION_SEC)
        except AudioValidationError as e:
            raise HTTPException(status_code=400, detail=str(e)) from e

        text = transcribe_path(file_path=str(tmp_path))
        return {'text': text}
    finally:
        try:
            await file.close()
        finally:
            if tmp_path is not None:
                try:
                    tmp_path.unlink(missing_ok=True)
                except OSError:
                    pass


@router.get("/ping")
def ping() -> dict[str, str]:
    return {"module": "asr", "status": "ok"}
