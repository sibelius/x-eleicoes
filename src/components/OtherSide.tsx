import { SIDE, challengeTweetUrl, comparePath } from "@/lib/links";
import type { Me, NetworkNode, Vote } from "@/lib/network";

/** People in your bubble who vote the other way, each one a click from a public challenge. */
export function OtherSide({ me, nodes, base }: { me: Me & { vote: Vote }; nodes: NetworkNode[]; base: string }) {
  const other = nodes.filter((n) => n.voted && n.vote !== me.vote && n.username).slice(0, 12);
  if (!other.length) return null;
  const side = me.vote === "lula" ? SIDE.bolsonaro : SIDE.lula;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Do outro lado</h2>
      <p className="mt-1 text-sm text-subtle">
        {other.length} {other.length === 1 ? "pessoa" : "pessoas"} da sua bolha {other.length === 1 ? "é" : "são"}{" "}
        <b style={{ color: me.vote === "lula" ? "var(--green)" : "var(--red)" }}>{side}</b>. Desafie a comparar as bolhas.
      </p>
      <ul className="mt-3 grid gap-2 text-sm">
        {other.map((n) => (
          <li key={n.id} className="flex items-center justify-between gap-2">
            <a href={comparePath(me.username, n.username!)} className="flex min-w-0 items-center gap-2">
              {n.avatar ? <img src={n.avatar} alt="" className="h-7 w-7 rounded-full" /> : <span className="h-7 w-7 rounded-full bg-muted" />}
              <span className="truncate">
                {n.name} <span className="text-subtle">@{n.username}</span>
              </span>
            </a>
            <a
              className="shrink-0 rounded-full bg-fg px-3 py-1 text-bg"
              href={challengeTweetUrl(base, { username: me.username, vote: me.vote }, n.username!)}
              target="_blank"
              rel="noreferrer"
            >
              Desafiar
            </a>
          </li>
        ))}
      </ul>
    </section>
  );
}
