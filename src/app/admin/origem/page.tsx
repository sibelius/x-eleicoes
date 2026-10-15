import { Suspense } from "react";
import { connection } from "next/server";
import { Card, HBars, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { DayChart } from "@/components/admin/Charts";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getUtmStats, type UtmRow } from "@/lib/stats";

// Names for the utm_campaign values we tag (see withUtm in lib/links and the pushes in lib/push).
const CAMPAIGN: Record<string, string> = {
  bubble: "Bolha postada",
  invite: "Convite",
  nudge: "Cobrança (quem não votou)",
  compare: "Comparação",
  challenge: "Desafio",
  call: "Chamar alguém",
  donate: "Doação",
  joined: "Push: alguém entrou",
  voted: "Push: alguém votou",
  switched: "Push: trocou de lado",
  invite_push: "Push: entrou pelo convite",
  "shared-bubble": "Push: bolha compartilhada",
  "shared-compare": "Push: comparação",
  viewed: "Push: viram sua bolha",
  daily: "Push: resumo diário",
};
const SOURCE: Record<string, string> = { "x|social": "Posts no X", "push|webpush": "Notificações push" };

export default function OriginPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Origin />
    </Suspense>
  );
}

const name = (r: UtmRow) => (r.source === "push" && r.campaign === "invite" ? CAMPAIGN.invite_push : CAMPAIGN[r.campaign] ?? r.campaign);

async function Origin() {
  await connection();
  await requireAdmin();
  const s = await getUtmStats();
  const conv = (a: number, b: number) => (b ? pctf(a / b, 1) : "—");
  return (
    <>
      <PageTitle
        title="Origem (UTM)"
        sub="Quem chegou pelos links que o app distribui: posts no X (bolha, convite, comparação…) e notificações push. Cadastro = conta nova criada depois de chegar por um link (primeiro toque, 30 dias)."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Chegadas por link" value={s.totals.visits} />
        <Kpi label="Visitantes únicos" value={s.totals.visitors} />
        <Kpi label="Cadastros" value={s.totals.signups} hint={`${conv(s.totals.signups, s.totals.visitors)} dos visitantes`} />
        <Kpi label="Cadastraram e votaram" value={s.totals.voted} hint={conv(s.totals.voted, s.totals.signups) + " dos cadastros"} />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Chegadas por dia">
          <DayChart data={s.daily} series={[{ key: "visits", label: "Chegadas", color: "var(--accent)" }]} />
        </Card>
        <Card title="Cadastros por dia">
          <DayChart data={s.daily} series={[{ key: "signups", label: "Cadastros", color: "var(--accent)" }]} />
        </Card>
        <Card title="Por canal">
          <HBars rows={s.sources.map((r) => ({ label: SOURCE[`${r.source}|${r.medium}`] ?? `${r.source} / ${r.medium}`, value: r.visits, note: `${r.signups} cadastros` }))} />
        </Card>
        <Card title="Páginas de chegada">
          <HBars rows={s.paths.map((p) => ({ label: p.path, value: p.visits }))} />
        </Card>
      </div>

      <Card title="Por campanha" note="Cada tipo de link. Conversão = cadastros ÷ visitantes únicos." className="mt-4">
        {s.campaigns.length === 0 ? (
          <p className="text-sm text-subtle">Nenhuma chegada por link marcado ainda.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="py-1.5 font-normal">Campanha</th>
                  <th className="py-1.5 font-normal">Canal</th>
                  <th className="py-1.5 text-right font-normal">Chegadas</th>
                  <th className="py-1.5 text-right font-normal">Visitantes</th>
                  <th className="py-1.5 text-right font-normal">Cadastros</th>
                  <th className="py-1.5 text-right font-normal">Votaram</th>
                  <th className="py-1.5 text-right font-normal">Conversão</th>
                </tr>
              </thead>
              <tbody>
                {s.campaigns.map((r) => (
                  <tr key={`${r.source}|${r.medium}|${r.campaign}`} className="border-t border-line">
                    <td className="py-2 font-semibold">{name(r)}</td>
                    <td className="py-2 text-subtle">{SOURCE[`${r.source}|${r.medium}`] ?? `${r.source} / ${r.medium}`}</td>
                    <td className="py-2 text-right tabular-nums">{r.visits}</td>
                    <td className="py-2 text-right tabular-nums">{r.visitors}</td>
                    <td className="py-2 text-right tabular-nums">{r.signups}</td>
                    <td className="py-2 text-right tabular-nums">{r.voted}</td>
                    <td className="py-2 text-right font-semibold tabular-nums">{conv(r.signups, r.visitors)}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Card>

      {s.detail.some((r) => r.content) && (
        <Card title="Detalhe (utm_content)" note="Ex.: bolha própria × de outra pessoa; convite geral × pessoal." className="mt-4">
          <ul className="grid gap-1 text-sm sm:grid-cols-2">
            {s.detail
              .filter((r) => r.content)
              .map((r) => (
                <li key={`${r.source}|${r.campaign}|${r.content}`} className="flex justify-between gap-2 border-b border-line py-1">
                  <span>
                    {name(r)} · <span className="text-subtle">{r.content}</span>
                  </span>
                  <span className="tabular-nums">
                    {r.visits} chegadas · {r.signups} cadastros
                  </span>
                </li>
              ))}
          </ul>
        </Card>
      )}
    </>
  );
}
