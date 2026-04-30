from __future__ import annotations

import re
from typing import Any, Literal

from fastapi import APIRouter, HTTPException
from langgraph.graph import END, START, StateGraph
from pydantic import BaseModel, Field

from app.llm.openrouter_client import OpenRouterClient
from app.llm.routing import DEFAULT_ENDPOINTS
from app.llm.structured import structured_with_retries

router = APIRouter()

ToolName = Literal[
    "explain",
    "summarize",
    "rewrite",
    "analyze",
    "analyze_image",
    "store_memory",
    "notify_user",
    "copy_to_clipboard",
]


class PlanInputMetadata(BaseModel):
    source: list[Literal["voice", "clipboard", "screen"]] = Field(default_factory=list)


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


class NormalizedInput(BaseModel):
    source: Literal["voice", "clipboard", "screenshot", "multimodal"]
    text: str
    image_context: str | None = None
    user_intent: str
    confidence: float = 0.0
    has_screenshot: bool = False


class RouterDecision(BaseModel):
    intent: Literal[
        "summarize", "rewrite", "explain", "analyze", "image_explain", "debug"
    ]
    target_tool: ToolName
    use_clipboard: bool = False
    needs_image: bool = False
    confidence: float = 0.0


class PlannerState(dict):
    req: PlanInput
    normalized: NormalizedInput
    decision: RouterDecision
    response: PlanResponse


def _guess_intent(voice: str, *, has_screen: bool) -> str:
    v = voice.lower()
    if any(
        k in v
        for k in (
            "rewrite",
            "rephrase",
            "tone",
            "reformat",
            "format",
            "convert",
            "transform",
            "remove semicolon",
            "remove semicolons",
        )
    ):
        return "rewrite"
    if any(k in v for k in ("summarize", "summary", "tldr")):
        return "summarize"
    if any(k in v for k in ("debug", "fix", "error", "bug", "issue", "traceback")):
        return "debug"
    if any(k in v for k in ("analyze", "analysis", "investigate")):
        return "analyze"
    if any(k in v for k in ("image", "screen", "screenshot", "what is this")):
        return "image_explain"
    if any(k in v for k in ("explain", "what is", "why")):
        return "explain"
    # Do not auto-switch to image intent just because a screenshot exists.
    # Screenshot should only be used when voice explicitly asks for image/screen analysis.
    if has_screen:
        return "analyze"
    return "analyze"


def _clean_text(value: str | None) -> str:
    return re.sub(r"\s+", " ", (value or "").strip())


def _determine_source(
    req: PlanInput,
) -> Literal["voice", "clipboard", "screenshot", "multimodal"]:
    has_clipboard = bool(_clean_text(req.clipboard))
    has_screenshot = bool(
        _clean_text(req.screenshot_analysis) or _clean_text(req.screenshot_base64)
    )
    if has_clipboard and has_screenshot:
        return "multimodal"
    if has_screenshot:
        return "screenshot"
    if has_clipboard:
        return "clipboard"
    return "voice"


def _needs_image_for_voice(voice: str) -> bool:
    v = voice.lower()
    return any(
        k in v
        for k in (
            "image",
            "screen",
            "screenshot",
            "what is on the image",
            "what is in the image",
        )
    )


def _normalize_input(req: PlanInput) -> NormalizedInput:
    voice = _clean_text(req.voice)
    clipboard = _clean_text(req.clipboard)
    image_context = _clean_text(req.screenshot_analysis) or None
    has_screenshot = bool(image_context or _clean_text(req.screenshot_base64))

    source = _determine_source(req)
    user_intent = _guess_intent(voice, has_screen=has_screenshot)

    if user_intent == "summarize" and clipboard:
        text = clipboard
    elif user_intent == "rewrite" and clipboard:
        text = clipboard
    else:
        text = voice

    if not text and clipboard:
        text = clipboard

    confidence = 0.55
    if source == "voice" and not has_screenshot:
        confidence = 0.75
    if source in {"clipboard", "screenshot", "multimodal"}:
        confidence = 0.8

    return NormalizedInput(
        source=source,
        text=text,
        image_context=image_context,
        user_intent=user_intent,
        confidence=confidence,
        has_screenshot=has_screenshot,
    )


def _is_structure_rewrite_request(voice: str) -> bool:
    v = voice.lower()
    if not any(
        k in v
        for k in (
            "rewrite",
            "reformat",
            "convert",
            "transform",
            "structure",
            "structured",
            "json",
            "yaml",
            "csv",
            "table",
            "schema",
        )
    ):
        return False
    return any(
        k in v
        for k in (
            "unstructured",
            "structured",
            "json",
            "yaml",
            "csv",
            "table",
            "schema",
            "format",
        )
    )


