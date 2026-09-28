"""Unit tests for style_checks.py — run: python3 -m unittest discover -s scripts -p 'test_*.py'

The contrast fixtures are the exact sentences a reviewer quoted from the
first Kerberoasting article as the "not X, but Y" tic.
"""
from __future__ import annotations

import sys
import unittest
from pathlib import Path

sys.path.insert(0, str(Path(__file__).resolve().parent))
import style_checks as sc  # noqa: E402

CRITIQUED = [
    "Cracking the ticket lands in a differently shaped bucket, not out of reach.",
    "AES buys time; it does not buy immunity.",
    "Long passwords make cracking more expensive, not impossible.",
    "A clean audit is a compliance checkbox, not proof.",
    "Success depends on fixing the right accounts, not on enabling logging alone.",
    "## A Design Feature, Not a Bug",
    "## Watching Ticket Requests, Not Simply Logging Them",
]


def run(body: str, words: int | None = None):
    return sc.run_all(body, words if words is not None else len(body.split()))


class ContrastTests(unittest.TestCase):
    def test_flags_the_critiqued_sentences_and_quotes_them(self):
        found = [f for f in run("\n\n".join(CRITIQUED)) if "contrast" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "fail")
        self.assertGreaterEqual(len(found[0].snippets), 6)

    def test_allows_a_few_and_ignores_not_only(self):
        body = "\n\n".join(CRITIQUED[:3] + ["It is not only fast but also cheap."])
        self.assertFalse([f for f in run(body) if "contrast" in f.message])

    def test_cap_scales_with_length(self):
        self.assertEqual(sc.contrast_cap(1000), 3)
        self.assertEqual(sc.contrast_cap(3000), 5)


class RepetitionTests(unittest.TestCase):
    THESIS = (
        "Kerberoasting success depends on fixing high-privilege service accounts with weak passwords first, "
        "not on the encryption default."
    )

    def test_same_claim_three_times_fails(self):
        body = "\n\n".join([
            self.THESIS,
            "- Kerberoasting success depends on fixing high-privilege service accounts with weak passwords first.",
            "Prioritize: success depends on fixing high-privilege service accounts with weak passwords before anything else.",
        ])
        rep = [f for f in run(body) if "same claim" in f.message]
        self.assertEqual(len(rep), 1)
        self.assertEqual(len(rep[0].snippets), 3)

    def test_twice_is_allowed_and_questions_do_not_count(self):
        body = "\n\n".join([
            self.THESIS,
            "### Why does success depend on fixing high-privilege service accounts with weak passwords first?",
            "Success depends on fixing high-privilege service accounts with weak passwords first.",
        ])
        self.assertFalse([f for f in run(body) if "same claim" in f.message])


class HypotheticalTests(unittest.TestCase):
    def test_invented_scenarios_fail(self):
        for text in [
            "Picture a domain with roughly 400 service accounts.",
            "Imagine you're the only admin on call.",
            "Suppose an attacker already has a foothold.",
            "Let's say the ticket uses RC4.",
            "In this hypothetical, the SOC misses it.",
        ]:
            found = [f for f in run(text) if "invented scenario" in f.message]
            self.assertEqual(len(found), 1, text)
            self.assertEqual(found[0].level, "fail")

    def test_ordinary_uses_pass(self):
        body = "The picture changes once AES is enforced. Attackers imagined nothing; they requested tickets."
        self.assertFalse([f for f in run(body) if "invented scenario" in f.message])


class SnippetTemplateTests(unittest.TestCase):
    def test_faq_filler_fails_and_plain_questions_pass(self):
        body = (
            "## Frequently Asked Questions\n\n### What's the actual difference between RC4 and AES?\n\nAnswer.\n\n"
            "### How long does cracking really take?\n\nAnswer.\n\n### What is Kerberoasting?\n\nAnswer.\n"
        )
        found = [f for f in run(body) if "FAQ questions" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(len(found[0].snippets), 2)
        self.assertFalse(
            [f for f in run("## FAQ\n\n### What is Kerberoasting?\n\nAnswer.\n") if "FAQ questions" in f.message]
        )

    def test_more_than_two_formal_definitions_fail(self):
        defs = [
            "**Kerberos** is a ticket-based authentication protocol.",
            "**An SPN** is the name a service registers.",
            "**RC4** is a stream cipher Kerberos still accepts.",
        ]
        self.assertTrue([f for f in run("\n\n".join(defs)) if "formal" in f.message])
        self.assertFalse([f for f in run("\n\n".join(defs[:2])) if "formal" in f.message])

    def test_takeaway_repeating_the_intro_fails(self):
        thesis = "Kerberoasting success depends on fixing high-privilege service accounts with weak passwords first."
        body = (
            f"# Title\n\n{thesis}\n\n## Key Takeaways\n\n- {thesis}\n"
            "- Rotating 41 service-account passwords took nine days in one engagement.\n"
        )
        found = [f for f in run(body) if "Takeaways repeat" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(len(found[0].snippets), 1)

    def test_heading_echo_only_warns_past_the_cap(self):
        sections = [
            ("Service accounts carry Kerberoasting risk", "Service accounts carry the Kerberoasting risk in most domains."),
            ("Ticket requests reveal the attack", "Ticket requests reveal the attack when you baseline them."),
            ("AES enforcement slows cracking", "AES enforcement slows cracking but does not stop it."),
        ]
        body = "\n\n".join(f"## {h}\n\n{p}" for h, p in sections)
        found = [f for f in run(body) if "restating their own heading" in f.message]
        self.assertEqual(found[0].level, "warn")
        two = "\n\n".join(f"## {h}\n\n{p}" for h, p in sections[:2])
        self.assertFalse([f for f in run(two) if "restating their own heading" in f.message])


class HedgeAndWarnTests(unittest.TestCase):
    def test_hedge_density_fails_with_context(self):
        body = " ".join(
            ["Attackers typically request tickets.", "Defenders usually miss it.", "Logs often lag.",
             "Tools sometimes help.", "Teams generally wait.", "Budgets tend to slip."] * 2
        )
        hedges = [f for f in run(body, 300) if "hedge" in f.message]
        self.assertEqual(hedges[0].level, "fail")

    def test_signposts_and_triads_only_warn(self):
        paras = ["That's why the order matters here.", "This is also why logging fails.",
                 "That's the ordering problem again.", "Here's why it breaks.", "No rights, no groups, and no malware."]
        findings = run("\n\n".join(paras * 2), 120)
        self.assertTrue(findings)
        self.assertTrue(all(f.level == "warn" for f in findings if "signpost" in f.message or "lists-of-three" in f.message))

    def test_tables_code_and_links_are_not_prose(self):
        body = "| a, not b | c |\n|---|---|\n\n```\nnot x, but y\n```\n\nSee [the guide, not the blog](https://x.io)."
        self.assertFalse([f for f in run(body) if "contrast" in f.message])


if __name__ == "__main__":
    unittest.main()
