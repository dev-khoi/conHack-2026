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
    qwen_7b_instruct: str
    qwen_72b_instruct: str
    qwen_vl_7b_instruct: str
    embedding_bge_large_en_v15: str


DEFAULT_ENDPOINTS = LlmEndpoints(
    qwen_7b_instruct='mock-qwen2_5-7b-instruct',
    qwen_72b_instruct='mock-qwen2_5-72b-instruct',
    qwen_vl_7b_instruct='mock-qwen2_5-vl-7b-instruct',
    embedding_bge_large_en_v15='mock-bge-large-en-v1_5',
)


def endpoint_for_task_type(task_type: TaskType, endpoints: LlmEndpoints = DEFAULT_ENDPOINTS) -> str:
    """Map task_type -> SageMaker endpoint name.

    Stage 5 routing middleware. For now returns mock endpoint names.
    """

    if task_type in ('summarize', 'rewrite', 'tag_generation', 'explain'):
        return endpoints.qwen_7b_instruct

    if task_type in ('skill_compile', 'rag_synthesis', 'complex_explain'):
        return endpoints.qwen_72b_instruct

    if task_type == 'analyze_image':
        return endpoints.qwen_vl_7b_instruct

    raise ValueError(f'Unknown task_type: {task_type}')
