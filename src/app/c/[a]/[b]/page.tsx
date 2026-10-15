import type { Metadata } from "next";
import { SupportStrip } from "@/components/SupportStrip";
import { Suspense } from "react";
import Link from "next/link";
import { notFound, permanentRedirect } from "next/navigation";
import { Bubble } from "@/components/Bubble";
import { TallyBar } from "@/components/TallyBar";
import { comparePath, compareTweetUrl, pct, sharePath } from "@/lib/links";
import { getComparison } from "@/lib/network";
import { appUrl } from "@/lib/session";
import { ViewBeacon } from "@/components/ViewBeacon";

type Params = PageProps<"/c/[a]/[b]">["params"];

async function load(params: Params) {
  const { a, b } = await params;
  return getComparison(decodeURIComponent(a), decodeURIComponent(b));
}

export async function generateMetadata({ params }: PageProps<"/c/[a]/[b]">): Promise<Metadata> {
  const c = await load(params);
  if (!c) return {};
  return {
    title: `@${c.a.user.username} × @${c.b.user.username}: como as bolhas votam`,
    description: "Compare a sua bolha do X com a de qualquer pessoa: Lula ou Bolsonaro.",
  };
}

export default function ComparePage({ params }: PageProps<"/c/[a]/[b]">) {
  return (
    <main className="mx-auto w-full max-w-6xl px-4 py-10">
      <Link href="/r" className="text-sm text-subtle underline">
        Todas as bolhas
      </Link>
      <Suspense fallback={<p className="mt-6 text-subtle">Carregando…</p>}>
        <Compare params={params} />
      </Suspense>
    </main>
  );
}

async function Compare({ params }: { params: Params }) {
  const c = await load(params);
  if (!c) notFound();
  const { a: ra, b: rb } = await params;
  const [A, B] = [c.a.user.username, c.b.user.username];
  if (decodeURIComponent(ra) !== A || decodeURIComponent(rb) !== B) permanentRedirect(comparePath(A, B));
  const base = appUrl();
  const la = pct(c.a.tally.lula, c.a.tally.total);
  const lb = pct(c.b.tally.lula, c.b.tally.total);
  const verdict =
    !c.a.tally.total || !c.b.tally.total
      ? null
      : la === lb
        ? "As duas redes votam igual."
        : `A rede de @${la > lb ? A : B} é ${Math.abs(la - lb)} pontos mais Lula.`;

  return (
    <>
      <ViewBeacon ids={[c.a.user.id, c.b.user.id]} />
      <h1 className="mt-2 text-3xl font-bold tracking-tight">
        @{A} × @{B}
      </h1>
      <p className="mt-1 text-subtle">
        {verdict && <b className="text-fg">{verdict} </b>}
        {c.shared} {c.shared === 1 ? "pessoa está" : "pessoas estão"} nas duas bolhas.
      </p>
      <div className="mt-4 flex flex-wrap gap-2 text-sm">
        <a className="rounded-full bg-fg px-4 py-2 text-bg" href={compareTweetUrl(base, A, B)} target="_blank" rel="noreferrer">
          Compartilhar no X
        </a>
        <Link className="rounded-full border border-line px-4 py-2" href={comparePath(B, A)}>
          Inverter
        </Link>
      </div>

      <div className="mt-4">
        <SupportStrip placement="compare" />
      </div>
      <div className="mt-6 grid gap-4 lg:grid-cols-2">
        {[c.a, c.b].map((s) => (
          <section key={s.user.id} className="grid min-w-0 content-start gap-4">
            <div className="rounded-2xl border border-line bg-card p-4">
              <a href={sharePath(s.user.username)} className="mb-3 flex items-center gap-3">
                {s.user.avatar && <img src={s.user.avatar} alt="" className="h-10 w-10 rounded-full" />}
                <span className="min-w-0">
                  <span className="block truncate font-semibold">{s.user.name}</span>
                  <span className="block text-sm text-subtle">
                    @{s.user.username}
                    {s.vote && (
                      <>
                        {" · vota "}
                        <b style={{ color: s.vote === "lula" ? "var(--lula)" : "var(--bolso)" }}>
                          {s.vote === "lula" ? "Lula" : "Bolsonaro"}
                        </b>
                      </>
                    )}
                  </span>
                </span>
              </a>
              <TallyBar tally={s.tally} />
            </div>
            <Bubble
              me={{ ...s.user, vote: s.vote }}
              nodes={s.nodes}
              shareBase={base}
              title={`A bolha de @${s.user.username}`}
              centerLabel={s.user.username.slice(0, 1).toUpperCase()}
              readOnly
            />
          </section>
        ))}
      </div>

      {c.sharedMembers.length > 0 && (
        <section className="mt-6 rounded-2xl border border-line bg-card p-4">
          <h2 className="text-lg font-semibold">Nas duas bolhas</h2>
          <ul className="mt-3 flex flex-wrap gap-2 text-sm">
            {c.sharedMembers.map((n) => (
              <li key={n.id}>
                <a
                  href={n.username ? sharePath(n.username) : undefined}
                  className="flex items-center gap-2 rounded-full border px-2 py-1"
                  style={{ borderColor: n.vote === "lula" ? "var(--lula)" : n.vote === "bolsonaro" ? "var(--bolso)" : "var(--line)" }}
                >
                  {n.avatar && <img src={n.avatar} alt="" className="h-6 w-6 rounded-full" />}@{n.username}
                </a>
              </li>
            ))}
          </ul>
        </section>
      )}
    </>
  );
}
