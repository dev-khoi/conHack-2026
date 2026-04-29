from __future__ import annotations

from app.skills.schema import SkillGraph, SkillStep


BUILTIN_SKILLS: list[SkillGraph] = [
    SkillGraph(
        name='summarize-and-store',
        trigger='clipboard',
        steps=[
            SkillStep(id='1', action='summarize', input='trigger_output', model_hint='fast'),
            SkillStep(id='2', action='store', input='step_1_output'),
        ],
    ),
    SkillGraph(
        name='explain-screenshot',
        trigger='screenshot',
        steps=[
            SkillStep(id='1', action='analyze_image', input='trigger_output', model_hint='vision'),
            SkillStep(id='2', action='store', input='step_1_output'),
        ],
    ),
    SkillGraph(
        name='rewrite-tone',
        trigger='selected_text',
        steps=[
            SkillStep(id='1', action='rewrite', input='trigger_output', model_hint='fast'),
        ],
    ),
]
