import { Card, PageTitle } from "@/components/admin/Card";
import { Constellation } from "@/components/admin/Constellation";
import { METRICS, voteColor, voteLabel } from "@/components/admin/metrics";
import type { GraphAnalysis } from "@/lib/graph";

export function CenterView({ g, u: handle, base }: { g: GraphAnalysis; u?: string; base: string }) {
  const byRank = [...g.nodes].sort((a, b) => b.pagerank - a.pagerank);
  const u = handle ? handle.replace(/^@/, "").toLowerCase() : "";
  const center = g.nodes.find((n) => n.username.toLowerCase() === u) ?? byRank[0];
  if (!center) return <p className="text-subtle">Ainda não há membros.</p>;
  // A "center score": the average of each person's rank in four centralities (lower is more central).
  const rankOf = (k: "pagerank" | "betweenness" | "closeness" | "inDeg") => {
    const sorted = [...g.nodes].sort((a, b) => b[k] - a[k]);
    return new Map(sorted.map((n, i) => [n.id, i + 1]));
  };
  const ranks = (["pagerank", "betweenness", "closeness", "inDeg"] as const).map(rankOf);
  const overall = g.nodes
    .map((n) => ({ n, score: ranks.reduce((s, r) => s + r.get(n.id)!, 0) / ranks.length }))
    .sort((a, b) => a.score - b.score)
    .slice(0, 5);

  return (
    <>
      <PageTitle
        title="Quem é o centro"
        sub="Centralidade no grafo de quem segue quem entre os membros. Escolha alguém para ver a rede em anéis a partir dessa pessoa."
      />
      <Card tour="center-top" title="🏆 O centro da rede" note="Média das posições em PageRank, intermediação, proximidade e seguidores membros." className="mb-4">
        <ol className="grid gap-2 sm:grid-cols-5">
          {overall.map(({ n, score }, i) => (
            <li key={n.id}>
              <a href={`${base}/centro?u=${encodeURIComponent(n.username)}`} className="flex flex-col items-center gap-1 rounded-xl p-2 text-center hover:bg-muted">
                <span className="relative">
                  {n.avatar ? (
                    <img src={n.avatar} alt="" className="rounded-full" style={{ width: i ? 48 : 64, height: i ? 48 : 64, border: `3px ${n.vote === "red" ? "dashed" : "solid"} ${voteColor(n)}` }} />
                  ) : (
                    <span className="block h-12 w-12 rounded-full bg-muted" />
                  )}
                  <span className="absolute -top-1 -left-1 rounded-full bg-fg px-1.5 text-xs font-bold text-bg">{i + 1}</span>
                </span>
                <b className="max-w-full truncate text-sm">@{n.username}</b>
                <span className="text-xs text-subtle">
                  {voteLabel(n)} · posição média {score.toFixed(1).replace(".", ",")}
                </span>
              </a>
            </li>
          ))}
        </ol>
      </Card>

      <Constellation graph={g} center={center.id} base={base} />

      <div data-tour="center-metrics" className="mt-4 grid gap-4 md:grid-cols-2 lg:grid-cols-3">
        {METRICS.map((m) => {
          const top = [...g.nodes].sort((a, b) => b[m.key] - a[m.key]).filter((n) => n[m.key] > 0).slice(0, 10);
          return (
            <Card key={m.key} title={m.label} note={m.desc}>
              {top.length === 0 ? (
                <p className="text-sm text-subtle">Ninguém ainda.</p>
              ) : (
                <ol className="grid gap-1">
                  {top.map((n, i) => (
                    <li key={n.id}>
                      <a href={`${base}/centro?u=${encodeURIComponent(n.username)}`} className="flex items-center gap-2 rounded-lg p-1 hover:bg-muted">
                        <span className="w-4 text-right text-xs text-subtle">{i + 1}</span>
                        {n.avatar ? <img src={n.avatar} alt="" className="h-6 w-6 rounded-full" /> : <span className="h-6 w-6 rounded-full bg-muted" />}
                        <span className="min-w-0 flex-1 truncate text-sm">@{n.username}</span>
                        <span className="h-2 w-2 rounded-full" style={{ background: voteColor(n) }} title={voteLabel(n)} />
                        <b className="text-sm tabular-nums">{m.fmt(n[m.key])}</b>
                      </a>
                    </li>
                  ))}
                </ol>
              )}
            </Card>
          );
        })}
      </div>
    </>
  );
}
