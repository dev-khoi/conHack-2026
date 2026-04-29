from __future__ import annotations

import asyncio
import base64
import os
from collections.abc import AsyncGenerator
from dataclasses import dataclass
from typing import Any

import httpx

from app.skills.schema import SkillGraph
from app.llm.openrouter_client import OpenRouterClient
from app.llm.routing import DEFAULT_ENDPOINTS


@dataclass(frozen=True)
class StepResult:
    step_id: str
    action: str
    output: Any


class SkillRunner:
    def __init__(self, *, backend_base_url: str) -> None:
        self._backend_base_url = backend_base_url.rstrip("/")

    async def run(
        self,
        *,
        skill: SkillGraph,
        payload: dict[str, Any],
        notify: callable[[dict[str, Any]], Any],
        similarity_task: asyncio.Task[dict[str, Any] | None] | None = None,
    ) -> dict[str, Any]:
        """Run a skill graph.

        - Executes steps in order, with optional parallel execution for independent steps.
        - Applies a per-step timeout budget.
        """

        outputs: dict[str, Any] = {
            "trigger_output": payload,
        }

        steps = list(skill.steps)
        completed: list[StepResult] = []

        # Very small scheduler: batches consecutive steps that don't depend on each other.
        i = 0
        timed_out = False
        while i < len(steps):
            batch = [steps[i]]
            used_inputs = {steps[i].input}
            j = i + 1
            while j < len(steps):
                s = steps[j]
                # Only parallelize if it depends on trigger_output or on a completed step.
                # And avoid parallelizing if it depends on a step output produced in the same batch.
                if s.input.startswith("step_") and s.input not in outputs:
                    break
                if s.input in used_inputs:
                    break
                batch.append(s)
                used_inputs.add(s.input)
                j += 1

            if len(batch) == 1:
                s = batch[0]
                try:
                    out = await self._run_step_with_timeout(
                        step=s.model_dump(), outputs=outputs, notify=notify
                    )
                except TimeoutError:
                    out = {"timeout": True}
                    timed_out = True
                outputs[f"step_{s.id}_output"] = out
                completed.append(StepResult(step_id=s.id, action=s.action, output=out))
            else:
                tasks = []
                for s in batch:
                    tasks.append(
                        self._run_step_with_timeout(
                            step=s.model_dump(), outputs=outputs, notify=notify
                        )
                    )
                results = await asyncio.gather(*tasks, return_exceptions=True)
                for s, r in zip(batch, results, strict=True):
                    if isinstance(r, Exception):
                        if isinstance(r, TimeoutError):
                            out = {"timeout": True}
                            timed_out = True
                        else:
                            out = str(r)
                    else:
                        out = r
                    outputs[f"step_{s.id}_output"] = out
                    completed.append(
                        StepResult(step_id=s.id, action=s.action, output=out)
                    )

            i = j

            if timed_out:
                break

        similarity: dict[str, Any] | None = None
        if similarity_task is not None:
            try:
                similarity = await similarity_task
            except Exception:
                similarity = None

        final_output = completed[-1].output if completed else None
        return {
            "skill": {"name": skill.name, "trigger": skill.trigger},
            "final_output": final_output,
            "steps": [r.__dict__ for r in completed],
            "similarity": similarity,
        }

    async def _run_step_with_timeout(
        self,
        *,
        step: dict[str, Any],
        outputs: dict[str, Any],
        notify: callable[[dict[str, Any]], Any],
        timeout_sec: float | None = None,
    ) -> Any:
        if timeout_sec is None:
            action = str(step.get("action") or "")
            if action in {"analyze_image", "generate_image"}:
                timeout_sec = 120.0
            elif action in {"store", "store_memory"}:
                timeout_sec = 90.0
            else:
                timeout_sec = 60.0
        return await asyncio.wait_for(
            self._run_step(step=step, outputs=outputs, notify=notify),
            timeout=timeout_sec,
        )

    def _resolve_input(self, *, input_ref: str, outputs: dict[str, Any]) -> Any:
        if input_ref == "trigger_output":
            return outputs.get("trigger_output")

        if input_ref.startswith("step_") and input_ref.endswith("_output"):
            if input_ref not in outputs:
                raise ValueError(f"Unknown input reference: {input_ref}")
            return outputs[input_ref]

        # Allow arbitrary keys from payload.
        trigger = outputs.get("trigger_output")
        if isinstance(trigger, dict) and input_ref in trigger:
            return trigger[input_ref]

        raise ValueError(f"Unsupported input reference: {input_ref}")

    async def _run_step(
        self,
        *,
        step: dict[str, Any],
        outputs: dict[str, Any],
        notify: callable[[dict[str, Any]], Any],
    ) -> Any:
        action = str(step.get("action") or "")
        input_ref = str(step.get("input") or "")
        step_input = self._resolve_input(input_ref=input_ref, outputs=outputs)

        if action == "analyze":
            action = "explain"

        if action in {"summarize", "explain", "rewrite"}:
            prompt = ""
            if isinstance(step_input, dict):
                prompt = str(step_input.get("text") or step_input.get("prompt") or "")
            else:
                prompt = str(step_input)

            extra: dict[str, Any] = {}
            if action == "rewrite" and isinstance(step_input, dict):
                tone = step_input.get("tone")
                style = step_input.get("style")
                if tone:
                    extra["tone"] = tone
                if style:
                    extra["style"] = style

            return await self._llm_generate_stream(
                prompt=prompt,
                task_type=action,
                notify=notify,
                extra=extra,
            )

        if action == "analyze_image":
            # Expect a base64 string under `image_base64` (data URL allowed) or raw bytes.
            image_b64 = None
            if isinstance(step_input, dict):
                image_b64 = step_input.get("image_base64")
            elif isinstance(step_input, str):
                # Graph execution may pass the base64 string directly.
                image_b64 = step_input
            if isinstance(image_b64, str):
                if image_b64.startswith("data:"):
                    image_b64 = image_b64.split(",", 1)[-1]
                image_bytes = base64.b64decode(image_b64)
            elif isinstance(step_input, (bytes, bytearray)):
                image_bytes = bytes(step_input)
            else:
                raise ValueError("analyze_image requires image_base64 or bytes")

            return await self._vision_analyze(image_bytes=image_bytes)

        if action == "generate_image":
            prompt = str(step_input)
            return await self._stability_generate_image(prompt=prompt)

        if action in {"store", "store_memory"}:
            return await self._memory_ingest(data=step_input)

        if action in {"notify", "notify_user"}:
            await notify({"type": "notify", "payload": step_input})
            return {"status": "sent"}

        raise ValueError(f"Unknown action: {action}")

    async def _llm_generate_stream(
        self,
        *,
        prompt: str,
        task_type: str,
        notify: callable[[dict[str, Any]], Any],
        extra: dict[str, Any] | None = None,
    ) -> str:
        url = f"{self._backend_base_url}/llm/generate"
        payload: dict[str, Any] = {
            "prompt": prompt,
            "task_type": task_type,
            "streaming": True,
        }
        if extra:
            payload.update(extra)

        text_parts: list[str] = []
        async with httpx.AsyncClient(timeout=None) as client:
            async with client.stream("POST", url, json=payload) as resp:
                resp.raise_for_status()
                async for line in resp.aiter_lines():
                    if not line.startswith("data:"):
                        continue
                    data = line[len("data:") :].strip()
                    if not data:
                        continue
                    if data == '{"type":"done"}':
                        break
                    try:
                        obj = httpx.Response(200, content=data).json()
                    except Exception:
                        continue
                    if obj.get("type") == "delta":
                        delta = str(obj.get("delta") or "")
                        if delta:
                            text_parts.append(delta)
                            await notify(
                                {
                                    "type": "delta",
                                    "delta": delta,
                                    "task_type": task_type,
                                }
                            )

        full = "".join(text_parts)
        await notify({"type": "done", "task_type": task_type})
        return full

    async def _vision_analyze(self, *, image_bytes: bytes) -> str:
        client = OpenRouterClient.from_env()
        if client is None:
            raise RuntimeError("OPENROUTER_API_KEY is not configured")

        return client.invoke_vision(
            endpoint_name=DEFAULT_ENDPOINTS.vision_inference,
            prompt="Describe the image briefly and accurately.",
            image_bytes=image_bytes,
        )

    async def _stability_generate_image(self, *, prompt: str) -> dict[str, Any]:
        api_key = os.getenv("STABILITY_API_KEY")
        if not api_key:
            raise RuntimeError("STABILITY_API_KEY is not configured")

        url = os.getenv(
            "STABILITY_API_URL",
            "https://api.stability.ai/v2beta/stable-image/generate/core",
        )
        headers = {
            "Authorization": f"Bearer {api_key}",
            "Accept": "application/json",
        }
        data = {
            "prompt": prompt,
            "output_format": "png",
        }

        async with httpx.AsyncClient(timeout=60.0) as client:
            resp = await client.post(url, headers=headers, data=data)
            resp.raise_for_status()
            return resp.json()

    async def _memory_ingest(self, *, data: Any) -> dict[str, Any]:
        url = f"{self._backend_base_url}/memory/ingest"
        async with httpx.AsyncClient(timeout=20.0) as client:
            try:
                resp = await client.post(url, json={"text": data})
                resp.raise_for_status()
                return resp.json()
            except httpx.HTTPStatusError as e:
                print("STATUS:", e.response.status_code)
                print("RESPONSE TEXT:", e.response.text)
                raise


async def similarity_check(
    *,
    backend_base_url: str,
    text: str,
    threshold: float = 0.82,
) -> dict[str, Any] | None:
    url = f"{backend_base_url.rstrip('/')}/memory/similarity"
    async with httpx.AsyncClient(timeout=20.0) as client:
        resp = await client.post(url, json={"text": text, "threshold": threshold})
        resp.raise_for_status()
        payload = resp.json()
        match = payload.get("match")
        if not isinstance(match, dict):
            return None
        score = match.get("score")
        if isinstance(score, (int, float)) and score >= threshold:
            return match
        return None
