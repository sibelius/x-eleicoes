import { Fragment } from "react";
import { SIDE, comparePath, sharePath } from "@/lib/links";
import type { Bridge } from "@/lib/social";
import { Face } from "./Face";

/** The shortest chain of follows from someone to the nearest member on the other side. */
export function BridgeCard({ bridge, own }: { bridge: Bridge; own: boolean }) {
  if (!bridge) return null;
  const { path, steps } = bridge;
  const me = path[0];
  const target = path[path.length - 1];
  const via = path.slice(1, -1);
  return (
    <section data-tour="bridge" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">🌉 Ponte para o outro lado</h2>
      <p className="mt-1 text-sm text-subtle">
        {own ? "Você está" : `@${me.username} está`} a <b className="text-fg">{steps} {steps === 1 ? "passo" : "passos"}</b> de{" "}
        <b style={{ color: `var(--${target.vote})` }}>{SIDE[target.vote!]}</b>
        {via.length ? <>, passando por {via.map((v) => `@${v.username}`).join(" → ")}</> : ": vocês se seguem"}.
      </p>
      <div className="mt-3 flex flex-wrap items-center gap-2">
        {path.map((p, i) => (
          <Fragment key={p.id}>
            {i > 0 && <span className="text-subtle">→</span>}
            <a href={sharePath(p.username)} title={`@${p.username}`} className="flex flex-col items-center gap-1 text-xs">
              <Face src={p.avatar} size={i === 0 || i === path.length - 1 ? 44 : 34} vote={p.vote} />
              <span className="max-w-20 truncate text-subtle">@{p.username}</span>
            </a>
          </Fragment>
        ))}
      </div>
      <a href={comparePath(me.username, target.username)} className="mt-3 inline-block rounded-full border border-line px-3 py-1 text-sm">
        Comparar com @{target.username}
      </a>
    </section>
  );
}
