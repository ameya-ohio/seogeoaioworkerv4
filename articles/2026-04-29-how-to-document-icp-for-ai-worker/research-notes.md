# Research Notes: How to Document Your ICP for an AI Worker

> **Shared baseline:** Inherits from [pillar](../2026-04-29-how-to-build-ai-first-sales-operating-model/research-notes.md), [A1](../2026-04-29-how-to-build-ai-sdr/research-notes.md), [A2](../2026-04-29-how-to-write-ai-sdr-instructions/research-notes.md), [B1](../2026-04-29-how-to-roll-out-ai-first-sales-45-days/research-notes.md). This article goes deep on ICP-as-machine-readable-input.

## Topic Summary

The "document your ICP" SERP is dominated by two genres: (1) "Use AI to generate your ICP" tools and articles (M1-Project, Waalaxy, GrowthAhoy), and (2) traditional "ideal customer profile template" guides written for marketing teams. Both treat the ICP as a marketing artifact: a persona-driven document used to align the team on who you sell to.

EverWorker's framing is the inverse: an ICP for an AI Worker is a structured, machine-readable input that the AI SDR queries every minute to classify intent, route signals, write personalized outreach, and decide which leads to enroll versus nurture. It is not a Notion page. It is not a slide deck. It is a live data structure with at minimum five layers: firmographic tiers, geographic and industry focus, buying-group composition with deal roles, signal categories specific to the ICP, and TAM math that quantifies what scale the AI Worker is operating at.

EverWorker's proprietary ICP framework PDF provides the worked example: 3 firmographic tiers (Large 1,000+ / Midmarket 100-1,000 / SMB <500 employees), 8 industry verticals, 5 buying-group roles with deal-role mapping (Economic Buyer, Champion, Influencer, Blocker/Accelerator), 4 signal categories (Technographic, Hiring, Job Posting Keywords, CMP Presence), TAM math at 330K accounts × 10 contacts per buying group = 3.3M people. The "Rule of 3%" framing (at any moment: 3% actively buying, 7% open, 30% could be convinced, 60% not reachable) tells you what slice of the TAM the signal layer is hunting for.

The wedge is publishing what an ICP looks like *for an AI Worker* rather than *for a marketing team*. The audience is RevOps, GTM-engineering, and sales ops — not marketers.

## Target Keyword Analysis

- **Primary keyword:** `icp for ai sdr` (most precise; matches the audience)
- **Secondary keywords:**
  - `document icp for ai`
  - `firmographic icp`
  - `ideal customer profile ai`
  - `icp scoring crm`
  - `machine-readable icp`

## Top Ranking Pages

