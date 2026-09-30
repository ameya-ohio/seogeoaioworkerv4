import { describe, expect, it } from "vitest";
import { ObjectId } from "mongodb";
import { buildFramerBundle, ExportRefusedError } from "./framer.js";
import { unzip, zip } from "../plan/zip.js";
import type { CompanyConfig } from "../companyConfig.js";
import type { ArticleDoc } from "../types.js";

const company: CompanyConfig = {
  path: "/x/company.yaml",
  brandAssetsDir: "/x",
  companyId: "saporo",
  companyName: "Saporo",
  raw: { company: { url: "https://www.saporo.io", domain: "saporo.io" }, site: { base_url: "https://www.saporo.io" } },
};

const MD = `---
title: "Identity Exposure vs Identity Risk: The Real Difference"
slug: "identity-exposure-vs-identity-risk"
meta_description: "Identity exposure is the condition; identity risk is what it could lead to."
canonical_url: "https://www.saporo.io/learn/identity-exposure-management/identity-exposure/vs-identity-risk/"
hero_image_alt: "Two overlapping circles"
---

# Identity Exposure vs Identity Risk

Intro with an [external source](https://www.crowdstrike.com/report).

| Dimension | Exposure | Risk |
|---|---|---|
| Purpose | find | prioritize |

\`\`\`json-ld
{"@context":"https://schema.org"}
\`\`\`

<!-- EDIT SUMMARY: done -->
`;

function article(over: Partial<ArticleDoc> = {}): ArticleDoc {
  return {
    _id: new ObjectId(),
    companyId: "saporo",
    slug: "identity-exposure-vs-identity-risk",
    folder: "2026-09-29-identity-exposure-vs-identity-risk",
    topic: "Identity exposure vs identity risk",
    stage: "review",
    stageHistory: [],
    artifacts: { article: MD, schema: { "@context": "https://schema.org", "@graph": [] } },
    path: "/learn/identity-exposure-management/identity-exposure/vs-identity-risk/",
    facets: { pageRole: "cluster", searchIntent: "informational", articleType: "comparison-concept", funnel: "mofu", source: "plan" },
    pendingLinks: ["What is Identity Exposure"],
    createdAt: new Date(),
    updatedAt: new Date(),
    ...over,
  };
}

describe("zip writer", () => {
  it("round-trips through the reader", () => {
    const files = unzip(zip([{ name: "a.txt", data: "hello" }, { name: "dir/b.bin", data: Buffer.from([0, 1, 2, 255]) }]));
    expect(files.get("a.txt")?.toString()).toBe("hello");
    expect([...(files.get("dir/b.bin") ?? [])]).toEqual([0, 1, 2, 255]);
  });
});

describe("Framer export bundle (D52)", () => {
  it("packs body, markdown, head, meta, header and a README", () => {
    const b = buildFramerBundle(article(), company, { headerPng: Buffer.from("png") });
    const files = unzip(b.zip);
    expect(b.filename).toBe("identity-exposure-vs-identity-risk-framer.zip");
    expect([...files.keys()].sort()).toEqual(["README.md", "body.html", "head.html", "header.png", "meta.json", "page.md"]);

    const body = files.get("body.html")!.toString();
    expect(body).not.toContain("<h1");
    expect(body).not.toContain("json-ld");
    expect(body).not.toContain("EDIT SUMMARY");
    expect(body).not.toContain("<style>");
    expect(body).toContain("<table>");
    expect(body).toContain('target="_blank"');

    const head = files.get("head.html")!.toString();
    expect(head).toContain('<link rel="canonical" href="https://www.saporo.io/learn/identity-exposure-management/identity-exposure/vs-identity-risk/">');
    expect(head).toContain('application/ld+json');

    const meta = JSON.parse(files.get("meta.json")!.toString());
    expect(meta).toMatchObject({ path: article().path, article_type: "comparison-concept", funnel: "mofu", hero_image: "header.png" });
    expect(files.get("README.md")!.toString()).toContain("What is Identity Exposure");
    expect(files.get("page.md")!.toString()).not.toContain("title:");
  });

  it("renders deferred links as their anchor text and lists them in the README (D53)", () => {
    const url = "https://www.saporo.io/learn/identity-exposure-management/identity-exposure/how-to-reduce/";
    const md = MD.replace("Intro with an", `Close the gap with [how to prioritize and reduce identity exposure](${url}). Intro with an`);
    const b = buildFramerBundle(article({ artifacts: { article: md } }), company, {
      deferredLinks: [{ url, anchor: "how to prioritize and reduce identity exposure" }],
    });
    const files = unzip(b.zip);
    const body = files.get("body.html")!.toString();
    expect(body).toContain("Close the gap with how to prioritize and reduce identity exposure.");
    expect(body).not.toContain(url);
    expect(files.get("README.md")!.toString()).toContain(`"how to prioritize and reduce identity exposure" → ${url}`);
  });

  it("refuses while HDCP editor flags remain in the article", () => {
    const md = MD.replace("Intro with an", "Intro [NEEDS SOURCE: 2026 figure] with an");
    expect(() => buildFramerBundle(article({ artifacts: { article: md } }), company)).toThrow(/editor flag/);
  });

  it("refuses drafts and unsigned vendor pages", () => {
    expect(() => buildFramerBundle(article({ stage: "write" }), company)).toThrow(ExportRefusedError);
    expect(() => buildFramerBundle(article(), company, { signoffRequired: true })).toThrow(/sign-off/);
    expect(() =>
      buildFramerBundle(article({ signoff: { by: "ameya", at: new Date() } }), company, { signoffRequired: true }),
    ).not.toThrow();
  });
});
