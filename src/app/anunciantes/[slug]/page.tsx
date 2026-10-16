import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { connection } from "next/server";
import { DayChart } from "@/components/admin/Charts";
import { PrintButton } from "@/components/PrintButton";
import { PageSkeleton } from "@/components/Skeleton";
import { adBySlug, checkReportToken, getSponsorReport, placementLabel } from "@/lib/sponsors";

// A sponsor's own numbers, shared by link (/anunciantes/<slug>?k=<HMAC>): no login, wrong key → 404.

export const metadata: Metadata = {
  title: "Relatório do anunciante",
  robots: { index: false, follow: false },
};

type Props = { params: Promise<{ slug: string }>; searchParams: Promise<Record<string, string | string[] | undefined>> };

export default function SponsorReportPage({ params, searchParams }: Props) {
  return (
    <main className="mx-auto w-full max-w-4xl px-4 py-8 print:max-w-none print:py-0">
      {/* Print: only the report (no live bar, footer or prompts from the layout). */}
      <style>{`@media print { body > *:not(main) { display: none !important; } @page { margin: 14mm; } }`}</style>
      <Suspense fallback={<PageSkeleton bubble={false} />}>
        <Report params={params} searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

const n = (v: number) => v.toLocaleString("pt-BR");
const pct = (v: number, digits = 2) => `${(v * 100).toFixed(digits).replace(".", ",")}%`;
const fmtDay = (d: string | null) => (d ? `${d.slice(8, 10)}/${d.slice(5, 7)}/${d.slice(0, 4)}` : "—");

function Stat({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3 print:break-inside-avoid">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
}

function Section({ title, note, children }: { title: string; note?: string; children: React.ReactNode }) {
  return (
    <section className="mt-4 rounded-2xl border border-line bg-card p-4 print:break-inside-avoid">
      <h2 className="font-semibold">{title}</h2>
      {note && <p className="mt-0.5 text-xs text-subtle">{note}</p>}
      <div className="mt-3">{children}</div>
    </section>
  );
}

async function Report({ params, searchParams }: Props) {
  await connection();
  const { slug } = await params;
  const k = (await searchParams).k;
  const ad = adBySlug(slug);
  if (!ad || !checkReportToken(slug, typeof k === "string" ? k : null)) notFound();
  const r = await getSponsorReport(ad.name);
  const t = r.totals;
  const ctr = t.views ? t.clicks / t.views : 0;
  const generated = new Date().toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", dateStyle: "long", timeStyle: "short" });
  const avgVisitors = Math.round(r.daily.reduce((s, d) => s + d.visitors, 0) / r.daily.length);
  return (
    <>
      <header className="flex flex-wrap items-start justify-between gap-3 border-b border-line pb-4">
        <div>
          <div className="text-xs font-semibold tracking-widest text-subtle uppercase">Minha Bolha · Relatório do anunciante</div>
          <h1 className="mt-1 text-3xl font-bold tracking-tight">{ad.name}</h1>
          <p className="text-sm text-subtle">
            {t.firstDay ? `No ar desde ${fmtDay(t.firstDay)}` : "Ainda sem impressões registradas"} · gerado em {generated}
          </p>
        </div>
        <div className="flex flex-col items-end gap-2">
          <img src={ad.image} alt={ad.alt} className="h-16 w-auto rounded-lg border border-line object-cover" />
          <PrintButton />
        </div>
      </header>

      <div className="mt-4 grid grid-cols-2 gap-3 sm:grid-cols-5">
        <Stat label="Impressões" value={n(t.views)} />
        <Stat label="Pessoas que viram" value={n(t.viewers)} hint="visitantes únicos" />
        <Stat label="Cliques" value={n(t.clicks)} />
        <Stat label="Pessoas que clicaram" value={n(t.clickers)} hint="visitantes únicos" />
        <Stat label="CTR" value={t.views ? pct(ctr) : "—"} hint="cliques ÷ impressões" />
      </div>

      <Section title="Por dia, últimos 30 dias" note="Impressões e cliques do seu anúncio (dias em UTC).">
        <div className="mb-1 text-xs font-semibold text-subtle">Impressões</div>
        <DayChart data={r.daily} series={[{ key: "views", label: "Impressões", color: "var(--accent)" }]} height={160} />
        <div className="mt-3">
          <div className="mb-1 text-xs font-semibold text-subtle">Cliques</div>
          <DayChart data={r.daily} series={[{ key: "clicks", label: "Cliques", color: "var(--green)" }]} height={120} />
        </div>
      </Section>

      <Section title="Por tela" note="Onde o anúncio foi visto. O carrossel aparece no rodapé das telas principais.">
        {r.placements.length === 0 ? (
          <p className="text-sm text-subtle">Nenhuma impressão registrada ainda.</p>
        ) : (
          <div className="-mx-4 overflow-x-auto px-4">
            <table className="w-full min-w-[480px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="py-1.5 font-normal">Tela</th>
                  <th className="py-1.5 text-right font-normal">Impressões</th>
                  <th className="py-1.5 text-right font-normal">Pessoas</th>
                  <th className="py-1.5 text-right font-normal">Cliques</th>
                  <th className="py-1.5 text-right font-normal">CTR</th>
                </tr>
              </thead>
              <tbody>
                {r.placements.map((p) => (
                  <tr key={p.placement} className="border-t border-line">
                    <td className="py-2 font-semibold">{placementLabel(p.placement)}</td>
                    <td className="py-2 text-right tabular-nums">{n(p.views)}</td>
                    <td className="py-2 text-right tabular-nums">{n(p.viewers)}</td>
                    <td className="py-2 text-right tabular-nums">{n(p.clicks)}</td>
                    <td className="py-2 text-right tabular-nums">{p.views ? pct(p.clicks / p.views) : "—"}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </Section>

      <Section title="Contexto: visitantes do site" note="Pessoas diferentes que abriram a Minha Bolha por dia, últimos 30 dias.">
        <div className="mb-3 grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Stat label="Visitantes, 30 dias" value={n(r.window.visitors)} />
          <Stat label="Média por dia" value={n(avgVisitors)} />
          <Stat
            label="Viram seu anúncio"
            value={r.window.visitors ? pct(Math.min(1, r.window.reached / r.window.visitors), 0) : "—"}
            hint={`${n(r.window.reached)} dos visitantes em 30 dias`}
          />
        </div>
        <DayChart data={r.daily} series={[{ key: "visitors", label: "Visitantes", color: "var(--subtle)" }]} height={120} />
      </Section>

      <p className="mt-4 text-xs text-subtle">
        Como contamos: uma impressão é o anúncio ao menos 1 segundo na tela, com o carrossel visível (uma por anúncio a cada página
        aberta). Clique é abrir o seu link, que leva UTMs (utm_source=minhabolha) para você ver as visitas no seu analytics. Pessoas
        únicas: quem entrou com o X conta como uma pessoa em qualquer aparelho; os demais, por um cookie anônimo. Não guardamos nada
        que identifique visitantes para os anunciantes.
      </p>
    </>
  );
}
