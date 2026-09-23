---
title: "Context Engineering for AI SDR Workers: 4-Layer Architecture"
slug: "context-engineering-for-ai-sdr-workers"
author: "Ameya Deshmukh"
author_bio_url: "https://everworker.ai/about/ameya-deshmukh"
publish_date: "2026-05-05"
modified_date: "2026-05-05"
meta_description: "Context engineering for AI SDR workers: the 4 knowledge layers, the 6 artifacts, Markdown over PDFs, what stays out of vector memory, and chunk-size math."
primary_keyword: "context engineering for ai sdr"
secondary_keywords: ["ai sdr architecture", "ai sdr knowledge engine", "ai sdr vector memory", "ai sdr rag architecture", "markdown for ai sdr", "chunk size ai sdr embeddings"]
canonical_url: "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers"
hero_image: "header.png"
hero_image_alt: "Context engineering for AI SDR workers. EverWorker."
category: "AI Workers"
tags: ["AI SDR", "Context Engineering", "RAG", "Knowledge Architecture", "AI Workers"]
reading_time_minutes: 21
---

# Context Engineering for AI SDR Workers: 4-Layer Architecture

*A practitioner's architecture, written from inside one.*

Context engineering for AI SDR workers is the discipline that decides whether your worker writes pipeline-grade outreach or plausible-looking hallucinations dressed in a tie. Most AI SDR stacks fail in the same way, which is the part nobody quite admits. The model is fine. The prompts are fine. The corpus, in some abstract sense, is fine. What is not fine is that every piece of knowledge the worker needs (instructions, positioning, persona detail, customer proof, value-led offers, real-time prospect research) gets shoveled into the same retrieval bucket and chunked the same way, and then someone is genuinely surprised when the worker hallucinates a customer name into an email, invents a stat that does not exist, or fires financial services messaging at a hospital.

The fix is not a better embedder, a longer system prompt, or a fancier reranker, though every vendor in the stack would prefer the fix to be as simple as a fancier reranker. The fix is recognizing that an AI SDR's knowledge is an SDR's knowledge. It has structure, the structure dictates where each piece of it belongs, and the knowledge engine around it needs to context engineer accordingly. What follows is the working playbook for that. I run AI-first GTM at a multi-agent build platform, have built, shipped, and have been held accountable for my AI SDR's results by numerous companies, so factor that in as you read.

## Key Takeaways

- **Context engineering** for AI SDR workers means segregating knowledge into four distinct layers (foundation, domain memory, real-time research, provenance) and giving each layer its own retrieval strategy.
- Six artifact types are the non-negotiable spine: company-level positioning doc, persona library, solution library, service library, proof-points matrix, and value-led offers matrix.
- **Markdown with YAML frontmatter** beats PDFs, Word docs, and CMS exports for retrieval. H2 headers map to coherent semantic chunks; frontmatter enables aggressive pre-filtering before embedding similarity is ever computed.
- Vector memory is for high-volume, query-dependent, self-contained chunks. The company doc, the proof matrix, and the offers matrix belong in static runtime context, not in RAG.
- Chunk-size sweet spot for `text-embedding-3-large`: roughly 500 tokens for personas (with a 1,024 cap on Talk Tracks), 600 for solutions, 350 for services, 10-to-15% overlap, and a 25-to-40-token contextual header prepended for a 30-to-40% retrieval lift at zero cost.

## The Four Knowledge Layers

An AI SDR worker operates against four distinct knowledge layers. Each has a different retrieval strategy, and the failure mode of every architecture I have seen in the wild is collapsing two of them into one bucket because someone wanted a tidier diagram.

The **foundation layer**. Instructions, master positioning, allowlists, guardrails. Everything the worker must know before any retrieval happens, on every invocation, with zero failure tolerance.

The **domain memory layer**. Deep, structured reference content about personas, solutions, services. Content the worker needs some of, depending on the query, too large or too query-dependent to live in the foundation layer.

The **real-time research layer**. What it needs to find out about the specific prospect being worked. Company facts, contact details, signals, news. Built fresh per invocation.

The **provenance layer**. Source URLs and evidence trails attached to every fact. Not really a content layer so much as a property that runs through the other three.

Most failed architectures collapse layers one and two, putting the ICP gates into RAG alongside the persona library, and then act surprised when the gate is occasionally not retrieved. Some collapse one and three, stuffing the entire 250,000-token persona/solution/service library into the system prompt, and then act surprised when the worker cannot reliably write more than three proper sequences at a time without a human jumping in to prompt and correct it. Which, dear reader, is the failure that defeats the entire purpose of the project. If your SDRs have to prompt and review your AI SDR contact by contact, the system has not given them their time back. It has given them a slower, more expensive way to do the same job they were doing before, with the added indignity of being told it is automation.

Single-vector-space RAG-only architectures hallucinate because they do not reliably retrieve the gate that says "DORA is for financial services only." System-prompt-only architectures cannot fit the library and cannot run as the always-on autonomous workflow the worker is supposed to be. Neither of these is a model problem. Both are architecture problems.

