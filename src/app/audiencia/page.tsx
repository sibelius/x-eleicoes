import type { Metadata } from "next";
import Link from "next/link";
import { redirect } from "next/navigation";
import { Suspense } from "react";
import { Card, Kpi } from "@/components/admin/Card";
import { communityColor } from "@/components/admin/metrics";
import { AudienceMap } from "@/components/audience/AudienceMap";
import { PageSkeleton, Shimmer } from "@/components/Skeleton";
import { TallyBar } from "@/components/TallyBar";
import { AUDIENCE_CAP, bridges, getAudience, mutuals, topFollowers, type AudienceNode } from "@/lib/audience";
import { SIDE, profileUrl, sharePath } from "@/lib/links";
import { getMe } from "@/lib/network";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Sua audiência (beta)",
  description: "Quem importa na sua audiência do X: alcance, pontes entre os lados e comunidades.",
  robots: { index: false },
};

export default function Page() {
  return (
    <Suspense
      fallback={
        <div className="mx-auto w-full max-w-5xl px-4 py-10">
          <Shimmer className="h-8 w-1/2" />
          <PageSkeleton bubble={false} />
        </div>
      }
    >
      <Audiencia />
    </Suspense>
  );
}

const fmt = (n: number) => n.toLocaleString("pt-BR");

async function Audiencia() {
  const uid = await getUserId();
  if (!uid) redirect("/");
  const me = await getMe(uid);
  if (!me) redirect("/");
  const a = await getAudience(uid);
  const s = a.summary;
  const top = topFollowers(a);
  const pontes = bridges(a);
  const mutuos = mutuals(a);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="flex flex-wrap items-start justify-between gap-3">
        <div>
          <h1 className="flex items-center gap-2 text-2xl font-bold tracking-tight">
            Sua audiência
            <span className="rounded-full bg-[var(--accent)] px-2 py-0.5 text-xs font-semibold text-white">Beta</span>
          </h1>
          <p className="mt-1 max-w-2xl text-sm text-subtle">
            Quem importa entre quem segue @{me.username}: alcance dentro da rede conhecida, pontes entre os lados e as comunidades da sua
            audiência. Ferramenta para criadores e marcas, grátis durante o beta.
          </p>
        </div>
        <div className="flex flex-wrap gap-2 text-sm">
          <Link href="/app" className="rounded-full border border-line px-4 py-2">
            ← Voltar
          </Link>
          {a.nodes.length > 0 && (
            <a href="/api/audience/csv" className="rounded-full bg-fg px-4 py-2 text-bg" download>
              Baixar CSV
            </a>
          )}
        </div>
      </header>

      {/* 1. Resumo */}
      <section className="mt-6 grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Seguidores conhecidos" value={s.followers} />
        <Kpi label="Seguindo" value={s.following} />
        <Kpi label="Mútuos" value={s.mutuals} hint="vocês se seguem" />
        <Kpi label="Membros do app" value={s.members} hint={`${fmt(s.memberFollowers)} te seguem`} />
      </section>
      <Card className="mt-3" title="De que lado está sua audiência" note="Entre os seus seguidores que já escolheram um lado.">
        {s.red + s.green > 0 ? (
          <TallyBar tally={{ red: s.red, green: s.green, total: s.red + s.green }} />
        ) : (
          <p className="text-sm text-subtle">Nenhum seguidor seu escolheu um lado ainda.</p>
        )}
      </Card>

      {a.nodes.length === 0 ? (
        <Card className="mt-4" title="Ainda não conhecemos sua audiência">
          <p className="text-sm text-subtle">
            Importe o arquivo do X no seu painel para trazer quem você segue e quem te segue.{" "}
            <Link href="/app" className="underline">
              Ir para o painel
            </Link>
          </p>
        </Card>
      ) : (
        <>
          {a.capped && (
            <p className="mt-3 text-xs text-subtle">
              Analisando as {fmt(AUDIENCE_CAP)} contas de maior alcance entre {fmt(s.accounts)} na sua rede.
            </p>
          )}

          {/* 2. Quem importa */}
          <h2 className="mt-8 text-xl font-bold">Quem importa na sua audiência</h2>
          <p className="text-sm text-subtle">
            <b>Alcance</b> = quantas contas conhecidas pelo Minha Bolha seguem a pessoa.
          </p>
          <div className="mt-3 grid gap-4 lg:grid-cols-[1.4fr_1fr]">
            <Card title="Seus seguidores de maior alcance" note="Quem te segue e é seguido por mais gente.">
              <People rows={top} empty="Nenhum seguidor conhecido ainda." rank />
            </Card>
            <div className="grid content-start gap-4">
              <Card title="Pontes" note="Seguidores ligados a gente dos dois lados: falam com Vermelho e com Verde.">
                <People rows={pontes} empty="Nenhum seguidor ligado aos dois lados ainda." bridge />
              </Card>
              <Card title="Superfãs e mútuos" note="Vocês se seguem; primeiro quem mais conecta o resto da sua audiência.">
                <People rows={mutuos} empty="Nenhum mútuo conhecido ainda." />
              </Card>
            </div>
          </div>

          {/* 3. Comunidades */}
          <h2 className="mt-8 text-xl font-bold">Comunidades</h2>
          <p className="text-sm text-subtle">
            Grupos que se seguem entre si dentro da sua audiência (detecção de comunidades por modularidade, sem olhar o voto).
          </p>
          {a.communities.length === 0 ? (
            <p className="mt-3 text-sm text-subtle">Sua audiência ainda não tem ligações suficientes para formar grupos.</p>
          ) : (
            <div className="mt-3 grid gap-3 sm:grid-cols-2 lg:grid-cols-3">
              {a.communities.slice(0, 9).map((c) => {
                const voted = c.red + c.green;
                return (
                  <section key={c.id} className="rounded-2xl border border-line bg-card p-4">
                    <div className="flex items-center gap-2">
                      <span className="h-3 w-3 shrink-0 rounded-full" style={{ background: communityColor(c.id) }} />
                      <h3 className="min-w-0 truncate font-semibold" title={c.label}>
                        {c.label}
                      </h3>
                    </div>
                    <p className="mt-1 text-xs text-subtle">
                      {fmt(c.size)} contas · {fmt(c.followers)} te seguem
                    </p>
                    <div className="mt-2 flex h-2 overflow-hidden rounded-full bg-muted" title={`${c.red} Vermelho, ${c.green} Verde`}>
                      {voted > 0 && (
                        <>
                          <div style={{ width: `${(c.red / voted) * 100}%`, background: "var(--red)" }} />
                          <div style={{ width: `${(c.green / voted) * 100}%`, background: "var(--green)" }} />
                        </>
                      )}
                    </div>
                    <p className="mt-1 text-xs text-subtle">
                      {voted ? `${c.red} ${SIDE.red} · ${c.green} ${SIDE.green}` : "Ninguém escolheu lado"}
                    </p>
                    <ul className="mt-3 grid gap-1.5">
                      {c.top.map((p) => (
                        <li key={p.id} className="flex items-center gap-2 text-sm">
                          <Avatar src={p.avatar} />
                          <span className="min-w-0 flex-1 truncate">
                            {p.username ? (
                              <Link href={sharePath(p.username)} className="hover:underline">
                                @{p.username}
                              </Link>
                            ) : (
                              <span className="text-subtle">{p.name ?? p.id}</span>
                            )}
                          </span>
                          <span className="tabular-nums text-xs text-subtle">{fmt(p.reach)}</span>
                        </li>
                      ))}
                    </ul>
                  </section>
                );
              })}
            </div>
          )}

          {/* 4. Mapa */}
          <h2 className="mt-8 text-xl font-bold">Mapa da audiência</h2>
          <p className="text-sm text-subtle">Cada ponto é uma conta; perto = se seguem. Arraste para mover, use os botões ou a pinça para dar zoom.</p>
          <div className="mt-3">
            <AudienceMap />
          </div>

          {/* 5. Export */}
          <Card className="mt-8" title="Exportar">
            <p className="text-sm text-subtle">
              A lista completa ({fmt(a.nodes.length)} contas, por alcance) com handle, nome, alcance, lado, relação e comunidade.
            </p>
            <a href="/api/audience/csv" className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg" download>
              Baixar CSV
            </a>
          </Card>
        </>
      )}
    </main>
  );
}

