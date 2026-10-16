import type { MetadataRoute } from "next";
import { appUrl } from "@/lib/session";

// Signed-in screens, APIs and private reports stay out of search; everything public is open,
// to search engines and to AI crawlers alike (named explicitly so no default blocklist catches them).
// "/app$" and "/app?" rather than "/app", which as a prefix would also block /apple-icon.
const PRIVATE = ["/admin", "/api/", "/app$", "/app?", "/mensagens", "/audiencia", "/roleta", "/anunciantes/"];

const AI_CRAWLERS = [
  "GPTBot",
  "OAI-SearchBot",
  "ChatGPT-User",
  "ClaudeBot",
  "Claude-User",
  "Claude-SearchBot",
  "anthropic-ai",
  "PerplexityBot",
  "Perplexity-User",
  "Google-Extended",
  "Applebot-Extended",
  "Amazonbot",
  "meta-externalagent",
  "DuckAssistBot",
  "MistralAI-User",
  "cohere-ai",
  "CCBot",
];

export default function robots(): MetadataRoute.Robots {
  return {
    rules: [
      { userAgent: "*", allow: "/", disallow: PRIVATE },
      { userAgent: AI_CRAWLERS, allow: "/", disallow: PRIVATE },
    ],
    sitemap: `${appUrl()}/sitemap.xml`,
  };
}
