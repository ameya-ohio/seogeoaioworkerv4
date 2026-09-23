# Schema Spec — JSON-LD Reference

> **All example values below are fictional** (`example.com` / “Example Co” / “Jane Author”). At build time the Schema Builder fills the real company, author, organization, breadcrumb, and locale values from `config/company.yaml`.

The Schema Builder agent uses this document as its bible. Every required schema type, its required and recommended properties, and a code example. The full example `@graph` at the end shows how the types nest.

All examples use `@context: "https://schema.org"`.

---

## BlogPosting

The article itself.

**Required**
- `@type`
- `@id` — `<canonical_url>#article`
- `headline` — the article H1
- `author` — reference to the `Person` node by `@id`
- `datePublished` — ISO 8601 (`YYYY-MM-DD`)
- `image` — reference to the `ImageObject` node by `@id`
- `publisher` — reference to the `Organization` node by `@id`
- `mainEntityOfPage` — reference to the `WebPage` node by `@id`

**Recommended**
- `description` — the meta description
- `dateModified` — ISO 8601
- `keywords` — comma-separated string OR array; primary + secondary keywords
- `wordCount` — integer
- `articleSection` — category (e.g. "AI Workers", "Agentic Operations")
- `inLanguage` — `blog.locale` from `config/company.yaml`
- `mentions` — array of `Thing` nodes referencing key entities (each with `name` and ideally `sameAs`)
- `citation` — array of `CreativeWork` nodes referencing external sources used

**Example**

```json
{
  "@type": "BlogPosting",
  "@id": "https://example.com/blog/agentic-procurement#article",
  "headline": "How Agentic Procurement Replaces the RFP Cycle",
  "description": "Agentic procurement compresses the RFP cycle from months to days. Here's how leading enterprise teams are deploying AI workers across the procure-to-pay process in 2026.",
  "author": { "@id": "https://example.com/about/jane-author#person" },
  "publisher": { "@id": "https://example.com/#organization" },
  "datePublished": "2026-04-29",
  "dateModified": "2026-04-29",
  "image": { "@id": "https://example.com/blog/agentic-procurement#primaryimage" },
  "mainEntityOfPage": { "@id": "https://example.com/blog/agentic-procurement#webpage" },
  "keywords": "agentic procurement, ai workers in procurement, ai procure-to-pay",
  "wordCount": 1820,
  "articleSection": "AI Workers",
  "inLanguage": "en-us",
  "mentions": [
    { "@id": "https://example.com/blog/agentic-procurement#mention-coupa" },
    { "@id": "https://example.com/blog/agentic-procurement#mention-sap-ariba" }
  ],
  "citation": [
    { "@id": "https://example.com/blog/agentic-procurement#citation-mckinsey-2025" }
  ]
}
```

---

## Person

The author.

**Required**
- `@type`
- `@id` — `https://example.com/about/<author-slug>#person`
- `name`

**Recommended**
- `url` — the author bio page on the site
- `image` — author headshot URL or `ImageObject` reference
- `jobTitle`
- `worksFor` — reference to the `Organization` by `@id`
- `sameAs` — array of canonical-identity URLs: LinkedIn, X/Twitter, personal site, Wikipedia/Wikidata if applicable

**`sameAs` guidance**
- Always include LinkedIn for B2B authors.
- Include Twitter/X if the author posts publicly.
- Include personal site if one exists.
- Include Wikipedia/Wikidata only if a real entry exists — never guess.

**Example**

```json
{
  "@type": "Person",
  "@id": "https://example.com/about/jane-author#person",
  "name": "Jane Author",
  "url": "https://example.com/about/jane-author",
  "image": "https://example.com/images/team/jane-author.jpg",
  "jobTitle": "Head of Content & Marketing",
  "worksFor": { "@id": "https://example.com/#organization" },
  "sameAs": [
    "https://www.linkedin.com/in/jane-author/",
    "https://twitter.com/jane-author"
  ]
}
```

