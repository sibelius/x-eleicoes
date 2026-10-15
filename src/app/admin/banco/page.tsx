import { Suspense } from "react";
import { connection } from "next/server";
import { Card, HBars, Kpi, PageTitle } from "@/components/admin/Card";
import { DayChart } from "@/components/admin/Charts";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { getDbStats } from "@/lib/stats";

export default function DbAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <DbAdmin />
    </Suspense>
  );
}

const mb = (b: number) => `${(b / 1024 / 1024).toFixed(1).replace(".", ",")} MB`;

async function DbAdmin() {
  await connection();
  await requireAdmin();
  const s = await getDbStats();
  const rows = s.tables.reduce((n, t) => n + t.rows, 0);
  const h = s.health;
  return (
    <>
      <PageTitle title="Banco de dados" sub={`${s.engine}: tamanho, linhas por tabela, crescimento diário e dados faltando.`} />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Tamanho" value={s.bytes != null ? mb(s.bytes) : "—"} />
        <Kpi label="Linhas" value={rows} hint={`${s.tables.length} tabelas`} />
        <Kpi label="Listas de seguidos importadas" value={h.importers} hint={`média de ${h.avgFollowing.toLocaleString("pt-BR")} por conta`} />
        <Kpi label="Pessoas com push" value={h.pushPeople} />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Por dia (14 dias)" note="Novos membros, escolhas de lado, mensagens">
          <DayChart
            data={s.daily}
            series={[
              { key: "members", label: "Membros", color: "var(--accent)" },
              { key: "picks", label: "Escolhas", color: "var(--green)" },
              { key: "messages", label: "Mensagens", color: "var(--red)" },
            ]}
          />
        </Card>
        <Card title="Visitantes únicos por dia">
          <DayChart data={s.daily} kind="line" series={[{ key: "visitors", label: "Visitantes", color: "var(--accent)" }]} />
        </Card>
        <Card title="Linhas por tabela">
          <HBars rows={s.tables.map((t) => ({ label: t.name, value: t.rows }))} />
        </Card>
        <Card title="Dados faltando" note="O que deixa bolhas incompletas">
          <ul className="grid gap-2 text-sm">
            <li>
              <b>{h.membersNoEdges}</b> membros sem lista de seguidos (a bolha deles depende só de quem os segue)
            </li>
            <li>
              <b>{h.membersNoPhoto}</b> membros sem foto (login OAuth 1.0a não traz a foto)
            </li>
            <li>
              <b>{h.profilesUnnamed.toLocaleString("pt-BR")}</b> contas conhecidas só pelo id, sem @
            </li>
          </ul>
        </Card>
      </div>
    </>
  );
}
