import { Suspense } from "react";
import { connection } from "next/server";
import { Card, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { DayChart } from "@/components/admin/Charts";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { sharePath } from "@/lib/links";
import { getOverview } from "@/lib/stats";

export default function AdminHome() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Overview />
    </Suspense>
  );
}

async function Overview() {
  await connection();
  await requireAdmin();
  const { kpis: k, growth, traffic, topBubbles } = await getOverview();
  const voters = k.red + k.green;
  return (
    <>
      <PageTitle title="Visão geral" sub="Membros, votos, tráfego e o que as pessoas mais olham. Últimos 30 dias nos gráficos." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-6">
        <Kpi label="Membros" value={k.members} hint={`${k.invited} vieram por convite`} />
        <Kpi label="Vermelho" value={k.red} hint={voters ? pctf(k.red / voters) + " dos votos" : undefined} color="var(--red)" />
        <Kpi label="Verde" value={k.green} hint={voters ? pctf(k.green / voters) + " dos votos" : undefined} color="var(--green)" />
        <Kpi label="Sem voto" value={k.undecided} hint={k.members ? pctf(k.undecided / k.members) + " dos membros" : undefined} color="var(--none)" />
        <Kpi label="Online agora" value={k.online} />
        <Kpi label="Visitantes únicos" value={k.visitors} hint="desde o início" />
        <Kpi label="Ligações conhecidas" value={k.edges} hint={`${k.memberEdges} entre membros`} />
        <Kpi label="Perfis do X" value={k.profiles} />
        <Kpi label="Listas importadas" value={k.imports} />
        <Kpi label="Com push ligado" value={k.pushUsers} hint={k.members ? pctf(k.pushUsers / k.members) : undefined} />
        <Kpi label="Bolhas vistas" value={k.bubblesViewed} hint={`${k.bubbleViews} visitas-dia`} />
        <Kpi label="Votos por membro" value={k.members ? pctf(voters / k.members) : "—"} hint="taxa de conversão" />
      </div>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Votos por dia" note="Pela data do voto atual de cada pessoa (quem trocou de lado conta no dia da troca).">
          <DayChart
            data={growth}
            series={[
              { key: "green", label: "Verde", color: "var(--green)" },
              { key: "red", label: "Vermelho", color: "var(--red)" },
            ]}
          />
        </Card>
        <Card title="Novos membros por dia">
          <DayChart data={growth} series={[{ key: "joined", label: "Novos membros", color: "var(--accent)" }]} />
        </Card>
        <Card title="Membros acumulados">
          <DayChart data={growth} kind="line" series={[{ key: "members", label: "Membros", color: "var(--accent)" }]} />
        </Card>
        <Card title="Visitantes únicos por dia" note="Dia em UTC. Logados contam uma vez em qualquer aparelho.">
          <DayChart
            data={traffic}
            kind="line"
            series={[
              { key: "visitors", label: "Todos", color: "var(--accent)" },
              { key: "signed", label: "Logados", color: "var(--subtle)" },
            ]}
          />
        </Card>
      </div>

      <Card title="Bolhas mais vistas" note="Visitantes únicos de cada página /r/@ (sem contar o dono)." className="mt-4">
        <ol className="grid gap-1 sm:grid-cols-2 lg:grid-cols-3">
          {topBubbles.map((b, i) => (
            <li key={b.id}>
              <a href={b.username ? sharePath(b.username) : undefined} className="flex items-center gap-2 rounded-xl p-1.5 hover:bg-muted">
                <span className="w-5 text-right text-xs text-subtle">{i + 1}</span>
                {b.avatar ? <img src={b.avatar} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-muted" />}
                <span className="min-w-0 flex-1 truncate text-sm">
                  @{b.username ?? b.id}
                  {b.vote && (
                    <span className="ml-1 text-xs" style={{ color: `var(--${b.vote})` }}>
                      {b.vote === "red" ? "Vermelho" : "Verde"}
                    </span>
                  )}
                </span>
                <b className="text-sm tabular-nums">{b.views}</b>
              </a>
            </li>
          ))}
        </ol>
      </Card>
    </>
  );
}
