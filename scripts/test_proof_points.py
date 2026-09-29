"""Tests for proof_points.py (D51)."""
from __future__ import annotations

import sys
import tempfile
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import proof_points as pp  # noqa: E402

TABLE = """# Proof points

| Number | Claim | Methodology | Date | Citable |
|---|---|---|---|---|
| 5.9M+ | attack paths identified | Saporo platform data across customer environments | 2026 | yes |
| 64% | reduction in critical misconfigurations | _(fill in)_ | | no |
| 1 hour | to deploy | _(fill in)_ | | no |
"""


def points():
    with tempfile.TemporaryDirectory() as d:
        f = Path(d, "proof-points.md")
        f.write_text(TABLE, encoding="utf-8")
        return pp.load_proof_points(f)


class ProofPointTests(unittest.TestCase):
    def test_citable_numbers_pass_in_any_spelling(self):
        body = "Saporo has identified 5.9 million attack paths across customer environments."
        self.assertEqual(pp.run_all(body, ["Saporo"], points()), [])

    def test_unapproved_numbers_fail(self):
        f = pp.run_all("Saporo customers see a 64% reduction in critical misconfigurations.", ["Saporo"], points())
        self.assertEqual([x.level for x in f], ["fail"])
        f = pp.run_all("Saporo deploys in 1 hour.", ["Saporo"], points())
        self.assertEqual([x.level for x in f], ["fail"])

    def test_unknown_company_numbers_warn_and_other_sentences_are_ignored(self):
        f = pp.run_all("Saporo mapped 245,000 identities at a regional hospital.", ["Saporo"], points())
        self.assertEqual([x.level for x in f], ["warn"])
        self.assertEqual(pp.run_all("CrowdStrike found 82% of detections were malware-free in 2026.", ["Saporo"], points()), [])
        self.assertEqual(pp.run_all("In 2026 Saporo shipped a release in 3 steps.", ["Saporo"], points()), [])

    def test_no_file_means_no_check(self):
        self.assertEqual(pp.run_all("Saporo deploys in 1 hour.", ["Saporo"], None), [])

    def test_the_shipped_file_parses(self):
        shipped = pp.load_proof_points()
        self.assertTrue(shipped and all(p.number for p in shipped))


if __name__ == "__main__":
    unittest.main()
