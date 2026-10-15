import { sharePath } from "@/lib/links";
import type { BubbleSize as Size } from "@/lib/network";

const n = (v: number) => v.toLocaleString("pt-BR");

/** Size of the bubble, and who joined but still hasn't voted. */
export function BubbleSize({ size, nudgeUrl }: { size: Size; nudgeUrl?: string }) {
  const silent = size.members - size.voted;
  const stats = [
    ["👥", n(size.accounts), "contas na bolha"],
    ["📲", n(size.members), "entraram no app"],
    ["🔴🟢", n(size.voted), "escolheram um lado"],
    ["🤐", n(silent), "entraram e não escolheram"],
  ];
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Tamanho da bolha</h2>
      <dl className="mt-3 grid grid-cols-2 gap-3 sm:grid-cols-4">
        {stats.map(([icon, value, label]) => (
          <div key={label} className="rounded-xl bg-muted p-3">
            <dt className="text-xs text-subtle">
              {icon} {label}
            </dt>
            <dd className="text-2xl font-bold tabular-nums">{value}</dd>
          </div>
        ))}
      </dl>
      {size.silent.length > 0 && (
        <>
          <h3 className="mt-4 text-sm font-semibold">Entraram mas não escolheram</h3>
          <ul className="mt-2 flex flex-wrap gap-2 text-sm">
            {size.silent.map((m) => (
              <li key={m.id}>
                <a href={sharePath(m.username)} className="flex items-center gap-1.5 rounded-full border border-line px-2 py-1">
                  {m.avatar ? <img src={m.avatar} alt="" className="h-5 w-5 rounded-full" /> : <span className="h-5 w-5 rounded-full bg-muted" />}@
                  {m.username}
                </a>
              </li>
            ))}
            {silent > size.silent.length && <li className="self-center text-subtle">+{n(silent - size.silent.length)}</li>}
          </ul>
          {nudgeUrl && (
            <a href={nudgeUrl} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg">
              Cobrar no X
            </a>
          )}
        </>
      )}
    </section>
  );
}
