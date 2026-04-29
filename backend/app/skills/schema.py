from __future__ import annotations

from typing import Literal

from pydantic import BaseModel, Field


TriggerType = Literal['clipboard', 'screenshot', 'selected_text', 'voice', 'manual']
ModelHint = Literal['fast', 'reasoning', 'vision']
ActionType = Literal[
    'summarize',
    'explain',
    'rewrite',
    'tag_generation',
    'analyze_image',
    'generate_image',
    'store',
    'notify',
]


class SkillStep(BaseModel):
    id: str = Field(min_length=1)
    action: ActionType
    input: str = Field(min_length=1)
    model_hint: ModelHint | None = None


class SkillGraph(BaseModel):
    name: str = Field(min_length=1)
    trigger: TriggerType
    steps: list[SkillStep] = Field(min_length=1)
