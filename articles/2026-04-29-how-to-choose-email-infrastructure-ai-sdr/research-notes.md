# Research Notes: How to Choose Your Sending Infrastructure for High-Volume AI Outbound

> **Shared baseline:** Inherits from [pillar](../2026-04-29-how-to-build-ai-first-sales-operating-model/research-notes.md), [A1](../2026-04-29-how-to-build-ai-sdr/research-notes.md), [B1](../2026-04-29-how-to-roll-out-ai-first-sales-45-days/research-notes.md), [B2](../2026-04-29-how-to-set-up-crm-for-ai-workers/research-notes.md). This article goes deep on the architectural decisions that make sending infrastructure work for AI-volume outbound.

## Topic Summary

The "cold email infrastructure" SERP is owned by tool-comparison roundups: Mailpool, Snov.io, Winnr, Hypergen, Amplemarket, Email Bison's own content, plus the platform-product pages from Instantly and Lemlist. Every result tells you *which tool to buy*. Almost none publish the *architectural decisions* that make any of those tools work: capacity math, mailbox sizing tiers, domain isolation by provider, sender-recipient provider matching, why open-rate tracking degrades deliverability, single-tenant vs multi-tenant IPs, private vs public warmup pools, and the cost/time comparison of self-managed vs managed infrastructure.

EverWorker's "Outbound Email Infrastructure Architecture" PDF (proprietary, 2026) provides the full architectural reference: 16,000 sends/month for 4,000-contact prosecution, 800 sends/day required, 5-sends-per-mailbox-per-day as the safe tier, 160 mailboxes total, 2-3 Google mailboxes per domain (safe ceiling), 25 Microsoft per domain, ~31 active domains rounded to 54 with replacement buffer, 50/50 Google/Microsoft split. Inbox placement: same-provider 94-96%, cross-provider 84-88%, SMTP relay 73%/67%. Apple Mail prefetches 49% of opens (Litmus 2025). ScaledMail managed: $215/month vs ~$8K/yr self-managed plus 32+ hours of GTM engineering setup labor.

The wedge is publishing the architecture-as-decision-framework that the tool-comparison genre skips. Audience: GTM Engineer / RevOps / sales-ops / VP Sales evaluating outbound infrastructure for AI-volume operations.

This is direct head-to-head with artisan's tools cluster: artisan reviews tools; this article publishes the architecture decisions that make tools work.

## Target Keyword Analysis

- **Primary keyword:** `cold email infrastructure 2026`
- **Secondary keywords:**
  - `email infrastructure ai sdr`
  - `cold email deliverability ai`
  - `sending domains ai sdr`
  - `instantly vs lemlist vs email bison`
  - `cold email sending architecture`
  - `single tenant vs shared smtp cold email`
