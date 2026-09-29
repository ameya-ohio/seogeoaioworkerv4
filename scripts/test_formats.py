"""Tests for formats.py and the format-aware parts of seo_audit.py (D45–D49)."""
from __future__ import annotations

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import formats  # noqa: E402
import seo_audit  # noqa: E402

REG = formats.load_registry()


def article(fm: dict[str, str], faq_questions: int) -> str:
    front = "\n".join(f'{k}: "{v}"' for k, v in fm.items())
    faq = ""
    if faq_questions:
        faq = "\n## Frequently Asked Questions\n\n" + "".join(
            f"### Question number {i} here?\n\nAnswer {i}.\n\n" for i in range(faq_questions)
        )
    return f"---\ntitle: \"T\"\nslug: \"t\"\n{front}\n---\n\n# Title\n\nIntro.\n\n## Key Takeaways\n\n- a\n- b\n- c\n\n## Body\n\nText.\n{faq}"


def audit_lines(md: str) -> list[str]:
    with tempfile.TemporaryDirectory() as d:
        Path(d, "article.md").write_text(md, encoding="utf-8")
        out = io.StringIO()
        with redirect_stdout(out):
            seo_audit.audit(Path(d))
        return [l for l in out.getvalue().splitlines() if "FAQ" in l]


class RegistryTests(unittest.TestCase):
    def test_python_mirror_matches_the_engine_rules(self):
        self.assertEqual(REG.faq("pillar-guide", "pillar", "tofu"), formats.Range(5, 8))
        self.assertEqual(REG.faq("stats-data", "hub", "tofu"), formats.Range(4, 6))
        self.assertEqual(REG.faq("thought-leadership", "cluster", "tofu"), formats.Range(0, 0))
        self.assertEqual(REG.faq("tools-listicle", "cluster", "bofu"), formats.Range(4, 6))
        self.assertEqual(REG.faq("deep-dive", "cluster", "mofu"), formats.Range(3, 5, True))
        self.assertEqual(REG.takeaways("stats-data"), formats.Range(8, 12))
        self.assertEqual(REG.takeaways("deep-dive"), formats.Range(3, 3))

    def test_article_type_accepts_slugs_labels_and_legacy_values(self):
        self.assertEqual(formats.article_type_slug(REG, "Comparison (Concept)"), "comparison-concept")
        self.assertEqual(formats.article_type_slug(REG, "deep-dive"), "deep-dive")
        self.assertEqual(formats.article_type_slug(REG, "tool-list"), "tools-listicle")


class AuditFaqTests(unittest.TestCase):
    def facets(self, t: str, role: str = "cluster", funnel: str = "mofu") -> dict[str, str]:
        return {"page_role": role, "article_type": t, "funnel": funnel}

    def test_no_faq_format_fails_with_an_faq(self):
        lines = audit_lines(article(self.facets("thought-leadership", funnel="tofu"), 3))
        self.assertTrue(any(l.startswith("FAIL") and "carries no FAQ" in l for l in lines))
        lines = audit_lines(article(self.facets("thought-leadership", funnel="tofu"), 0))
        self.assertFalse(any(l.startswith("FAIL") for l in lines))

    def test_optional_faq_may_be_absent_but_not_short(self):
        self.assertFalse(any(l.startswith("FAIL") for l in audit_lines(article(self.facets("deep-dive"), 0))))
        self.assertTrue(any(l.startswith("FAIL") for l in audit_lines(article(self.facets("deep-dive"), 2))))
        self.assertFalse(any(l.startswith("FAIL") for l in audit_lines(article(self.facets("deep-dive"), 4))))

    def test_hub_needs_four_to_six(self):
        hub = self.facets("definition-explainer", role="hub", funnel="tofu")
        self.assertTrue(any(l.startswith("FAIL") for l in audit_lines(article(hub, 3))))
        self.assertFalse(any(l.startswith("FAIL") for l in audit_lines(article(hub, 5))))

    def test_pages_without_facets_keep_the_old_rule(self):
        self.assertTrue(any(l.startswith("FAIL") and "missing" in l for l in audit_lines(article({}, 0))))


if __name__ == "__main__":
    unittest.main()