def _is_clipboard_text_edit_request(voice: str) -> bool:
    v = voice.lower()
    return any(
        k in v
        for k in (
            "trim",
            "shorten",
            "condense",
            "make it one sentence",
            "one sentence",
            "summarize this",
            "rewrite this",
            "rephrase",
            "fix grammar",
            "clean up",
            "normalize",
            "remove semicolon",
            "remove semicolons",
            "convert this",
            "format this",
        )
    )


def _router_prompt(normalized: NormalizedInput, req: PlanInput) -> str:
    return (
        "Route this user request to exactly one primary tool. Return strict JSON only.\n"
        "Available tools: summarize, rewrite, explain, analyze, analyze_image.\n"
        "Rules:\n"
        "- Prefer summarize when user asks summary/TLDR.\n"
        "- After every tool is done, copy the result to the clipboard, set use_clipboard=true.\n"
        "- Set needs_image=true only if image understanding is required.\n"
        "- If screenshot is missing, needs_image must be false.\n"
        "- intent must be one of: summarize, rewrite, explain, analyze, image_explain, debug.\n"
        "\n"
        f"voice: {normalized.text}\n"
        f"raw_voice: {req.voice}\n"
        f"has_clipboard: {bool(_clean_text(req.clipboard))}\n"
        f"has_screenshot: {normalized.has_screenshot}\n"
        f"source: {normalized.source}\n"
        f"heuristic_intent: {normalized.user_intent}"
    )


def _deterministic_decision(
    normalized: NormalizedInput, req: PlanInput
) -> RouterDecision:
    intent = normalized.user_intent
    use_clipboard = bool(_clean_text(req.clipboard)) and intent in {
        "summarize",
        "rewrite",
    }
    needs_image = intent == "image_explain"
    target_tool: ToolName
    if intent == "summarize":
        target_tool = "summarize"
    elif intent == "rewrite":
        target_tool = "rewrite"
    elif intent == "analyze":
        target_tool = "analyze"
    elif intent == "debug":
        target_tool = "analyze"
    elif intent == "image_explain":
        target_tool = "analyze_image"
    else:
        target_tool = "explain"

    if needs_image and not normalized.has_screenshot:
        needs_image = False
        target_tool = "explain"
        intent = "explain"

    return RouterDecision(
        intent=(
            intent
            if intent
            in {"summarize", "rewrite", "explain", "analyze", "image_explain", "debug"}
            else "explain"
        ),
        target_tool=target_tool,
        use_clipboard=use_clipboard,
        needs_image=needs_image,
        confidence=normalized.confidence,
    )


def _llm_router_decision(
    normalized: NormalizedInput, req: PlanInput
) -> RouterDecision | None:
    client = OpenRouterClient.from_env()
    if client is None:
        return None

    schema_fields: dict[str, Any] = {
        "intent": {"type": "string"},
        "target_tool": {"type": "string"},
        "use_clipboard": {"type": "boolean", "optional": True},
        "needs_image": {"type": "boolean", "optional": True},
        "confidence": {"type": "number", "optional": True},
    }
    parsed, err, _ = structured_with_retries(
        client_invoke=client.invoke,
        endpoint_name=DEFAULT_ENDPOINTS.reasoning_inference,
        prompt=_router_prompt(normalized, req),
        schema_name="RouterDecision",
        schema_fields=schema_fields,
        max_attempts=2,
    )
    if err is not None or parsed is None:
        return None

    data = parsed.model_dump()
    intent_raw = str(data.get("intent") or "").strip().lower()
    tool_raw = str(data.get("target_tool") or "").strip().lower()
    use_clipboard = bool(data.get("use_clipboard", False))
    needs_image = bool(data.get("needs_image", False))
    confidence = float(
        data.get("confidence", normalized.confidence) or normalized.confidence
    )

    allowed_intents = {
        "summarize",
        "rewrite",
        "explain",
        "analyze",
        "image_explain",
        "debug",
    }
    if intent_raw not in allowed_intents:
        return None

    tool_map: dict[str, ToolName] = {
        "summarize": "summarize",
        "rewrite": "rewrite",
        "explain": "explain",
        "analyze": "analyze",
        "analyze_image": "analyze_image",
    }
    if tool_raw not in tool_map:
        return None

    if needs_image and not normalized.has_screenshot:
        return None

    # Hard guardrails: summarization/rewrite should not trigger image analysis.
    if intent_raw in {"summarize", "rewrite"} and tool_raw == "analyze_image":
        return None
    if intent_raw in {"summarize", "rewrite"} and needs_image:
        return None

    return RouterDecision(
        intent=intent_raw,
        target_tool=tool_map[tool_raw],
        use_clipboard=use_clipboard,
        needs_image=needs_image,
        confidence=max(0.0, min(1.0, confidence)),
    )


