import type { MetadataRoute } from "next";
import { connection } from "next/server";
import { sharePath } from "@/lib/links";
import { indexableMembers } from "@/lib/network";
import { appUrl } from "@/lib/session";

// The public pages, plus the bubble pages of members whose bubble is public and not too thin
// (the same rule as the page's robots meta). Built per request from a cached query.
const PAGES: [path: string, changeFrequency: "hourly" | "daily" | "weekly" | "monthly", priority: number][] = [
  ["/", "daily", 1],
  ["/sobre", "monthly", 0.8],
  ["/r", "hourly", 0.9],
  ["/ranking", "hourly", 0.7],
  ["/mapa", "daily", 0.6],
  ["/virada", "daily", 0.6],
  ["/hoje", "daily", 0.6],
  ["/c", "weekly", 0.5],
  ["/ao-vivo", "daily", 0.5],
  ["/grafo", "daily", 0.5],
  ["/centro", "daily", 0.4],
  ["/polarizacao", "daily", 0.4],
  ["/convites", "daily", 0.4],
  ["/apoie", "monthly", 0.3],
  ["/anuncie", "monthly", 0.3],
  ["/privacidade", "monthly", 0.3],
];

export default async function sitemap(): Promise<MetadataRoute.Sitemap> {
  await connection(); // live members, not frozen at build time
  const base = appUrl();
  const members = await indexableMembers();
  return [
    ...PAGES.map(([path, changeFrequency, priority]) => ({ url: `${base}${path === "/" ? "" : path}`, changeFrequency, priority })),
    ...members.map((m) => ({
      url: `${base}${sharePath(m.username)}`,
      lastModified: new Date(m.at),
      changeFrequency: "daily" as const,
      priority: 0.5,
    })),
  ];
}
