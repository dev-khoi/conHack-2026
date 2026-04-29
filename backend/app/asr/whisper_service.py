from __future__ import annotations

import os
import threading
from typing import Iterable

from faster_whisper import WhisperModel


_model: WhisperModel | None = None
_model_lock = threading.Lock()


def _model_size() -> str:
    return os.getenv('ASR_WHISPER_MODEL', 'base')


def get_whisper_model() -> WhisperModel:
    global _model
    if _model is not None:
        return _model

    with _model_lock:
        if _model is not None:
            return _model

        # CPU defaults: int8 is the usual fast path.
        _model = WhisperModel(_model_size(), device='cpu', compute_type='int8')
        return _model


def transcribe_path(*, file_path: str) -> str:
    model = get_whisper_model()

    segments, _info = model.transcribe(
        file_path,
        beam_size=1,
        vad_filter=True,
    )

    text = ''.join(seg.text for seg in segments).strip()
    return text