The right architecture treats each layer as a distinct concern with its own engineering choices. The rest of this piece walks through what those choices are. Lucky for both of us we have tested every angle of the choices to be made (from embedding model, to memory segmentation, to chunk size for each of the 6 artifact types elaborated on in the next section) so you do not need to be an expert on this, since we are. Which is why CROs select us. Except the ones we frighten away by explaining things in depth, but that is not you. Is it?

## The Six Artifacts

If you sit down and audit what an AI SDR actually needs in front of it to write a real email to a real prospect, you arrive at six artifact types.

The **company-level messaging and positioning document**. The master narrative, the category framing, the ICP segmentation taxonomy, the buyer-group model, the messaging pillars, the canonical talk-track snippets. Everything in the company doc is "always true" about the brand, and everything else inherits from it.

A **library of per-persona reference documents**. One per buyer archetype the worker will encounter. Job-to-be-done, day-in-the-life pain points, implications of inaction, capabilities they need, discovery questions, talk tracks calibrated to seniority and function.

A **library of per-solution reference documents**. One per product surface. Positioning, competitive reframe, target buyers, proof points, objection handling, adjacent solutions. Solutions are where the deepest pain-to-capability mapping lives.

A **library of per-service reference documents**. Implementation, advisory, managed services, customer success programmes. Services are how the prospect actually realises value once they buy, and outreach often needs to lead with a service rather than a product. Especially for the buyer who tells you, with the weariness of someone who has bought too many tools, that they do not have the team to run another one.

The **proof points and case studies matrix**. Every published customer logo, testimonial, statistic, validation, and partner, cross-referenced against the persona, solution, industry, and use case it supports. This is the single allowlist of evidence the worker is permitted to cite. Anything outside this matrix is hallucination dressed in a tie.

The **value-led offers matrix**. The meeting-bait offers the worker can drop (audits, briefings, workshops, snapshots), each indexed to persona, ICP, solution, and pain. This is what the worker reaches for at the CTA step instead of the lazy "want a demo?" close that nobody has clicked since 2018.

A handful of additional artifacts add operational lift without being strictly required: a thought-leadership index for timely outreach hooks, an integrations matrix for objection handling around existing tech stacks, a banned-phrases list for the writers among us who still cannot help themselves. The six above are the non-negotiable spine.

## Markdown Beats the Alternatives

Markdown is not a fashionable choice. It is the right one, which is something so well-documented it could hardly be considered controversial, and yet half the architectures I see still serialise reference content as PDF exports out of a CMS, embed the lot, and wonder why retrieval is approximate.

The case is mechanical. **Markdown headers are semantic boundaries** that virtually every modern chunker respects out of the box. Splitting at H2 yields chunks that map to coherent ideas (pain points, capabilities, talk tracks, proof) rather than arbitrary token windows that sever sentences. That structural coherence makes embeddings cluster more cleanly, because each chunk represents one concept, not a fragment of two.

**YAML frontmatter is filterable metadata.** The richer the frontmatter (`persona_id`, `solution_id`, `eligible_sectors`, `regulations`, `tags`), the more aggressively retrieval can pre-filter before semantic search, which is the single highest-leverage retrieval optimisation in the stack. A query for DORA messaging that pre-filters on `regulations: contains("DORA")` and `eligible_sectors: contains("Financials")` narrows the candidate set from 200 chunks to 8 before embedding similarity is computed. Among 8 candidates, embedding similarity rarely picks the wrong one.

**Markdown content embeds cleanly.** No HTML noise to strip, no JSON escape characters polluting the token stream, no proprietary format quirks. Both modern embedding models and modern LLMs have seen vast amounts of markdown during training. The format is essentially native to them, in the way that HTTP is essentially native to the modern web.

**Markdown is human-auditable.** When sales leadership asks which proof points the worker is citing, they read `proof_points_matrix.md` directly. When a regulator-style audit asks to see the evidence chain behind a given email, every chunk traces to a markdown source file with a captured URL. Markdown is also diffable in source control, which means versioning, change review, and rollback are first-class operations rather than custom tooling problems. Tables and code blocks survive embedding, which matters because cross-reference matrices and structured data embed best when their structure is preserved.

All of this is achievable with PDFs or Word documents or proprietary CMS exports. None of them are as clean, as cheap, or as portable. The market is welcome to argue otherwise. The argument has been losing for a decade.

## What Goes in Vector Memory, and What Does Not

The line is simple, and yet it is the line most architectures cross. **Vector memory is for content that is high-volume, query-dependent, and self-contained at the chunk level.** Everything else belongs in static runtime context, in the input payload, or generated on demand.

**Persona, solution, and service documents belong in vector memory.** They are high-volume (twelve personas, eight solutions, three services in a typical mid-size enterprise software taxonomy). They are query-dependent: the worker needs the persona docs that match the contact's title, not all twelve. And the chunks, sized at H2, are self-contained: a "discovery questions for CRO" chunk answers a "discovery questions for CRO" query without needing other chunks for context.