- **Search intent:** evaluation. GTM Engineer / RevOps / sales-ops audience. Buyer-stage but technical: they have or are buying an AI SDR and need to know what infrastructure to put underneath it.
- **SERP type:** mostly long-form tool roundups + vendor comparison articles + a few infrastructure-deep pieces (Mailpool's "best cold email stack" comes closest).

## Top Ranking Pages

1. **[Mailpool — The Best Cold Email Stack in 2026 (Infrastructure + Sending Tool + Tracking)](https://www.mailpool.ai/blog/the-best-cold-email-stack-in-2026-infrastructure-sending-tool-tracking)** — closest competitor; goes deeper than a pure roundup but still tool-comparison framing.
2. **[Email Bison — 17 Best Cold Email Marketing Software for Agencies in 2026](https://emailbison.com/blogs/cold-email-marketing-softwares)** — vendor SEO listicle.
3. **[Snov.io — Best Cold Email Infrastructure Tools for 2026](https://snov.io/blog/best-cold-email-infrastructure-tools/)** — tool roundup.
4. **[Winnr — 7 Best Cold Email Infrastructure Providers 2026](https://winnr.app/blog/best-cold-email-infrastructure-2026.html)** — tool roundup.
5. **[ZoomInfo Pipeline — 9 Best Cold Email Software to Build Pipeline in 2026](https://pipeline.zoominfo.com/sales/cold-email-software)** — tool roundup.
6. **[Hypergen — Top 7 Cold Email Infrastructure Providers That Actually Work in 2026](https://www.hypergen.io/blog/top-cold-email-infrastructure-providers)** — tool roundup.
7. **[ColdEmailPick — Lemlist Pricing 2026](https://coldemailpick.com/reviews/lemlist-pricing/)** — vendor pricing review.
8. **[Outreach Almanac — Zapmail Review 2026: Pre-Warmed Google Workspace](https://outreachalmanac.com/tools/zapmail/)** — vendor review.
9. **[Amplemarket — Best Cold Email Software 2026: 9 Platforms Scored Across 231 Features](https://www.amplemarket.com/blog/best-cold-email-software-2026)** — quantified roundup, still tool-focused.
10. **[Litemail — Cold Email Tool Pricing Comparison 2026](https://litemail.ai/blog/cold-email-tool-pricing-comparison-2026)** — pricing roundup.

**Gap takeaway:** Mailpool is the only result that brushes against architecture (their "stack" framing). Even that piece focuses on which tools belong in a stack rather than the architectural decisions inside infrastructure. The capacity-math + mailbox-sizing + provider-matching + open-tracking + warmup-pool framework is unowned content.

## Authoritative Sources

(Article-specific; shared sources in pillar + B2 `research-notes.md`.)

1. **EverWorker — "Outbound Email Infrastructure Architecture for High-Volume SDR AI Worker Operations" PDF** (proprietary, 2026). Source of: capacity math, mailbox sizing tiers (5/8/11 sends/mailbox/day), domain sizing by provider (2-3 Google / 25 Microsoft), 50/50 provider split rationale, inbox placement rates by provider pairing (94-96% / 84-88% / 73-67%), open-rate-tracking-disabled justification, single-tenant IP rationale, private vs public warmup pool tradeoffs, ScaledMail $215/month vs $8K/yr self-managed cost comparison.
2. **EverWorker — "The State of Cold Email in 2026" PDF** (proprietary, 2026). Source of: 42% B2B pipeline contribution, 3.43% average reply / 10%+ top, $152.73/meeting cold email vs $2,777.78 calling, 9.1% spam-landing rate, 84% inbox placement industry average.
3. **[Mailpool — The Best Cold Email Stack in 2026](https://www.mailpool.ai/blog/the-best-cold-email-stack-in-2026-infrastructure-sending-tool-tracking)** — closest competitor.
4. **[Validity — 2025 Email Deliverability Benchmark Report](https://www.validity.com/)** — 84% inbox placement, 9.1% spam landing.
5. **[Litmus — Email Client Market Share 2025](https://litmus.com/)** — 49% Apple Mail share; 85-90% corporate inboxes Gmail+Microsoft.
6. **[Google Postmaster — February 2024 Bulk Sender Guidelines](https://support.google.com/mail/answer/81126)** — 0.3% spam complaint rate enforcement; tracking-pixel devaluation.
7. **[Saleshandy — Cold Email Statistics 2026](https://www.saleshandy.com/blog/cold-email-statistics/)** — 5-18% / 1-3% reply rates.

## Key Entities

- **Concepts:** Sending infrastructure, deliverability, inbox placement rate, sender reputation, mailbox warmup, sending domain isolation, SPF, DKIM ([https://en.wikipedia.org/wiki/DomainKeys_Identified_Mail]), DMARC, single-tenant IP, multi-tenant IP, private warmup pool, open-rate tracking pixel.
- **Email providers:** Google Workspace, Microsoft 365 / Exchange Online.
- **Sequencing tools:** Instantly, Lemlist, Email Bison, Outreach, Salesloft, Apollo.
- **Infrastructure managed services:** ScaledMail, Zapmail.
- **Email security gateways:** Proofpoint, Mimecast, Barracuda.
- **Privacy / browser:** Apple Mail Privacy Protection.

## Statistics & Data Points

- 4,000 contacts/month × 4-touch sequence = 16,000 sends/month. Source: EverWorker.
- 16,000/20 working days = 800 sends/day. Source: EverWorker.
- Tier safety: 5 sends/mailbox/day (low), 8 (medium), 11 (max-volume). Source: EverWorker.
- 800/5 = 160 mailboxes required for low-tier safety. Source: EverWorker.
- Google: 2-3 mailboxes per domain (safe ceiling). Microsoft: 25 mailboxes per domain. Source: EverWorker / Lemlist / Woodpecker / SmartLead industry consensus.
- 80 Google mailboxes / 3 = ~27 Google domains; 80 Microsoft / 25 = ~4 Microsoft domains. Total ~31; rounded to 54 with replacement buffer. Source: EverWorker.
- 50/50 provider split rationale: same-provider inbox placement.
- Same-provider inbox placement: Google→Gmail 94-96%; Microsoft→Outlook 92-95%. Source: EverWorker / Validity 2025 / Litmus 2025.
- Cross-provider: Google→Outlook 84-87%; Microsoft→Gmail 85-88%. Source: EverWorker.
- SMTP relay (SendGrid, Mailgun, Postmark, Amazon SES) to Gmail: ~73%; to Outlook: ~67%. Source: EverWorker.
- Apple Mail prefetches 49% of opens (~iOS 15+). Source: Litmus 2025.
- Apple Mail global market share: ~49.29%. Source: Litmus 2025.
- Google Postmaster spam complaint threshold: 0.3% enforced (Feb 2024 bulk sender guidelines).
- Validity 2025: global average inbox placement ~84%; spam landing ~9.1%.
- ScaledMail managed: $215/month, fully provisioned in ~27 hours.
- Self-managed at 160-mailbox scale: ~$8,000/yr (54 domains $100-500 + 80 MS $4,000 + 80 Google $4,000).
- Self-managed setup labor: 8h domain + 8h auth + 16h account/warmup = 32+ hours of GTM engineer time.
- Cold email = 42% of B2B pipeline. Source: EverWorker State of Cold Email PDF.
- 3.43% average reply rate (Instantly 2026); 10%+ top performers.
- $152.73/meeting cold email vs $2,777.78 cold calling.
- Multi-threading +93% response rate (Saleshandy SaaS data).

## Quotes Worth Including

- "Same-provider sending earns its keep on every send." (EverWorker)
- "The infrastructure becomes invisible. It sends at capacity every working day without manual intervention." (EverWorker, slightly rephrased)

## Questions People Are Asking

- How do I set up cold email infrastructure for AI?
- How many sending domains do I need for an AI SDR?
- Should I use Google Workspace or Microsoft 365 for cold email?
- What's the difference between Instantly, Lemlist, and Email Bison?
- Should I disable open-rate tracking?
- Is a managed service like ScaledMail worth it vs self-managed?
- How do you warm up cold email domains?
- What's the safe sending limit per mailbox per day?

## Debates & Counterpoints

- **High-volume vs low-volume sending.** Some sources push 11 sends/mailbox/day or higher. EverWorker's data and the deliverability research support 5/day as the long-term-stable tier; higher tiers accelerate reputation degradation. The article publishes 5/8/11 with the tradeoff explicit.
- **Open-rate tracking pixel: useful or harmful?** Vendor narrative says useful for measurement. The data: Apple prefetches 49% of opens (false positives), corporate gateways strip pixels (false negatives), Google's bulk-sender guidelines explicitly devalue tracking-pixel signals. Article's position: disable by default; use reply rate as the primary engagement metric.
- **Self-managed vs managed.** Tool roundups assume self-managed. The math: 32+ hours GTM engineering at launch, 4-8 hours/month maintenance, $8K/yr in domains + mailboxes. Managed (ScaledMail at $215/month) is cheaper, faster, and frees the GTM engineer for sequence logic.
- **Single-tenant vs multi-tenant IPs.** Most sequencing tools (Instantly, Apollo, Outreach, Salesloft) route through shared SMTP. Reputation contamination from other senders is real. Single-tenant IPs (ScaledMail provisions these) earn their keep at scale.

## Content Gaps (Opportunities)

- **The full architectural framework with capacity math is unowned.** Tool roundups don't publish the math. Mailpool brushes the architecture but doesn't publish the math either.
- **The "open-rate tracking degrades deliverability" argument is invisible content.** Most articles treat open rate as a useful metric.
- **The cost-and-time comparison of self-managed vs managed is missing from the SERP.** Vendor pricing pages don't make the time-cost case.
- **Direct head-to-head positioning vs artisan's tools cluster.** Artisan reviews tools (zoominfo-vs-leadiq, seamless-vs-apollo, reply-io-alternatives, etc.). This article publishes architecture decisions that span tools.

## AI Engine Patterns

- "Cold email infrastructure" Google AI Overviews currently surface tool roundups and Mailpool. Architecture-as-framework framing is absent.
- Citation neighborhood: Validity, Litmus, Google Postmaster, Saleshandy, Mailpool. The article belongs in this set.
- The framing AI engines aren't yet using: architecture-as-decision-framework with capacity math, provider matching, single-tenant rationale, and managed-vs-self-managed cost comparison. Owning that frame produces citation upside in a buyer-stage SERP.
