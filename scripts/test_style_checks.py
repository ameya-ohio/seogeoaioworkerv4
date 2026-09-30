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
            "Take a hypothetical hospital with 400 service accounts.",
            "Hypothetically, the SOC misses it.",
        ]:
            found = [f for f in run(text) if "invented scenario" in f.message]
            self.assertEqual(len(found), 1, text)
            self.assertEqual(found[0].level, "fail")

    def test_ordinary_uses_pass(self):
        body = (
            "The picture changes once AES is enforced. Attackers imagined nothing; they requested tickets. "
            "The audit phase shows the compatibility risk was real, not hypothetical."
        )
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

    def test_hook_shaped_intro_fails_and_quotes_each_move(self):
        # The intro a reviewer called slop (identity exposure vs identity risk).
        slop = (
            "# Title\n\n"
            "In 2025, 82% of the intrusion detections CrowdStrike recorded were malware-free. "
            "The attacker used a valid identity and walked in the front door.\n\n"
            "That number should reframe how security teams talk about identity, but mostly it hasn't. "
            "They aren't the same word, and the gap between them is exactly where remediation effort goes to die.\n\n"
            "Confuse the two, and you'll spend a sprint fixing the wrong things.\n\n## Key Takeaways\n\n- a\n- b\n- c\n"
        )
        found = [f for f in run(slop) if "hook-shaped intro" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "fail")
        self.assertGreaterEqual(len(found[0].snippets), 6)
        self.assertTrue(found[0].snippets[0].startswith("opens on a statistic"))

    def test_topic_summary_style_intro_passes(self):
        good = (
            "# Title\n\n"
            "Identity exposure and identity risk are two of the most conflated terms in the identity security "
            "market. Identity exposure is the measurable, technical layer.\n\n"
            "This distinction has become urgent in 2026. CrowdStrike's 2026 Global Threat Report found 82% of "
            "detections were malware-free.\n\n## Key Takeaways\n\n- a\n- b\n- c\n"
        )
        self.assertFalse([f for f in run(good) if "hook-shaped intro" in f.message])
        # A year alone in the opening words is not a stat hook.
        self.assertFalse([f for f in run("In 2026, identity exposure became a board topic.\n\n## X\n\nBody.\n")
                          if "hook-shaped intro" in f.message])

    def test_long_sentences_warn(self):
        rejected = ("Identity risk is the contextual layer built on top of it, meaning what an attacker could reach "
                    "through one specific exposure once its blast radius and business criticality are weighed against "
                    "active threat signals, and the confusion costs security teams real work.")
        found = [f for f in run(rejected) if "over 30 words" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "warn")
        self.assertFalse([f for f in run("It defines what an attacker can reach through one specific exposure.")
                          if "over 30 words" in f.message])

    def test_key_takeaways_must_be_exactly_three(self):
        four = "Intro.\n\n## Key Takeaways\n\n- one\n- two\n- three\n- four\n"
        found = [f for f in run(four) if "Key Takeaways has" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "fail")
        self.assertFalse([f for f in run("Intro.\n\n## Key Takeaways\n\n- one\n- two\n- three\n")
                          if "Key Takeaways has" in f.message])

    def test_takeaway_count_follows_the_format(self):
        ten = "Intro.\n\n## Key Takeaways\n\n" + "".join(f"- stat {i}\n" for i in range(10))
        self.assertTrue([f for f in run(ten) if "Key Takeaways has" in f.message])
        self.assertFalse([f for f in sc.run_all(ten, 20, takeaways=(8, 12)) if "Key Takeaways has" in f.message])

    def test_faq_question_repeating_an_h2_fails(self):
        body = (
            "Intro.\n\n## How identity exposure is measured\n\nBody.\n\n"
            "## Frequently Asked Questions\n\n### How is identity exposure measured?\n\nAnswer.\n\n"
            "### Who owns ISPM in a security team?\n\nAnswer.\n"
        )
        found = [f for f in run(body) if "FAQ repeats a section heading" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "fail")
        self.assertEqual(len(found[0].snippets), 1)

    def test_faq_answers_outside_40_to_60_words_warn(self):
        ok = " ".join(["word"] * 50)
        short = "Too short."
        body = f"Intro.\n\n## Frequently Asked Questions\n\n### Q one?\n\n{ok}\n\n### Q two?\n\n{short}\n"
        found = [f for f in run(body) if "FAQ answers outside" in f.message]
        self.assertEqual(len(found), 1)
        self.assertEqual(found[0].level, "warn")
        self.assertEqual(len(found[0].snippets), 1)

    def test_long_paragraphs_warn_but_the_intro_is_exempt(self):
        long_para = " ".join(["claim"] * 70) + "."
        body = f"# T\n\n{long_para}\n\n## Section\n\n{long_para.replace('claim', 'point')}\n"
        found = [f for f in run(body) if "paragraphs over 60 words" in f.message]
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