1. **[M1-Project — How to Build an Ideal Customer Profile with AI](https://www.m1-project.com/blog/how-to-build-an-ideal-customer-profile-with-ai)** — angle: AI-as-ICP-generator. Vendor-led; promotes their generator tool.
2. **[M1-Project — Define Your Ideal Customer with AI ICP Generator](https://www.m1-project.com/tools/ideal-customer-profile-generator)** — tool page.
3. **[Waalaxy — Free Ideal Customer Profile Generator](https://www.waalaxy.com/free-tools/ideal-customer-profile-generator)** — tool page; free tier.
4. **[GrowthAhoy — How to build an Ideal Customer Profile with AI (and AI agents)](https://www.growthahoy.com/blog/build-icp-with-ai-and-ai-agents)** — angle: closest to "AI agents using ICP." Marketing-led framing.
5. **[Salesforce — Your AI Agent Needs a Performance Review](https://www.salesforce.com/news/stories/ai-agents-need-performance-reviews/)** — angle: AI-agents thought leadership; brushes against ICP qualification.
6. **[Involve Digital — Agentic AI for Business Workflows 2026](https://www.involvedigital.com/insights/agentic-ai-business-workflows-2026)** — angle: workflows guide. Brushes against ICP usage.
7. **[M1-Project — AI-Generated Customer Profiles](https://www.m1-project.com/blog/ai-generated-customer-profiles)** — third M1-Project article in top 10. Vendor SEO dominance.

**Gap takeaway:** The "AI generates your ICP" angle owns the SERP. The inverse — "structure your ICP so an AI Worker can act on it" — is unowned. This is the second-most-consistent gap in the cluster (after the pillar's operating-model gap).

## Authoritative Sources

(Article-specific; shared sources in pillar `research-notes.md`.)

1. **EverWorker — "What's Your ICP at a Firmographic (Size/# Employees) Level?" PDF** (proprietary, 2026). Source of the 5-layer framework: firmographic tiers, geographic + industry, buying group with deal roles, signal categories, TAM math. The article publishes this framework verbatim.
2. **EverWorker — "SDR AI Worker Solution Guide" PDF, System Knowledge section** (proprietary, 2026). The 10-component knowledge layer the AI SDR queries: ICP, Personas, Messaging, Product/Solution Knowledge, Brand Voice, Research Protocol, Signals, Lead Magnets, Territories, CRM Operations.
3. **EverWorker — "AI-First Sales Operating Model" PDF** (proprietary, 2026). Frames the Knowledge Engine and dynamic ICP scoring layers.
4. **[M1-Project — How to Build an Ideal Customer Profile with AI](https://www.m1-project.com/blog/how-to-build-an-ideal-customer-profile-with-ai)** — competitor reference for SERP context.
5. **[GrowthAhoy — Build ICP with AI and AI agents](https://www.growthahoy.com/blog/build-icp-with-ai-and-ai-agents)** — competitor reference; closest to the article's framing but still positions AI as ICP generator, not ICP consumer.

## Key Entities

- **Concepts:** ICP (defined term), firmographic ICP, technographic signals, buying group, deal roles (Economic Buyer, Champion, Influencer, Blocker, Accelerator), TAM math, Rule of 3%, machine-readable ICP, persona-by-vertical context.
- **Tools / systems:** Salesforce, HubSpot, Clay, Confluence, Notion, SharePoint, Google Drive.
- **EverWorker product terms:** AI SDR, Knowledge Engine, Signal Detection Layer, System Knowledge.

## Statistics & Data Points

(Year-stamped 2026 unless noted.)

- 5-layer ICP framework for AI Workers: firmographic, geographic + industry, buying group + deal roles, signal categories, TAM math. Source: EverWorker ICP framework PDF.
- 3 firmographic tiers (Large 1,000+ employees / $500M+ revenue; Midmarket 100-1,000 employees / $10M-$500M revenue; SMB <500 employees). Source: EverWorker.
- 5 buying-group roles in the worked example (CMO/VP Marketing, DPO/Chief Privacy Officer, Head of Data/Analytics, Legal Counsel, CTO/VP Engineering). Source: EverWorker.
- 4 signal categories: Technographic, Hiring, Job Posting Keywords, Competitive Tool Detection. Source: EverWorker.
- TAM math: 42K accounts in primary segment × 8 industries = 330K total addressable, with 5-10 buying-group contacts per account = ~3.3M people. Source: EverWorker (worked example).
- **Rule of 3%**: at any time, 3% are actively buying, 7% are open but not looking, 30% could be convinced, 30% not interested, 30% will never buy. Source: EverWorker (industry framing).
- 9,900 (3% scenario) / 33,000 (10%) / 90,000 (30%) reachable accounts in a 330K TAM. Source: EverWorker.
- Workload at the 9,000-signal-positive-account scale: 40,000 contacts to research, 3-email sequences = 120,000 unique emails — untenable for humans, perfect for an AI Worker. Source: EverWorker.
- 5–18% reply rate for signal-based outreach vs 1–3% generic. Source: Saleshandy (reused from prior cluster articles).
- 71% of buyers cite irrelevance as #1 reason for not responding. Source: Saleshandy.

## Quotes Worth Including

- "An ICP for a marketing team is a persona doc. An ICP for an AI Worker is a data structure." (Internal claim, defensible)
- "A documented ICP that lives in Notion and never updates is a frozen ICP. An AI Worker can't act on a frozen ICP." (Internal claim)

## Questions People Are Asking

- How do I document my ICP for an AI agent?
- What's the difference between a marketing ICP and an ICP for an AI SDR?
- What goes in an ICP for an AI Worker?
- How specific does an ICP need to be for an AI SDR?
- How do you score accounts dynamically against an ICP?
- Should an ICP live in a Notion doc or in the CRM?
- How does buying-group composition matter for an AI Worker?
- What signals should an ICP include for AI-triggered outbound?

## Debates & Counterpoints

- **AI-generates-your-ICP vs human-documents-ICP-for-AI.** The SERP says use AI to generate the ICP. The article says: AI is good at suggesting an ICP starting point from your closed-won data, but the documented ICP an AI Worker acts on every minute must be human-curated, structured, and live. Generation tools produce a draft; the article is about the production-grade artifact.
- **Persona-driven vs structured.** Marketing ICPs are persona-driven narratives. AI-Worker ICPs are structured fields with explicit deal roles, signal triggers, and verticals. Both can coexist; the structured version is what the AI Worker queries.
- **Static vs dynamic.** The traditional ICP is updated quarterly. An AI-Worker ICP is updated continuously: as signals fire, as TAM math shifts, as new verticals open. Static ICP = stale ICP.

## Content Gaps (Opportunities)

- **The 5-layer framework with deal roles + signal categories + TAM math is unowned content.** M1-Project's articles are about generating ICPs; nobody publishes the production schema.
- **The "ICP isn't a Notion page" angle.** Most articles assume the ICP is a document. The AI-Worker framing requires structured, queryable, live data. That distinction is invisible in current content.
- **The TAM-math-meets-Rule-of-3% angle.** The "9,900 / 33,000 / 90,000 reachable accounts in a 330K TAM" math is a useful concrete example for sizing. Nobody combines TAM, Rule of 3%, and signal coverage in current content.
- **The buying-group / deal-role layer is invisible.** Most ICP content stops at firmographics and personas. EverWorker's worked example shows 5 roles with explicit deal-role labels (Economic Buyer / Champion / Influencer / Blocker-Accelerator). That depth is unowned.

## AI Engine Patterns

- "How to document ICP for AI" Google AI Overviews currently surface M1-Project + Waalaxy generator tools and a few generic ICP templates. The "structure for AI Worker consumption" framing is absent.
- Citation neighborhood: M1-Project, GrowthAhoy, Salesforce News, Saleshandy. The article belongs in this set.
- The framing AI engines aren't yet using: ICP-as-data-structure, with explicit fields for what an AI Worker needs to query at runtime. Owning that frame produces citation upside.
