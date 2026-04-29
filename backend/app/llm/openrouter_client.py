from __future__ import annotations

import os
from collections.abc import Generator
from dotenv import load_dotenv

load_dotenv()
from openai import OpenAI


class OpenRouterClient:
    def __init__(self, *, api_key: str, base_url: str | None = None) -> None:
        self._client = OpenAI(
            api_key=api_key,
            base_url=base_url or "https://openrouter.ai/api/v1",
        )

    @classmethod
    def from_env(cls) -> OpenRouterClient | None:
        api_key = os.getenv("OPENROUTER_API_KEY")
        if not api_key:
            return None
        base_url = os.getenv("OPENROUTER_BASE_URL")
        return cls(api_key=api_key, base_url=base_url)

    def invoke(self, *, endpoint_name: str, payload: dict) -> str:
        prompt = str(payload.get("prompt", ""))
        completion = self._client.chat.completions.create(
            model=endpoint_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
        )
        return completion.choices[0].message.content or ""

    def invoke_stream(
        self, *, endpoint_name: str, payload: dict
    ) -> Generator[str, None, None]:
        prompt = str(payload.get("prompt", ""))
        stream = self._client.chat.completions.create(
            model=endpoint_name,
            messages=[{"role": "user", "content": prompt}],
            temperature=0.2,
            stream=True,
        )
        for chunk in stream:
            if not chunk.choices:
                continue
            delta = chunk.choices[0].delta.content
            if delta:
                yield delta

    def embed(self, *, endpoint_name: str, text: str) -> list[float]:
        response = self._client.embeddings.create(model=endpoint_name, input=text)
        if not response.data:
            return []
        return list(response.data[0].embedding)

    def invoke_vision(self, *, endpoint_name: str, prompt: str, image_bytes: bytes) -> str:
        image_b64 = image_bytes.hex()
        # OpenAI-compatible image_url expects base64 data URL. We avoid importing base64 here.
        # Hex -> bytes is reversible but not a valid data URL; convert properly.
        import base64

        image_b64 = base64.b64encode(image_bytes).decode('ascii')
        data_url = f'data:image/png;base64,{image_b64}'

        completion = self._client.chat.completions.create(
            model=endpoint_name,
            messages=[
                {
                    'role': 'user',
                    'content': [
                        {'type': 'text', 'text': prompt},
                        {'type': 'image_url', 'image_url': {'url': data_url}},
                    ],
                }
            ],
            temperature=0.2,
        )
        return completion.choices[0].message.content or ''
