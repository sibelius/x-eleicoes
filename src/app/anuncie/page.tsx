import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { DayChart } from "@/components/admin/Charts";
import { Shimmer } from "@/components/Skeleton";
import { ADS } from "@/lib/ads";
import { AD_DM_URL } from "@/lib/links";
import { PLACEMENTS, getMediaKit, placementLabel } from "@/lib/sponsors";

export const metadata: Metadata = {
  title: "Anuncie",
  description: "Audiência, espaços e como funciona anunciar na Minha Bolha.",
  alternates: { canonical: "/anuncie" },
};

const n = (v: number) => v.toLocaleString("pt-BR");

export default function AnunciePage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Bolha
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Anuncie na Minha Bolha</h1>
      <p className="mt-1 text-subtle">
        Gente do Brasil inteiro entra com o X, escolhe Vermelho ou Verde e compartilha a própria bolha. Sua marca aparece no rodapé
        das telas principais, para quem está vendo e compartilhando.
      </p>
      <a href={AD_DM_URL} target="_blank" rel="noreferrer" className="mt-4 inline-block rounded-full bg-fg px-5 py-2.5 font-semibold text-bg">
        📢 Quero anunciar (mensagem no X)
      </a>

      <Suspense fallback={<Shimmer className="mt-6 h-64 w-full" />}>
        <Audience />
      </Suspense>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Como funciona</h2>
        <ol className="mt-2 grid gap-2 text-sm">
          <li>
            <b>1. A arte.</b> Uma imagem horizontal (como as do carrossel abaixo) e o link do seu site. Seu link sai com UTMs
            (utm_source=minhabolha, e a tela em utm_content), então você vê as visitas no seu próprio analytics.
          </li>
          <li>
            <b>2. O carrossel.</b> Os anúncios giram em ordem aleatória a cada página aberta, em todas as telas com o espaço
            “Patrocinado”. Ninguém fica sempre por último.
          </li>
          <li>
            <b>3. O relatório.</b> Você recebe um link privado com impressões, pessoas alcançadas, cliques, CTR, gráfico por dia e por
            tela, atualizado em tempo real. Dá pra imprimir ou salvar em PDF.
          </li>
          <li>
            <b>4. Sem rastreio de terceiros.</b> Contamos impressões e cliques no nosso próprio banco, sem pixels de anunciantes e sem
            identificar visitantes para ninguém.
          </li>
        </ol>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">Quem já anuncia</h2>
        <div className="mt-3 grid grid-cols-2 gap-2 sm:grid-cols-3">
          {ADS.map((a) => (
            <a key={a.name} href={a.href} target="_blank" rel="noreferrer" title={a.alt} className="block overflow-hidden rounded-xl border border-line">
              <img src={a.image} alt={a.alt} className="aspect-[1.9] w-full object-cover" />
            </a>
          ))}
        </div>
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4 text-center">
        <h2 className="text-lg font-semibold">Vamos conversar?</h2>
        <p className="mt-1 text-sm text-subtle">Me chama no X com o seu site e a ideia da campanha. Respondo rápido.</p>
        <a href={AD_DM_URL} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-fg px-5 py-2.5 font-semibold text-bg">
          Comprar anúncio (mensagem no X)
        </a>
      </section>
    </main>
  );
}

function Big({ label, value, hint }: { label: string; value: string; hint?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="text-xs text-subtle">{label}</div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{value}</div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
}

async function Audience() {
  const k = await getMediaKit();
  const seen = new Map(k.placements.map((p) => [p.placement, p]));
  const screens = [...new Set([...Object.keys(PLACEMENTS), ...seen.keys()])];
  return (
    <>
      <section className="mt-6">
        <h2 className="mb-2 text-lg font-semibold">Audiência</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3">
          <Big label="Membros" value={n(k.members)} hint="entraram com a conta do X" />
          <Big label="Visitantes, 7 dias" value={n(k.visitors7)} hint="pessoas diferentes" />
          <Big label="Visitantes, 30 dias" value={n(k.visitors30)} hint="pessoas diferentes" />
          <Big label="Visitas a bolhas" value={n(k.bubbleViews)} hint={`${n(k.bubbles)} bolhas diferentes vistas`} />
          <Big label="Impressões de anúncios" value={n(k.ads.views)} hint={`${n(k.ads.reach)} pessoas alcançadas`} />
          <Big label="CTR médio" value={k.ads.views ? `${(k.ads.ctr * 100).toFixed(2).replace(".", ",")}%` : "—"} hint={`${n(k.ads.clicks)} cliques no total`} />
        </div>
      </section>
      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Visitantes por dia</h2>
        <p className="mt-0.5 text-xs text-subtle">Pessoas diferentes por dia, últimos 30 dias.</p>
        <div className="mt-3">
          <DayChart data={k.daily} series={[{ key: "visitors", label: "Visitantes", color: "var(--accent)" }]} height={150} />
        </div>
      </section>
      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="font-semibold">Onde o anúncio aparece</h2>
        <p className="mt-0.5 text-xs text-subtle">O espaço “Patrocinado” fica no rodapé de cada uma destas telas. Impressões desde o início.</p>
        <ul className="mt-3 divide-y divide-line text-sm">
          {screens.map((p) => (
            <li key={p} className="flex items-baseline justify-between gap-3 py-2">
              <div>
                <b>{placementLabel(p)}</b>
                {PLACEMENTS[p] && <span className="text-subtle"> · {PLACEMENTS[p].note}</span>}
              </div>
              <span className="shrink-0 tabular-nums text-subtle">{n(seen.get(p)?.views ?? 0)} {(seen.get(p)?.views ?? 0) === 1 ? "impressão" : "impressões"}</span>
            </li>
          ))}
        </ul>
      </section>
    </>
  );
}
