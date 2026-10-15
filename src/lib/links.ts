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

export function shareTweetUrl(base: string, username: string, lulaPct: number, bolsoPct: number) {
  const text = `Minha rede no X: ${lulaPct}% Lula × ${bolsoPct}% Bolsonaro. E a sua?`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(`${base}${sharePath(username)}`)}`;
}

export function profileUrl(n: { id: string; username: string | null }) {
  return n.username ? `https://x.com/${n.username}` : `https://x.com/i/user/${n.id}`;
}

export function pct(part: number, total: number) {
  return total ? Math.round((part / total) * 100) : 0;
}
