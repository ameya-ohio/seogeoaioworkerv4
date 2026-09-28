import { cfgGet, type CompanyConfig } from "../companyConfig.js";

/**
 * HubSpot CMS Blog Posts v3 + Files v3 client (roadmap 5.1/5.2). Endpoint
 * shapes per developers.hubspot.com:
 * - create  POST  /cms/v3/blogs/posts            (name + contentGroupId required)
 * - update  PATCH /cms/v3/blogs/posts/{id}        (updates draft and live together)
 * - publish PATCH /cms/v3/blogs/posts/{id}  {"state":"PUBLISHED"}
 * - upload  POST  /files/v3/files  multipart: file, fileName, folderPath, options
 * `fetch` is injectable so tests never touch the network.
 */

export class HubSpotError extends Error {
  constructor(
    message: string,
    readonly status?: number,
    readonly body?: unknown,
  ) {
    super(message);
  }
}

export interface HubSpotBlog {
  id: string;
  name?: string;
  absoluteUrl?: string;
}

export interface HubSpotAuthor {
  id: string;
  displayName?: string;
  fullName?: string;
  name?: string;
  email?: string;
}

export interface HubSpotPost {
  id: string;
  url?: string;
  state?: string;
  currentState?: string;
  slug?: string;
  publishDate?: string;
  [key: string]: unknown;
}

type FetchLike = (input: string, init?: RequestInit) => Promise<Response>;

export class HubSpotClient {
  private readonly baseUrl: string;
  private readonly fetch: FetchLike;

  constructor(
    private readonly token: string,
    opts: { baseUrl?: string; fetch?: FetchLike } = {},
  ) {
    if (!token) throw new HubSpotError("HubSpot token is empty.");
    this.baseUrl = (opts.baseUrl ?? "https://api.hubapi.com").replace(/\/+$/, "");
    this.fetch = opts.fetch ?? ((input, init) => fetch(input, init));
  }

  private async request<T>(method: string, path: string, init: { json?: unknown; form?: FormData } = {}): Promise<T> {
    const headers: Record<string, string> = { Authorization: `Bearer ${this.token}`, Accept: "application/json" };
    let body: string | FormData | undefined;
    if (init.json !== undefined) {
      headers["Content-Type"] = "application/json";
      body = JSON.stringify(init.json);
    } else if (init.form) {
      body = init.form;
    }
    const res = await this.fetch(`${this.baseUrl}${path}`, { method, headers, ...(body ? { body } : {}) });
    const text = await res.text();
    let parsed: unknown = undefined;
    try {
      parsed = text ? JSON.parse(text) : undefined;
    } catch {
      parsed = text;
    }
    if (!res.ok) {
      const detail =
        parsed && typeof parsed === "object" && "message" in parsed ? String((parsed as { message: unknown }).message) : text.slice(0, 300);
      throw new HubSpotError(`HubSpot ${method} ${path} → ${res.status}: ${detail}`, res.status, parsed);
    }
    return parsed as T;
  }

  async listBlogs(): Promise<HubSpotBlog[]> {
    const r = await this.request<{ results?: HubSpotBlog[] }>("GET", "/cms/v3/blog-settings/settings?limit=100");
    return (r?.results ?? []).map((b) => ({ ...b, id: String(b.id) }));
  }

  async listAuthors(): Promise<HubSpotAuthor[]> {
    const r = await this.request<{ results?: HubSpotAuthor[] }>("GET", "/cms/v3/blogs/authors?limit=100");
    return (r?.results ?? []).map((a) => ({ ...a, id: String(a.id) }));
  }

  async uploadFile(content: Buffer, fileName: string, folderPath: string, contentType: string): Promise<{ id: string; url: string }> {
    const form = new FormData();
    form.append("file", new Blob([new Uint8Array(content)], { type: contentType }), fileName);
    form.append("fileName", fileName);
    form.append("folderPath", folderPath);
    form.append("options", JSON.stringify({ access: "PUBLIC_INDEXABLE", duplicateValidationStrategy: "NONE" }));
    const r = await this.request<{ id: string | number; url?: string; defaultHostingUrl?: string }>("POST", "/files/v3/files", {
      form,
    });
    const url = r.url ?? r.defaultHostingUrl;
    if (!url) throw new HubSpotError("HubSpot file upload returned no url.");
    return { id: String(r.id), url };
  }

  createPost(body: Record<string, unknown>): Promise<HubSpotPost> {
    return this.request<HubSpotPost>("POST", "/cms/v3/blogs/posts", { json: body });
  }

  updatePost(id: string, body: Record<string, unknown>): Promise<HubSpotPost> {
    return this.request<HubSpotPost>("PATCH", `/cms/v3/blogs/posts/${encodeURIComponent(id)}`, { json: body });
  }

  getPost(id: string): Promise<HubSpotPost> {
    return this.request<HubSpotPost>("GET", `/cms/v3/blogs/posts/${encodeURIComponent(id)}`);
  }
}

/** The env var named by `hubspot.token_env` in company.yaml. */
export function hubspotTokenEnv(company: CompanyConfig): string {
  return String(cfgGet(company, "hubspot.token_env", "HUBSPOT_TOKEN") ?? "HUBSPOT_TOKEN");
}

/** null when the token isn't set — the UI shows "HubSpot not configured" instead of failing. */
export function hubspotClientFromEnv(company: CompanyConfig): HubSpotClient | null {
  const token = process.env[hubspotTokenEnv(company)];
  return token ? new HubSpotClient(token, process.env["HUBSPOT_BASE_URL"] ? { baseUrl: process.env["HUBSPOT_BASE_URL"] } : {}) : null;
}
