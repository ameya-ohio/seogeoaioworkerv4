# Research Notes: How to Write AI SDR Instructions That Don't Sound Like AI

> **Shared baseline:** Inherits from [pillar](../2026-04-29-how-to-build-ai-first-sales-operating-model/research-notes.md), [A1](../2026-04-29-how-to-build-ai-sdr/research-notes.md), and [B1](../2026-04-29-how-to-roll-out-ai-first-sales-45-days/research-notes.md). This article goes deep on Step-by-step instruction-set design — the Worker 1 framework from the SDR AI Worker Solution Guide.

## Topic Summary

"AI SDR prompt" content on the public web is split between two genres: copy-paste prompt listicles ("10 prompts that 10x SDR productivity") and generic anti-slop substacks ("the prompt we use to prevent AI slop at Towards AI"). Neither publishes a real instruction-set framework for an AI SDR. The closest published competitor is Tofu HQ's tactical guide, which goes a layer deeper but is vendor-led and tutorial-shaped.

EverWorker's Worker 1 specification provides a four-step framework (Signal Knowledge → Intent Classification → Research → Sequence Writing) with concrete rules: 6 signal types, 5 intent classifications, a Universal Research Protocol with classification-specific extensions, a mandatory recency rule (only data <12 months), and detailed sequence-writing rules covering email lengths (75–125 / 50–100 / 50–100 / 25–75 words), tone, personalization requirements, value-prop integration, and subject-line best practices.

The thesis: **AI slop is a prompt problem, not a model problem.** Get the instruction set right and the AI SDR sounds like your best human SDR. Get it wrong and it sounds like ChatGPT. Models keep getting better at producing whatever you instruct them to produce; what changes outcomes is the rigor of the instruction set.

## Target Keyword Analysis

