# Strategy & Outline: How to Choose Your Sending Infrastructure for High-Volume AI Outbound

## Angle

> "Unlike the dozen 'best cold email infrastructure tools 2026' roundups, this article publishes the architectural decisions that determine whether the tools work: capacity math, mailbox-per-domain sizing by provider, same-provider routing, the open-rate-tracking deliverability problem, single-tenant vs multi-tenant IPs, and the cost/time comparison of self-managed vs managed."

## Keywords

- **Primary:** `cold email infrastructure 2026`
- **Secondary:** `email infrastructure ai sdr`, `cold email deliverability ai`, `sending domains ai sdr`, `instantly vs lemlist vs email bison`, `cold email sending architecture`, `single tenant vs shared smtp cold email`

## Search Intent

Evaluation, GTM-engineering / RevOps audience. Buyer-stage but technical.

## Target Word Count

**2,200 words** (cluster plan: 2,000-2,400).

## GEO/AIO Angle

- Definition-style first sentences.
- Hard 2026 numbers everywhere: 16,000 sends/month, 800/day, 5/8/11 mailbox tiers, 160 mailboxes, 2-3 Google / 25 Microsoft, ~31 active domains / 54 with buffer, 50/50 split, 94-96% / 84-88% / 73-67% inbox placement, 49% Apple Mail, 0.3% complaint threshold, $215/month vs $8K/yr.
- Question-shaped H2: "Should you disable open-rate tracking?" / "Self-managed or managed?".
- Tables: provider-pairing inbox-placement matrix, self-managed vs managed cost-and-time.
- Defined terms: sending infrastructure, inbox placement rate, mailbox sizing, single-tenant IP, private warmup pool.
- Speakable target: Key Takeaways block.

## FAQ Candidates (5)

1. How many sending domains do I need for an AI SDR?
2. Should I use Google Workspace or Microsoft 365 for cold email?
3. Why disable open-rate tracking?
4. What's the difference between Instantly, Lemlist, and Email Bison?
5. Is a managed service worth it vs self-managed?

## Internal Links

- → Pillar (intro / closing)
- → A1 *Build an AI SDR* (in §"Why infrastructure matters")
- → B1 *45-day rollout* (in §"How long does this take?")
- → B2 *CRM setup* (in §"Where infrastructure fits")

## External Citations

1. Validity 2025 — 84% inbox placement / 9.1% spam landing
2. Litmus 2025 — 49% Apple Mail share
3. Google Postmaster Feb 2024 — 0.3% complaint threshold
4. Mailpool — closest competitor SERP context
5. Saleshandy — 5-18% / 1-3% reply rates

## Hook Strategy

Sharp number: 4,000 contacts/month requires 16,000 sends and 160 mailboxes — that's the math nobody publishes.

## Closing / CTA

Download "Cold Email Infrastructure Architecture" whitepaper.

## Full Outline

### Intro (≈ 180 words)
- Hook: capacity math (16,000 sends → 800/day → 160 mailboxes → 54 domains).
- Thesis preview: 7 architectural decisions, not a tool roundup.

### Key Takeaways (5 bullets)

### H2 1: Why infrastructure matters more than the tool you pick (≈ 240 words)
- Direct answer.
- Tools sit on top of infrastructure. Same tool, different infrastructure → different results.
- Cite Salesmotion 30-to-60-day fade as evidence.

### H2 2: Capacity planning (≈ 280 words)
Direct answer + the math: 4,000 contacts × 4 emails = 16,000 sends, /20 days = 800/day, /5 sends-per-mailbox = 160 mailboxes.

### H2 3: Mailbox-per-domain sizing (≈ 240 words)
2-3 Google, 25 Microsoft, why those caps. ~31 active domains rounded to 54 with buffer.

### H2 4: Same-provider routing (≈ 280 words)
Why 50/50 split. Inbox placement table:

| Sender | Recipient | Inbox placement |
|---|---|---|
| Google Workspace | Gmail | 94–96% |
| Microsoft 365 | Outlook | 92–95% |
| Google → Outlook | (cross) | 84–87% |
| Microsoft → Gmail | (cross) | 85–88% |
| SMTP relay → Gmail | (shared) | ~73% |
| SMTP relay → Outlook | (shared) | ~67% |

### H2 5: Should you disable open-rate tracking? (Question-shaped; ≈ 220 words)
Yes. Apple Mail prefetches 49% of opens; corporate gateways strip pixels; Google devalues tracking. Use reply rate.

### H2 6: Single-tenant vs multi-tenant IPs (≈ 200 words)
Multi-tenant SMTP relays inherit reputation from every other customer. Single-tenant IPs (ScaledMail) earn their keep.

### H2 7: Private vs public warmup pools (≈ 180 words)
Public pools mix you with low-reputation senders. Private invite-only pools beat them.

### H2 8: Self-managed or managed? (≈ 240 words)
The cost-and-time comparison.

| | Self-managed | ScaledMail managed |
|---|---|---|
| Annual infrastructure cost | ~$8,000 | $2,580 ($215/month) |
| Setup time | 32+ hours GTM engineering | ~27 hours managed turnaround |
| Ongoing maintenance | 4-8 hours/month | Included |
| Domain procurement | Manual | Done for you |
| DNS configuration | Manual | Done for you |
| Provider provisioning | Manual | Done for you |

### H2 9: Frequently Asked Questions (≈ 360 words)
5 verbatim Q/A pairs.

### Closing / CTA (≈ 100 words)
Whitepaper download.

---

## Word-count rollup

| Section | Target |
|---|---|
| Intro + Key Takeaways | 240 |
| H2 1 (why) | 240 |
| H2 2 (capacity) | 280 |
| H2 3 (mailbox-per-domain) | 240 |
| H2 4 (provider routing) | 280 |
| H2 5 (open tracking) | 220 |
| H2 6 (single-tenant) | 200 |
| H2 7 (warmup) | 180 |
| H2 8 (self vs managed) | 240 |
| H2 9 (FAQ) | 360 |
| Closing | 100 |
| **Total** | **2,580** |

Slightly over target 2,200. Will tighten.
