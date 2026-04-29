from __future__ import annotations

import unittest

from app.llm.routing import DEFAULT_ENDPOINTS, endpoint_for_task_type


class TestLlmRouting(unittest.TestCase):
    def test_routes_to_7b(self) -> None:
        for t in ('summarize', 'rewrite', 'tag_generation', 'explain'):
            with self.subTest(task_type=t):
                self.assertEqual(endpoint_for_task_type(t), DEFAULT_ENDPOINTS.qwen_7b_instruct)

    def test_routes_to_72b(self) -> None:
        for t in ('skill_compile', 'rag_synthesis', 'complex_explain'):
            with self.subTest(task_type=t):
                self.assertEqual(endpoint_for_task_type(t), DEFAULT_ENDPOINTS.qwen_72b_instruct)

    def test_routes_to_vl(self) -> None:
        self.assertEqual(endpoint_for_task_type('analyze_image'), DEFAULT_ENDPOINTS.qwen_vl_7b_instruct)


if __name__ == '__main__':
    unittest.main()
