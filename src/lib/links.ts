export const SIDE = { red: "Vermelho", green: "Verde" } as const;

/** Tags a link we hand out (posts on X, push notifications) so arrivals can be attributed (see /admin/origem). */
export function withUtm(url: string, campaign: string, opts: { source?: string; medium?: string; content?: string } = {}) {
  const u = new URL(url);
  u.searchParams.set("utm_source", opts.source ?? "x");
  u.searchParams.set("utm_medium", opts.medium ?? "social");
  u.searchParams.set("utm_campaign", campaign);
  if (opts.content) u.searchParams.set("utm_content", opts.content);
  return u.toString();
}

export function inviteLink(base: string, uid: string) {
  return `${base}/?ref=${encodeURIComponent(uid)}`;
}

export function inviteTweetUrl(base: string, uid: string, username?: string | null) {
  const text = username
    ? `@${username} já escolheu seu lado? Entra com sua conta do X e vê de que lado está a nossa rede: Vermelho ou Verde 🔴🟢`
    : `De que lado está a sua rede do X? Vermelho ou Verde? Entra e descobre 🔴🟢`;
  const url = withUtm(inviteLink(base, uid), "invite", { content: username ? "personal" : "general" });
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function sharePath(username: string) {
  return `/r/${encodeURIComponent(username)}`;
}

export type Verdict = { label: string; side: "red" | "green" | null };

/** A label people argue about: how closed the bubble is, and to which side. */
export function bubbleVerdict(tally: { red: number; total: number }): Verdict {
  if (tally.total < 3) return { label: "Bolha em formação 🌱", side: null };
  const l = pct(tally.red, tally.total);
  if (l >= 85) return { label: "Bolha fechada no Vermelho 🔒", side: "red" };
  if (l <= 15) return { label: "Bolha fechada no Verde 🔒", side: "green" };
  if (l >= 65) return { label: "Bolha inclinada pro Vermelho ↖️", side: "red" };
  if (l <= 35) return { label: "Bolha inclinada pro Verde ↗️", side: "green" };
  return { label: "Bolha mista ⚖️", side: null };
}

/** Tweet a bubble: your own (`own`), someone else's, or the combined one (no username). */
export function shareTweetUrl(
  base: string,
  username: string | null,
  tally: { red: number; total: number },
  own = false,
) {
  const l = pct(tally.red, tally.total);
  const split = `${l}% Vermelho × ${tally.total ? 100 - l : 0}% Verde`;
  const v = tally.total >= 3 ? `${bubbleVerdict(tally).label} (${split})` : split;
  const text = !username
    ? `A bolha de todo mundo no X: ${v}. E a sua?`
    : own
      ? `Minha bolha no X: ${v}. E a sua?`
      : `A bolha de @${username} no X: ${v}. E a sua?`;
  const url = withUtm(`${base}${username ? sharePath(username) : "/r"}`, "bubble", { content: own ? "own" : username ? "other" : "all" });
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function profileUrl(n: { id: string; username: string | null }) {
  return n.username ? `https://x.com/${n.username}` : `https://x.com/i/user/${n.id}`;
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}

export function comparePath(a: string, b: string) {
  return `/c/${encodeURIComponent(a)}/${encodeURIComponent(b)}`;
}

export function compareTweetUrl(base: string, a: string, b: string) {
  const text = `Comparei a bolha de @${a} com a de @${b} no X. Qual é mais Vermelho? E mais Verde? 🔴🟢`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(withUtm(`${base}${comparePath(a, b)}`, "compare"))}`;
}

/** One post tagging the members who joined but haven't voted (as many as fit in a post). */
export function nudgeTweetUrl(base: string, uid: string, usernames: string[]) {
  const tail = " vocês já entraram na Minha Bolha mas ainda não escolheram um lado: Vermelho ou Verde? 🔴🟢";
  // 280 chars, the link counts as 23 + a space.
  let tags = "";
  for (const u of usernames) {
    const next = `${tags}${tags ? " " : ""}@${u}`;
    if (next.length + tail.length + 24 > 280) break;
    tags = next;
  }
  const text = `${tags}${tail}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(withUtm(inviteLink(base, uid), "nudge"))}`;
}

/** Badge for bringing people in through your link. */
export function inviteBadge(invites: number) {
  if (invites >= 25) return { emoji: "🥇", label: "Recrutador ouro" };
  if (invites >= 10) return { emoji: "🥈", label: "Recrutador prata" };
  if (invites >= 3) return { emoji: "🥉", label: "Recrutador bronze" };
  return null;
}

export const BADGE_STEPS = [3, 10, 25];

/** Challenge someone in your network who votes the other way to compare bubbles. */
export function challengeTweetUrl(base: string, me: { username: string; vote: "red" | "green" }, them: string) {
  const mine = SIDE[me.vote];
  const theirs = me.vote === "red" ? SIDE.green : SIDE.red;
  const text = `@${them} você é ${theirs}, eu sou ${mine}. Bora ver qual das nossas bolhas é mais fechada? 👀`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(withUtm(`${base}${comparePath(me.username, them)}`, "challenge"))}`;
}

/** Buying an ad = a DM to @sseraphini on X. */
export const AD_DM_URL = `https://x.com/messages/compose?recipient_id=2313873457&text=${encodeURIComponent(
  "Olá! Quero anunciar na Minha Bolha. Meu produto/marca: ",
)}`;