---

## Organization

The publisher — the company from `config/company.yaml`.

**Required**
- `@type`
- `@id` — `https://example.com/#organization`
- `name`
- `url`
- `logo` — embedded `ImageObject` (with `url`, `width`, `height`)

**Recommended**
- `sameAs` — array of canonical-identity URLs: LinkedIn company page, X/Twitter, GitHub, Crunchbase, etc.
- `description` — one-sentence company description

**Example**

```json
{
  "@type": "Organization",
  "@id": "https://example.com/#organization",
  "name": "Example Co",
  "url": "https://example.com",
  "description": "Example Co builds widgets that do the work.",
  "logo": {
    "@type": "ImageObject",
    "url": "https://example.com/images/example-co-logo.png",
    "width": 512,
    "height": 512
  },
  "sameAs": [
    "https://www.linkedin.com/company/example",
    "https://twitter.com/example"
  ]
}
```

---

## BreadcrumbList

Navigation context.

**Required**
- `@type`
- `@id` — `<canonical_url>#breadcrumbs`
- `itemListElement` — array of `ListItem`, each with `position`, `name`, `item` (URL)

**Example**

```json
{
  "@type": "BreadcrumbList",
  "@id": "https://example.com/blog/agentic-procurement#breadcrumbs",
  "itemListElement": [
    { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://example.com/" },
    { "@type": "ListItem", "position": 2, "name": "Blog",  "item": "https://example.com/blog" },
    { "@type": "ListItem", "position": 3, "name": "How Agentic Procurement Replaces the RFP Cycle", "item": "https://example.com/blog/agentic-procurement" }
  ]
}
```

---

## FAQPage

The article's FAQ section, structured.

**Required**
- `@type`
- `@id` — `<canonical_url>#faq`
- `mainEntity` — array of `Question`, each with `name` (the question text) and `acceptedAnswer` of type `Answer` with `text`

**Verbatim rule:** the question text in JSON-LD must match the H3 in the article exactly; the answer `text` must match the answer prose exactly.

**Example**

```json
{
  "@type": "FAQPage",
  "@id": "https://example.com/blog/agentic-procurement#faq",
  "mainEntity": [
    {
      "@type": "Question",
      "name": "What is agentic procurement?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Agentic procurement is the use of AI workers to take ownership of procurement processes end-to-end — from supplier discovery and RFP generation to contract negotiation and PO issuance — with humans approving rather than executing each step."
      }
    },
    {
      "@type": "Question",
      "name": "How does agentic procurement differ from procurement automation?",
      "acceptedAnswer": {
        "@type": "Answer",
        "text": "Traditional procurement automation handles narrow rule-based steps. Agentic procurement gives an AI worker a goal and the autonomy to plan, act, and adapt across the procure-to-pay flow."
      }
    }
  ]
}
```

---

## SpeakableSpecification (inside WebPage)

Marks the section voice assistants and AI engines should treat as speakable.

**Required**
- `@type` — `SpeakableSpecification`
- One of:
  - `cssSelector` — array of CSS selectors
  - `xpath` — array of XPath strings

**Use it inside the WebPage node:**

```json
{
  "@type": "WebPage",
  "@id": "https://example.com/blog/agentic-procurement#webpage",
  "url": "https://example.com/blog/agentic-procurement",
  "name": "How Agentic Procurement Replaces the RFP Cycle",
  "isPartOf": { "@id": "https://example.com/#website" },
  "primaryImageOfPage": { "@id": "https://example.com/blog/agentic-procurement#primaryimage" },
  "speakable": {
    "@type": "SpeakableSpecification",
    "cssSelector": ["#key-takeaways", ".key-takeaways"]
  }
}
```

---

## DefinedTerm

Each inline-defined term in the body.

**Required**
- `@type`
- `@id` — `<canonical_url>#term-<slug>`
- `name` — the term
- `description` — the definition

