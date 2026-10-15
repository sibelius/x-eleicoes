import { Suspense } from "react";
import { redirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { ImportArchive } from "@/components/ImportArchive";
import { TallyBar } from "@/components/TallyBar";
import { VotePanel } from "@/components/VotePanel";
import { inviteLink, inviteTweetUrl, pct, sharePath, shareTweetUrl } from "@/lib/links";
import { getMe, getNetwork } from "@/lib/network";
import { appUrl, getUserId } from "@/lib/session";
import Link from "next/link";

export default function AppPage() {
  return (
    <Suspense fallback={<p className="p-8 text-subtle">Carregando sua rede…</p>}>
      <Dashboard />
    </Suspense>
  );
}

async function Dashboard() {
  const uid = await getUserId();
  if (!uid) redirect("/");
  const me = await getMe(uid);
  if (!me) redirect("/");
  const { nodes, tally, counts } = await getNetwork(uid);
  const base = appUrl();
  const pendingMembers = nodes.filter((n) => !n.voted && n.username).slice(0, 8);
  const l = pct(tally.lula, tally.total);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <header className="flex items-center justify-between gap-3">
        <div className="flex items-center gap-3">
          {me.avatar && <img src={me.avatar} alt="" className="h-10 w-10 rounded-full" />}
          <div>
            <div className="font-semibold">{me.name}</div>
            <div className="text-sm text-subtle">@{me.username}</div>
          </div>
        </div>
        <div className="flex items-center gap-4 text-sm">
          <Link href="/r" className="text-subtle underline">
            Todas as bolhas
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="text-subtle underline">Sair</button>
          </form>
        </div>
      </header>

      {/* Phones: one column ordered vote → result → bubble → invites → archive; desktop: two columns. */}
      <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px]">
        <div className="contents lg:grid lg:min-w-0 lg:content-start lg:gap-4">
          <section className="order-2 rounded-2xl border border-line bg-card p-4 lg:order-none">
            <h2 className="mb-3 text-lg font-semibold">Como sua rede vota</h2>
            <TallyBar tally={tally} />
            <div className="mt-4 flex flex-wrap gap-2 text-sm">
              <a
                className="rounded-full bg-fg px-4 py-2 text-bg"
                href={shareTweetUrl(base, me.username, tally, true)}
                target="_blank"
                rel="noreferrer"
              >
                Compartilhar no X
              </a>
              <a className="rounded-full border border-line px-4 py-2" href={sharePath(me.username)} target="_blank">
                Ver página pública
              </a>
            </div>
          </section>
          <div className="order-3 min-w-0 lg:order-none">
            <Bubble me={me} nodes={nodes} shareBase={base} shareUrl={shareTweetUrl(base, me.username, tally, true)} />
          </div>
        </div>

        <aside className="contents lg:grid lg:content-start lg:gap-4">
          <div className="order-1 lg:order-none">
            <VotePanel me={me} />
          </div>
          <section className="order-4 rounded-2xl border border-line bg-card p-4 lg:order-none">
            <h2 className="text-lg font-semibold">Chame sua rede</h2>
            <p className="mt-1 text-sm text-subtle">
              Quem entrar pelo seu link entra direto na sua bolha.
            </p>
            <code className="mt-2 block truncate rounded-lg bg-muted px-2 py-1.5 text-xs">{inviteLink(base, me.id)}</code>
            <a
              className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg"
              href={inviteTweetUrl(base, me.id)}
              target="_blank"
              rel="noreferrer"
            >
              Postar convite no X
            </a>
            {pendingMembers.length > 0 && (
              <ul className="mt-4 grid gap-2 text-sm">
                {pendingMembers.map((n) => (
                  <li key={n.id} className="flex items-center justify-between gap-2">
                    <span className="min-w-0 truncate">
                      {n.name} <span className="text-subtle">@{n.username}</span>
                    </span>
                    <a
                      className="shrink-0 rounded-full border border-line px-3 py-1"
                      href={inviteTweetUrl(base, me.id, n.username)}
                      target="_blank"
                      rel="noreferrer"
                    >
                      Pedir voto
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="order-5 lg:order-none">
            <ImportArchive counts={counts} />
          </div>
        </aside>
      </div>
    </main>
  );
}
