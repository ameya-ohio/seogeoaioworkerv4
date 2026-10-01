"""Editor notes are not article prose (D61): the audit strips them before its style checks."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seo_audit  # noqa: E402


class EditorNotesTests(unittest.TestCase):
    def test_strips_every_kind_of_note(self):
        body = (
            "Sophos found 71% of organizations had a breach. [VERIFY: the 71% figure is from 2025, not 2026]\n"
            "A claim. [NEEDS RESEARCH: a primary source] [HUMAN INPUT: an example] [NEEDS SOURCE: who said it]\n"
        )
        out = seo_audit.strip_editor_notes(body)
        self.assertNotIn("[", out)
        self.assertIn("Sophos found 71% of organizations had a breach.", out)
        self.assertNotIn("2025, not 2026", out)

    def test_leaves_ordinary_brackets_alone(self):
        self.assertEqual(seo_audit.strip_editor_notes("See [the docs](https://x) [1]."), "See [the docs](https://x) [1].")


if __name__ == "__main__":
    unittest.main()
