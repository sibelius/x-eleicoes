import type { Metadata } from "next";
import { Suspense } from "react";
import { notFound, permanentRedirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { TallyBar } from "@/components/TallyBar";
import { sharePath } from "@/lib/links";
import { getNetwork, getShare, resolveUser } from "@/lib/network";
import { appUrl } from "@/lib/session";

async function load(params: PageProps<"/r/[handle]">["params"]) {
  const handle = decodeURIComponent((await params).handle);
  const user = await resolveUser(handle);
  return user ? { handle, user, share: await getShare(user.id) } : null;
}

export async function generateMetadata({ params }: PageProps<"/r/[handle]">): Promise<Metadata> {
  const share = (await load(params))?.share;
  if (!share) return {};
  return {
    title: `Como a rede de @${share.user.username} vota`,
    description: "Entre com o X e veja como a sua rede vota: Lula ou Bolsonaro.",
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
  return (
    <>
      <div className="flex items-center gap-3">
        {share.user.avatar && <img src={share.user.avatar} alt="" className="h-12 w-12 rounded-full" />}
        <div>
          <div className="text-xl font-bold">{share.user.name}</div>
          <div className="text-subtle">@{share.user.username}</div>
        </div>
      </div>
      <h1 className="mt-6 text-3xl font-bold tracking-tight">Como a rede de @{share.user.username} vota</h1>
      {share.vote && (
        <p className="mt-2 text-subtle">
          @{share.user.username} vota{" "}
          <b style={{ color: share.vote === "lula" ? "var(--lula)" : "var(--bolso)" }}>
            {share.vote === "lula" ? "Lula" : "Bolsonaro"}
          </b>
        </p>
      )}
      <div className="mt-6 rounded-2xl border border-line bg-card p-4">
        <TallyBar tally={share.tally} />
      </div>
      <a
        href={`/?ref=${encodeURIComponent(share.user.id)}`}
        className="mt-6 self-start rounded-full bg-fg px-6 py-3 font-semibold text-bg"
      >
        Ver como a minha rede vota
      </a>
      {nodes.length > 0 && (
        <div className="mt-8">
          <Bubble
            me={me}
            nodes={nodes}
            shareBase={appUrl()}
            title={`A bolha de @${share.user.username}`}
            centerLabel={share.user.username.slice(0, 1).toUpperCase()}
            readOnly
          />
        </div>
      )}
    </>
  );
}
