import { Suspense } from "react";
import { connection } from "next/server";
import { Card, HBars, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { DayChart } from "@/components/admin/Charts";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { ADS } from "@/lib/ads";
import { getAdStats } from "@/lib/stats";

const PLACEMENT: Record<string, string> = {
  home: "Início",
  app: "Minha bolha",
  bubble: "Bolha de alguém",
  directory: "Todas as bolhas",
  ranking: "Ranking",
  compare: "Comparar",
};

export default function AdsPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Ads />
    </Suspense>
  );
}

function Spark({ values }: { values: number[] }) {
  const max = Math.max(1, ...values);
  const w = 120;
  const h = 28;
  const step = w / values.length;
  return (
    <svg viewBox={`0 0 ${w} ${h}`} className="h-7 w-28" aria-hidden>
      {values.map((v, i) => (
        <rect key={i} x={i * step + 0.5} width={Math.max(1, step - 1)} y={h - (v / max) * h} height={(v / max) * h} rx={1} fill="var(--accent)" />
      ))}
    </svg>
  );
}

async function Ads() {
  await connection();
  await requireAdmin();
  const s = await getAdStats();
  const ctr = (clicks: number, views: number) => (views ? pctf(clicks / views, 2) : "—");
  const cellMax = Math.max(1, ...Object.values(s.matrix).flatMap((r) => Object.values(r).map((c) => c.views)));
  return (
    <>
      <PageTitle
        title="Anúncios"
        sub="Impressão = o anúncio ficou ao menos 1s na tela, com o carrossel visível (uma por anúncio a cada página aberta). Clique = abriu o link."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Impressões" value={s.totals.views} />
        <Kpi label="Pessoas alcançadas" value={s.totals.reach} hint="visitantes únicos que viram algum" />
        <Kpi label="Cliques" value={s.totals.clicks} hint={`${s.totals.clickers} pessoas`} />
        <Kpi label="CTR geral" value={ctr(s.totals.clicks, s.totals.views)} />
      </div>

      <Card title="Por anúncio" className="mt-4">
        <div className="-mx-4 overflow-x-auto px-4">
          <table className="w-full min-w-[640px] text-sm">
            <thead className="text-left text-xs text-subtle">
              <tr>
                <th className="py-1.5 font-normal">Anúncio</th>
                <th className="py-1.5 text-right font-normal">Impressões</th>
                <th className="py-1.5 text-right font-normal">Alcance</th>
                <th className="py-1.5 text-right font-normal">Cliques</th>
                <th className="py-1.5 text-right font-normal">Quem clicou</th>
                <th className="py-1.5 text-right font-normal">CTR</th>
                <th className="py-1.5 pl-4 font-normal">Impressões, 30 dias</th>
              </tr>
            </thead>
            <tbody>
              {s.ads.map((a) => {
                const ad = ADS.find((x) => x.name === a.ad)!;
                return (
                  <tr key={a.ad} className="border-t border-line">
                    <td className="py-2">
                      <a href={ad.href} target="_blank" rel="noreferrer" className="flex items-center gap-2 hover:underline">
                        <img src={ad.image} alt="" className="h-7 w-[53px] rounded object-cover" />
                        <b>{a.ad}</b>
                      </a>
                    </td>
                    <td className="py-2 text-right tabular-nums">{a.views.toLocaleString("pt-BR")}</td>
                    <td className="py-2 text-right tabular-nums">{a.viewers.toLocaleString("pt-BR")}</td>
                    <td className="py-2 text-right tabular-nums">{a.clicks.toLocaleString("pt-BR")}</td>
                    <td className="py-2 text-right tabular-nums">{a.clickers.toLocaleString("pt-BR")}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{ctr(a.clicks, a.views)}</td>
                    <td className="py-2 pl-4">
                      <Spark values={s.daily[a.ad].map((d) => d.views)} />
                    </td>
                  </tr>
                );
              })}
            </tbody>
          </table>
        </div>
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Impressões por dia">
          <DayChart data={s.totalByDay} series={[{ key: "views", label: "Impressões", color: "var(--accent)" }]} />
        </Card>
        <Card title="Cliques por dia">
          <DayChart data={s.totalByDay} series={[{ key: "clicks", label: "Cliques", color: "var(--accent)" }]} />
        </Card>
        <Card title="Alcance por anúncio" note="Pessoas diferentes que viram cada um.">
          <HBars rows={s.ads.map((a) => ({ label: a.ad, value: a.viewers }))} />
        </Card>
        <Card title="CTR por anúncio" note="Cliques ÷ impressões.">
          <HBars
            rows={s.ads.map((a) => ({ label: a.ad, value: a.views ? a.clicks / a.views : 0, note: `${a.clicks} cliques` }))}
            format={(v) => pctf(v, 2)}
          />
        </Card>
      </div>

      <Card title="Impressões por tela" note="Onde cada anúncio foi visto (cliques entre parênteses). Mais escuro = mais impressões." className="mt-4">
        {s.placements.length === 0 ? (
          <p className="text-sm text-subtle">Nenhuma impressão registrada ainda.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[560px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="py-1.5 font-normal">Anúncio</th>
                  {s.placements.map((p) => (
                    <th key={p} className="py-1.5 text-center font-normal">
                      {PLACEMENT[p] ?? p}
                    </th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {ADS.map(({ name }) => (
                  <tr key={name}>
                    <td className="py-0.5 pr-2 font-semibold">{name}</td>
                    {s.placements.map((p) => {
                      const c = s.matrix[name][p];
                      const t = c.views / cellMax;
                      return (
                        <td key={p} className="p-0.5">
                          <div
                            className="rounded-md px-2 py-1.5 text-center tabular-nums"
                            style={{
                              background: `color-mix(in oklab, var(--accent) ${Math.round(t * 85)}%, var(--muted))`,
                              color: t > 0.5 ? "white" : "var(--fg)",
                            }}
                          >
                            {c.views}
                            {c.clicks > 0 && <span className="opacity-80"> ({c.clicks})</span>}
                          </div>
                        </td>
                      );
                    })}
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>
    </>
  );
}
