import { MongoMemoryServer } from "mongodb-memory-server";
import { afterAll, beforeAll, describe, expect, it } from "vitest";
import { connect, createArticle, type EngineDb } from "@blogagent/engine";
import type { ObjectId } from "mongodb";
import type { LlmClient, LlmRequest, LlmResponse } from "./llm.js";
import { LiveCitationVerifier, LiveLinkChecker, htmlToText, type PageFetcher } from "./quality.js";

/**
 * D34/D35 verification logic with fake pages and a fake judge — including a
 * replay of the exact Session-14 failure: a SpecterOps stat cited to a Quest
 * product page that never states it.
 */

const NOTES = `# Research Notes

## Authoritative Sources
1. **Attack Path Management** — SpecterOps via Quest, 2026. https://quest.example.com/apm-product
   Key claim: Over 70% of AD environments contain an exploitable path to Domain Admin
2. **Cost of a Data Breach 2026** — IBM, 2026. https://ibm.example.com/report
   Key claim: Healthcare breaches averaged $6.64M in 2026
3. **Tier model** — Microsoft, 2026. https://ms.example.com/tier-model
4. **Dead page** — Gone Inc, 2026. https://gone.example.com/404

## Statistics & Data Points
- ~17,000 attack paths severed per choke point — Source #1
- Healthcare breach cost $6.64M — Source #2
`;

const PAGES: Record<string, string> = {
  "https://quest.example.com/apm-product":
    "<html><body><h1>Attack Path Management software</h1><p>Buy our product. It maps identity risk.</p></body></html>",
  "https://ibm.example.com/report":
    "<html><body><p>Healthcare breaches averaged $6.64M in 2026, the costliest industry for the 13th year.</p></body></html>",
  "https://ms.example.com/tier-model": "<html><body><p>The enterprise access model has tiers.</p></body></html>",
};

const fakeFetcher: PageFetcher = async (url) => {
  const html = PAGES[url];
  return html ? { ok: true, text: htmlToText(html) } : { ok: false, note: "HTTP 404" };
};

/** Judges "supported" iff the claim's distinctive number appears in the page text. */
class FakeJudge implements LlmClient {
  async complete(req: LlmRequest): Promise<LlmResponse> {
    const page = /PAGE \([^)]+\):\n([\s\S]*?)\n\nCLAIMS:/.exec(req.prompt)?.[1] ?? "";
    const claims = [...req.prompt.matchAll(/^(\d+): (.+)$/gm)].map((m) => m[2] as string);
    const verdicts = claims.map((claim, i) => {
      const numbers = claim.match(/[\d,.]+%?|\$[\d,.]+M?/g) ?? [];
      const supported = numbers.length > 0 && numbers.every((n) => page.includes(n));
      return supported
        ? { index: i, supported: true, quote: "matching sentence" }
        : { index: i, supported: false, note: "not stated on page" };
    });
    return { text: JSON.stringify(verdicts), inputTokens: 10, outputTokens: 10 };
  }
}

