"""Unit tests for competitor_checks.py — run: python3 -m unittest discover -s scripts -p 'test_*.py'

The SpecterOps fixtures are the shapes from the first attack-path-analysis
article: a competitor CTO's figure as the intro hook (via a neutral trade
outlet), repeated as a Key Takeaways stat, and an FAQ about BloodHound.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import competitor_checks as cc  # noqa: E402
from company_config import _parse_yaml  # noqa: E402

CONFIG = _parse_yaml(
    """
competitors:
  head_to_head:
    - name: SpecterOps
      domains: [specterops.io]
      url_prefixes: [github.com/SpecterOps]
      names: [SpecterOps, BloodHound, BloodHound Enterprise]
    - name: Tenable Identity Exposure
      url_prefixes: [tenable.com/products/identity-exposure]
      names: [Tenable Identity Exposure]
"""
)
COMPS = cc.load_competitors(CONFIG)

CLEAN_INTRO = "# Attack path analysis\n\nAttack path analysis maps how an attacker moves between identities.\n"
TAKEAWAYS = "## Key Takeaways\n\n- One fix can remove many paths.\n- Tier 0 is the target.\n- Re-evaluate on a schedule.\n"
FAQ = "## Frequently Asked Questions\n\n### What is a chokepoint?\n\nA node many paths cross.\n"


def article(intro=CLEAN_INTRO, takeaways=TAKEAWAYS, body="## How it works\n\nGraphs model trust.\n", faq=FAQ):
    return intro + "\n" + takeaways + "\n" + body + "\n" + faq


def run(md, **kw):
    return cc.run_all(md, COMPS, **kw)


def fails(findings):
    return [f.message for f in findings if f.level == "fail"]


class ConfigTests(unittest.TestCase):
    def test_parses_inline_lists_in_list_items(self):
        self.assertEqual(COMPS[0].domains, ["specterops.io"])
        self.assertEqual(COMPS[0].url_prefixes, ["github.com/specterops"])
        self.assertEqual(COMPS[1].domains, [])

    def test_no_config_no_competitors(self):
        self.assertEqual(cc.load_competitors({}), [])


class PlacementTests(unittest.TestCase):
    def test_clean_article_passes(self):
        self.assertEqual(run(article()), [])

    def test_hook_via_neutral_outlet_fails(self):
        intro = CLEAN_INTRO + (
            "\nThat figure comes from Jared Atkinson, CTO of SpecterOps, writing in "
            "[Identity Week](https://identityweek.net/x/).\n"
        )
        msgs = fails(run(article(intro=intro)))
        self.assertTrue(any("named in the intro" in m for m in msgs))
        self.assertTrue(any("used as a source" in m for m in msgs))

    def test_key_takeaways_and_faq_fail(self):
        kt = TAKEAWAYS + "- SpecterOps reported 22 million paths at 10,000 identities.\n"
        faq = FAQ + "\n### Is BloodHound safe to use?\n\nIt is dual-use.\n"
        msgs = fails(run(article(takeaways=kt, faq=faq)))
        self.assertTrue(any("Key Takeaways" in m for m in msgs))
        self.assertTrue(any("FAQ" in m for m in msgs))


class SourceTests(unittest.TestCase):
    def test_links_to_their_domain_and_prefix_fail(self):
        body = (
            "## Tools\n\nSee [the docs](https://www.specterops.io/blog/x) and "
            "[the repo](https://github.com/SpecterOps/BloodHound).\n"
        )
        f = [x for x in run(article(body=body)) if "linked" in x.message]
        self.assertEqual(len(f), 1)
        self.assertEqual(len(f[0].snippets), 2)

    def test_product_only_vendor_rest_of_domain_is_citable(self):
        body = "## Patching\n\nCVE data from [Tenable research](https://www.tenable.com/research) helps.\n"
        self.assertEqual(fails(run(article(body=body))), [])
        body = "## Patching\n\nSee [this](https://tenable.com/products/identity-exposure/overview).\n"
        self.assertTrue(fails(run(article(body=body))))

    def test_jsonld_citation_fails_by_url_or_name(self):
        by_url = {"@graph": [{"citation": [{"name": "x", "url": "https://specterops.io/r"}]}]}
        by_name = {"citation": {"name": "Attack paths", "author": {"name": "SpecterOps"}}}
        for ld in (by_url, by_name):
            self.assertTrue(any("citation array" in m for m in fails(run(article(), jsonld=ld))))

    def test_attribution_sentence_in_body_fails(self):
        body = "## Scale\n\nAccording to SpecterOps, path counts grow fast.\n"
        self.assertTrue(any("used as a source" in m for m in fails(run(article(body=body)))))


class MentionTests(unittest.TestCase):
    ONE = "## Categories\n\nPosture tools such as BloodHound Enterprise map attack paths.\n"
    TWO = ONE + "\nBloodHound Enterprise added AWS coverage in 2026.\n"

    def test_one_factual_mention_passes(self):
        self.assertEqual(run(article(body=self.ONE)), [])

    def test_second_mention_warns_unless_comparison(self):
        warns = [f for f in run(article(body=self.TWO)) if f.level == "warn"]
        self.assertEqual(len(warns), 1)
        self.assertIn("2 sentences", warns[0].message)
        self.assertEqual(run(article(body=self.TWO), article_type="comparison"), [])
        self.assertEqual(run(article(body=self.TWO), article_type="tool-list"), [])

    def test_comparison_article_still_bans_hook_and_sources(self):
        intro = CLEAN_INTRO + "\nBloodHound is where most teams start.\n"
        self.assertTrue(fails(run(article(intro=intro), article_type="comparison")))

    def test_whole_word_names_only(self):
        body = "## Words\n\nThe bloodhounds of old tracked scent; specteropsis is not a word.\n"
        self.assertEqual(run(article(body=body)), [])


if __name__ == "__main__":
    unittest.main()
