import { Card, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { Legend, Scatter } from "@/components/admin/Charts";
import { voteColor, voteLabel } from "@/components/admin/metrics";
import type { GraphAnalysis } from "@/lib/graph";
import type { BubbleLean } from "@/lib/stats";
import { sharePath } from "@/lib/links";


const SIDES = [
  { key: "green", label: "Verde", color: "var(--green)" },
  { key: "red", label: "Vermelho", color: "var(--red)" },
  { key: "none", label: "Sem voto", color: "var(--none)" },
];

export function PolarizationView({ g, leans, base }: { g: GraphAnalysis; leans: BubbleLean[]; base: string }) {
  const { homophily: h, mixing: mx } = g.stats;
  const maxTotal = Math.max(2, ...leans.map((l) => l.total));
  const logY = (v: number) => Math.log(v) / Math.log(maxTotal);

  // Echo chamber: in each voter's bubble, how much is their own side?
  const own = (side: "red" | "green") => {
    const xs = leans.filter((l) => l.vote === side && l.total >= 3);
    const share = xs.reduce((s, l) => s + (side === "red" ? l.red : l.green) / l.total, 0);
    return { n: xs.length, share: xs.length ? share / xs.length : 0 };
  };
  const echoRed = own("red");
  const echoGreen = own("green");

  // Histogram of bubble lean, 10 bins, stacked by the owner's vote.
  const bins = Array.from({ length: 10 }, (_, i) => ({ i, red: 0, green: 0, none: 0 }));
  for (const l of leans) {
    if (l.total < 3) continue;
    const b = bins[Math.min(9, Math.floor((l.red / l.total) * 10))];
    b[l.vote ?? "none"]++;
  }
  const binMax = Math.max(1, ...bins.map((b) => b.red + b.green + b.none));

  const bridges = [...g.nodes].filter((n) => n.crossTies > 0).sort((a, b) => b.crossTies - a.crossTies || b.betweenness - a.betweenness).slice(0, 12);
  const mixTotal = mx.rr + mx.rg + mx.gr + mx.gg || 1;

  return (
    <>
      <PageTitle title="Polarização" sub="As bolhas são fechadas? Quem segue quem do outro lado, e quem faz a ponte." />
      <div data-tour="pol-kpis" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-5">
        <Kpi label="Laços do mesmo lado" value={h.same + h.cross ? pctf(h.same / (h.same + h.cross)) : "—"} hint={`${h.same} de ${h.same + h.cross} entre eleitores`} />
        <Kpi label="Assortatividade" value={h.assortativity.toFixed(2).replace(".", ",")} hint="0 = aleatório, 1 = só o próprio lado" />
        <Kpi label="Câmara de eco Vermelho" value={pctf(echoRed.share)} hint={`bolha média de ${echoRed.n} eleitores`} color="var(--red)" />
        <Kpi label="Câmara de eco Verde" value={pctf(echoGreen.share)} hint={`bolha média de ${echoGreen.n} eleitores`} color="var(--green)" />
        <Kpi label="Pontes" value={g.nodes.filter((n) => n.crossTies > 0).length} hint="membros com laço no outro lado" />
      </div>

      <div className="grid gap-4 lg:grid-cols-[3fr_2fr]">
        <Card tour="pol-scatter" title="Cada bolha: inclinação × tamanho" note="Um ponto por membro. Cor = o voto da pessoa; posição = como votou a rede dela.">
          <Legend series={SIDES} />
          <Scatter
            dots={leans.map((l) => ({
              id: l.id,
              x: l.red / l.total,
              y: logY(Math.max(1, l.total)),
              r: 3 + Math.sqrt(l.total),
              color: l.vote ? `var(--${l.vote})` : "var(--none)",
              label: `@${l.username}`,
              detail: `${voteLabel(l)} · rede ${pctf(l.red / l.total)} Vermelho de ${l.total}`,
              href: sharePath(l.username),
            }))}
            xLabel="% Vermelho na bolha"
            yLabel="votos na bolha (log)"
            xTicks={[0, 0.25, 0.5, 0.75, 1].map((at) => ({ at, label: pctf(at) }))}
            yTicks={[1, 3, 10, 30, 100, 300].filter((v) => v <= maxTotal).map((v) => ({ at: logY(v), label: String(v) }))}
          />
        </Card>
        <div className="grid content-start gap-4">
          <Card tour="pol-matrix" title="Quem segue quem" note="Ligações entre membros que votaram, por lado de quem segue → de quem é seguido.">
            <table className="w-full text-center text-sm">
              <thead className="text-xs text-subtle">
                <tr>
                  <th />
                  <th className="pb-1 font-normal">→ Vermelho</th>
                  <th className="pb-1 font-normal">→ Verde</th>
                </tr>
              </thead>
              <tbody>
                {(
                  [
                    ["Vermelho", mx.rr, mx.rg],
                    ["Verde", mx.gr, mx.gg],
                  ] as const
                ).map(([from, a, b]) => (
                  <tr key={from}>
                    <th className="pr-2 text-right text-xs font-normal text-subtle">{from} segue</th>
                    {[a, b].map((v, i) => (
                      <td key={i} className="p-0.5">
                        <div
                          className="rounded-lg py-3 tabular-nums"
                          style={{ background: `color-mix(in oklab, var(--accent) ${Math.round((v / mixTotal) * 140)}%, var(--muted))`, color: v / mixTotal > 0.35 ? "white" : undefined }}
                        >
                          <b>{v}</b>
                          <div className="text-xs opacity-80">{pctf(v / mixTotal)}</div>
                        </div>
                      </td>
                    ))}
                  </tr>
                ))}
              </tbody>
            </table>
          </Card>
          <Card tour="pol-hist" title="Distribuição das bolhas" note="Quantas bolhas (≥ 3 votos) em cada faixa de % Vermelho, pelo voto do dono.">
            <svg viewBox="0 0 320 150" className="block h-auto w-full" role="img">
              {bins.map((b) => {
                let acc = 0;
                return (["green", "red", "none"] as const).map((k) => {
                  const v = b[k];
                  if (!v) return null;
                  const hgt = (v / binMax) * 120;
                  acc += hgt;
                  return (
                    <rect key={k + b.i} x={b.i * 32 + 2} y={130 - acc + 1} width={28} height={Math.max(1, hgt - 1)} rx={2} fill={SIDES.find((s) => s.key === k)!.color}>
                      <title>{`${b.i * 10}–${b.i * 10 + 10}% Vermelho: ${v} (${SIDES.find((s) => s.key === k)!.label})`}</title>
                    </rect>
                  );
                });
              })}
              {[0, 5, 10].map((i) => (
                <text key={i} x={Math.min(316, Math.max(4, i * 32))} y={146} fontSize={10} fill="var(--subtle)" textAnchor={i === 0 ? "start" : i === 10 ? "end" : "middle"}>
                  {i * 10}%
                </text>
              ))}
            </svg>
          </Card>
        </div>
      </div>

      <Card tour="pol-bridges" title="🌉 Pontes entre os lados" note="Membros com mais laços (seguir ou ser seguido) com quem votou diferente." className="mt-4">
        <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {bridges.map((n) => (
            <li key={n.id}>
              <a href={`${base}/centro?u=${encodeURIComponent(n.username)}`} className="flex items-center gap-2 rounded-lg p-1.5 hover:bg-muted">
                {n.avatar ? <img src={n.avatar} alt="" className="h-8 w-8 rounded-full" style={{ border: `2px ${n.vote === "red" ? "dashed" : "solid"} ${voteColor(n)}` }} /> : <span className="h-8 w-8 rounded-full bg-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm">
                  @{n.username}
                  <span className="block text-xs text-subtle">
                    {voteLabel(n)} · {n.sameTies} do mesmo lado
                  </span>
                </span>
                <b className="text-sm tabular-nums">{n.crossTies}</b>
              </a>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
