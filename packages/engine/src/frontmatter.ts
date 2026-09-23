import matter from "gray-matter";

export interface ParsedArticle {
  frontmatter: Record<string, unknown>;
  body: string;
}

export function parseArticle(markdown: string): ParsedArticle {
  const parsed = matter(markdown);
  return { frontmatter: parsed.data as Record<string, unknown>, body: parsed.content };
}

/** Body with the json-ld fence and HTML comments (edit summary) removed. */
export function cleanBody(body: string): string {
  return body
    .replace(/```json-ld[\s\S]*?```/gi, "")
    .replace(/<!--[\s\S]*?-->/g, "");
}

export function countWords(text: string): number {
  return (text.match(/\b\w+\b/g) ?? []).length;
}

export function countHeadings(body: string, level: number): number {
  const re = new RegExp(`^#{${level}}\\s+\\S`, "gm");
  return (body.match(re) ?? []).length;
}

/** Case-insensitive `## <title>` presence check. */
export function hasSection(body: string, title: string): boolean {
  const re = new RegExp(`^##\\s+${escapeRe(title)}\\s*$`, "im");
  return re.test(body);
}

export function escapeRe(s: string): string {
  return s.replace(/[.*+?^${}()|[\]\\]/g, "\\$&");
}

/** Distinct http(s) URLs in a markdown document. */
export function distinctUrls(text: string): string[] {
  const urls = text.match(/https?:\/\/[^\s)\]>"']+/g) ?? [];
  return [...new Set(urls.map((u) => u.replace(/[.,;:]+$/, "")))];
}
