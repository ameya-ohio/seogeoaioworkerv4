import { mkdtempSync } from "node:fs";
import { tmpdir } from "node:os";
import { join } from "node:path";
import { MongoMemoryServer } from "mongodb-memory-server";
import type { ObjectId } from "mongodb";
import { afterAll, beforeAll, beforeEach, describe, expect, it } from "vitest";
import type { CompanyConfig } from "./companyConfig.js";
import { connect, type EngineDb } from "./db.js";
import { createArticle } from "./dal/articles.js";
import { LocalStorage } from "./storage.js";
import { HubSpotClient } from "./publish/hubspot.js";
import { buildHeadHtml, postFieldsFromArticle, renderPostBody } from "./publish/render.js";
import { goLive, refreshFromHubSpot, resolveHubSpotIds, sendToHubSpot, type PublishDeps } from "./publish/publish.js";

let mongod: MongoMemoryServer;
let db: EngineDb;

beforeAll(async () => {
  mongod = await MongoMemoryServer.create();
  db = await connect(mongod.getUri(), "publish_test");
}, 180_000);

afterAll(async () => {
  await db?.close();
  await mongod?.stop();
});

const company = (hubspot: Record<string, string> = {}): CompanyConfig => ({
  path: "/x/company.yaml",
  brandAssetsDir: "/x/brand-assets",
  companyId: "co",
  companyName: "Co",
  raw: {
    company: { id: "co", name: "Co", domain: "example.com" },
    author: { name: "Ameya Deshmukh" },
    brand: { font: { family: "Inter" }, colors: { body_text: "#0A0A0A" } },
    hubspot: { token_env: "CO_HUBSPOT_TOKEN", content_group_id: "", blog_author_id: "", ...hubspot },
  },
});

const ARTICLE = `---
title: "Kerberoasting Detection and Remediation"
slug: "kerberoasting-detection"
meta_description: "How to detect Kerberoasting and fix the service accounts it targets."
canonical_url: "https://www.example.com/resources/blog/kerberoasting-detection"
hero_image_alt: "Header reading Kerberoasting Detection"
---

# Kerberoasting Detection and Remediation

Intro with an [external source](https://learn.microsoft.com/x) and an [internal page](https://www.example.com/p).

## Key Takeaways

- One.

\`\`\`json-ld
{"@graph": []}
\`\`\`

<!-- EDIT SUMMARY: fixed things -->
`;

/** A tiny HubSpot: records every call, answers from a script. */
class FakeHubSpot {
  calls: { method: string; path: string; body?: unknown; form?: FormData }[] = [];
  blogs = [{ id: 111, name: "Blog", absoluteUrl: "https://www.example.com/resources/blog" }];
  authors = [{ id: 222, displayName: "Ameya Deshmukh" }];
  state = "DRAFT";
  fetch = async (url: string, init?: RequestInit): Promise<Response> => {
    const path = url.replace("https://api.hubapi.com", "");
    const method = init?.method ?? "GET";
    const body = typeof init?.body === "string" ? JSON.parse(init.body) : undefined;
    this.calls.push({ method, path, ...(body ? { body } : {}), ...(init?.body instanceof FormData ? { form: init.body } : {}) });
    const json = (data: unknown, status = 200) => new Response(JSON.stringify(data), { status });
    if (path.startsWith("/cms/v3/blog-settings/settings")) return json({ results: this.blogs });
    if (path.startsWith("/cms/v3/blogs/authors")) return json({ results: this.authors });
    if (path === "/files/v3/files") return json({ id: 9, url: "https://cdn.example.com/blog-headers/kerberoasting-detection.png" });
    const post = { id: "555", url: "https://www.example.com/resources/blog/kerberoasting-detection" };
    if (path === "/cms/v3/blogs/posts" && method === "POST") return json({ ...post, currentState: "DRAFT" }, 201);
    if (path === "/cms/v3/blogs/posts/555" && method === "PATCH") {
      if ((body as { state?: string })?.state === "PUBLISHED") this.state = "PUBLISHED";
      return json({ ...post, currentState: this.state });
    }
    if (path === "/cms/v3/blogs/posts/555" && method === "GET") return json({ ...post, currentState: this.state });
    return json({ message: `unexpected ${method} ${path}` }, 404);
  };
}