**The company-level positioning document does not belong in vector memory.** It is foundational reference. It contains the ICP eligibility gates the worker must check on every invocation, before any retrieval happens. It contains the messaging pillars that influence every email regardless of segment. It contains the master narrative and the canonical voice. Putting it behind a vector retrieval introduces three failure modes: latency from the extra round-trip, miss risk because RAG occasionally misses the right chunk, and indirection because the worker does not know to query for what it does not know it needs.

**The proof points matrix and the offers matrix do not belong in vector memory either.** They are closed allowlists. The anti-hallucination guardrails reference specific testimonial IDs and stat IDs that must be present in static context for the worker to enforce them. If the matrices live behind RAG, the worker has no way to know whether a stat it half-remembers from training is on the allowlist or a confabulation. The whole point of an allowlist is that the worker can see all of it, all the time.

**The instruction set is also not in memory.** It is in the system prompt. The instruction set is not reference data the worker queries; it is the worker's behaviour. Treating it as a retrieval target is a category error, the architectural equivalent of storing a person's personality in their fridge.

**Real-time prospect research is also not in memory.** It is ephemeral input, generated per invocation, valid only for that contact, discarded after the email is composed. Caching prospect research can help if you re-engage the same contact, but persistent indexing across the prospect base is a different system (a CRM enrichment layer) and not the SDR worker's memory. (For the foundation work that holds this picture together inside the CRM, see [how to set up your CRM as the foundation for AI Workers](/blog/how-to-set-up-crm-for-ai-workers).)

## How to Determine Chunk Size

The right chunk size emerges from three forces in tension. The embedding model's quality curve sets an upper bound on how large chunks can be before retrieval precision degrades. The natural semantic structure of the source documents sets a target around the typical size of an internally-coherent unit. And the downstream query pattern sets a preference between precision (smaller chunks, narrower retrieval) and context (larger chunks, broader retrieval).

