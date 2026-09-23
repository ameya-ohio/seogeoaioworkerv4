/**
 * Chat tab (3.3), v1 = smart intake (decision at roadmap §7): parse the
 * natural-language request into topic + optional target keyword. A
 * conversational agent can replace this parser later without changing the
 * pipeline side.
 */
export function parseChatPrompt(raw: string): { topic: string; keyword?: string } {
  let text = raw.trim().replace(/\s+/g, " ");
  let keyword: string | undefined;

  const kwMatch = /[,.;]?\s*(?:target keyword|keyword)\s*[:=]?\s*["“']?([^"”']+?)["”']?\s*\.?$/i.exec(
    text,
  );
  if (kwMatch?.[1]) {
    keyword = kwMatch[1].trim();
    text = text.slice(0, kwMatch.index).trim().replace(/[,.;]$/, "");
  }

  const lead =
    /^(?:please\s+)?(?:write|generate|draft|create)\s+(?:an?\s+|the\s+)?(?:long-form\s+)?(?:article|blog post|blog|post|piece)\s*(?:about|on|covering|for)?\s*:?\s*/i;
  const topic = text.replace(lead, "").trim() || text;
  return keyword ? { topic, keyword } : { topic };
}
