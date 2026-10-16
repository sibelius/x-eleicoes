import { Suspense } from "react";
import { connection } from "next/server";
import Link from "next/link";
import { Card, Kpi, PageTitle } from "@/components/admin/Card";
import { FeedbackStatus } from "@/components/admin/FeedbackStatus";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { KINDS, listFeedback } from "@/lib/feedback";
import { sharePath } from "@/lib/links";

export default function FeedbackAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <FeedbackAdmin />
    </Suspense>
  );
}

const when = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function FeedbackAdmin() {
  await connection();
  await requireAdmin();
  const all = await listFeedback();
  const open = all.filter((f) => f.status !== "done");
  return (
    <>
      <PageTitle title="Feedback" sub="O que as pessoas mandam pelo “Enviar feedback” (rodapé e painel). Cada novo chega como push para os admins." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Novos" value={all.filter((f) => f.status === "new").length} color="var(--accent)" />
        <Kpi label="Em aberto" value={open.length} />
        {(["idea", "bug"] as const).map((k) => (
          <Kpi key={k} label={KINDS[k]} value={all.filter((f) => f.kind === k).length} />
        ))}
      </div>
      <Card title={`Mensagens (${all.length})`} className="mt-4">
        {all.length === 0 ? (
          <p className="text-sm text-subtle">Nenhum feedback ainda.</p>
        ) : (
          <ul className="divide-y divide-line">
            {all.map((f) => (
              <li key={f.id} className={`py-3 ${f.status === "done" ? "opacity-60" : ""}`}>
                <div className="flex flex-wrap items-center gap-2 text-xs text-subtle">
                  <span className="rounded-full bg-muted px-2 py-0.5 text-fg">{KINDS[f.kind]}</span>
                  {f.username ? (
                    <Link href={sharePath(f.username)} className="flex items-center gap-1 font-semibold text-fg underline">
                      {f.avatar && <img src={f.avatar} alt="" className="h-4 w-4 rounded-full" />}@{f.username}
                    </Link>
                  ) : (
                    <span>Visitante</span>
                  )}
                  <span>{when(f.at)}</span>
                  {f.page && <span>em {f.page}</span>}
                  {f.contact && <span>· contato: {f.contact}</span>}
                  <span className="ml-auto">
                    <FeedbackStatus id={f.id} status={f.status} />
                  </span>
                </div>
                <p className="mt-1.5 text-sm whitespace-pre-wrap">{f.body}</p>
              </li>
            ))}
          </ul>
        )}
      </Card>
    </>
  );
}
