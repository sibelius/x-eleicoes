import { pct } from "@/lib/links";
import type { Tally } from "@/lib/network";

export function TallyBar({ tally }: { tally: Tally }) {
  const l = pct(tally.lula, tally.total);
  const b = tally.total ? 100 - l : 0;
  return (
    <div>
      <div className="flex justify-between text-sm font-semibold">
        <span className="text-[var(--lula)]">Lula {l}%</span>
        <span className="text-[var(--bolso)]">Bolsonaro {b}%</span>
      </div>
      <div className="mt-1 flex h-4 overflow-hidden rounded-full bg-muted">
        <div style={{ width: `${l}%`, background: "var(--lula)" }} />
        <div style={{ width: `${b}%`, background: "var(--bolso)" }} />
      </div>
      <div className="mt-1 text-xs text-subtle">
        {tally.total} {tally.total === 1 ? "voto" : "votos"} na rede
        {tally.hidden && " · alguns votos privados ficam de fora até a rede ter 5+ votos"}
      </div>
    </div>
  );
}
