"""Tests for link_checks.py (D53) — fixtures are the operator's own examples (2026-09-29)."""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import link_checks as lc  # noqa: E402

HOSTS = ["saporo.io"]
U = "https://www.saporo.io/learn/identity-exposure-management/identity-exposure/"
PAGE_MD = f"""## Internal link inventory (D53)

- **What Causes Identity Exposure in Hybrid Environments** — {U}what-causes-it-in-hybrid-environments/ (planned)
  - Query: what causes identity exposure in hybrid environments
  - Covers: Deep-dive.
- **How to Reduce Identity Exposure** — {U}how-to-reduce/ (planned)
  - Query: reduce identity exposure
  - Covers: How-to Guide.
"""

BAD = f"""For how these weaknesses accumulate specifically across Active Directory, Entra ID, and AWS, see [What Causes Identity Exposure in Hybrid Environments]({U}what-causes-it-in-hybrid-environments/) and the hub page, [What is Identity Exposure]({U}).

If you already have exposure data but no way to rank it, that gap is the one to close next. See [How to Reduce Identity Exposure]({U}how-to-reduce/).

For the remediation side of that work, see [How to Reduce Identity Exposure]({U}how-to-reduce/).
"""

GOOD = f"""These weaknesses build up differently across Active Directory, Entra ID, and AWS, and [what causes identity exposure in hybrid environments]({U}what-causes-it-in-hybrid-environments/) breaks down each one. If you're newer to the concept, start with [what identity exposure is]({U}).

If you already have exposure data but no way to rank it, that's the gap to close next. Here's [how to prioritize and reduce identity exposure]({U}how-to-reduce/).
"""


def msgs(body: str, level: str) -> list[str]:
    return [f.message for f in lc.run_all(body, HOSTS, PAGE_MD) if f.level == level]


class LinkCheckTests(unittest.TestCase):
    def test_the_operators_bad_examples_fail_on_each_problem(self):
        fails = " | ".join(msgs(BAD, "fail"))
        self.assertIn("footnote", fails)
        self.assertIn("jargon", fails)
        self.assertIn("more than once", fails)
        self.assertIn("full title", " | ".join(msgs(BAD, "warn")))

    def test_the_operators_rewrites_pass(self):
        self.assertEqual(msgs(GOOD, "fail"), [])
        self.assertEqual(msgs(GOOD, "warn"), [])

    def test_generic_and_relative_links_fail(self):
        body = "Read the details [here](https://www.saporo.io/learn/x/) and [our checklist of controls](/learn/y/)."
        fails = " | ".join(msgs(body, "fail"))
        self.assertIn("generic", fails)
        self.assertIn("relative", fails)

    def test_one_anchor_for_two_pages_fails(self):
        body = f"Start with [identity exposure]({U}) and later [identity exposure]({U}how-to-reduce/) again."
        self.assertTrue(any("one anchor" in m for m in msgs(body, "fail")))

    def test_hub_and_spoke_networks_are_ordinary_prose(self):
        body = f"A hub-and-spoke network trust model makes [each forest trust path]({U}x/) visible."
        self.assertFalse(any("jargon" in m for m in msgs(body, "fail")))

    def test_external_links_are_ignored(self):
        body = "According to [the 2026 DBIR](https://www.verizon.com/dbir/) credential abuse led."
        self.assertEqual(lc.run_all(body, HOSTS, None), [])


if __name__ == "__main__":
    unittest.main()
