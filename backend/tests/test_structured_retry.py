from __future__ import annotations

import unittest

from app.llm.structured import StructuredError, structured_with_retries


class TestStructuredRetry(unittest.TestCase):
    def test_success_on_third_attempt(self) -> None:
        calls: list[str] = []

        def invoke(*, endpoint_name: str, payload: dict) -> str:
            calls.append(payload.get('prompt', ''))
            if len(calls) < 3:
                return '{"x": "not an int"}'
            return '{"x": 123}'

        parsed, err, attempts = structured_with_retries(
            client_invoke=invoke,
            endpoint_name='mock',
            prompt='base prompt',
            schema_name='Out',
            schema_fields={'x': {'type': 'integer'}},
            max_attempts=3,
        )

        self.assertIsNone(err)
        self.assertIsNotNone(parsed)
        self.assertEqual(attempts, 3)
        self.assertEqual(parsed.model_dump(), {'x': 123})

    def test_failure_returns_clean_error(self) -> None:
        def invoke(*, endpoint_name: str, payload: dict) -> str:
            return 'not json'

        parsed, err, attempts = structured_with_retries(
            client_invoke=invoke,
            endpoint_name='mock',
            prompt='base prompt',
            schema_name='Out',
            schema_fields={'x': {'type': 'integer'}},
            max_attempts=3,
        )

        self.assertIsNone(parsed)
        self.assertIsInstance(err, StructuredError)
        self.assertEqual(attempts, 3)
        self.assertEqual(err.code, 'SCHEMA_VALIDATION_FAILED')


if __name__ == '__main__':
    unittest.main()
