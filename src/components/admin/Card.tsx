// Building blocks for the admin screens.

export function Card({ title, note, children, className = "" }: { title?: string; note?: string; children: React.ReactNode; className?: string }) {
  return (
    <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>
      {title && <h2 className="font-semibold">{title}</h2>}
      {note && <p className="mt-0.5 text-xs text-subtle">{note}</p>}
      <div className={title || note ? "mt-3" : ""}>{children}</div>
    </section>
  );
}

export function Kpi({ label, value, hint, color }: { label: string; value: string | number; hint?: string; color?: string }) {
  return (
    <div className="rounded-2xl border border-line bg-card p-3">
      <div className="flex items-center gap-1.5 text-xs text-subtle">
        {color && <span className="h-2 w-2 rounded-full" style={{ background: color }} />}
        {label}
      </div>
      <div className="mt-1 text-2xl font-bold tabular-nums">{typeof value === "number" ? value.toLocaleString("pt-BR") : value}</div>
      {hint && <div className="text-xs text-subtle">{hint}</div>}
    </div>
  );
}

export function PageTitle({ title, sub }: { title: string; sub?: string }) {
  return (
    <header className="mb-4">
      <h1 className="text-2xl font-bold tracking-tight">{title}</h1>
      {sub && <p className="text-sm text-subtle">{sub}</p>}
    </header>
  );
}

export const pctf = (x: number, digits = 0) => `${(x * 100).toFixed(digits).replace(".", ",")}%`;

/** Horizontal bars: one row per item, value label at the end. */
export function HBars({ rows, color = "var(--accent)", format = (v: number) => v.toLocaleString("pt-BR") }: {
  rows: { label: string; value: number; color?: string; note?: string }[];
  color?: string;
  format?: (v: number) => string;
}) {
  const max = Math.max(1, ...rows.map((r) => r.value));
  return (
    <ul className="grid gap-1.5">
      {rows.map((r) => (
        <li key={r.label} className="grid grid-cols-[7rem_1fr_auto] items-center gap-2 text-sm" title={r.note}>
          <span className="truncate text-subtle">{r.label}</span>
          <span className="h-3 rounded-r" style={{ width: `${(r.value / max) * 100}%`, minWidth: r.value ? 3 : 0, background: r.color ?? color }} />
          <b className="tabular-nums">{format(r.value)}</b>
        </li>
      ))}
    </ul>
  );
}