# The intro paragraph 2 of the production "identity exposure vs vulnerabilities"
# draft: four figures from three reports in five sentences (D57).
STAT_PARADE = (
    "Three findings from 2026 put the distinction in front of security teams. Verizon's 2026 Data Breach "
    "Investigations Report recorded vulnerability exploitation overtaking credential abuse, 31% against 13%. "
    "BeyondTrust's 2026 report found Elevation of Privilege flaws made up 40% of all Microsoft vulnerabilities. "
    "A January 2026 ManageEngine survey found machine-to-human identity ratios above 100:1 at nearly half of organizations."
)
REASONED = (
    "A kerberoastable account is dangerous in proportion to what it can reach. The KDC encrypts the service "
    "ticket with the account's key, so anyone holding a ticket can attack the password offline. Fix the "
    "accounts on paths to Tier 0 first."
)


class EvidenceTests(unittest.TestCase):
    def _evidence(self, body, article_type=""):
        return [f for f in sc.run_all(body, len(body.split()), article_type=article_type) if f.message.startswith("Evidence")]

    def test_stat_parade_paragraph_fails(self):
        found = [f for f in self._evidence(STAT_PARADE) if "stack" in f.message]
        self.assertEqual(found[0].level, "fail")

    def test_reasoned_prose_and_bare_numbers_pass(self):
        body = REASONED + "\n\nEvent 4769 logs each request, and Tier 0 holds three kinds of asset."
        self.assertFalse(self._evidence(body))

    def test_budget_scales_with_length(self):
        stats = "\n\n".join(f"Section {i} matters. A survey found {i + 10}% of teams agree." for i in range(8))
        found = [f for f in self._evidence(stats) if "carry a statistic" in f.message]
        self.assertEqual(found[0].level, "fail")
        long = stats + "\n\n" + "\n\n".join([REASONED] * 60)
        self.assertFalse([f for f in self._evidence(long) if "carry a statistic" in f.message])

    def test_source_openers_and_report_headings_warn(self):
        body = (
            "## Credential theft keeps working\n\nAccording to Verizon, credential abuse led. " + REASONED
            + "\n\n## The 2026 DBIR undercounts identity\n\nVerizon's 2026 report found that 22% began with stolen credentials."
            + "\n\n## Report what an attacker can reach\n\n" + REASONED
        )
        found = self._evidence(body)
        openers = [f for f in found if "open on a statistic" in f.message]
        headings = [f for f in found if "built around a source" in f.message]
        self.assertEqual(openers[0].level, "warn")
        self.assertEqual(headings[0].snippets, ["The 2026 DBIR undercounts identity"])

    def test_stats_formats_are_exempt(self):
        self.assertFalse(self._evidence(STAT_PARADE, "stats-data"))


if __name__ == "__main__":
    unittest.main()


class MetaCommentaryTests(unittest.TestCase):
    """D59: the article states its own view, never a review of other writing."""

    FLAGGED = [
        "The discipline is only as good as the identities its graph counts, and most of what's written about it hasn't caught up to that data.",
        "Unlike most guides, this one treats machine identities as nodes.",
        "The top-ranking pages define the term and stop.",
        "Existing articles model attack paths around Active Directory alone.",
        "Nobody else is writing about this yet.",
    ]
    CLEAN = [
        "A graph that counts only human accounts will call an environment safe while service accounts carry the path.",
        "See the other pages in this hub for how choke points are scored.",
        "NIST's existing guidance covers credential rotation.",
    ]

    def test_flags_commentary_on_other_writing(self):
        for text in self.FLAGGED:
            found = [f for f in run(text) if "comments on other writing" in f.message]
            self.assertEqual(len(found), 1, text)
            self.assertEqual(found[0].level, "fail")

    def test_leaves_the_articles_own_claims_alone(self):
        for text in self.CLEAN:
            self.assertFalse([f for f in run(text) if "comments on other writing" in f.message], text)
