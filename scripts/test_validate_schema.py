"""Tests for validate_schema.py's format-aware rules (D49, D51)."""
from __future__ import annotations

import io
import json
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import validate_schema as vs  # noqa: E402


def graph(main_type: str = "TechArticle", faq: bool = True, extra: list | None = None) -> dict:
    nodes = [
        {"@type": main_type, "@id": "#a", "headline": "h", "author": {"@id": "#p"}, "datePublished": "2026-09-29",
         "image": {"@id": "#i"}, "publisher": {"@id": "#o"}, "mainEntityOfPage": {"@id": "#w"}},
        {"@type": "Person", "@id": "#p", "name": "A", "sameAs": ["https://x"]},
        {"@type": "Organization", "@id": "#o", "name": "O"},
        {"@type": "BreadcrumbList", "@id": "#b", "itemListElement": []},
        {"@type": "WebPage", "@id": "#w", "speakable": {}},
        {"@type": "ImageObject", "@id": "#i"},
        {"@type": "DefinedTerm", "@id": "#d", "name": "x"},
    ]
    if faq:
        nodes.append({"@type": "FAQPage", "@id": "#f", "mainEntity": [
            {"@type": "Question", "name": "Q?", "acceptedAnswer": {"@type": "Answer", "text": "A."}}]})
    return {"@context": "https://schema.org", "@graph": nodes + (extra or [])}


def run(schema: dict, article: str | None) -> tuple[int, str]:
    with tempfile.TemporaryDirectory() as d:
        Path(d, "schema.json").write_text(json.dumps(schema), encoding="utf-8")
        if article is not None:
            Path(d, "article.md").write_text(article, encoding="utf-8")
        out = io.StringIO()
        with redirect_stdout(out):
            code = vs.validate(Path(d, "schema.json"))
        return code, out.getvalue()


WITH_FAQ = "# T\n\n## Frequently Asked Questions\n\n### Q?\n\nA.\n"
NO_FAQ = "# T\n\n## Argument\n\nText.\n"


class ValidateSchemaTests(unittest.TestCase):
    def test_article_family_is_accepted(self):
        for t in ("TechArticle", "Article", "BlogPosting"):
            self.assertEqual(run(graph(t), WITH_FAQ)[0], 0, t)

    def test_faqpage_required_only_when_the_article_has_an_faq(self):
        self.assertEqual(run(graph(faq=False), NO_FAQ)[0], 0)
        code, out = run(graph(faq=False), WITH_FAQ)
        self.assertEqual(code, 1)
        self.assertIn("FAQPage", out)
        # No article.md beside the schema: the old rule (always required).
        self.assertEqual(run(graph(faq=False), None)[0], 1)

    def test_review_of_a_competitor_fails(self):
        review = {"@type": "Review", "@id": "#r", "itemReviewed": {"@type": "SoftwareApplication", "name": "BloodHound Enterprise"}}
        code, out = run(graph(extra=[review]), WITH_FAQ)
        self.assertEqual(code, 1)
        self.assertIn("competitor", out)


if __name__ == "__main__":
    unittest.main()
