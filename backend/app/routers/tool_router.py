from __future__ import annotations

import re
from typing import Literal

from fastapi import APIRouter
from pydantic import BaseModel, Field

router = APIRouter()

ToolName = Literal[
    'explain',
    'summarize',
    'rewrite',
    'analyze',
    'analyze_image',
    'store_memory',
    'notify_user',
]


class PlanInputMetadata(BaseModel):
    source: list[Literal['voice', 'clipboard', 'screen']] = Field(default_factory=list)


class PlanInput(BaseModel):
    voice: str = Field(min_length=1)
    clipboard: str | None = None
    screenshot_analysis: str | None = None
    screenshot_base64: str | None = None
    metadata: PlanInputMetadata = Field(default_factory=PlanInputMetadata)


class GraphStep(BaseModel):
    id: str
    tool: ToolName
    input: str
    depends_on: list[str] = Field(default_factory=list)


class PlanResponse(BaseModel):
    intent: str
    tool_graph: list[GraphStep]


def _guess_intent(voice: str) -> str:
    v = voice.lower()
    if any(k in v for k in ('rewrite', 'rephrase', 'tone')):
        return 'rewrite'
    if any(k in v for k in ('summarize', 'summary', 'tldr')):
        return 'summarize'
    if any(k in v for k in ('debug', 'fix', 'error', 'bug', 'issue', 'traceback')):
        return 'debug'
    if any(k in v for k in ('analyze', 'analysis', 'investigate')):
        return 'analyze'
    if any(k in v for k in ('image', 'screen', 'screenshot', 'what is this')):
        return 'image_explain'
    if any(k in v for k in ('explain', 'what is', 'why')):
        return 'explain'
    return 'analyze'


def _fused_input(req: PlanInput) -> str:
    parts = [f'voice: {req.voice.strip()}']
    if req.clipboard:
        parts.append(f'clipboard: {req.clipboard.strip()}')
    if req.screenshot_analysis:
        parts.append(f'screenshot_analysis: {req.screenshot_analysis.strip()}')
    return '\n'.join(parts)


@router.post('/plan', response_model=PlanResponse)
def plan(req: PlanInput) -> PlanResponse:
    intent = _guess_intent(req.voice)
    fused = _fused_input(req)

    steps: list[GraphStep] = []
    next_id = 1

    has_screen = bool(req.screenshot_analysis)
    has_clipboard = bool(req.clipboard)

    vision_step_id: str | None = None
    if has_screen:
        # Rule: if screenshot exists, start with analyze_image
        vision_step_id = str(next_id)
        steps.append(
            GraphStep(
                id=vision_step_id,
                tool='analyze_image',
                input='screenshot_base64',
                depends_on=[],
            )
        )
        next_id += 1

    deps = [vision_step_id] if vision_step_id else []

    if intent == 'rewrite':
        steps.append(GraphStep(id=str(next_id), tool='rewrite', input=fused, depends_on=deps))
    elif intent == 'summarize':
        steps.append(GraphStep(id=str(next_id), tool='summarize', input=fused, depends_on=deps))
    elif intent == 'debug':
        analyze_id = str(next_id)
        steps.append(GraphStep(id=analyze_id, tool='analyze', input=fused, depends_on=deps))
        next_id += 1
        explain_id = str(next_id)
        steps.append(GraphStep(id=explain_id, tool='explain', input='step_{}_output'.format(analyze_id), depends_on=[analyze_id]))
        next_id += 1
        steps.append(GraphStep(id=str(next_id), tool='rewrite', input='step_{}_output'.format(explain_id), depends_on=[explain_id]))
    elif intent == 'image_explain':
        steps.append(GraphStep(id=str(next_id), tool='explain', input=fused, depends_on=deps))
    elif intent == 'analyze':
        steps.append(GraphStep(id=str(next_id), tool='analyze', input=fused, depends_on=deps))
    else:
        steps.append(GraphStep(id=str(next_id), tool='explain', input=fused, depends_on=deps))

    next_id += 1
    last_id = steps[-1].id

    steps.append(GraphStep(id=str(next_id), tool='store_memory', input=fused, depends_on=[last_id]))
    next_id += 1
    steps.append(GraphStep(id=str(next_id), tool='notify_user', input='Completed', depends_on=[last_id]))

    # sanitize: strict deterministic ids and dependencies
    for s in steps:
        s.input = re.sub(r'\s+', ' ', s.input).strip()

    return PlanResponse(intent=intent, tool_graph=steps)
