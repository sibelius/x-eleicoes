import { Suspense } from "react";
import { connection } from "next/server";
import { Card, Kpi, PageTitle } from "@/components/admin/Card";
import { PageSkeleton } from "@/components/Skeleton";
import { Face } from "@/components/play/Face";
import { requireAdmin } from "@/lib/admin";
import { sharePath } from "@/lib/links";
import { allMessages } from "@/lib/messages";

export default function MessagesAdminPage() {
  return (
    <Suspense fallback={<PageSkeleton bubble={false} />}>
      <MessagesAdmin />
    </Suspense>
  );
}

const when = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

const VIA: Record<string, string> = { live: "⚡ ao vivo", push: "🔔 push", "live+push": "⚡→🔔 push (não viu ao vivo)", none: "—" };

async function MessagesAdmin() {
  await connection();
  await requireAdmin();
  const messages = await allMessages(500);
  const asks = messages.filter((m) => m.kind === "ask");
  const replies = messages.filter((m) => m.kind === "reply");
  const switched = replies.filter((m) => m.body.startsWith("Troquei")).length;
  return (
    <>
      <PageTitle title="Mensagens" sub="Pedidos para trocar de cor entre membros e as respostas (textos prontos), com como cada um chegou." />
      <div className="grid grid-cols-2 gap-3 sm:grid-cols-4">
        <Kpi label="Pedidos" value={asks.length} hint={`${new Set(asks.map((m) => m.from.id)).size} pessoas pediram`} />
        <Kpi label="Respostas" value={replies.length} hint={asks.length ? `${Math.round((replies.length / asks.length) * 100)}% dos pedidos` : undefined} />
        <Kpi label="Trocaram de cor" value={switched} hint="responderam “Troquei!”" color="var(--green)" />
        <Kpi label="Vistos ao vivo" value={messages.filter((m) => m.via === "live").length} hint="toast no site" />
      </div>
      <Card title="Todas as mensagens" className="mt-4">
        {messages.length === 0 ? (
          <p className="text-sm text-subtle">Nenhuma mensagem ainda.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="w-full min-w-[640px] text-sm">
              <thead className="text-left text-xs text-subtle">
                <tr>
                  <th className="py-1 pr-2">Quando</th>
                  <th className="pr-2">De</th>
                  <th className="pr-2">Para</th>
                  <th className="pr-2">Mensagem</th>
                  <th className="pr-2">Chegou</th>
                  <th>Lida</th>
                </tr>
              </thead>
              <tbody>
                {messages.map((m) => (
                  <tr key={m.id} className="border-t border-line align-top">
                    <td className="py-2 pr-2 whitespace-nowrap text-subtle">{when(m.at)}</td>
                    <td className="pr-2">
                      <a href={sharePath(m.from.username)} className="flex items-center gap-1.5">
                        <Face src={m.from.avatar} size={22} vote={m.from.vote} />@{m.from.username}
                      </a>
                    </td>
                    <td className="pr-2">
                      <a href={sharePath(m.to.username)} className="flex items-center gap-1.5">
                        <Face src={m.to.avatar} size={22} vote={m.to.vote} />@{m.to.username}
                      </a>
                    </td>
                    <td className="pr-2">
                      <span className="text-xs text-subtle">{m.kind === "ask" ? "pedido" : "resposta"}</span> {m.body}
                    </td>
                    <td className="pr-2 whitespace-nowrap text-xs">{VIA[m.via] ?? m.via}</td>
                    <td className="whitespace-nowrap text-xs text-subtle">{m.seenAt ? when(m.seenAt) : "—"}</td>
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
