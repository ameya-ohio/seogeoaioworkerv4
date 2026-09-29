"""Tests for format_checks.py (per-format required elements, M4)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import format_checks as fc  # noqa: E402

TABLE = "| Dimension | X | Y |\n|---|---|---|\n| Purpose | a | b |\n| Scope | c | d |\n"


def fails(body: str, slug: str) -> list[str]:
    return [f.message for f in fc.run_all(body, slug) if f.level == "fail"]


class FormatCheckTests(unittest.TestCase):
    def test_howto_needs_numbered_steps(self):
        prose = "# How to X\n\nIntro.\n\n## The procedure\n\nDo a thing, then another.\n"
        self.assertTrue(fails(prose, "how-to-guide"))
        stepped = "# How to X\n\nIntro.\n\n## Step 1: Export\n\nA.\n\n## Step 2: Review\n\nB.\n\n## Step 3: Fix\n\nC.\n\n## Verify it worked\n\nD.\n"
        self.assertEqual(fc.run_all(stepped, "how-to-guide"), [])

    def test_comparison_needs_a_table_high_on_the_page(self):
        late = "# X vs Y\n\nIntro.\n\n## A\n\nx\n\n## B\n\ny\n\n## C\n\nz\n\n## D\n\n" + TABLE
        self.assertIn("first three sections", fails(late, "comparison-concept")[0])
        early = "# X vs Y\n\nIntro.\n\n## The two side by side\n\n" + TABLE + "\n## B\n\ny\n"
        self.assertEqual(fails(early, "comparison-concept"), [])

    def test_stats_bullets_need_number_and_year(self):
        body = "# Stats\n\n## Key Takeaways\n\n- 82% of detections were malware-free (CrowdStrike, 2026).\n- Most breaches involve identity.\n\n## Data\n\n" + TABLE
        f = fails(body, "stats-data")
        self.assertEqual(len(f), 1)

    def test_metrics_need_a_formula(self):
        self.assertTrue(fails("# Metrics\n\n## Exposure count\n\nCount things.\n", "metrics-guide"))
        self.assertFalse(fails("# Metrics\n\n## Exposure count\n\nFormula: exposures / identities.\n", "metrics-guide"))

    def test_checklist_needs_items(self):
        body = "# Checklist\n\n## Tier 0\n\n" + "".join(f"- [ ] Item {i}\n" for i in range(10))
        self.assertEqual(fails(body, "checklist"), [])
        self.assertTrue(fails("# Checklist\n\n## Tier 0\n\n- one\n", "checklist"))

    def test_unknown_or_unchecked_formats_pass(self):
        self.assertEqual(fc.run_all("anything", "deep-dive"), [])
        self.assertEqual(fc.run_all("anything", "generic"), [])


if __name__ == "__main__":
    unittest.main()
