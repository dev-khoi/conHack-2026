from __future__ import annotations

from dataclasses import dataclass
from typing import Literal


TaskType = Literal[
    'summarize',
    'rewrite',
    'tag_generation',
    'explain',
    'skill_compile',
    'rag_synthesis',
    'complex_explain',
    'analyze_image',
]


@dataclass(frozen=True)
class LlmEndpoints:
    fast_inference: str
    reasoning_inference: str
    vision_inference: str
    embedding_inference: str


DEFAULT_ENDPOINTS = LlmEndpoints(
    fast_inference='openai/gpt-4o-mini',
    reasoning_inference='openai/gpt-4o',
    vision_inference='openai/gpt-4o',
    embedding_inference='text-embedding-3-small',
)


def endpoint_for_task_type(task_type: TaskType, endpoints: LlmEndpoints = DEFAULT_ENDPOINTS) -> str:
    """Map task_type -> OpenRouter model id.

    Stage 5 routing middleware for OpenRouter-only inference.
    """

    if task_type in ('summarize', 'rewrite', 'tag_generation', 'explain'):
        return endpoints.fast_inference

    if task_type in ('skill_compile', 'rag_synthesis', 'complex_explain'):
        return endpoints.reasoning_inference

    if task_type == 'analyze_image':
        return endpoints.vision_inference

    raise ValueError(f'Unknown task_type: {task_type}')