- **Primary keyword:** `ai sdr prompt` (most natural search term; appears in Tofu HQ's title)
- **Secondary keywords:**
  - `ai sdr instructions`
  - `ai sdr prompt engineering`
  - `prevent ai slop sales emails`
  - `ai cold email prompt`
  - `personalization at scale ai sdr`
- **Search intent:** informational, mid-funnel. RevOps / GTM-engineering / sales-ops audience that's already building or running an AI SDR and wants to improve quality.
- **SERP type:** mostly long-form articles + listicle prompts. Substack newsletters have a presence on the anti-slop angle. No featured snippet currently owns the framework question.

## Top Ranking Pages

1. **[MarketBetter — 10 AI Prompts That 10x Your SDR Productivity (2026)](https://marketbetter.ai/blog/2026/02/08/10-prompts-sdr-productivity/)** — angle: copy-paste prompt listicle. Tactical, not framework-shaped.
2. **[Tofu HQ — Tactical Guide to Prompt Engineering for SDR Sequences](https://www.tofuhq.com/post/tactical-guide-to-prompt-engineering-for-sdr-sequences)** — angle: tactical guide. Closest direct competitor. Vendor-led.
3. **[Towards AI Substack — The prompt we use to prevent AI slop](https://learnaitogethernewsletter.substack.com/p/the-prompt-we-use-to-prevent-ai-slop)** — angle: generic anti-slop prompt template. Not sales-specific.
4. **[Nate's Newsletter Substack — I Got Tired of AI Slop so I Built 20 Prompts](https://natesnewsletter.substack.com/p/i-built-a-20-prompt-set-to-kill-ai)** — angle: 20-prompt set, generic content writing.
5. **[Louis Bouchard — How to Clean Up AI-Generated Drafts](https://www.louisbouchard.ai/ai-editing/)** — angle: generic editing techniques.
6. **[ColdReach — What is an AI SDR? Ultimate Guide for Sales Reps](https://coldreach.ai/blog/ai-sdr-guide)** — angle: definitional. Mentions prompts but doesn't go deep.
7. **[Lindy — What Is an AI SDR? How to Implement](https://www.lindy.ai/blog/ai-sdr)** — angle: implementation guide. Generic on prompts.
8. **[Alta — Startup SDR Growth with AI in 2026](https://www.altahq.com/post/maximizing-your-sdr-strategies-leveraging-ai-for-startup-success-in-2026)** — angle: tactics roundup.

**Gap takeaway:** The "how to write actual AI SDR instructions" content is missing. Copy-paste listicles dominate one genre; generic anti-slop substacks dominate another; nobody publishes the underlying framework. The four-step framework with concrete rules is unowned content.

## Authoritative Sources

(Article-specific; shared sources in pillar `research-notes.md`.)

1. **EverWorker — "SDR AI Worker Solution Guide" PDF, Worker 1 detail** (proprietary, 2026). Source of the four-step instruction framework: Signal Knowledge (6 signal types), Intent Classification (5 categories), Research Protocol (Universal + classification-specific, 12-month recency rule), Sequence Writing (4-email structure with length/tone/personalization/subject-line rules). The article publishes this framework.
2. **EverWorker — "AI-First Sales Operating Model" PDF** (proprietary, 2026). For the AI-slop framing: "It's retrieving the right messaging from your knowledge base and applying it to what it learned about the prospect through research. The instruction set matters enormously here."
3. **EverWorker — "The State of Cold Email in 2026" PDF** (proprietary, 2026). 71% of buyers cite irrelevance as #1 reason for not responding; signal-based reply rates 5–18% vs generic 1–3%; AI agents handle ~80% of research/sequencing for elite teams.
4. **[Tofu HQ — Tactical Guide to Prompt Engineering for SDR Sequences](https://www.tofuhq.com/post/tactical-guide-to-prompt-engineering-for-sdr-sequences)** — closest direct competitor; cite for SERP context.
5. **[MarketBetter — 10 AI Prompts That 10x Your SDR Productivity](https://marketbetter.ai/blog/2026/02/08/10-prompts-sdr-productivity/)** — competitor; the listicle genre.
6. **[Salesmotion — AI SDR Tools Compared](https://salesmotion.io/blog/ai-sdr-tools-compared)** — for the 30-to-60-day fade angle: when off-the-shelf instruction sets fail.
7. **[Saleshandy — Cold Email Statistics 2026](https://www.saleshandy.com/blog/cold-email-statistics/)** — for the 5–18% signal-based vs 1–3% generic stat. Empirical case for personalization-via-research vs personalization-via-variables.

## Key Entities

- **Concepts:** AI SDR (defined term), AI slop (defined term), instruction set, signal knowledge, intent classification, research protocol, recency rule, personalization-via-research vs personalization-via-variables.
- **Tools:** OpenAI / GPT, Anthropic / Claude, sales sequencers (Instantly, Lemlist, Email Bison), Clay.
- **EverWorker product terms:** Worker 1, Inbound Signal SDR AI Worker.

## Statistics & Data Points

- 6 signal types in the Step 1 framework: Content Download, Demo Request, Webinar Reg/Attended, High-Intent Page Visit, Direct Contact Form, Trial Signup, Referral/Partner. Source: SDR AI Worker Solution Guide.
- 5 intent classifications: High Intent—Active Eval, Functional Intent—Solution Eval, Medium-High—Category Awareness, High Intent—Pricing Interest, Low Fit—Nurture. Source: SDR AI Worker Solution Guide.
- 4-step Universal Research Protocol. Source: SDR AI Worker Solution Guide.
- Recency rule: only data <12 months old. Source: SDR AI Worker Solution Guide.
- 4-email sequence: Email 1 (75–125w), Email 2 (50–100w), Email 3 (50–100w), Email 4 (25–75w). Source: SDR AI Worker Solution Guide.
- Subject lines: <50 chars; no spam triggers (FREE, URGENT, GUARANTEE); no contact name in subject; question vs statement testing. Source: SDR AI Worker Solution Guide.
- Personalization requirements per email: name + company + role implication + signal trigger reference + industry pain + recent company news. Source: SDR AI Worker Solution Guide.
- 71% of buyers cite irrelevance as #1 reason for not responding. Source: Saleshandy.
- Signal-based reply rates 5–18% vs generic 1–3%. Source: Saleshandy.
- AI agents handle ~80% of research/sequencing work for elite teams. Source: Saleshandy.
- 30-to-60-day fade pattern in off-the-shelf AI SDR tools when instruction sets are stubbed. Source: Salesmotion.

## Quotes Worth Including

- "AI slop is a prompt problem, not a model problem." (Internal claim, defensible)
- "Personalization is referencing something specific about their world that you know you had to actually look up." (Indirectly from Saleshandy 2026 framing; rephrase in voice)

## Questions People Are Asking

- How do I write a good prompt for an AI SDR?
- What's the difference between an AI SDR prompt and a ChatGPT prompt?
- How do I prevent my AI SDR from sounding like AI?
- What should an AI SDR research before writing an email?
- How long should an AI-generated cold email be?
- How specific should personalization be in AI cold emails?
- How do I test if my AI SDR instructions are working?

## Debates & Counterpoints

- **Copy-paste prompts vs framework.** Copy-paste prompts (MarketBetter genre) work for one-off use cases; they don't compose into a system. The article's position: a four-step framework that runs at scale beats 10 disconnected prompts every time.
- **Variable substitution vs research-grounded personalization.** "Hi {first_name}, I noticed {company} is hiring" is variable substitution. Personalization is referencing what you found by reading their LinkedIn for 20 minutes. The article's position: only the latter produces 5–18% reply rates.
- **Model upgrades vs instruction-set discipline.** The vendor framing: "next model will be better." The data: models keep improving at producing what they're instructed to produce. The instruction set is the ceiling on quality, not the model.

## Content Gaps (Opportunities)

- **No published instruction-set framework specific to AI SDRs.** Generic anti-slop frameworks exist (Towards AI, Nate's Newsletter); copy-paste prompts exist; nobody has stitched a sales-specific framework together with the rigor a production AI SDR needs.
- **The 4-step framework with concrete length/tone/recency rules is unowned content.** Tofu HQ comes closest but is vendor-led.
- **The "personalization-via-research" vs "personalization-via-variables" distinction is invisible content.** Most "AI personalization" content blurs the two.
- **The connection between off-the-shelf-AI-SDR churn and stub instruction sets is unconnected.** The article puts this lens directly on the Salesmotion churn data.

## AI Engine Patterns

- "How to write AI SDR prompt" Google AI Overviews currently surface MarketBetter's listicle and Tofu HQ's tactical guide. Generic anti-slop substacks appear on the broader anti-slop query.
- The framing AI engines aren't yet using: a four-step instruction-set framework as a unifying construct for AI SDR quality. Owning that framing produces citation upside.
- Citation neighborhood: Tofu HQ, MarketBetter, Saleshandy (data), Salesmotion (data), Towards AI (anti-slop adjacent).