async function seed(slug: string, extra: Record<string, unknown> = {}) {
  const storage = new LocalStorage(mkdtempSync(join(tmpdir(), "publish-")));
  await storage.put(`articles/2026-09-25-${slug}/header.png`, Buffer.from([0x89, 0x50, 0x4e, 0x47]));
  const article = await createArticle(db, { companyId: "co", slug, folder: `2026-09-25-${slug}`, topic: "t" });
  await db.articles.updateOne(
    { _id: article._id },
    {
      $set: {
        stage: "review",
        "artifacts.article": ARTICLE,
        "artifacts.schema": { "@context": "https://schema.org", "@graph": [{ "@type": "BlogPosting", headline: "</script>x" }] },
        header: { storageKey: `articles/2026-09-25-${slug}/header.png`, contentType: "image/png" },
        ...extra,
      },
    },
  );
  await db.keywords.insertOne({
    companyId: "co",
    text: slug,
    source: "chat",
    status: "in_production",
    articleId: article._id as ObjectId,
    createdAt: new Date(),
    updatedAt: new Date(),
  });
  return { storage, id: article._id as ObjectId };
}

const load = async (id: ObjectId) => (await db.articles.findOne({ _id: id }))!;

describe("render", () => {
  it("drops the H1, fence and edit summary; styles the body; opens external links in a new tab", () => {
    const html = renderPostBody(ARTICLE, company());
    expect(html).not.toMatch(/<h1/);
    expect(html).not.toContain("json-ld");
    expect(html).not.toContain("EDIT SUMMARY");
    expect(html).toContain("font-family:'Inter'");
    expect(html).toMatch(/<h2[^>]*>Key Takeaways<\/h2>/);
    expect(html).toContain('href="https://www.example.com/p">'); // internal link: same tab
    expect(html).toContain('href="https://learn.microsoft.com/x" target="_blank" rel="noopener"');
  });

  it("escapes </ inside JSON-LD so the script tag can't be closed early", () => {
    expect(buildHeadHtml({ a: "</script><b>" })).toBe('<script type="application/ld+json">{"a":"<\\/script><b>"}</script>');
  });

  it("requires title, slug and meta description", async () => {
    const { id } = await seed("render-missing");
    await db.articles.updateOne({ _id: id }, { $set: { "artifacts.article": "---\ntitle: \"t\"\n---\n\n# t\n" } });
    const a = await load(id);
    expect(() => postFieldsFromArticle(a, company())).toThrow(/slug, meta_description/);
  });
});