function Avatar({ src }: { src: string | null }) {
  return src ? (
    <img src={src} alt="" className="h-7 w-7 shrink-0 rounded-full" loading="lazy" />
  ) : (
    <span className="h-7 w-7 shrink-0 rounded-full bg-muted" />
  );
}

function People({ rows, empty, rank, bridge }: { rows: AudienceNode[]; empty: string; rank?: boolean; bridge?: boolean }) {
  if (!rows.length) return <p className="text-sm text-subtle">{empty}</p>;
  return (
    <ol className="grid gap-2">
      {rows.map((p, i) => (
        <li key={p.id} className="flex items-center gap-2.5">
          {rank && <span className="w-5 shrink-0 text-right text-xs tabular-nums text-subtle">{i + 1}</span>}
          <Avatar src={p.avatar} />
          <div className="min-w-0 flex-1">
            <div className="flex min-w-0 items-center gap-1.5">
              <span className="truncate text-sm font-medium">{p.name ?? p.username ?? p.id}</span>
              {p.vote && (
                <span
                  className="shrink-0 rounded-full px-1.5 text-[10px] font-semibold text-white"
                  style={{ background: `var(--${p.vote})` }}
                >
                  {SIDE[p.vote]}
                </span>
              )}
            </div>
            <div className="flex gap-2 text-xs text-subtle">
              {p.username && <span className="truncate">@{p.username}</span>}
              {p.username && (
                <Link href={sharePath(p.username)} className="shrink-0 underline">
                  bolha
                </Link>
              )}
              <a href={profileUrl(p)} target="_blank" rel="noreferrer" className="shrink-0 underline">
                X
              </a>
            </div>
          </div>
          <div className="shrink-0 text-right">
            <div className="text-sm font-bold tabular-nums">{fmt(p.reach)}</div>
            <div className="text-[10px] text-subtle">
              {bridge ? (
                <>
                  <span className="text-[var(--red)]">{p.red}</span> · <span className="text-[var(--green)]">{p.green}</span>
                </>
              ) : (
                "alcance"
              )}
            </div>
          </div>
        </li>
      ))}
    </ol>
  );
}
