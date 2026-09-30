"""Keyword-stuffed opener + comparison-keyword placement (D32), and the burn-cycles ban."""
from __future__ import annotations

import io
import sys
import tempfile
import unittest
from contextlib import redirect_stdout
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import seo_audit  # noqa: E402


def lines(intro: str, kw: str = "identity exposure vs identity risk") -> list[str]:
    md = f'---\ntitle: "T"\nslug: "t"\nprimary_keyword: "{kw}"\n---\n\n# Title\n\n{intro}\n\n## Key Takeaways\n\n- a\n- b\n- c\n'
    with tempfile.TemporaryDirectory() as d:
        Path(d, "article.md").write_text(md, encoding="utf-8")
        out = io.StringIO()
        with redirect_stdout(out):
            seo_audit.audit(Path(d))
        return out.getvalue().splitlines()


class OpenerTests(unittest.TestCase):
    def test_query_verbatim_opener_fails(self):
        out = lines("Identity exposure vs identity risk is a distinction most security teams get wrong.")
        self.assertTrue(any(l.startswith("FAIL") and "Keyword-stuffed opener" in l for l in out))

    def test_natural_comparison_passes_both_checks(self):
        out = lines("Identity exposure and identity risk are two of the most conflated terms in identity security.")
        self.assertFalse(any("Keyword-stuffed" in l for l in out))
        self.assertTrue(any(l.startswith("PASS") and "natural comparison" in l for l in out))

    def test_plain_subject_keyword_may_open(self):
        out = lines("Identity exposure is the measurable, technical layer of the problem.", kw="identity exposure")
        self.assertFalse(any("Keyword-stuffed" in l for l in out))

    def test_burn_cycles_is_banned(self):
        out = lines("Identity exposure and identity risk differ. Teams end up burning cycles on findings that lead nowhere.")
        self.assertTrue(any(l.startswith("FAIL") and "burning cycles" in l for l in out))


if __name__ == "__main__":
    unittest.main()
