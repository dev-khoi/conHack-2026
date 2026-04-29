from __future__ import annotations

import unittest

from app.llm.routing import DEFAULT_ENDPOINTS, endpoint_for_task_type


class TestLlmRouting(unittest.TestCase):
    def test_routes_to_fast_model(self) -> None:
        for t in ('summarize', 'rewrite', 'explain'):
            with self.subTest(task_type=t):
                self.assertEqual(endpoint_for_task_type(t), DEFAULT_ENDPOINTS.fast_inference)

    def test_routes_to_tag_model(self) -> None:
        self.assertEqual(endpoint_for_task_type('tag_generation'), DEFAULT_ENDPOINTS.tag_inference)

    def test_routes_to_reasoning_model(self) -> None:
        for t in ('skill_compile', 'complex_explain'):
            with self.subTest(task_type=t):
                self.assertEqual(endpoint_for_task_type(t), DEFAULT_ENDPOINTS.reasoning_inference)

    def test_routes_to_rag_model(self) -> None:
        self.assertEqual(endpoint_for_task_type('rag_synthesis'), DEFAULT_ENDPOINTS.rag_inference)

    def test_routes_to_vision_model(self) -> None:
        self.assertEqual(endpoint_for_task_type('analyze_image'), DEFAULT_ENDPOINTS.vision_inference)


if __name__ == '__main__':
    unittest.main()
