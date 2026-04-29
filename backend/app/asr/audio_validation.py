from __future__ import annotations

import wave
from dataclasses import dataclass
from typing import Literal

import av


AudioKind = Literal['wav', 'webm']


class AudioValidationError(Exception):
    pass


@dataclass(frozen=True)
class AudioInfo:
    kind: AudioKind
    duration_sec: float


def sniff_audio_kind(header: bytes) -> AudioKind | None:
    # WAV: RIFF .... WAVE
    if len(header) >= 12 and header[0:4] == b'RIFF' and header[8:12] == b'WAVE':
        return 'wav'

    # WebM/Matroska: EBML header
    if len(header) >= 4 and header[0:4] == b'\x1a\x45\xdf\xa3':
        return 'webm'

    return None


def duration_seconds_for_path(*, file_path: str, kind: AudioKind) -> float:
    if kind == 'wav':
        with wave.open(file_path, 'rb') as wf:
            framerate = wf.getframerate()
            frames = wf.getnframes()
            if framerate <= 0:
                raise AudioValidationError('Invalid WAV framerate')
            return float(frames) / float(framerate)

    try:
        with av.open(file_path) as container:
            if container.duration is not None:
                # PyAV duration is in microseconds (AV_TIME_BASE units).
                return float(container.duration) / 1_000_000.0

            audio_stream = next((s for s in container.streams if s.type == 'audio'), None)
            if audio_stream is None:
                raise AudioValidationError('No audio stream found')

            if audio_stream.duration is not None and audio_stream.time_base is not None:
                return float(audio_stream.duration * audio_stream.time_base)

            # Browser-recorded WebM often omits stream/container duration metadata.
            # Fallback: decode frames and estimate from sample count.
            if audio_stream.rate and audio_stream.rate > 0:
                total_samples = 0
                for frame in container.decode(audio=audio_stream.index):
                    if frame.samples:
                        total_samples += int(frame.samples)

                if total_samples > 0:
                    return float(total_samples) / float(audio_stream.rate)

            raise AudioValidationError('Audio duration unavailable')
    except AudioValidationError:
        raise
    except Exception as e:
        raise AudioValidationError(f'Failed to parse WebM: {e}') from e


def validate_audio_for_path(*, file_path: str, kind: AudioKind, max_duration_sec: float) -> AudioInfo:
    duration = duration_seconds_for_path(file_path=file_path, kind=kind)
    if duration <= 0:
        raise AudioValidationError('Audio duration is invalid')
    if duration > max_duration_sec:
        raise AudioValidationError(f'Audio too long: {duration:.2f}s (max {max_duration_sec:.0f}s)')
    return AudioInfo(kind=kind, duration_sec=duration)
