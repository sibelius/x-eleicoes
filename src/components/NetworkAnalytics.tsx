import Link from "next/link";

/** Entry to the network analysis pages; with a username, the first tile opens the network centered on them. */
export function NetworkAnalytics({ username, className = "" }: { username?: string; className?: string }) {
  const tiles = [
    ...(username ? [{ href: `/centro?u=${encodeURIComponent(username)}`, icon: "🎯", label: "Você na rede", note: "seus anéis e posição" }] : []),
    { href: "/grafo", icon: "🕸️", label: "Grafo", note: "quem segue quem" },
    { href: "/polarizacao", icon: "🧲", label: "Polarização", note: "bolhas fechadas?" },
    { href: "/convites", icon: "🌳", label: "Convites", note: "quem trouxe quem" },
    { href: "/centro", icon: "🏆", label: "Quem é o centro", note: "influência e pontes" },
    // The directory already links the map; on your own page it rounds the grid to six.
    ...(username ? [{ href: "/mapa", icon: "🗺️", label: "Mapa", note: "todas as contas" }] : []),
  ];
  return (
    <section data-tour="analytics" className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      <h2 className="text-lg font-semibold">📊 Análises da rede</h2>
      <p className="mt-1 text-sm text-subtle">Todo mundo que entrou, num grafo só: quem é o centro, quem faz ponte, quem trouxe quem.</p>
      <div className={`mt-3 grid grid-cols-2 gap-2 ${username ? "" : "sm:grid-cols-4"}`}>
        {tiles.map((t) => (
          <Link key={t.href} href={t.href} className="flex min-h-16 flex-col justify-center rounded-xl border border-line px-3 py-2 hover:bg-muted active:bg-muted">
            <span className="text-sm font-semibold">
              {t.icon} {t.label}
            </span>
            <span className="text-xs text-subtle">{t.note}</span>
          </Link>
        ))}
      </div>
    </section>
  );
}
