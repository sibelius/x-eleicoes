import type { Metadata } from "next";
import { PageSkeleton } from "@/components/Skeleton";
import { SupportStrip } from "@/components/SupportStrip";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { TallyBar } from "@/components/TallyBar";
import { SIDE, sharePath, shareTweetUrl, withUtm, wrappedPath } from "@/lib/links";
import { INDEX_MIN_VOTES, getBubbleSize, getNetwork, getShare, getTimeline, inviteCount, resolveUser } from "@/lib/network";
import { BubbleSize } from "@/components/BubbleSize";
import { Timeline } from "@/components/Timeline";
import { InviteBadge } from "@/components/InviteBadge";
import { appUrl, getUserId } from "@/lib/session";
import { getBridge, getTwins } from "@/lib/social";
import { GuessHidden, GuessPanel, GuessProvider } from "@/components/play/Guess";
import { Twins } from "@/components/play/Twins";
import { BridgeCard } from "@/components/play/BridgeCard";
import { AskButton } from "@/components/play/AskButton";
import { getMe } from "@/lib/network";
import { viewCount } from "@/lib/views";
import { ViewBeacon } from "@/components/ViewBeacon";
import Link from "next/link";
import { Tour } from "@/components/Tour";
import { ShareMenu } from "@/components/ShareMenu";
import { SupporterBadgeFor } from "@/components/SupporterBadge";

async function load(params: PageProps<"/r/[handle]">["params"]) {
  const handle = decodeURIComponent((await params).handle);
  const user = await resolveUser(handle);
  return user ? { handle, user, share: await getShare(user.id) } : null;
}

export async function generateMetadata({ params }: PageProps<"/r/[handle]">): Promise<Metadata> {
  const share = (await load(params))?.share;
  if (!share) return {};
  const { username, name } = share.user;
  const who = name && name !== username ? `${name} (@${username})` : `@${username}`;
  const voters = share.tally.total;
  const description = share.member
    ? voters > 0
      ? `A bolha de ${who} no X: ${voters} ${voters === 1 ? "pessoa" : "pessoas"} da rede de @${username} já ${voters === 1 ? "escolheu" : "escolheram"} Vermelho ou Verde. Veja a bolha e compare com a sua.`
      : `A bolha de ${who} no X está em formação: ainda ninguém da rede escolheu Vermelho ou Verde. Veja e compare com a sua.`
    : `A bolha de ${who} no X, montada com quem já entrou na Minha Bolha e segue ou é seguido por @${username}.`;
  return {
    title: `De que lado está a rede de @${username}`,
    description,
    alternates: { canonical: sharePath(username) },
    // Indexed: public members with a real bubble. Not: people who never joined (their page is built from
    // others' links, without their consent), private ones, and thin bubbles still "em formação".
    robots: share.public && voters >= INDEX_MIN_VOTES ? undefined : { index: false, follow: true },
  };
}