**Recommended**
- `inDefinedTermSet` — `@id` of a `DefinedTermSet` if you keep a glossary

**Example**

```json
{
  "@type": "DefinedTerm",
  "@id": "https://example.com/blog/agentic-procurement#term-agentic-procurement",
  "name": "Agentic procurement",
  "description": "The use of AI workers to take ownership of procurement processes end-to-end, from supplier discovery to PO issuance, with humans approving rather than executing each step."
}
```

---

## ImageObject

The hero image (and any other named images).

**Required**
- `@type`
- `@id`
- `url`

**Recommended**
- `width` and `height` (integers, in pixels)
- `caption`
- `contentUrl` (often equal to `url`)

**Example**

```json
{
  "@type": "ImageObject",
  "@id": "https://example.com/blog/agentic-procurement#primaryimage",
  "url": "https://example.com/images/blog/agentic-procurement-hero.webp",
  "contentUrl": "https://example.com/images/blog/agentic-procurement-hero.webp",
  "width": 1600,
  "height": 900,
  "caption": "A hero illustration for the agentic procurement article."
}
```

---

## mentions (array on BlogPosting)

Each item is a `Thing` (or a more specific subtype: `Person`, `Organization`, `Product`, `SoftwareApplication`, `Place`, etc.).

**Required per entry**
- `@type`
- `name`

**Strongly recommended**
- `sameAs` — Wikipedia/Wikidata URL or canonical official URL

**Example entry**

```json
{
  "@type": "Organization",
  "@id": "https://example.com/blog/agentic-procurement#mention-sap-ariba",
  "name": "SAP Ariba",
  "sameAs": "https://en.wikipedia.org/wiki/Ariba_Network"
}
```

---

## citation (array on BlogPosting)

Each external source the article actually uses.

**Required per entry**
- `@type` — `CreativeWork`, `ScholarlyArticle`, `NewsArticle`, `Report`, etc., as appropriate
- `@id`
- `name` — title of the source
- `url`

**Recommended**
- `author` — string or `Person`
- `datePublished`
- `publisher` — string or `Organization`

**Example entry**

```json
{
  "@type": "Report",
  "@id": "https://example.com/blog/agentic-procurement#citation-mckinsey-2025",
  "name": "The state of AI in 2025: Generative AI's breakout year",
  "url": "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai",
  "author": "McKinsey & Company",
  "datePublished": "2025-05-30",
  "publisher": "McKinsey & Company"
}
```

---

## Complete example `@graph`

A minimal-but-complete graph for one article. The Schema Builder produces something shaped like this for every article:

