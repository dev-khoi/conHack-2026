from __future__ import annotations

import os
import tempfile
import unittest
import wave

from app.asr.audio_validation import sniff_audio_kind, validate_audio_for_path


class TestAsrAudioValidation(unittest.TestCase):
    def test_sniff_wav(self) -> None:
        header = b'RIFF' + (b'\x00' * 4) + b'WAVE'
        self.assertEqual(sniff_audio_kind(header), 'wav')

    def test_sniff_webm(self) -> None:
        self.assertEqual(sniff_audio_kind(b'\x1a\x45\xdf\xa3' + b'\x00' * 16), 'webm')

    def test_validate_wav_duration_limit(self) -> None:
        # Create a 2-second, 16kHz mono WAV.
        sr = 16000
        seconds = 2
        frames = sr * seconds
        samples = b'\x00\x00' * frames

        with tempfile.NamedTemporaryFile(delete=False, suffix='.wav') as tmp:
            wav_path = tmp.name

        try:
            with wave.open(wav_path, 'wb') as wf:
                wf.setnchannels(1)
                wf.setsampwidth(2)
                wf.setframerate(sr)
                wf.writeframes(samples)

            info = validate_audio_for_path(file_path=wav_path, kind='wav', max_duration_sec=60.0)
            self.assertGreater(info.duration_sec, 1.9)
            self.assertLess(info.duration_sec, 2.1)
        finally:
            try:
                os.unlink(wav_path)
            except OSError:
                pass


if __name__ == '__main__':
    unittest.main()
