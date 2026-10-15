import { Suspense } from "react";
import { PageSkeleton, Shimmer } from "@/components/Skeleton";
import { SupportStrip } from "@/components/SupportStrip";
import { redirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { ImportArchive } from "@/components/ImportArchive";
import { PushToggle } from "@/components/PushToggle";
import { TallyBar } from "@/components/TallyBar";
import { VotePanel } from "@/components/VotePanel";
import { VoteModal } from "@/components/VoteModal";
import { BADGE_STEPS, inviteLink, inviteTweetUrl, nudgeTweetUrl, sharePath, shareTweetUrl } from "@/lib/links";
import { viewCount } from "@/lib/views";
import { getBubbleSize, getMe, getNetwork, getTimeline, inviteCount } from "@/lib/network";
import { BubbleSize } from "@/components/BubbleSize";
import { Timeline } from "@/components/Timeline";
import { OtherSide } from "@/components/OtherSide";
import { InviteBadge } from "@/components/InviteBadge";
import { pushPublicKey } from "@/lib/push";
import { isAdmin } from "@/lib/admin";
import { appUrl, getUserId } from "@/lib/session";
import Link from "next/link";
import { Tour } from "@/components/Tour";
import { NetworkAnalytics } from "@/components/NetworkAnalytics";

export default function AppPage() {
  return (
    <Suspense fallback={<div className="mx-auto w-full max-w-3xl px-4 py-10">
          <Shimmer className="h-8 w-1/2" />
          <PageSkeleton />
        </div>}>
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
  // Joined but haven't voted: worth a public nudge.
  const silent = nodes.filter((n) => n.member && !n.voted && n.username).map((n) => n.username!);
  const [views, invites, timeline, size, admin] = await Promise.all([
    viewCount(me.id),
    inviteCount(me.id),
    getTimeline(me.id),
    getBubbleSize(me.id),
    isAdmin(),
  ]);
  const nextBadge = BADGE_STEPS.find((n) => n > invites);

  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <VoteModal me={me} />
      <header className="flex flex-wrap items-center justify-between gap-3">
        <div data-tour="me" className="flex items-center gap-3">
          {me.avatar && <img src={me.avatar} alt="" className="h-10 w-10 rounded-full" />}
          <div>
            <div className="font-semibold">
              {me.name} <InviteBadge invites={invites} />
            </div>
            <div className="text-sm text-subtle">@{me.username}</div>
          </div>
        </div>
        <div data-tour="nav" className="flex w-full flex-wrap items-center gap-x-4 gap-y-2 text-sm sm:w-auto sm:justify-end">
          <Tour name="app" autoStart={!!me.vote} />
          <Link href="/apoie" className="rounded-full bg-[var(--green)] px-3 py-1 font-semibold text-white">
            Doar
          </Link>
          {admin && (
            <Link href="/admin" className="font-semibold underline">
              Admin
            </Link>
          )}
          <Link href="/ranking" className="text-subtle underline">
            Ranking
          </Link>
          <Link href="/grafo" className="text-subtle underline">
            A rede
          </Link>
          <Link href="/r" className="text-subtle underline">
            Todas as bolhas
          </Link>
          <Link href="/privacidade" className="text-subtle underline">
            Meus dados
          </Link>
          <form action="/api/auth/logout" method="post">
            <button className="text-subtle underline">Sair</button>
          </form>
        </div>
      </header>

      <div data-tour="support" className="mt-4">
        <SupportStrip placement="app" />
      </div>

      {/* Phones: one column ordered vote → result → bubble → invites → archive; desktop: two columns. */}
      <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px]">
        <div className="contents lg:grid lg:min-w-0 lg:content-start lg:gap-4">
          <section data-tour="tally" className="order-2 rounded-2xl border border-line bg-card p-4 lg:order-none">
            <h2 className="mb-3 text-lg font-semibold">De que lado está sua rede</h2>
            <TallyBar tally={tally} />
            <p className="mt-2 text-sm text-subtle">
              👀 {views} {views === 1 ? "pessoa viu" : "pessoas viram"} sua bolha
            </p>
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
            <form action="/c" data-tour="compare" className="mt-3 flex gap-2 text-sm">
              <input type="hidden" name="a" value={me.username} />
              <input
                name="b"
                required
                placeholder="Comparar com @…"
                className="min-w-0 flex-1 rounded-full border border-line bg-bg px-4 py-2"
              />
              <button className="rounded-full border border-line px-4 py-2">Comparar</button>
            </form>
          </section>
          <div className="order-3 min-w-0 lg:order-none">
            <Bubble me={me} nodes={nodes} shareBase={base} shareUrl={shareTweetUrl(base, me.username, tally, true)} tally={tally} own />
          </div>
          <div data-tour="size" className="order-3 min-w-0 lg:order-none">
            <BubbleSize size={size} nudgeUrl={silent.length ? nudgeTweetUrl(base, me.id, silent) : undefined} />
          </div>
          <div data-tour="timeline" className="order-3 min-w-0 lg:order-none">
            <Timeline {...timeline} />
          </div>
        </div>

        <aside className="contents lg:grid lg:content-start lg:gap-4">
          <div data-tour="vote" className="order-1 lg:order-none">
            <VotePanel me={me} />
          </div>
          {me.vote && (
            <div data-tour="other-side" className="order-4 lg:order-none">
              <OtherSide me={{ ...me, vote: me.vote }} nodes={nodes} base={base} />
            </div>
          )}
          <section data-tour="invite" className="order-4 rounded-2xl border border-line bg-card p-4 lg:order-none">
            <h2 className="text-lg font-semibold">Chame sua rede</h2>
            <p className="mt-1 text-sm text-subtle">
              Quem entrar pelo seu link entra direto na sua bolha.
            </p>
            <p className="mt-2 text-sm">
              <b>{invites}</b> {invites === 1 ? "pessoa entrou" : "pessoas entraram"} pelo seu link{" "}
              <InviteBadge invites={invites} full />
              {nextBadge && (
                <span className="block text-xs text-subtle">
                  Faltam {nextBadge - invites} para o selo {nextBadge >= 25 ? "🥇" : nextBadge >= 10 ? "🥈" : "🥉"}
                </span>
              )}
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
            {silent.length > 0 && (
              <div className="mt-4 rounded-xl bg-muted p-3 text-sm">
                <b>{silent.length}</b> {silent.length === 1 ? "pessoa entrou" : "pessoas entraram"} mas ainda não{" "}
                {silent.length === 1 ? "escolheu um lado" : "escolheram um lado"}.
                <a
                  className="mt-2 block w-fit rounded-full bg-fg px-4 py-2 text-bg"
                  href={nudgeTweetUrl(base, me.id, silent)}
                  target="_blank"
                  rel="noreferrer"
                >
                  Cobrar no X
                </a>
              </div>
            )}
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
                      Chamar
                    </a>
                  </li>
                ))}
              </ul>
            )}
          </section>
          <div className="order-4 lg:order-none">
            <NetworkAnalytics username={me.username} />
          </div>
          {pushPublicKey() && (
            <div data-tour="push" className="order-5 lg:order-none">
              <PushToggle publicKey={pushPublicKey()!} />
            </div>
          )}
          <div data-tour="import" className="order-6 lg:order-none">
            <ImportArchive counts={counts} />
          </div>
        </aside>
      </div>
    </main>
  );
}