```json
{
  "@context": "https://schema.org",
  "@graph": [
    {
      "@type": "Organization",
      "@id": "https://example.com/#organization",
      "name": "Example Co",
      "url": "https://example.com",
      "logo": {
        "@type": "ImageObject",
        "url": "https://example.com/images/example-co-logo.png",
        "width": 512,
        "height": 512
      },
      "sameAs": [
        "https://www.linkedin.com/company/example",
        "https://twitter.com/example"
      ]
    },
    {
      "@type": "WebSite",
      "@id": "https://example.com/#website",
      "url": "https://example.com",
      "name": "Example Co",
      "publisher": { "@id": "https://example.com/#organization" },
      "inLanguage": "en-us"
    },
    {
      "@type": "Person",
      "@id": "https://example.com/about/jane-author#person",
      "name": "Jane Author",
      "url": "https://example.com/about/jane-author",
      "jobTitle": "Head of Content & Marketing",
      "worksFor": { "@id": "https://example.com/#organization" },
      "sameAs": [
        "https://www.linkedin.com/in/jane-author/"
      ]
    },
    {
      "@type": "ImageObject",
      "@id": "https://example.com/blog/agentic-procurement#primaryimage",
      "url": "https://example.com/images/blog/agentic-procurement-hero.webp",
      "width": 1600,
      "height": 900,
      "caption": "A hero illustration for the agentic procurement article."
    },
    {
      "@type": "BreadcrumbList",
      "@id": "https://example.com/blog/agentic-procurement#breadcrumbs",
      "itemListElement": [
        { "@type": "ListItem", "position": 1, "name": "Home",  "item": "https://example.com/" },
        { "@type": "ListItem", "position": 2, "name": "Blog",  "item": "https://example.com/blog" },
        { "@type": "ListItem", "position": 3, "name": "How Agentic Procurement Replaces the RFP Cycle", "item": "https://example.com/blog/agentic-procurement" }
      ]
    },
    {
      "@type": "WebPage",
      "@id": "https://example.com/blog/agentic-procurement#webpage",
      "url": "https://example.com/blog/agentic-procurement",
      "name": "How Agentic Procurement Replaces the RFP Cycle",
      "isPartOf": { "@id": "https://example.com/#website" },
      "primaryImageOfPage": { "@id": "https://example.com/blog/agentic-procurement#primaryimage" },
      "breadcrumb": { "@id": "https://example.com/blog/agentic-procurement#breadcrumbs" },
      "speakable": {
        "@type": "SpeakableSpecification",
        "cssSelector": ["#key-takeaways", ".key-takeaways"]
      },
      "inLanguage": "en-us"
    },
    {
      "@type": "BlogPosting",
      "@id": "https://example.com/blog/agentic-procurement#article",
      "headline": "How Agentic Procurement Replaces the RFP Cycle",
      "description": "Agentic procurement compresses the RFP cycle from months to days. Here's how leading enterprise teams are deploying AI workers across the procure-to-pay process in 2026.",
      "author": { "@id": "https://example.com/about/jane-author#person" },
      "publisher": { "@id": "https://example.com/#organization" },
      "datePublished": "2026-04-29",
      "dateModified": "2026-04-29",
      "image": { "@id": "https://example.com/blog/agentic-procurement#primaryimage" },
      "mainEntityOfPage": { "@id": "https://example.com/blog/agentic-procurement#webpage" },
      "keywords": "agentic procurement, ai workers in procurement, ai procure-to-pay",
      "wordCount": 1820,
      "articleSection": "AI Workers",
      "inLanguage": "en-us",
      "mentions": [
        {
          "@type": "Organization",
          "@id": "https://example.com/blog/agentic-procurement#mention-sap-ariba",
          "name": "SAP Ariba",
          "sameAs": "https://en.wikipedia.org/wiki/Ariba_Network"
        }
      ],
      "citation": [
        {
          "@type": "Report",
          "@id": "https://example.com/blog/agentic-procurement#citation-mckinsey-2025",
          "name": "The state of AI in 2025: Generative AI's breakout year",
          "url": "https://www.mckinsey.com/capabilities/quantumblack/our-insights/the-state-of-ai",
          "author": "McKinsey & Company",
          "datePublished": "2025-05-30",
          "publisher": "McKinsey & Company"
        }
      ]
    },
    {
      "@type": "FAQPage",
      "@id": "https://example.com/blog/agentic-procurement#faq",
      "mainEntity": [
        {
          "@type": "Question",
          "name": "What is agentic procurement?",
          "acceptedAnswer": {
            "@type": "Answer",
            "text": "Agentic procurement is the use of AI workers to take ownership of procurement processes end-to-end — from supplier discovery and RFP generation to contract negotiation and PO issuance — with humans approving rather than executing each step."
          }
        }
      ]
    },
    {
      "@type": "DefinedTerm",
      "@id": "https://example.com/blog/agentic-procurement#term-agentic-procurement",
      "name": "Agentic procurement",
      "description": "The use of AI workers to take ownership of procurement processes end-to-end, from supplier discovery to PO issuance, with humans approving rather than executing each step."
    }
  ]
}
```

The Schema Builder must produce a graph with all of the types above. If a property is genuinely unknown for the article, mark a placeholder rather than skipping the type — the Audit will surface it.
