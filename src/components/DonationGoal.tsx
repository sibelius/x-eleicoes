import { brl, getGoalProgress } from "@/lib/donations";

/** This month's confirmed donations against the goal. `compact` for the Pix box on every screen. */
export async function DonationGoal({ compact = false }: { compact?: boolean }) {
  const g = await getGoalProgress();
  const pct = g.goal ? Math.min(100, Math.round((g.raised / g.goal) * 100)) : 0;
  const bar = (
    <div className={`overflow-hidden rounded-full bg-muted ${compact ? "h-1.5" : "h-3"}`} role="progressbar" aria-valuenow={pct} aria-valuemin={0} aria-valuemax={100}>
      <div className="h-full rounded-full bg-[var(--green)]" style={{ width: `${Math.max(pct, g.raised ? 2 : 0)}%` }} />
    </div>
  );
  if (compact) {
    return (
      <a href="/apoie" className="mt-3 block text-xs text-subtle">
        <div className="mb-1 flex justify-between gap-2">
          <span>Meta de {g.month.split(" ")[0]}</span>
          <span className="tabular-nums">
            <b className="text-fg">{brl(g.raised)}</b> de {brl(g.goal)}
          </span>
        </div>
        {bar}
      </a>
    );
  }
  return (
    <div>
      <div className="mb-2 flex flex-wrap items-baseline justify-between gap-2">
        <div>
          <span className="text-2xl font-bold tabular-nums">{brl(g.raised)}</span>
          <span className="text-subtle"> de {brl(g.goal)}</span>
        </div>
        <span className="text-sm text-subtle">
          {pct}% · {g.donors} {g.donors === 1 ? "apoiador" : "apoiadores"} em {g.month}
        </span>
      </div>
      {bar}
      <p className="mt-2 text-xs text-subtle">Meta do mês para servidores e para buscar quem cada pessoa segue no X. Conta só o que já confirmamos no extrato.</p>
    </div>
  );
}
