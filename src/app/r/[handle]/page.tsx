import type { Metadata } from "next";
import { SupportStrip } from "@/components/SupportStrip";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { TallyBar } from "@/components/TallyBar";
import { SIDE, sharePath, shareTweetUrl } from "@/lib/links";
import { getBubbleSize, getNetwork, getShare, getTimeline, inviteCount, resolveUser } from "@/lib/network";
import { BubbleSize } from "@/components/BubbleSize";
import { Timeline } from "@/components/Timeline";
import { InviteBadge } from "@/components/InviteBadge";
import { appUrl } from "@/lib/session";
import { viewCount } from "@/lib/views";
import { ViewBeacon } from "@/components/ViewBeacon";
import Link from "next/link";

async function load(params: PageProps<"/r/[handle]">["params"]) {
  const handle = decodeURIComponent((await params).handle);
  const user = await resolveUser(handle);
  return user ? { handle, user, share: await getShare(user.id) } : null;
}

export async function generateMetadata({ params }: PageProps<"/r/[handle]">): Promise<Metadata> {
  const share = (await load(params))?.share;
  if (!share) return {};
  return {
    title: `De que lado está a rede de @${share.user.username}`,
    description: "Entre com o X e veja de que lado está a sua rede: Vermelho ou Verde.",
  };
}

export default function SharePage({ params }: PageProps<"/r/[handle]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
      <Suspense fallback={<p className="text-subtle">Carregando…</p>}>
        <Share params={params} />
      </Suspense>
    </main>
  );
}

async function Share({ params }: { params: PageProps<"/r/[handle]">["params"] }) {
  const loaded = await load(params);
  if (!loaded?.share) notFound();
  const { handle, user, share } = loaded;
  // Old links used the numeric id; the handle is the canonical URL.
  if (handle !== user.username) permanentRedirect(sharePath(user.username));
  const { nodes } = await getNetwork(user.id);
  const me = { ...share.user, vote: share.vote };
  const [views, invites, timeline, size] = await Promise.all([
    viewCount(user.id),
    inviteCount(user.id),
    getTimeline(user.id),
    getBubbleSize(user.id),
  ]);
  return (
    <>
      <div className="flex items-center gap-3">
        {share.user.avatar && <img src={share.user.avatar} alt="" className="h-12 w-12 rounded-full" />}
        <div>
          <div className="text-xl font-bold">
            {share.user.name} <InviteBadge invites={invites} full />
          </div>
          <div className="text-subtle">@{share.user.username}</div>
        </div>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">De que lado está a rede de @{share.user.username}</h1>
      {!share.member && (
        <p className="mt-2 text-sm text-subtle">
          @{share.user.username} ainda não entrou no app: esta bolha é montada com quem já entrou e segue ou é seguido
          por @{share.user.username}.{" "}
          <a
            className="underline"
            target="_blank"
            rel="noreferrer"
            href={`https://x.com/intent/post?text=${encodeURIComponent(
              `@${share.user.username} já vimos de que lado está a sua rede. Falta só você: Vermelho ou Verde? 🔴🟢`,
            )}&url=${encodeURIComponent(`${appUrl()}${sharePath(share.user.username)}`)}`}
          >
            Chamar @{share.user.username} no X
          </a>
        </p>
      )}
      {share.vote && (
        <p className="mt-2 text-subtle">
          @{share.user.username} é{" "}
          <b style={{ color: share.vote === "lula" ? "var(--red)" : "var(--green)" }}>
            {SIDE[share.vote]}
          </b>
        </p>
      )}
      <div className="mt-6 rounded-2xl border border-line bg-card p-4">
        <TallyBar tally={share.tally} />
        <p className="mt-2 text-xs text-subtle">
          👀 {views} {views === 1 ? "pessoa viu" : "pessoas viram"} esta bolha
        </p>
      </div>
      <ViewBeacon ids={[user.id]} />
      <a
        href={`/?ref=${encodeURIComponent(share.user.id)}`}
        className="mt-6 self-start rounded-full bg-fg px-6 py-3 font-semibold text-bg"
      >
        Ver de que lado está a minha rede
      </a>
      <a
        href={shareTweetUrl(appUrl(), share.user.username, share.tally)}
        target="_blank"
        rel="noreferrer"
        className="mt-3 self-start rounded-full border border-line px-6 py-3 font-semibold"
      >
        Compartilhar esta bolha no X
      </a>
      <a
        href={`/c?b=${encodeURIComponent(share.user.username)}`}
        className="mt-3 self-start rounded-full border border-line px-6 py-3 font-semibold"
      >
        Comparar com a minha bolha
      </a>
      <Link href="/r" className="mt-3 self-start text-sm text-subtle underline">
        Ver todas as bolhas
      </Link>
      {nodes.length > 0 && (
        <div className="mt-8">
          <Bubble
            me={me}
            nodes={nodes}
            shareBase={appUrl()}
            title={`A bolha de @${share.user.username}`}
            centerLabel={share.user.username.slice(0, 1).toUpperCase()}
            readOnly
            shareUrl={shareTweetUrl(appUrl(), share.user.username, share.tally)}
            tally={share.tally}
          />
        </div>
      )}
      <div className="mt-4">
        <SupportStrip placement="bubble" />
      </div>
      <div className="mt-4">
        <BubbleSize size={size} />
      </div>
      <div className="mt-4">
        <Timeline {...timeline} />
      </div>
    </>
  );
}
