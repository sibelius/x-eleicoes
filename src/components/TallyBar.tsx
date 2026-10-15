import { SIDE, bubbleVerdict, pct } from "@/lib/links";
import type { Tally } from "@/lib/network";

export function TallyBar({ tally }: { tally: Tally }) {
  const l = pct(tally.lula, tally.total);
  const b = tally.total ? 100 - l : 0;
  const v = bubbleVerdict(tally);
  return (
    <div>
      <div
        className="mb-2 inline-block rounded-full px-3 py-1 text-sm font-bold"
        style={
          v.side
            ? { background: v.side === "lula" ? "var(--red)" : "var(--green)", color: "#fff" }
            : { background: "var(--muted)" }
        }
      >
        {v.label}
      </div>
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-[var(--red)]">{SIDE.lula} {l}%</span>
        <span className="text-[var(--green)]">{SIDE.bolsonaro} {b}%</span>
      </div>
      <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${l}%`, background: "var(--red)" }} />
        <div style={{ width: `${b}%`, background: "var(--green)" }} />
      </div>
      <div className="mt-1 text-xs text-subtle">
        {tally.total} {tally.total === 1 ? "escolha" : "escolhas"} na rede
      </div>
    </div>
  );
}
