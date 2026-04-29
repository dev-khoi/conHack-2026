from __future__ import annotations

import json
from typing import Any

from pydantic import BaseModel, ValidationError, create_model


class StructuredError(BaseModel):
    code: str
    message: str
    attempts: int
    validation_errors: list[dict[str, Any]]


def build_pydantic_model(name: str, fields: dict[str, Any]) -> type[BaseModel]:
    """Build a Pydantic model from a minimal field spec.

    Spec example:
      {
        "title": {"type": "string"},
        "count": {"type": "integer", "optional": true},
        "items": {"type": "array", "items": {"type": "string"}}
      }
    """

    model_fields: dict[str, tuple[Any, Any]] = {}
    for field_name, spec_any in fields.items():
        if not isinstance(spec_any, dict):
            raise ValueError(f'Invalid field spec for {field_name}: expected object')

        spec: dict[str, Any] = spec_any
        py_type = _spec_to_type(spec, name_hint=_nested_model_name(name, field_name))
        optional = bool(spec.get('optional', False))
        default = None if optional else ...
        model_fields[field_name] = (py_type, default)

    return create_model(name, **model_fields)  # type: ignore[call-arg]


def validate_json(text: str, model: type[BaseModel]) -> BaseModel:
    parsed = json.loads(text)
    return model.model_validate(parsed)


def auto_repair_prompt(*, prompt: str, schema_name: str, schema_fields: dict[str, Any], errors: list[dict[str, Any]]) -> str:
    schema_json = json.dumps({'name': schema_name, 'fields': schema_fields}, indent=2, sort_keys=True)
    errors_json = json.dumps(errors, indent=2, sort_keys=True)
    return (
        "You MUST return JSON only. No prose. No markdown.\n"
        "Return an object that matches this schema exactly.\n\n"
        f"Schema:\n{schema_json}\n\n"
        f"Validation errors to fix (fix ONLY invalid fields):\n{errors_json}\n\n"
        f"Original prompt:\n{prompt}"
    )


def structured_with_retries(
    *,
    client_invoke: Any,
    endpoint_name: str,
    prompt: str,
    schema_name: str,
    schema_fields: dict[str, Any],
    max_attempts: int = 3,
) -> tuple[BaseModel | None, StructuredError | None, int]:
    model = build_pydantic_model(schema_name, schema_fields)

    current_prompt = prompt
    last_errors: list[dict[str, Any]] = []
    for attempt in range(1, max_attempts + 1):
        raw = client_invoke(endpoint_name=endpoint_name, payload={'prompt': current_prompt, 'task_type': 'structured'})
        try:
            parsed = validate_json(raw, model)
            return parsed, None, attempt
        except (json.JSONDecodeError, ValidationError) as e:
            if isinstance(e, ValidationError):
                last_errors = e.errors()
            else:
                last_errors = [{'type': 'json_decode', 'msg': str(e)}]

            if attempt >= max_attempts:
                err = StructuredError(
                    code='SCHEMA_VALIDATION_FAILED',
                    message='Model output did not validate against schema',
                    attempts=attempt,
                    validation_errors=last_errors,
                )
                return None, err, attempt

            current_prompt = auto_repair_prompt(
                prompt=prompt,
                schema_name=schema_name,
                schema_fields=schema_fields,
                errors=last_errors,
            )

    err = StructuredError(
        code='SCHEMA_VALIDATION_FAILED',
        message='Model output did not validate against schema',
        attempts=max_attempts,
        validation_errors=last_errors,
    )
    return None, err, max_attempts


def _spec_to_type(spec: dict[str, Any], *, name_hint: str) -> Any:
    t = spec.get('type')
    if t == 'string':
        return str
    if t == 'integer':
        return int
    if t == 'number':
        return float
    if t == 'boolean':
        return bool
    if t == 'array':
        items = spec.get('items')
        if not isinstance(items, dict):
            raise ValueError('Array type requires items spec')
        return list[_spec_to_type(items, name_hint=f'{name_hint}Item')]
    if t == 'object':
        nested_fields = spec.get('fields')
        if isinstance(nested_fields, dict) and nested_fields:
            return build_pydantic_model(name_hint, nested_fields)
        return dict[str, Any]
    raise ValueError(f'Unsupported field type: {t}')


def _nested_model_name(parent: str, field_name: str) -> str:
    # Keep names stable and ASCII-only for dynamic Pydantic models.
    parts = [p for p in field_name.replace('-', '_').split('_') if p]
    suffix = ''.join(p[:1].upper() + p[1:] for p in parts) or 'Field'
    return f'{parent}{suffix}'