describe("HubSpot publishing", () => {
  let hub: FakeHubSpot;
  beforeEach(async () => {
    hub = new FakeHubSpot();
    await db.settings.deleteMany({});
  });
  const deps = (storage: LocalStorage, cfg = company(), probe?: (u: string) => Promise<boolean>): PublishDeps => ({
    db,
    storage,
    company: cfg,
    client: new HubSpotClient("t", { fetch: hub.fetch }),
    ...(probe ? { probe } : {}),
  });

  it("resolves blog + author once, then serves them from the settings cache", async () => {
    const { storage } = await seed("ids");
    expect(await resolveHubSpotIds(deps(storage))).toEqual({ blogId: "111", authorId: "222" });
    const apiCalls = hub.calls.length;
    await resolveHubSpotIds(deps(storage));
    expect(hub.calls.length).toBe(apiCalls);
  });

  it("refuses to guess between several blogs or same-named authors", async () => {
    const { storage } = await seed("ambiguous");
    hub.blogs.push({ id: 112, name: "News", absoluteUrl: "https://www.example.com/news" });
    await expect(resolveHubSpotIds(deps(storage))).rejects.toThrow(/2 blogs — set hubspot.content_group_id/);
    hub.blogs.pop();
    hub.authors.push({ id: 223, displayName: "Ameya Deshmukh" });
    await expect(resolveHubSpotIds(deps(storage))).rejects.toThrow(/2 HubSpot authors/);
  });

  it("creates a draft with the uploaded hero, then updates the same post", async () => {
    const { storage, id } = await seed("draft");
    const first = await sendToHubSpot(deps(storage), await load(id));
    expect(first).toMatchObject({ postId: "555", state: "DRAFT", warnings: [] });

    const create = hub.calls.find((c) => c.method === "POST" && c.path === "/cms/v3/blogs/posts")!;
    expect(create.body).toMatchObject({
      name: "Kerberoasting Detection and Remediation",
      slug: "kerberoasting-detection",
      contentGroupId: "111",
      blogAuthorId: "222",
      state: "DRAFT",
      featuredImage: "https://cdn.example.com/blog-headers/kerberoasting-detection.png",
      featuredImageAltText: "Header reading Kerberoasting Detection",
      useFeaturedImage: true,
    });
    expect((create.body as { headHtml: string }).headHtml).toContain("<\\/script>x");
    const upload = hub.calls.find((c) => c.path === "/files/v3/files")!;
    expect(upload.form?.get("folderPath")).toBe("/blog-headers");
    expect(JSON.parse(String(upload.form?.get("options")))).toMatchObject({ access: "PUBLIC_INDEXABLE" });

    let a = await load(id);
    expect(a.stage).toBe("approved");
    expect(a.hubspot).toMatchObject({ postId: "555", state: "DRAFT" });
    expect((await db.keywords.findOne({ articleId: id }))?.status).toBe("in_review");

    await sendToHubSpot(deps(storage), a);
    expect(hub.calls.filter((c) => c.path === "/cms/v3/blogs/posts" && c.method === "POST")).toHaveLength(1);
    expect(hub.calls.some((c) => c.method === "PATCH" && c.path === "/cms/v3/blogs/posts/555")).toBe(true);
    a = await load(id);
    expect(a.stageHistory.filter((h) => h.stage === "approved")).toHaveLength(1);
  });

  it("goes live, syncs the keyword, and refresh reads HubSpot's state back", async () => {
    const { storage, id } = await seed("live");
    await sendToHubSpot(deps(storage), await load(id));
    const res = await goLive(deps(storage), await load(id));
    expect(res.state).toBe("PUBLISHED");
    expect(hub.calls.at(-1)).toMatchObject({ method: "PATCH", body: { state: "PUBLISHED" } });
    expect((await load(id)).stage).toBe("published");
    expect((await db.keywords.findOne({ articleId: id }))?.status).toBe("published");

    hub.state = "DRAFT"; // someone unpublished it in HubSpot
    await refreshFromHubSpot(deps(storage), await load(id));
    expect((await load(id)).stage).toBe("approved");
  });

  it("refuses to go live while a deferred sibling link isn't a live page (D43)", async () => {
    const { storage, id } = await seed("deferred", { deferredLinks: ["https://www.example.com/resources/blog/sibling"] });
    const draft = await sendToHubSpot(deps(storage, company(), async () => false), await load(id));
    expect(draft.warnings.join(" ")).toMatch(/Deferred links not live yet/);
    await expect(goLive(deps(storage, company(), async () => false), await load(id))).rejects.toThrow(/publish those articles first/);
    expect((await goLive(deps(storage, company(), async () => true), await load(id))).state).toBe("PUBLISHED");
  });

  it("warns when HubSpot's URL doesn't match the article's canonical", async () => {
    const { storage, id } = await seed("canonical");
    hub.blogs[0]!.absoluteUrl = "https://blog.example.com";
    const fetchWrongUrl = hub.fetch;
    hub.fetch = async (url, init) => {
      const r = await fetchWrongUrl(url, init);
      if (!url.endsWith("/cms/v3/blogs/posts")) return r;
      return new Response(JSON.stringify({ id: "555", url: "https://blog.example.com/kerberoasting-detection", currentState: "DRAFT" }));
    };
    const res = await sendToHubSpot(deps(storage), await load(id));
    expect(res.warnings.join(" ")).toMatch(/doesn't match the article's canonical_url/);
  });
});
