import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { PageSkeleton } from "@/components/Skeleton";
import { Face } from "@/components/play/Face";
import { SIDE, bubbleVerdict, comparePath, pct, sharePath, wrappedPath, wrappedTweetUrl } from "@/lib/links";
import { getMe, getShare, resolveUser } from "@/lib/network";
import { getBridge, getTwins, getWrapped } from "@/lib/social";
import { appUrl, getUserId } from "@/lib/session";

export async function generateMetadata({ params }: PageProps<"/w/[handle]">): Promise<Metadata> {
  const handle = decodeURIComponent((await params).handle);
  return {
    title: `Retrospectiva da bolha de @${handle} · Minha Bolha`,
    description: "Quão fechada é a bolha, o gêmeo de bolha, a ponte para o outro lado e quem chegou primeiro.",
  };
}

export default function WrappedPage({ params }: PageProps<"/w/[handle]">) {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <Suspense fallback={<PageSkeleton bubble={false} />}>
        <Wrapped params={params} />
      </Suspense>
    </main>
  );
}

const date = (t: number) => new Date(t).toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo", day: "2-digit", month: "2-digit" });

async function Wrapped({ params }: { params: PageProps<"/w/[handle]">["params"] }) {
  const handle = decodeURIComponent((await params).handle);
  const user = await resolveUser(handle);
  if (!user) notFound();
  if (handle !== user.username) permanentRedirect(wrappedPath(user.username));
  const [share, w, twins, bridge, viewer] = await Promise.all([
    getShare(user.id),
    getWrapped(user.id),
    getTwins(user.id),
    getBridge(user.id),
    getUserId(),
  ]);
  if (!share?.member) notFound();
  const own = viewer === user.id;
  const mine = viewer && !own ? await getMe(viewer) : null;
  const you = own ? "Você" : `@${user.username}`;
  const your = own ? "sua" : `de @${user.username}`;
  const t = w.tally;
  const r = pct(t.red, t.total);
  const verdict = bubbleVerdict(t);
  const majority = t.red >= t.green ? "red" : "green";
  const base = appUrl();
  const tile = "rounded-2xl border border-line bg-card p-5";
  return (
    <>
      <Link href={sharePath(user.username)} className="text-sm text-subtle underline">
        Ver a bolha
      </Link>
      <div className="mt-3 flex items-center gap-3">
        <Face src={share.user.avatar} size={56} vote={share.vote} />
        <div>
          <p className="text-sm tracking-wide text-subtle uppercase">Retrospectiva da bolha</p>
          <h1 className="text-3xl font-bold tracking-tight">@{user.username}</h1>
        </div>
      </div>

      <div className="mt-6 grid gap-4 sm:grid-cols-2">
        <section className={`${tile} sm:col-span-2`}>
          <p className="text-sm text-subtle">A bolha {your}</p>
          <p className="mt-1 text-3xl font-bold" style={{ color: verdict.side ? `var(--${verdict.side})` : undefined }}>
            {verdict.label}
          </p>
          <div className="mt-3 flex h-4 overflow-hidden rounded-full bg-muted">
            <div style={{ width: `${r}%`, background: "var(--red)" }} />
            <div style={{ width: `${t.total ? 100 - r : 0}%`, background: "var(--green)" }} />
          </div>
          <p className="mt-2 text-sm text-subtle">
            {t.red} Vermelho × {t.green} Verde, entre {w.members} {w.members === 1 ? "pessoa" : "pessoas"} da rede que já entraram
          </p>
        </section>

        {t.total >= 3 && (
          <section className={tile}>
            <p className="text-sm text-subtle">Quão fechada</p>
            <p className="mt-1 text-5xl font-bold" style={{ color: `var(--${majority})` }}>
              {w.closed}%
            </p>
            <p className="mt-1">
              de um lado só ({SIDE[majority]}). Mais fechada que <b>{w.percentile}%</b> das {w.bubbles} bolhas.
            </p>
          </section>
        )}

        {w.first && (
          <section className={tile}>
            <p className="text-sm text-subtle">Quem chegou primeiro</p>
            <a href={sharePath(w.first.username)} className="mt-2 flex items-center gap-3">
              <Face src={w.first.avatar} size={48} vote={w.first.vote} />
              <span>
                <b className="block text-xl">@{w.first.username}</b>
                <span className="text-sm text-subtle">a primeira pessoa da rede a entrar, em {date(w.first.at)}</span>
              </span>
            </a>
          </section>
        )}

        {twins.twin && (
          <section className={tile}>
            <p className="text-sm text-subtle">Gêmeo de bolha</p>
            <a href={comparePath(user.username, twins.twin.username)} className="mt-2 flex items-center gap-3">
              <Face src={twins.twin.avatar} size={48} vote={twins.twin.vote} />
              <span>
                <b className="block text-xl">@{twins.twin.username}</b>
                <span className="text-sm text-subtle">{Math.max(1, Math.round(twins.twin.similarity * 100))}% das redes em comum</span>
              </span>
            </a>
            {twins.opposite && twins.opposite.id !== twins.twin.id && (
              <p className="mt-2 text-sm text-subtle">
                Do outro lado: <a className="underline" href={comparePath(user.username, twins.opposite.username)}>@{twins.opposite.username}</a> 👀
              </p>
            )}
          </section>
        )}

        {bridge && (
          <section className={tile}>
            <p className="text-sm text-subtle">Ponte para o outro lado</p>
            <p className="mt-1 text-5xl font-bold">{bridge.steps}</p>
            <p className="mt-1">
              {bridge.steps === 1 ? "passo" : "passos"} até{" "}
              <a className="font-semibold underline" href={sharePath(bridge.path[bridge.path.length - 1].username)}>
                @{bridge.path[bridge.path.length - 1].username}
              </a>
              {bridge.path.length > 2 && <>, via @{bridge.path[1].username}</>}
            </p>
          </section>
        )}

        <section className={tile}>
          <p className="text-sm text-subtle">Alcance</p>
          <p className="mt-1">
            <b className="text-3xl">{w.invites}</b> {w.invites === 1 ? "pessoa entrou" : "pessoas entraram"} pelo link
          </p>
          <p className="mt-1">
            <b className="text-3xl">{w.views}</b> {w.views === 1 ? "pessoa viu" : "pessoas viram"} a bolha
          </p>
          {w.joinedAt && <p className="mt-1 text-sm text-subtle">{you} entrou em {date(w.joinedAt)}</p>}
        </section>
      </div>

      <div className="mt-6 flex flex-wrap gap-3">
        <a
          className="rounded-full bg-fg px-6 py-3 font-semibold text-bg"
          href={wrappedTweetUrl(base, user.username, own, w.closed, w.percentile)}
          target="_blank"
          rel="noreferrer"
        >
          Postar no X
        </a>
        {!own && (
          <a href={mine ? wrappedPath(mine.username) : `/?ref=${encodeURIComponent(user.id)}`} className="rounded-full border border-line px-6 py-3 font-semibold">
            Ver a minha retrospectiva
          </a>
        )}
      </div>
    </>
  );
}