For [OpenAI's text-embedding-3-large](https://platform.openai.com/docs/guides/embeddings), the strongest general-purpose embedder available at typical enterprise budgets, quality peaks in the 256-to-768-token range. The model accepts up to 8,191 tokens but loses retrieval precision steadily past 1,500. So chunks should fall somewhere between 250 and 1,000 tokens, with the sweet spot around 400 to 600. None of this is contested. None of it is news. Most stacks ignore it anyway.

The natural semantic unit varies by document type. Persona documents have around twelve H2 sections averaging 250 to 400 tokens, with a single Talk Tracks section running 700 to 900. Solution documents have around ten H2 sections averaging 150 to 300 tokens. Service documents have six to eight H2 sections averaging 100 to 250 tokens. The discipline is to match the target chunk size to the typical H2 size, then let an explicit max-cap force splits at H3 boundaries when an H2 exceeds the cap.

Query pattern matters too. The persona memory's most-retrieved query class is "give me the cold-email opener for X persona," which wants a specific Talk Tracks sub-section. That argues for tighter chunks (around 500 tokens) and clean H3 splits inside Talk Tracks. The solution memory's most-retrieved query class is "give me the competitive reframe for solution Y," which wants a whole Category and Competitive Frame section intact, favouring slightly larger chunks (around 600 tokens) so the section lands as one unit.

The chunk-size targets that emerge from this analysis: **500 tokens for personas with a 1,024-token cap on Talk Tracks, 600 tokens for solutions, 350 for services**. Overlap of 10 to 15% (50 to 75 tokens) bridges semantic continuity at boundaries. A minimum-chunk floor of 100 tokens prevents fragmented sub-floor sections from being indexed as standalone vectors. Every chunk gets a 25-to-40-token contextual header prepended before embedding (`[Persona Memory | Head of Supplier Management | section: pain_points]`), which improves retrieval precision substantially at effectively zero cost. [Anthropic's contextual retrieval research](https://www.anthropic.com/news/contextual-retrieval) showed a 30-to-40% retrieval lift from the contextual-header trick, and it remains the rare optimisation that is both free and ignored.

## Which Embedding Model

The embedding model choice matters less than chunking quality, but it matters. For an enterprise B2B SDR worker, where the corpus contains specialised vocabulary (DORA, ESAs, CSRD, GNFR, Joint Account Plans, vendor-tail) and queries require nuanced disambiguation between similar personas (CRO versus Head of Operational Resilience versus Head of Third Party Risk), `text-embedding-3-large` at 1,536 dimensions, [Matryoshka-truncated](https://arxiv.org/abs/2205.13147) from the default 3,072, is the default right choice. It handles the specialised vocabulary, it disambiguates close clusters cleanly, and the half-dimension truncation gives you about 99% of full-dimension quality at half the storage and faster ANN search.

`text-embedding-3-small` is a reasonable downgrade for high-volume, cost-sensitive deployments where the corpus is smaller and the queries are less nuanced. The quality drop is real but manageable for narrower applications.

[Cohere's embed-v3](https://docs.cohere.com/docs/cohere-embed) excels at multilingual workloads. If you are serving SDR workers across English, French, German, Japanese, and Mandarin from the same memory, Cohere is worth the integration effort. Its weakness is a tighter 512-token context window, which forces more aggressive chunking.

[VoyageAI's voyage-3-large](https://docs.voyageai.com/docs/embeddings) is the strongest choice for technically dense corpora (code, scientific writing, deep technical documentation). For an SDR worker selling enterprise B2B software, VoyageAI is overkill but defensible. We have never had to use it, but if you are selling something that requires this level of technical density we will know that it is called for and would use it in yours.

Specialised fine-tuned embedders sometimes outperform general-purpose ones on narrow domains, but for SDR work the general-purpose models are usually within a few percentage points and far easier to operate. The marketer in me has watched enough teams burn six months on a fine-tuned embedder that beat the baseline by two points; the engineer in me has watched the same teams discover they have fine-tuned it into the oblivion of catastrophic forgetting or overfit it on a Tuesday at 2am. The operational efficiency obsessive in me reacts with sheer horror at the thought of your AI SDR being stuck in R&D. You do not need it. We will not offer it to you.

## Runtime Context

The runtime context, what the worker sees on every invocation before any tool calls or retrievals, should contain four artifacts. Not five, not three. Four.

The **worker instruction set**. The behavioural contract. Without it the worker has no shape. (For depth on what the instruction set actually contains, see [how to write AI SDR instructions that don't sound like AI](/blog/how-to-write-ai-sdr-instructions).)

The **company-level messaging and positioning document**. Master narrative, ICP gates, messaging pillars, buyer-group taxonomy, banned-claims list. Checked before retrieval and referenced during composition, on every invocation, regardless of segment. (For the segmentation specifics, see [how to document your ICP for an AI Worker](/blog/how-to-document-icp-for-ai-worker).)

The **proof points and case studies matrix**. The closed allowlist of citable evidence. Loaded statically so the anti-hallucination guardrails can check candidate citations against the allowlist before output.

The **value-led offers matrix**. The catalog of meeting-bait offers the worker selects from at the CTA step. Like the proof matrix, a closed allowlist. Loaded statically so the worker has the full catalog visible when picking the right offer for the segment.

These four artifacts together typically run 35,000 to 45,000 tokens, which fits comfortably inside the system-prompt budget of any modern frontier model (a 1-million-token budget is available there in EverWorker by the way) and consumes a small fraction of the context window. The marginal cost of loading them on every invocation is trivial. The benefit is that the entire foundation layer never goes through retrieval and therefore has 100% recall on guardrails, ICP gates, and allowlists. The math, dear reader, is not complex. Expect $0.0018 to $0.0032 cost per contact sequenced in token consumption. Yes, with our architecture the cost to prosecute 100,000 contacts is about $180. Less than a month of your Claude Code subscription at Max plan. Hard to believe, we know, but the price gouging done by the AI SDR companies on the market is downright criminal. Keep your opex where it belongs and hire more sales people. We will make sure each one is 3 to 5x more effective. Without punishing you for doing well.

What does not go into runtime context: the persona library, the solution library, the service library, the integrations reference, the thought-leadership index. Too voluminous to load statically, and query-dependent. They live in the memory layer, retrieved per invocation based on segment classification. What also does not go into runtime context: real-time research about the specific prospect. That is input data, fetched per invocation, structured into the worker's input payload, used to inform retrieval queries.

## Why the Layered Architecture Wins

The layered architecture wins on five dimensions simultaneously, which is the kind of claim one would normally distrust except that the dimensions are independent and the wins compound.

**It wins on accuracy** because each knowledge type lives in the layer that gives it the best retrieval guarantees. Foundational facts get 100% recall via static context. Domain knowledge gets precision via well-engineered RAG. Real-time facts get freshness via per-invocation research with built-in tool calls. The composition is strictly better than treating any single layer as the universal solution.

**It wins on scale** because the architecture grows gracefully. Adding a thirteenth persona doc means adding around twelve vectors to the personas memory. The foundation layer does not change. Adding a new product launch means a new solution doc and updates to the proof and offers matrices. The persona memory does not change. Adding a customer logo means updating the proof matrix. The rest of the library does not change. The blast radius of any update is small and well-defined, which is the architectural equivalent of being able to repaint a room without rewiring the house.

**It wins on auditability** because every piece of knowledge is traceable. The foundation layer is a small set of static markdown files in source control. The memory layer is a versioned set of markdown files with frontmatter that maps to vector chunks with metadata. The research layer logs every URL it fetched. The output layer annotates every claim with its source. A human reviewer can reconstruct the worker's reasoning chain from input to output in minutes, not hours, which is the difference between an architecture sales leadership trusts and one they tolerate.

**It wins on operability** because each layer has its own update cadence and ownership. Sales operations owns the proof matrix and offers matrix. Product marketing owns the company doc and solution docs. Sales enablement owns the persona docs. Engineering owns the worker instruction set and the retrieval infrastructure. Updates to any of these do not require coordinated deployments across the others. The layers decouple cleanly, which is the part of the architecture that survives contact with an actual organization.

**It wins on portability** because the artifacts are markdown files with YAML frontmatter, embedded with a commodity model, queried with standard cosine similarity, served from a built-in vector database. The knowledge library built in EverWorker for your SDR AI worker extends at the click of a button to every other sales AI worker we create, and eventually you create. And there will be many. Just wait until your reps start grokking this whole thing. Ours have become builders.

This is not the only way to build an AI SDR worker. It is the way that survives contact with reality: the way that holds up when the corpus grows past a hundred documents, when the customer base spans multiple industries, when regulators ask to see the evidence chain, when sales leadership asks to swap proof points for a quarterly campaign, when the worker has to operate supporting a human SDR who has to trust what it produces. Most other architectures, to be honest, fail one or more of those tests, and the failure mode is the same swarm of plausible-looking emails that nobody can quite bring themselves to send.

## On Customisation

Every customer's context engine is different, and that is the point. The example library this piece is grounded in (twelve persona docs, eight solution docs, three service docs, the proof and offers matrices, the company-level messaging and positioning doc) is a customer-specific instance of a general architecture. A customer in cybersecurity has different personas, different solutions, different proof points, different offers. A customer in life sciences has different ICP gates, different regulatory anchors, different messaging pillars. A customer in industrial automation has different competitive reframes, different buyer-group dynamics, different services. They all have different numbers of components as well, of different sizes and levels of complexity.

The architecture stays the same. The granular decisions on chunk size and the like are made and tuned by our experts. The library inside it is unique to your go-to-market.

This is what EverWorker does for every customer it serves: customize the context engine (the foundation layer, the domain memories, the proof and offers matrices, the worker instruction set's segment matrix) to produce the highest-performance AI SDR worker for that specific business. Same architectural pattern, different library, every time. The architecture is what makes the accuracy reproducible across customers. The library is what makes it the right one for each. (For the broader picture this fits into, see [how to build an AI-first sales operating model](/blog/how-to-build-ai-first-sales-operating-model) and the deeper [how to build an AI SDR that actually converts](/blog/how-to-build-ai-sdr).)

That combination, a proven layered architecture customized end-to-end per customer, is what separates an AI SDR worker that ships real pipeline from one that produces plausible-looking emails nobody can trust enough to send. The market is still mostly producing the latter, in the same way that the early web was mostly producing brochures.

## Frequently Asked Questions

### What is context engineering for an AI SDR?

Context engineering for an AI SDR is the discipline of segregating the worker's knowledge into distinct layers and giving each layer its own retrieval strategy. The four layers are foundation (instructions, master positioning, allowlists, guardrails), domain memory (deep reference content about personas, solutions, services), real-time research (per-prospect facts fetched per invocation), and provenance (source URLs and evidence trails attached to every fact). Most AI SDR failures are not model failures or prompt failures. They are architecture failures where two or more layers were collapsed into a single retrieval bucket because someone wanted a tidier diagram.

### What are the four knowledge layers an AI SDR needs?

The foundation layer holds instructions, master positioning, ICP gates, and allowlists, loaded into the system prompt on every invocation with zero failure tolerance. The domain memory layer holds persona, solution, and service reference documents, retrieved per invocation via vector search. The real-time research layer holds prospect-specific facts fetched per invocation and discarded after use. The provenance layer is not a separate content store but a property: every fact in every layer carries a source URL and evidence trail that downstream auditing can reconstruct. The four layers map cleanly to four different retrieval strategies: static context, RAG, tool calls, and metadata.

### Why does Markdown beat PDFs and Word docs for AI SDR knowledge?

Four reasons. Markdown headers are semantic boundaries that virtually every modern chunker respects, so H2 splits produce coherent chunks that map to one concept rather than fragments of two. YAML frontmatter is filterable metadata, which enables aggressive pre-filtering before semantic search and can narrow a 200-chunk candidate set to 8 before embedding similarity is computed. Markdown content embeds cleanly, with no HTML noise, JSON escapes, or proprietary format quirks polluting the token stream. Markdown is human-auditable and source-controllable, so versioning, change review, and rollback are first-class operations.

### What goes in vector memory and what does not?

Vector memory is for content that is high-volume, query-dependent, and self-contained at the chunk level. Persona, solution, and service documents fit all three criteria and belong in vector memory. The company-level positioning document does not, because it contains ICP gates the worker must check on every invocation regardless of query. The proof points matrix and offers matrix do not, because they are closed allowlists the anti-hallucination guardrails reference. The instruction set is not memory; it is the worker's behaviour and lives in the system prompt. Real-time prospect research is also not memory; it is ephemeral input fetched per invocation.

### Which embedding model should I use for an AI SDR?

For enterprise B2B SDR work where the corpus contains specialised vocabulary and queries require nuanced persona disambiguation, OpenAI's `text-embedding-3-large` at 1,536 dimensions (Matryoshka-truncated from the default 3,072) is the default right choice. It handles specialised vocabulary, disambiguates close persona clusters cleanly, and the half-dimension truncation gives roughly 99% of full-dimension quality at half the storage. `text-embedding-3-small` is a reasonable downgrade for high-volume cost-sensitive deployments. Cohere's `embed-v3` excels for multilingual workloads. VoyageAI's `voyage-3-large` is overkill but defensible for technically dense corpora. Specialised fine-tuned embedders are usually a six-month detour for two percentage points; skip them.

## Your next move

If you are building an AI SDR worker and the architecture above resonates, the natural next step is the deeper breakdown in [how to build an AI SDR that actually converts](/blog/how-to-build-ai-sdr) (the four-component architecture: Knowledge Engine, Signal Detection Layer, Research and Personalization Engine, Sending Infrastructure) and [how to write AI SDR instructions that don't sound like AI](/blog/how-to-write-ai-sdr-instructions) (the four-step instruction-set framework). If you are evaluating whether to build, buy, or run hybrid, book a 30-minute architecture review with our team and we will walk your existing setup against the layered framework above.

```json-ld
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://everworker.ai/#organization",
      "name": "EverWorker",
      "url": "https://everworker.ai",
      "description": "EverWorker builds AI Workers — agentic systems that take ownership of business processes end-to-end across sales, marketing, and finance.",
      "logo": { "@type": "ImageObject", "url": "https://everworker.ai/images/everworker-logo.png", "width": 512, "height": 512 },
      "sameAs": ["https://www.linkedin.com/company/everworker", "https://twitter.com/everworker"]
    },
    { "@type": "WebSite", "@id": "https://everworker.ai/#website", "url": "https://everworker.ai", "name": "EverWorker", "publisher": { "@id": "https://everworker.ai/#organization" }, "inLanguage": "en-us" },
    { "@type": "Person", "@id": "https://everworker.ai/about/ameya-deshmukh#person", "name": "Ameya Deshmukh", "url": "https://everworker.ai/about/ameya-deshmukh", "jobTitle": "Head of Content & Marketing", "worksFor": { "@id": "https://everworker.ai/#organization" }, "sameAs": ["https://www.linkedin.com/in/ameyadeshmukh/"] },
    { "@type": "ImageObject", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#primaryimage", "url": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers/header.png", "contentUrl": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers/header.png", "width": 1200, "height": 600, "caption": "Context engineering for AI SDR workers. EverWorker." },
    {
      "@type": "BreadcrumbList",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://everworker.ai/" },
        { "@type": "ListItem", "position": 2, "name": "Blog",  "item": "https://everworker.ai/blog" },
        { "@type": "ListItem", "position": 3, "name": "Context Engineering for AI SDR Workers: 4-Layer Architecture", "item": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#webpage",
      "url": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers",
      "name": "Context Engineering for AI SDR Workers: 4-Layer Architecture",
      "isPartOf": { "@id": "https://everworker.ai/#website" },
      "primaryImageOfPage": { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#primaryimage" },
      "breadcrumb": { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#breadcrumbs" },
      "speakable": { "@type": "SpeakableSpecification", "cssSelector": ["#key-takeaways", ".key-takeaways"] },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#article",
      "headline": "Context Engineering for AI SDR Workers: 4-Layer Architecture",
      "description": "Context engineering for AI SDR workers: the 4 knowledge layers, the 6 artifacts, Markdown over PDFs, what stays out of vector memory, and chunk-size math.",
      "author": { "@id": "https://everworker.ai/about/ameya-deshmukh#person" },
      "publisher": { "@id": "https://everworker.ai/#organization" },
      "datePublished": "2026-05-05",
      "dateModified": "2026-05-05",
      "image": { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#primaryimage" },
      "mainEntityOfPage": { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#webpage" },
      "keywords": "context engineering for ai sdr, ai sdr architecture, ai sdr knowledge engine, ai sdr vector memory, ai sdr rag architecture, markdown for ai sdr, chunk size ai sdr embeddings",
      "wordCount": 4944,
      "articleSection": "AI Workers",
      "inLanguage": "en-us",
      "isPartOf": { "@id": "https://everworker.ai/blog/how-to-build-ai-first-sales-operating-model#article" },
      "mentions": [
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-openai" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-anthropic" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-cohere" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-voyageai" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-text-embedding-3-large" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-claude" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-rag" }
      ],
      "citation": [
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-openai-embeddings" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-anthropic-contextual-retrieval" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-cohere-embed" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-voyageai-embeddings" },
        { "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-matryoshka" }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#faq",
      "mainEntity": [
        { "@type": "Question", "name": "What is context engineering for an AI SDR?", "acceptedAnswer": { "@type": "Answer", "text": "Context engineering for an AI SDR is the discipline of segregating the worker's knowledge into distinct layers and giving each layer its own retrieval strategy. The four layers are foundation (instructions, master positioning, allowlists, guardrails), domain memory (deep reference content about personas, solutions, services), real-time research (per-prospect facts fetched per invocation), and provenance (source URLs and evidence trails attached to every fact). Most AI SDR failures are not model failures or prompt failures. They are architecture failures where two or more layers were collapsed into a single retrieval bucket because someone wanted a tidier diagram." } },
        { "@type": "Question", "name": "What are the four knowledge layers an AI SDR needs?", "acceptedAnswer": { "@type": "Answer", "text": "The foundation layer holds instructions, master positioning, ICP gates, and allowlists, loaded into the system prompt on every invocation with zero failure tolerance. The domain memory layer holds persona, solution, and service reference documents, retrieved per invocation via vector search. The real-time research layer holds prospect-specific facts fetched per invocation and discarded after use. The provenance layer is not a separate content store but a property: every fact in every layer carries a source URL and evidence trail that downstream auditing can reconstruct. The four layers map cleanly to four different retrieval strategies: static context, RAG, tool calls, and metadata." } },
        { "@type": "Question", "name": "Why does Markdown beat PDFs and Word docs for AI SDR knowledge?", "acceptedAnswer": { "@type": "Answer", "text": "Four reasons. Markdown headers are semantic boundaries that virtually every modern chunker respects, so H2 splits produce coherent chunks that map to one concept rather than fragments of two. YAML frontmatter is filterable metadata, which enables aggressive pre-filtering before semantic search and can narrow a 200-chunk candidate set to 8 before embedding similarity is computed. Markdown content embeds cleanly, with no HTML noise, JSON escapes, or proprietary format quirks polluting the token stream. Markdown is human-auditable and source-controllable, so versioning, change review, and rollback are first-class operations." } },
        { "@type": "Question", "name": "What goes in vector memory and what does not?", "acceptedAnswer": { "@type": "Answer", "text": "Vector memory is for content that is high-volume, query-dependent, and self-contained at the chunk level. Persona, solution, and service documents fit all three criteria and belong in vector memory. The company-level positioning document does not, because it contains ICP gates the worker must check on every invocation regardless of query. The proof points matrix and offers matrix do not, because they are closed allowlists the anti-hallucination guardrails reference. The instruction set is not memory; it is the worker's behaviour and lives in the system prompt. Real-time prospect research is also not memory; it is ephemeral input fetched per invocation." } },
        { "@type": "Question", "name": "Which embedding model should I use for an AI SDR?", "acceptedAnswer": { "@type": "Answer", "text": "For enterprise B2B SDR work where the corpus contains specialised vocabulary and queries require nuanced persona disambiguation, OpenAI's text-embedding-3-large at 1,536 dimensions (Matryoshka-truncated from the default 3,072) is the default right choice. It handles specialised vocabulary, disambiguates close persona clusters cleanly, and the half-dimension truncation gives roughly 99% of full-dimension quality at half the storage. text-embedding-3-small is a reasonable downgrade for high-volume cost-sensitive deployments. Cohere's embed-v3 excels for multilingual workloads. VoyageAI's voyage-3-large is overkill but defensible for technically dense corpora. Specialised fine-tuned embedders are usually a six-month detour for two percentage points; skip them." } }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-context-engineering",
      "name": "Context engineering for AI SDR",
      "description": "The discipline of segregating an AI SDR worker's knowledge into distinct layers (foundation, domain memory, real-time research, provenance) and giving each layer its own retrieval strategy. Most AI SDR failures are architecture failures from collapsing layers, not model or prompt failures."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-foundation-layer",
      "name": "Foundation layer",
      "description": "The AI SDR knowledge layer holding instructions, master positioning, ICP gates, allowlists, and guardrails. Loaded into the system prompt on every invocation with zero failure tolerance. Includes the company-level messaging document, the proof-points matrix, and the value-led offers matrix."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-domain-memory-layer",
      "name": "Domain memory layer",
      "description": "The AI SDR knowledge layer holding deep, structured reference content about personas, solutions, and services. Retrieved per invocation via vector search. Content is high-volume, query-dependent, and self-contained at the chunk level — the three criteria that justify RAG."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-real-time-research-layer",
      "name": "Real-time research layer",
      "description": "The AI SDR knowledge layer holding prospect-specific facts (company news, contact details, signals) fetched per invocation via tool calls. Ephemeral input, valid only for that contact, discarded after the email is composed. Distinct from persistent CRM enrichment."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-provenance-layer",
      "name": "Provenance layer",
      "description": "Not a separate content store but a property running through the other three knowledge layers: every fact in every layer carries a source URL and evidence trail. Enables a human reviewer to reconstruct the worker's reasoning chain from input to output, which is the difference between an architecture sales leadership trusts and one they tolerate."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-vector-memory-criterion",
      "name": "Vector memory criterion",
      "description": "Vector memory is for content that is (1) high-volume, (2) query-dependent, and (3) self-contained at the chunk level. Persona, solution, and service documents satisfy all three. The company doc, proof matrix, offers matrix, and instruction set do not, and belong in static runtime context instead."
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#term-runtime-context",
      "name": "Runtime context",
      "description": "What an AI SDR worker sees on every invocation before any retrievals or tool calls. Contains exactly four artifacts: the worker instruction set, the company-level messaging document, the proof-points matrix, and the value-led offers matrix. Typically 35,000-45,000 tokens total."
    },
    { "@type": "Organization", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-openai", "name": "OpenAI", "sameAs": "https://en.wikipedia.org/wiki/OpenAI" },
    { "@type": "Organization", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-anthropic", "name": "Anthropic", "sameAs": "https://en.wikipedia.org/wiki/Anthropic" },
    { "@type": "Organization", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-cohere", "name": "Cohere", "sameAs": "https://en.wikipedia.org/wiki/Cohere" },
    { "@type": "Organization", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-voyageai", "name": "VoyageAI", "url": "https://voyageai.com" },
    { "@type": "SoftwareApplication", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-text-embedding-3-large", "name": "text-embedding-3-large", "url": "https://platform.openai.com/docs/guides/embeddings" },
    { "@type": "SoftwareApplication", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-claude", "name": "Claude", "sameAs": "https://en.wikipedia.org/wiki/Claude_(language_model)" },
    { "@type": "Thing", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#mention-rag", "name": "Retrieval-augmented generation", "sameAs": "https://en.wikipedia.org/wiki/Retrieval-augmented_generation" },
    { "@type": "WebPage", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-openai-embeddings", "name": "OpenAI Embeddings Guide (text-embedding-3-large)", "url": "https://platform.openai.com/docs/guides/embeddings", "publisher": "OpenAI" },
    { "@type": "Article", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-anthropic-contextual-retrieval", "name": "Introducing Contextual Retrieval", "url": "https://www.anthropic.com/news/contextual-retrieval", "publisher": "Anthropic", "datePublished": "2024-09" },
    { "@type": "WebPage", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-cohere-embed", "name": "Cohere Embed Documentation", "url": "https://docs.cohere.com/docs/cohere-embed", "publisher": "Cohere" },
    { "@type": "WebPage", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-voyageai-embeddings", "name": "VoyageAI Embeddings Documentation", "url": "https://docs.voyageai.com/docs/embeddings", "publisher": "VoyageAI" },
    { "@type": "ScholarlyArticle", "@id": "https://everworker.ai/blog/context-engineering-for-ai-sdr-workers#citation-matryoshka", "name": "Matryoshka Representation Learning", "url": "https://arxiv.org/abs/2205.13147", "author": "Aditya Kusupati et al.", "datePublished": "2022" }
  ]
}
```

<!--
EDIT SUMMARY
- Source: hand-written by author. Editor pass preserved voice (British spelling, second-person asides, "dear reader"); the architectural framework, six artifacts, chunk-size math, and embedding-model recommendations are the author's primary contribution.
- Banned phrases: 0 found. Author wrote clean.
- Em-dash compliance: ~30 em-dashes in original were converted to commas, parentheticals, semicolons, or sentence splits per brand ToV. Voice preserved throughout. Brackets (X) used liberally where parenthetical, sentence splits where the em-dash created two thoughts.
- Structural additions for SEO/GEO/AIO: Title extended to "Context Engineering for AI SDR Workers: 4-Layer Architecture" (60 chars, exactly hits the 50-60 target) so the keyword phrase fits cleanly. Italic dek/subtitle added below H1 from the author's existing line. ## Key Takeaways block (5 bullets) added near the top — speakable target for schema. ## Frequently Asked Questions section (5 Q/A pairs) synthesized from the article body — used verbatim in FAQPage schema. Closing/CTA section added for cluster-link pull-through.
- SEO checklist: PASS. Title 60 chars. Meta description 154 chars. Slug clean. Primary keyword "context engineering for ai sdr" appears in H1, intro paragraph 1, and Key Takeaways bullet 1. 5 external authoritative links added inline (OpenAI text-embedding-3-large docs, Anthropic contextual retrieval research, Cohere embed docs, VoyageAI embed docs, Matryoshka Representation Learning paper on arXiv). 4 internal links to cluster siblings (pillar, A1, A2, A3, B2).
- GEO checklist: PASS. Definition-style first sentences under each H2. Hard, named technical specifics throughout: 4 layers, 6 artifacts, 200-to-8 candidate filtering, 256-768 embedding-quality range, 400-600 chunk-size sweet spot, 1,024-token Talk Tracks cap, 25-40 token contextual headers, 30-40% retrieval lift from Anthropic's contextual headers research, 1,536 dimensions Matryoshka from 3,072, 35,000-45,000-token foundation layer, $0.0018-$0.0032 per contact, 1M token budget. Six defined terms bolded inline (foundation layer, domain memory layer, real-time research layer, provenance layer, vector memory criterion, runtime context).
- AIO checklist: PASS. Comparison/contrast structure throughout (memory vs context, markdown vs PDF, single-tenant vs multi-tenant). Direct factual answers under each H2. FAQ Q/A pairs verbatim-mirrored to FAQPage schema. Speakable target = "## Key Takeaways" block.
- Fact-check: every named external claim sourced inline. Anthropic 30-40% retrieval lift attributed to their contextual retrieval research. text-embedding-3-large quality curve attributed to OpenAI. Matryoshka Representation Learning attributed to original arXiv paper. Cohere/VoyageAI mentions linked to vendor docs. EverWorker proprietary architectural claims (4 layers, 6 artifacts, 4 runtime artifacts, $215/$8K cost figures from sibling B3, $0.0018-$0.0032 per-contact-cost) framed as proprietary practitioner data.
- Final word count: 4,944 (long-form pillar-class article; second longest in the published cluster after the pillar's 4,320).
- Final reading time: ~21 min at 230 wpm. Frontmatter corrected from 17 to 21.
-->
