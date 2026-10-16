import { bubbleVerdict, comparePath, pct, sharePath, withUtm } from "./links";

// Sharing beyond X: WhatsApp, Instagram Stories, LinkedIn, Telegram, copy link, the phone share sheet.

export type ShareVia = "x" | "native" | "whatsapp" | "instagram" | "linkedin" | "telegram" | "copy";
export const SHARE_VIAS: readonly ShareVia[] = ["x", "native", "whatsapp", "instagram", "linkedin", "telegram", "copy"];

/** What is being shared: a bubble (yours or someone else's), the combined one, or a comparison. */
export type ShareTarget =
  | { kind: "bubble"; username: string; tally: { red: number; total: number }; own?: boolean }
  | { kind: "all"; tally: { red: number; total: number } }
  | { kind: "compare"; a: string; b: string };

export function targetPath(t: ShareTarget) {
  return t.kind === "bubble" ? sharePath(t.username) : t.kind === "compare" ? comparePath(t.a, t.b) : "/r";
}

function campaign(t: ShareTarget) {
  return t.kind === "compare" ? "compare" : "bubble";
}

function content(t: ShareTarget) {
  return t.kind === "bubble" ? (t.own ? "own" : "other") : t.kind === "all" ? "all" : undefined;
}

/** The page link tagged with where it was shared. */
export function targetLink(base: string, t: ShareTarget, source: ShareVia) {
  return withUtm(`${base}${targetPath(t)}`, campaign(t), { source, medium: source === "copy" ? "link" : "social", content: content(t) });
}

/** Printed on the Stories image (no clickable links there): host + path, no scheme. */
export function shortLink(base: string, path: string) {
  return `${base.replace(/^https?:\/\//, "")}${path}`;
}

export function storyPath(username: string) {
  return `${sharePath(username)}/story`;
}

function split(tally: { red: number; total: number }) {
  const l = pct(tally.red, tally.total);
  return `${l}% Vermelho × ${tally.total ? 100 - l : 0}% Verde`;
}

/** Casual text for chats (WhatsApp, Telegram, share sheet). */
export function shareText(t: ShareTarget) {
  if (t.kind === "compare") return `Comparei a bolha de @${t.a} com a de @${t.b} no X. Qual é mais Vermelho? E mais Verde? 🔴🟢`;
  const s = split(t.tally);
  const v = t.tally.total >= 3 ? `${bubbleVerdict(t.tally).label} (${s})` : s;
  if (t.kind === "all") return `A bolha de todo mundo no X: ${v}. E a sua?`;
  return t.own ? `Minha bolha no X: ${v}. E a sua?` : `A bolha de @${t.username} no X: ${v}. E a sua?`;
}

/** LinkedIn: framed as data about networks, not a political post. */
export function analysisText(t: ShareTarget) {
  if (t.kind === "compare")
    return `Comparei duas redes do X, @${t.a} e @${t.b}: quanto cada uma está fechada num lado só e quantas pessoas elas têm em comum. Um retrato de como as bolhas se formam nas redes.`;
  const s = split(t.tally);
  const who = t.kind === "all" ? "Somando todas as redes analisadas" : t.own ? "Analisei a minha rede no X" : `Analisei a rede de @${t.username} no X`;
  return `${who}: ${s} entre ${t.tally.total} pessoas que escolheram um lado. ${bubbleVerdict(t.tally).label}. Vale olhar para a própria bolha antes de tirar conclusões sobre o resto do país.`;
}

export function whatsappUrl(base: string, t: ShareTarget) {
  return `https://wa.me/?text=${encodeURIComponent(`${shareText(t)} ${targetLink(base, t, "whatsapp")}`)}`;
}

export function telegramUrl(base: string, t: ShareTarget) {
  return `https://t.me/share/url?url=${encodeURIComponent(targetLink(base, t, "telegram"))}&text=${encodeURIComponent(shareText(t))}`;
}

/** LinkedIn only takes the link; the text goes to the clipboard to paste. */
export function linkedinUrl(base: string, t: ShareTarget) {
  return `https://www.linkedin.com/sharing/share-offsite/?url=${encodeURIComponent(targetLink(base, t, "linkedin"))}`;
}
