import { Suspense } from "react";
import { connection } from "next/server";
import { Card, Kpi, PageTitle } from "@/components/admin/Card";
import { PageSkeleton } from "@/components/Skeleton";
import { requireAdmin } from "@/lib/admin";
import { brl, getGoal, listDonations, monthLabel, monthStart, type Donation } from "@/lib/donations";
import { sharePath } from "@/lib/links";
import { removeDonation, setStatus } from "./actions";
import { AddDonationForm, GoalForm } from "./Forms";

export default function DonationsAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <Donations />
    </Suspense>
  );
}

const when = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const STATUS: Record<Donation["status"], { label: string; cls: string }> = {
  pending: { label: "pendente", cls: "bg-amber-500/15 text-amber-700 dark:text-amber-400" },
  confirmed: { label: "confirmada", cls: "bg-[var(--green)]/15 text-[var(--green)]" },
  rejected: { label: "rejeitada", cls: "bg-muted text-subtle" },
};

function Who({ d }: { d: Donation }) {
  return (
    <div className="flex min-w-0 items-center gap-2">
      {d.avatar ? <img src={d.avatar} alt="" className="h-7 w-7 shrink-0 rounded-full" /> : <span className="h-7 w-7 shrink-0 rounded-full bg-muted" />}
      <div className="min-w-0">
        <div className="truncate font-semibold">{d.name ?? <span className="font-normal text-subtle">sem nome</span>}</div>
        <div className="truncate text-xs text-subtle">
          {d.username ? (
            <a href={sharePath(d.username)} className="underline">
              @{d.username}
            </a>
          ) : (
            "não é membro"
          )}
          {" · "}
          {d.public ? "no mural" : "anônima"}
          {d.note && ` · ${d.note.startsWith("site ") ? "aviso pelo site" : d.note}`}
        </div>
      </div>
    </div>
  );
}

function Actions({ d }: { d: Donation }) {
  const btn = "rounded-full border border-line px-3 py-1 text-xs hover:bg-muted";
  return (
    <div className="flex flex-wrap justify-end gap-1.5">
      {d.status !== "confirmed" && (
        <form action={setStatus.bind(null, d.id, "confirmed")}>
          <button className="rounded-full bg-[var(--green)] px-3 py-1 text-xs font-semibold text-white">Confirmar</button>
        </form>
      )}
      {d.status !== "rejected" && (
        <form action={setStatus.bind(null, d.id, "rejected")}>
          <button className={btn}>Rejeitar</button>
        </form>
      )}
      {d.status !== "pending" && (
        <form action={setStatus.bind(null, d.id, "pending")}>
          <button className={btn}>Voltar p/ pendente</button>
        </form>
      )}
      {d.status === "rejected" && (
        <form action={removeDonation.bind(null, d.id)}>
          <button className={`${btn} text-[var(--red)]`}>Apagar</button>
        </form>
      )}
    </div>
  );
}

function Table({ rows, empty }: { rows: Donation[]; empty: string }) {
  if (!rows.length) return <p className="text-sm text-subtle">{empty}</p>;
  return (
    <ul className="divide-y divide-line">
      {rows.map((d) => (
        <li key={d.id} className="grid grid-cols-[1fr_auto] items-center gap-x-3 gap-y-2 py-2 text-sm sm:grid-cols-[minmax(0,1fr)_6rem_7rem_auto]">
          <Who d={d} />
          <div className="text-right font-semibold tabular-nums">{brl(d.amount)}</div>
          <div className="text-xs text-subtle sm:text-right">
            <span className={`mr-1 rounded-full px-2 py-0.5 ${STATUS[d.status].cls}`}>{STATUS[d.status].label}</span>
            <div className="mt-0.5">{when(d.at)}</div>
          </div>
          <Actions d={d} />
        </li>
      ))}
    </ul>
  );
}

async function Donations() {
  await connection();
  await requireAdmin();
  const [all, goal] = await Promise.all([listDonations(), getGoal()]);
  const start = monthStart();
  const confirmed = all.filter((d) => d.status === "confirmed");
  const month = confirmed.filter((d) => d.at >= start).reduce((s, d) => s + d.amount, 0);
  const pending = all.filter((d) => d.status === "pending");
  return (
    <>
      <PageTitle
        title="Doações"
        sub="O Pix é estático: não vemos quando chega. “Já doei” cria uma doação pendente; confira no extrato e confirme. Só confirmadas contam na meta, no mural e no selo de Apoiador."
      />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label={`Confirmado em ${monthLabel()}`} value={brl(month)} hint={`meta ${brl(goal)} · ${goal ? Math.round((month / goal) * 100) : 0}%`} />
        <Kpi label="Pendentes" value={pending.length} hint={pending.length ? `${brl(pending.reduce((s, d) => s + d.amount, 0))} a conferir` : undefined} />
        <Kpi label="Total confirmado" value={brl(confirmed.reduce((s, d) => s + d.amount, 0))} hint={`${confirmed.length} doações`} />
        <Kpi label="No mural" value={new Set(confirmed.filter((d) => d.public && (d.uid || d.name)).map((d) => d.uid ?? d.name)).size} hint="pessoas" />
      </div>

      <Card title="Pendentes" note="Avisos de “Já doei”. Confira valor e horário no extrato antes de confirmar." className="mt-4">
        <Table rows={pending} empty="Nada para conferir." />
      </Card>

      <div className="mt-4 grid gap-4 lg:grid-cols-2">
        <Card title="Adicionar doação" note="Um Pix que chegou sem aviso. Entra já confirmada.">
          <AddDonationForm />
        </Card>
        <Card title="Meta do mês" note="Aparece em /apoie e na caixa de Pix de todas as telas. Mês do calendário, horário de Brasília.">
          <GoalForm current={goal} />
        </Card>
      </div>

      <Card title="Confirmadas" className="mt-4">
        <Table rows={confirmed} empty="Nenhuma doação confirmada ainda." />
      </Card>

      {all.some((d) => d.status === "rejected") && (
        <Card title="Rejeitadas" className="mt-4">
          <Table rows={all.filter((d) => d.status === "rejected")} empty="" />
        </Card>
      )}
    </>
  );
}