describe("LiveCitationVerifier (fake pages + fake judge)", () => {
  const verifier = new LiveCitationVerifier(new FakeJudge(), "fake", ["saporo.io"], fakeFetcher);

  it("catches the Quest mis-attribution, passes IBM, flags the dead page", async () => {
    const report = await verifier.verifyResearch(NOTES);
    const byUrl = (u: string) => report.results.filter((r) => r.url.includes(u));

    // Session-14 replay: claims attributed to the Quest page are unsupported.
    expect(byUrl("quest.example.com").every((r) => r.verdict === "unsupported")).toBe(true);
    // IBM page really states its numbers.
    expect(byUrl("ibm.example.com").every((r) => r.verdict === "supported")).toBe(true);
    // Claim-less reachable source counts via a reachability result.
    expect(byUrl("ms.example.com")[0]?.verdict).toBe("supported");
    // Dead page is unreachable.
    expect(byUrl("gone.example.com")[0]?.verdict).toBe("unreachable");

    // Verified sources: IBM + Microsoft only → below the 3 minimum.
    expect(report.verifiedSourceCount).toBe(2);
    expect(report.unsupportedCount).toBe(2);
    expect(report.unreachableCount).toBe(1);
  });

  it("accepts a wrapped verdict array from the judge (regression: 'no verdict' false negatives)", async () => {
    class WrappingJudge extends FakeJudge {
      override async complete(req: LlmRequest): Promise<LlmResponse> {
        const inner = await super.complete(req);
        return { ...inner, text: JSON.stringify({ verdicts: JSON.parse(inner.text) }) };
      }
    }
    const wrapped = new LiveCitationVerifier(new WrappingJudge(), "fake", ["saporo.io"], fakeFetcher);
    const report = await wrapped.verifyResearch(NOTES);
    // Same verdicts as the bare-array judge: IBM supported, Quest unsupported.
    expect(report.results.find((r) => r.url.includes("ibm.example.com"))?.verdict).toBe("supported");
    expect(report.verifiedSourceCount).toBe(2);
  });

  it("verifyArticleBody accepts only research-verified URLs", async () => {
    const research = await verifier.verifyResearch(NOTES);
    const body = `Per [IBM](https://ibm.example.com/report), costs rose. But per
[Quest](https://quest.example.com/apm-product) and [new](https://never-checked.example.com/x), things.`;
    const check = verifier.verifyArticleBody(body, research);
    const verdictFor = (u: string) => check.results.find((r) => r.url.includes(u))?.verdict;
    expect(verdictFor("ibm.example.com")).toBe("supported");
    expect(verdictFor("quest.example.com")).toBe("unsupported");
    expect(verdictFor("never-checked.example.com")).toBe("unsupported");
  });

  it("ignores plumbing links and frontmatter (author bio false-positive regression)", async () => {
    const research = await verifier.verifyResearch(NOTES);
    const body = `---
author_bio_url: "https://sneaky-frontmatter.example.com/profile"
canonical_url: "https://elsewhere.example.com/post"
---

# Title

Written by [Ameya Deshmukh](https://www.linkedin.com/in/ameyadeshmukh/), on
**Active Directory** ([Wikipedia](https://en.wikipedia.org/wiki/Active_Directory)).
Per [IBM](https://ibm.example.com/report), costs rose.

<!-- EDIT SUMMARY: mentions https://comment.example.com/x -->`;
    const check = verifier.verifyArticleBody(body, research);
    const urls = check.results.map((r) => r.url);
    expect(urls).toEqual(["https://ibm.example.com/report"]);
    expect(check.unsupportedCount).toBe(0);
  });
});

describe("LiveLinkChecker (D35)", () => {
  let mongod: MongoMemoryServer;
  let db: EngineDb;

  beforeAll(async () => {
    mongod = await MongoMemoryServer.create();
    db = await connect(mongod.getUri(), "quality_test");
    const published = await createArticle(db, {
      companyId: "testco",
      slug: "published-post",
      folder: "2026-09-01-published-post",
      topic: "t",
    });
    await db.articles.updateOne(
      { _id: published._id as ObjectId },
      { $set: { stage: "published", "hubspot.url": "https://www.saporo.io/resources/blog/published-post" } },
    );
    await createArticle(db, {
      companyId: "testco",
      slug: "still-in-review",
      folder: "2026-09-15-still-in-review",
      topic: "t2",
    });
  }, 120_000);

  afterAll(async () => {
    await db?.close();
    await mongod?.stop();
  });

  it("resolves published articles, flags drafts as pending, live-checks site pages", async () => {
    const livePages: PageFetcher = async (url) =>
      url === "https://saporo.io/product" ? { ok: true, text: "product" } : { ok: false, note: "HTTP 404" };
    const checker = new LiveLinkChecker(db, "testco", ["saporo.io"], livePages);
    const body = `See [published](https://www.saporo.io/resources/blog/published-post),
[draft](https://www.saporo.io/resources/blog/still-in-review),
[product](https://saporo.io/product) and [ghost](https://www.saporo.io/resources/blog/never-planned).`;
    const report = await checker.check(body);
    const statusFor = (u: string) => report.results.find((r) => r.url.includes(u));
    expect(statusFor("published-post")?.status).toBe("ok");
    expect(statusFor("still-in-review")?.status).toBe("missing");
    expect(statusFor("still-in-review")?.note).toContain("not published");
    expect(statusFor("/product")?.status).toBe("ok");
    expect(statusFor("never-planned")?.status).toBe("missing");
    expect(report.missingCount).toBe(2);
  });

  it("ignores the article's own canonical_url, comments, and the json-ld fence", async () => {
    // Replay of the first live direct-route failure: an absolute self
    // canonical in frontmatter read as an unpublished internal link.
    const checker = new LiveLinkChecker(db, "testco", ["saporo.io"], async () => ({ ok: false, note: "HTTP 404" }));
    const md = `---
title: "Still in review"
canonical_url: "https://www.saporo.io/resources/blog/still-in-review"
---

# Still in review

Prose with no internal links.

<!-- INTERNAL LINK PLACEHOLDER: https://www.saporo.io/resources/blog/never-planned -->

\`\`\`json-ld
{"@id": "https://www.saporo.io/resources/blog/still-in-review#article"}
\`\`\`
`;
    const report = await checker.check(md);
    expect(report.results).toEqual([]);
    expect(report.missingCount).toBe(0);
  });
});
