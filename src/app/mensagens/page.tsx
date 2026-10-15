import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { ListSkeleton } from "@/components/Skeleton";
import { Face } from "@/components/play/Face";
import { MuteToggle } from "@/components/play/MuteToggle";
import { ReplyButtons } from "@/components/play/Reply";
import { sharePath } from "@/lib/links";
import { isMuted, markAllSeen, myMessages } from "@/lib/messages";
import { getMe } from "@/lib/network";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = { title: "Mensagens · Minha Bolha" };

export default function MessagesPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/app" className="text-sm text-subtle underline">
        ← Minha bolha
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Mensagens</h1>
      <p className="mt-1 text-subtle">Pedidos para trocar de cor que você recebeu e enviou, e as respostas.</p>
      <Suspense fallback={<div className="mt-6"><ListSkeleton rows={8} /></div>}>
        <Messages />
      </Suspense>
    </main>
  );
}

const when = (t: number) =>
  new Date(t).toLocaleString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit", hour: "2-digit", minute: "2-digit" });

async function Messages() {
  const uid = await getUserId();
  if (!uid) redirect("/");
  const [me, messages, muted] = await Promise.all([getMe(uid), myMessages(uid), isMuted(uid)]);
  if (!me) redirect("/");
  // An ask can still be answered if no reply to its sender was sent after it.
  const answered = (askAt: number, from: string) => messages.some((m) => m.kind === "reply" && m.from.id === uid && m.to.id === from && m.at > askAt);
  await markAllSeen(uid);
  return (
    <>
      <div className="mt-4">
        <MuteToggle muted={muted} />
      </div>
      {messages.length === 0 ? (
        <p className="mt-6 text-subtle">
          Nenhuma mensagem ainda. Peça para alguém do outro lado trocar de cor na bolha da pessoa ou em{" "}
          <Link href="/app" className="underline">Do outro lado</Link>.
        </p>
      ) : (
        <ul className="mt-6 grid gap-3">
          {messages.map((m) => {
            const mine = m.from.id === uid;
            const other = mine ? m.to : m.from;
            return (
              <li key={m.id} className={`rounded-2xl border bg-card p-3 ${!mine && !m.seenAt ? "border-[var(--accent)]" : "border-line"}`}>
                <div className="flex items-start gap-3">
                  <Face src={other.avatar} size={36} vote={other.vote} />
                  <div className="min-w-0 flex-1">
                    <div className="text-sm text-subtle">
                      {mine ? (
                        <>Você → <a className="font-semibold text-fg" href={sharePath(other.username)}>@{other.username}</a></>
                      ) : (
                        <><a className="font-semibold text-fg" href={sharePath(other.username)}>@{other.username}</a> → você</>
                      )}{" "}
                      · {m.kind === "ask" ? "pedido" : "resposta"} · {when(m.at)}
                    </div>
                    <div className="mt-0.5 font-semibold">{m.body}</div>
                    {!mine && m.kind === "ask" && !answered(m.at, m.from.id) && (
                      <div className="mt-2">
                        <ReplyButtons id={m.id} side={m.side} canSwitch={me.vote != null && me.vote !== m.side} />
                      </div>
                    )}
                  </div>
                </div>
              </li>
            );
          })}
        </ul>
      )}
    </>
  );
}
