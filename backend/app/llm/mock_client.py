from __future__ import annotations

import json
from collections.abc import Generator


class MockInferenceClient:
    """Mock stand-in for SageMaker Runtime InvokeEndpoint.

    Replace with a real SageMaker client later (boto3 sagemaker-runtime InvokeEndpoint).
    """

    def invoke(self, *, endpoint_name: str, payload: dict) -> str:
        prompt = str(payload.get('prompt', ''))
        task_type = str(payload.get('task_type', ''))

        if endpoint_name.startswith('mock-bge-'):
            raise ValueError('Use embed() for embedding endpoints')

        if task_type == 'tag_generation':
            tags = [t for t in _simple_tags(prompt)][:8]
            return json.dumps({'tags': tags})

        return (
            f"[mock:{endpoint_name}] task={task_type}\n"
            f"Prompt: {prompt.strip()[:500]}\n\n"
            "This is a mocked LLM response."
        )

    def invoke_stream(self, *, endpoint_name: str, payload: dict) -> Generator[str, None, None]:
        text = self.invoke(endpoint_name=endpoint_name, payload=payload)
        chunk_size = 18
        for i in range(0, len(text), chunk_size):
            yield text[i : i + chunk_size]

    def embed(self, *, endpoint_name: str, text: str) -> list[float]:
        # Deterministic pseudo-embedding: 32 floats in [-1, 1].
        h = 2166136261
        for ch in text:
            h ^= ord(ch)
            h = (h * 16777619) & 0xFFFFFFFF

        vec: list[float] = []
        x = h
        for _ in range(32):
            x = (1103515245 * x + 12345) & 0x7FFFFFFF
            vec.append((x / 0x7FFFFFFF) * 2.0 - 1.0)
        return vec


def _simple_tags(prompt: str) -> list[str]:
    words = [w.strip('.,!?;:()[]{}"\'').lower() for w in prompt.split()]
    words = [w for w in words if w and len(w) >= 4]

    seen: set[str] = set()
    tags: list[str] = []
    for w in words:
        if w in seen:
            continue
        seen.add(w)
        tags.append(w)
    return tags
