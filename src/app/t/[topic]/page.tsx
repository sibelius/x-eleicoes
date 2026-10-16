import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { notFound } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { PageSkeleton } from "@/components/Skeleton";
import { TopicVote } from "@/components/TopicVote";
import { isAdmin } from "@/lib/admin";
import { pct } from "@/lib/links";
import { getMe } from "@/lib/network";
import { appUrl, getUserId } from "@/lib/session";
import { getTopic, getTopicNetwork, getTopicVote, sideToSlot, topicCounts, topicSides, type Topic } from "@/lib/topics";

/** Live topics for everyone; drafts and closed ones only for admins (everyone else gets a 404). */
async function load(params: PageProps<"/t/[topic]">["params"]) {
  const topic = await getTopic(decodeURIComponent((await params).topic));
  if (!topic) return null;
  if (topic.status !== "live" && !(await isAdmin())) return null;
  return topic;
}

export async function generateMetadata({ params }: PageProps<"/t/[topic]">): Promise<Metadata> {
  const topic = await load(params);
  if (!topic) return {};
  return {
    title: `${topic.title} · Minha Bolha`,
    description: topic.question,
    robots: topic.status === "live" ? undefined : { index: false, follow: false },
  };
}

export default function TopicPage({ params }: PageProps<"/t/[topic]">) {
  return (
    <main className="mx-auto w-full max-w-5xl px-4 py-6">
      <Suspense fallback={<PageSkeleton list={0} />}>
        <TopicView params={params} />
      </Suspense>
    </main>
  );
}

/** Split of picks, in the topic's colors (TallyBar for A × B). */
function Split({ topic, a, b, label }: { topic: Topic; a: number; b: number; label: string }) {
  const total = a + b;
  const l = pct(a, total);
  const r = total ? 100 - l : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold">
        <span style={{ color: topic.a_color }}>
          {topic.a_label} {l}%
        </span>
        <span style={{ color: topic.b_color }}>
          {topic.b_label} {r}%
        </span>
      </div>
      <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${l}%`, background: topic.a_color }} />
        <div style={{ width: `${r}%`, background: topic.b_color }} />
      </div>
      <div className="mt-1 text-xs text-subtle">
        {total} {total === 1 ? "escolha" : "escolhas"} {label}
      </div>
    </div>
  );
}

async function TopicView({ params }: { params: PageProps<"/t/[topic]">["params"] }) {
  const topic = await load(params);
  if (!topic) notFound();
  const uid = await getUserId();
  const me = uid ? await getMe(uid) : null;
  const overall = (await topicCounts(topic.id))[topic.id] ?? { a: 0, b: 0 };
  const sides = { a: { label: topic.a_label, color: topic.a_color }, b: { label: topic.b_label, color: topic.b_color } };

  return (
    <>
      {topic.status !== "live" && (
        <div className="mb-4 rounded-xl border border-dashed border-line bg-muted px-3 py-2 text-sm">
          <b>{topic.status === "draft" ? "Rascunho" : "Encerrado"}</b>: só admins veem esta página. Publique em <Link href="/admin/temas" className="underline">/admin/temas</Link>.
        </div>
      )}
      <header>
        <h1 className="text-2xl font-bold tracking-tight">{topic.title}</h1>
        <p className="text-subtle">{topic.question}</p>
      </header>

      {!me ? (
        <section className="mt-6 rounded-2xl border border-line bg-card p-6 text-center">
          <p className="text-lg font-semibold">
            {topic.a_label} ou {topic.b_label}? Veja de que lado está a sua rede.
          </p>
          <p className="mt-1 text-sm text-subtle">Entre com o X: usamos quem você segue e quem segue você.</p>
          <a href="/api/auth/x" className="mt-4 inline-block rounded-full bg-fg px-5 py-2.5 font-semibold text-bg">
            Entrar com X
          </a>
          <div className="mx-auto mt-6 max-w-md text-left">
            <Split topic={topic} a={overall.a} b={overall.b} label="no total" />
          </div>
        </section>
      ) : (
        <Member topic={topic} me={me} sides={sides} overall={overall} />
      )}
    </>
  );
}

async function Member({
  topic,
  me,
  sides,
  overall,
}: {
  topic: Topic;
  me: NonNullable<Awaited<ReturnType<typeof getMe>>>;
  sides: Record<"a" | "b", { label: string; color: string }>;
  overall: { a: number; b: number };
}) {
  const [side, network] = await Promise.all([getTopicVote(topic.id, me.id), getTopicNetwork(topic.id, me.id)]);
  const { nodes, tally } = network;
  return (
    <div className="mt-6 flex flex-col gap-4 lg:grid lg:grid-cols-[1fr_340px]">
      <div className="order-2 grid min-w-0 content-start gap-4 lg:order-none">
        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-3 text-lg font-semibold">De que lado está sua rede</h2>
          <Split topic={topic} a={tally.red} b={tally.green} label="na rede" />
        </section>
        <Bubble me={{ ...me, vote: sideToSlot(side) }} nodes={nodes} shareBase={appUrl()} sides={topicSides(topic)} readOnly />
      </div>
      <aside className="order-1 grid content-start gap-4 lg:order-none">
        <TopicVote topic={topic.id} side={side} sides={sides} disabled={topic.status === "closed"} />
        <section className="rounded-2xl border border-line bg-card p-4">
          <h2 className="mb-3 text-sm font-semibold">Todo mundo</h2>
          <Split topic={topic} a={overall.a} b={overall.b} label="no total" />
        </section>
      </aside>
    </div>
  );
}
