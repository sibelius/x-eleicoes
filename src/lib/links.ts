export function inviteLink(base: string, uid: string) {
  return `${base}/?ref=${encodeURIComponent(uid)}`;
}

export function inviteTweetUrl(base: string, uid: string, username?: string | null) {
  const text = username
    ? `@${username} já votou? Entra com sua conta do X e vê como a nossa rede vota: Lula ou Bolsonaro 🗳️`
    : `Como a sua rede do X vota? Lula ou Bolsonaro? Entra e descobre 🗳️`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(inviteLink(base, uid))}`;
}

export function sharePath(username: string) {
  return `/r/${encodeURIComponent(username)}`;
}

export type Verdict = { label: string; side: "lula" | "bolsonaro" | null };

/** A label people argue about: how closed the bubble is, and to which side. */
export function bubbleVerdict(tally: { lula: number; total: number }): Verdict {
  if (tally.total < 3) return { label: "Bolha em formação 🌱", side: null };
  const l = pct(tally.lula, tally.total);
  if (l >= 85) return { label: "Bolha fechada no Lula 🔒", side: "lula" };
  if (l <= 15) return { label: "Bolha fechada no Bolsonaro 🔒", side: "bolsonaro" };
  if (l >= 65) return { label: "Bolha inclinada pro Lula ↖️", side: "lula" };
  if (l <= 35) return { label: "Bolha inclinada pro Bolsonaro ↗️", side: "bolsonaro" };
  return { label: "Bolha mista ⚖️", side: null };
}

/** Tweet a bubble: your own (`own`), someone else's, or the combined one (no username). */
export function shareTweetUrl(
  base: string,
  username: string | null,
  tally: { lula: number; total: number },
  own = false,
) {
  const l = pct(tally.lula, tally.total);
  const split = `${l}% Lula × ${tally.total ? 100 - l : 0}% Bolsonaro`;
  const v = tally.total >= 3 ? `${bubbleVerdict(tally).label} (${split})` : split;
  const text = !username
    ? `A bolha de todo mundo no X: ${v}. E a sua?`
    : own
      ? `Minha bolha no X: ${v}. E a sua?`
      : `A bolha de @${username} no X: ${v}. E a sua?`;
  const url = `${base}${username ? sharePath(username) : "/r"}`;
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
  const text = `Comparei a bolha de @${a} com a de @${b} no X. Qual rede vota mais Lula? E mais Bolsonaro? 🗳️`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${base}${comparePath(a, b)}`)}`;
}

/** One post tagging the members who joined but haven't voted (as many as fit in a post). */
export function nudgeTweetUrl(base: string, uid: string, usernames: string[]) {
  const tail = " vocês já entraram no Minha Rede Vota mas ainda não votaram: Lula ou Bolsonaro? 🗳️";
  // 280 chars, the link counts as 23 + a space.
  let tags = "";
  for (const u of usernames) {
    const next = `${tags}${tags ? " " : ""}@${u}`;
    if (next.length + tail.length + 24 > 280) break;
    tags = next;
  }
  const text = `${tags}${tail}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(inviteLink(base, uid))}`;
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
export function challengeTweetUrl(base: string, me: { username: string; vote: "lula" | "bolsonaro" }, them: string) {
  const mine = me.vote === "lula" ? "Lula" : "Bolsonaro";
  const theirs = me.vote === "lula" ? "Bolsonaro" : "Lula";
  const text = `@${them} você vota ${theirs}, eu voto ${mine}. Bora ver qual das nossas bolhas é mais fechada? 👀`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${base}${comparePath(me.username, them)}`)}`;
}
