import { Suspense } from "react";
import { connection } from "next/server";
import { Card, HBars, Kpi, PageTitle } from "@/components/admin/Card";
import { DayChart } from "@/components/admin/Charts";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { sharePath } from "@/lib/links";
import { getPushLog } from "@/lib/stats";

export default function PushAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <PushAdmin />
    </Suspense>
  );
}

const when = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function PushAdmin() {
  await connection();
  await requireAdmin();
  const p = await getPushLog(500);
  const total = p.byCampaign.reduce((s, c) => s + c.n, 0);
  const ok = p.byCampaign.reduce((s, c) => s + c.ok, 0);
  return (
    <>
      <PageTitle title="Notificações push" sub="Todo push enviado, para quem, com o texto. Uma linha por pessoa por notificação (registro começa com esta versão)." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Pushes enviados" value={total} />
        <Kpi label="Entregues" value={ok} hint={total ? `${Math.round((ok / total) * 100)}% chegaram a algum aparelho` : undefined} />
        <Kpi label="Tipos" value={p.byCampaign.length} />
        <Kpi label="Pessoas alcançadas" value={new Set(p.rows.map((r) => r.username)).size} hint="nos últimos 500" />
      </div>
      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Pushes por dia">
          <DayChart data={p.daily} series={[{ key: "pushes", label: "Pushes", color: "var(--accent)" }]} />
        </Card>
        <Card title="Por tipo">
          <HBars rows={p.byCampaign.map((c) => ({ label: c.campaign, value: c.n, note: `${c.ok} entregues · ${c.people} pessoas` }))} />
        </Card>
      </div>
      <Card title="Todos os pushes" className="mt-4">
        {p.rows.length === 0 ? (
          <p className="text-sm text-subtle">Nenhum push registrado ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="py-1 pr-2">Quando</th>
                  <th className="pr-2">Para</th>
                  <th className="pr-2">Tipo</th>
                  <th className="pr-2">Texto</th>
                  <th>Aparelhos</th>
                </tr>
              </thead>
              <tbody>
                {p.rows.map((r) => (
                  <tr key={r.id} className="border-t border-line align-top">
                    <td className="py-2 pr-2 whitespace-nowrap text-subtle">{when(r.at)}</td>
                    <td className="pr-2">{r.username ? <a className="underline" href={sharePath(r.username)}>@{r.username}</a> : "—"}</td>
                    <td className="pr-2 text-xs">{r.campaign}</td>
                    <td className="pr-2">
                      <b>{r.title}</b>
                      <span className="block text-xs text-subtle">{r.body}</span>
                    </td>
                    <td className="whitespace-nowrap text-xs" style={{ color: r.delivered ? undefined : "var(--red)" }}>
                      {r.delivered}/{r.devices}
                    </td>
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
