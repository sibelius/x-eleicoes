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

/** Tweet a bubble: your own (`own`), someone else's, or the combined one (no username). */
export function shareTweetUrl(
  base: string,
  username: string | null,
  tally: { lula: number; total: number },
  own = false,
) {
  const l = pct(tally.lula, tally.total);
  const split = `${l}% Lula × ${tally.total ? 100 - l : 0}% Bolsonaro`;
  const text = !username
    ? `A bolha de todo mundo no X: ${split}. E a sua?`
    : own
      ? `Minha rede no X: ${split}. E a sua?`
      : `A rede de @${username} no X: ${split}. E a sua?`;
  const url = `${base}${username ? sharePath(username) : "/r"}`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(url)}`;
}

export function profileUrl(n: { id: string; username: string | null }) {
  return n.username ? `https://x.com/${n.username}` : `https://x.com/i/user/${n.id}`;
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}