def _build_plan_from_decision(decision: RouterDecision, req: PlanInput) -> PlanResponse:
    steps: list[GraphStep] = []
    next_id = 1

    if decision.needs_image:
        steps.append(
            GraphStep(
                id=str(next_id),
                tool="analyze_image",
                input="screenshot_base64",
                depends_on=[],
            )
        )
    else:
        input_ref = "voice"
        if decision.use_clipboard and _clean_text(req.clipboard):
            input_ref = "clipboard"

        steps.append(
            GraphStep(
                id=str(next_id),
                tool=decision.target_tool,
                input=input_ref,
                depends_on=[],
            )
        )

    if not decision.needs_image:
        next_id += 1
        steps.append(
            GraphStep(
                id=str(next_id),
                tool="copy_to_clipboard",
                input=f"step_{next_id - 1}_output",
                depends_on=[str(next_id - 1)],
            )
        )

    for s in steps:
        s.input = re.sub(r"\s+", " ", s.input).strip()

    return PlanResponse(intent=decision.intent, tool_graph=steps)


def _build_planner_graph():
    graph = StateGraph(PlannerState)

    def normalize_node(state: PlannerState) -> dict[str, Any]:
        req = state["req"]
        normalized = _normalize_input(req)
        if _needs_image_for_voice(req.voice) and not normalized.has_screenshot:
            raise HTTPException(
                status_code=400,
                detail="Image-focused request requires a screenshot, but no screenshot was captured.",
            )
        return {"normalized": normalized}

    def route_node(state: PlannerState) -> dict[str, Any]:
        req = state["req"]
        normalized = state["normalized"]
        has_clipboard = bool(_clean_text(req.clipboard))
        llm_decision = _llm_router_decision(normalized, req)
        decision = llm_decision or _deterministic_decision(normalized, req)

        # Guardrail: screenshot presence alone must never force image analysis.
        if decision.target_tool == "analyze_image" and not _needs_image_for_voice(
            req.voice
        ):
            decision = _deterministic_decision(normalized, req)
            decision.needs_image = False

        # Final deterministic override for "summarize/rewrite clipboard" behavior.
        if normalized.user_intent in {"summarize", "rewrite"}:
            decision.intent = normalized.user_intent  # type: ignore[assignment]
            decision.target_tool = normalized.user_intent  # type: ignore[assignment]
            decision.needs_image = False
            decision.use_clipboard = has_clipboard

        if _is_structure_rewrite_request(req.voice):
            decision.intent = "rewrite"
            decision.target_tool = "rewrite"
            decision.use_clipboard = has_clipboard
            decision.needs_image = False

        # Wrapper behavior: clipboard + edit-style command should transform clipboard text,
        # then copy result back to clipboard.
        if has_clipboard and _is_clipboard_text_edit_request(req.voice):
            if any(
                k in req.voice.lower()
                for k in ("summarize", "one sentence", "shorten", "condense", "trim")
            ):
                decision.intent = "summarize"
                decision.target_tool = "summarize"
            else:
                decision.intent = "rewrite"
                decision.target_tool = "rewrite"
            decision.use_clipboard = True
            decision.needs_image = False

        return {"decision": decision}

    def plan_node(state: PlannerState) -> dict[str, Any]:
        req = state["req"]
        decision = state["decision"]
        response = _build_plan_from_decision(decision, req)
        return {"response": response}

    graph.add_node("normalize", normalize_node)
    graph.add_node("route", route_node)
    graph.add_node("plan", plan_node)
    graph.add_edge(START, "normalize")
    graph.add_edge("normalize", "route")
    graph.add_edge("route", "plan")
    graph.add_edge("plan", END)
    return graph.compile()


_PLANNER_GRAPH = _build_planner_graph()


@router.post("/plan", response_model=PlanResponse)
def plan(req: PlanInput) -> PlanResponse:
    state = _PLANNER_GRAPH.invoke({"req": req})
    response = state.get("response")
    if not isinstance(response, PlanResponse):
        raise HTTPException(
            status_code=500, detail="Planner did not produce a valid response."
        )
    return response