export default function SharePage({ params }: PageProps<"/r/[handle]">) {
  return (
    <main className="mx-auto flex w-full max-w-3xl flex-1 flex-col justify-center px-4 py-16">
      {/* A screen tall while loading, so the footer doesn't show and then jump down (CLS). */}
      <Suspense fallback={<div className="min-h-dvh"><PageSkeleton list={0} /></div>}>
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
  const [views, invites, timeline, size, viewer, twins, bridge] = await Promise.all([
    viewCount(user.id),
    inviteCount(user.id),
    getTimeline(user.id),
    getBubbleSize(user.id),
    getUserId(),
    share.member ? getTwins(user.id) : null,
    share.member ? getBridge(user.id) : null,
  ]);
  // The guessing game: everyone but the owner guesses before seeing a bubble with a few picks.
  const game = viewer !== user.id && share.tally.total >= 3;
  // Signed-in members on the other side can ask the owner to change color.
  const asker = viewer && viewer !== user.id && share.member && share.vote ? await getMe(viewer) : null;
  const canAsk = asker?.vote && asker.vote !== share.vote ? asker.vote : null;
  return (
    <GuessProvider bubble={user.id} on={game}>
      <div data-tour="r-header" className="flex items-center gap-3">
        {share.user.avatar && (
          // X's 48px "_normal" photo is blurry at 48 CSS px on most phones; the 200px one isn't.
          <img src={share.user.avatar.replace("_normal.", "_200x200.")} alt="" width={48} height={48} className="h-12 w-12 rounded-full" />
        )}
        <div>
          <div className="text-xl font-bold">
            {share.user.name} <InviteBadge invites={invites} full />{" "}
            <Suspense fallback={null}>
              <SupporterBadgeFor uid={user.id} />
            </Suspense>
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
            )}&url=${encodeURIComponent(withUtm(`${appUrl()}${sharePath(share.user.username)}`, "call"))}`}
          >
            Chamar @{share.user.username} no X
          </a>
        </p>
      )}
      {share.vote && (
        <p className="mt-2 text-subtle">
          @{share.user.username} é{" "}
          <b style={{ color: share.vote === "red" ? "var(--red)" : "var(--green)" }}>
            {SIDE[share.vote]}
          </b>
        </p>
      )}
      <div className="mt-2">
        <Tour name="bubble" />
      </div>
      <GuessPanel username={share.user.username} base={appUrl()} />
      <GuessHidden>
        <div data-tour="r-tally" className="mt-6 rounded-2xl border border-line bg-card p-4">
          <TallyBar tally={share.tally} />
          <p className="mt-2 text-xs text-subtle">
            👀 {views} {views === 1 ? "pessoa viu" : "pessoas viram"} esta bolha
          </p>
        </div>
      </GuessHidden>
      <ViewBeacon ids={[user.id]} />
      <a
        data-tour="r-mine"
        href={`/?ref=${encodeURIComponent(share.user.id)}`}
        className="mt-6 self-start rounded-full bg-fg px-6 py-3 font-semibold text-bg"
      >
        Ver de que lado está a minha rede
      </a>
      <div data-tour="r-share" className="mt-3 self-start">
        <ShareMenu
          base={appUrl()}
          target={{ kind: "bubble", username: share.user.username, tally: share.tally }}
          xUrl={shareTweetUrl(appUrl(), share.user.username, share.tally)}
          xLabel="Compartilhar esta bolha no X"
        />
      </div>
      <a
        data-tour="r-compare"
        href={`/c?b=${encodeURIComponent(share.user.username)}`}
        className="mt-3 self-start rounded-full border border-line px-6 py-3 font-semibold"
      >
        Comparar com a minha bolha
      </a>
      {canAsk && (
        <div data-tour="ask" className="mt-3 self-start">
          <AskButton to={share.user.username} mySide={canAsk} />
        </div>
      )}
      {share.member && (
        <Link data-tour="wrapped" href={wrappedPath(share.user.username)} className="mt-3 self-start rounded-full border border-line px-6 py-3 font-semibold">
          🎁 Retrospectiva da bolha
        </Link>
      )}
      <Link href="/r" className="mt-3 self-start text-sm text-subtle underline">
        Ver todas as bolhas
      </Link>
      {nodes.length > 0 && (
        <GuessHidden>
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
        </GuessHidden>
      )}
      {twins && (twins.twin || twins.opposite) && (
        <div className="mt-4">
          <Twins twin={twins.twin} opposite={twins.opposite} base={appUrl()} owner={share.user.username} own={false} />
        </div>
      )}
      {bridge && (
        <div className="mt-4">
          <BridgeCard bridge={bridge} own={false} />
        </div>
      )}
      <div className="mt-4">
        <SupportStrip placement="bubble" />
      </div>
      <div data-tour="size" className="mt-4">
        <BubbleSize size={size} />
      </div>
      <div data-tour="timeline" className="mt-4">
        <GuessHidden>
          <Timeline {...timeline} />
        </GuessHidden>
      </div>
    </GuessProvider>
  );
}
