import { SIDE, pct, sharePath } from "@/lib/links";
import type { TimelineEvent, TimelinePoint } from "@/lib/network";

const W = 640;
const H = 200;
const PAD = { l: 34, r: 12, t: 12, b: 24 };

function ago(t: number) {
  const m = Math.round((Date.now() - t) / 60000);
  if (m < 60) return `${Math.max(1, m)} min`;
  if (m < 60 * 24) return `${Math.round(m / 60)} h`;
  return `${Math.round(m / 1440)} d`;
}

/** Cumulative votes per side over time, plus the latest joins and votes. */
export function Timeline({ points, events, title = "Como a bolha evoluiu" }: { points: TimelinePoint[]; events: TimelineEvent[]; title?: string }) {
  if (!points.length) return null;
  // A single day still draws a line: start from zero the day before.
  const pts = points.length === 1 ? [{ ...points[0], day: "", lula: 0, bolsonaro: 0, members: 0 }, ...points] : points;
  const max = Math.max(1, ...pts.map((p) => Math.max(p.lula, p.bolsonaro)));
  const x = (i: number) => PAD.l + (i / (pts.length - 1)) * (W - PAD.l - PAD.r);
  const y = (v: number) => H - PAD.b - (v / max) * (H - PAD.t - PAD.b);
  const line = (k: "lula" | "bolsonaro") => pts.map((p, i) => `${i ? "L" : "M"}${x(i).toFixed(1)},${y(p[k]).toFixed(1)}`).join("");
  const first = points[0];
  const last = points[points.length - 1];
  const fmt = (d: string) => d.slice(8, 10) + "/" + d.slice(5, 7);
  const share = (p: TimelinePoint) => pct(p.lula, p.lula + p.bolsonaro);
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      <p className="mt-1 text-sm text-subtle">
        {last.members} {last.members === 1 ? "pessoa entrou" : "pessoas entraram"} desde {fmt(first.day)}
        {last.lula + last.bolsonaro > 0 && first.lula + first.bolsonaro > 0 && share(first) !== share(last) && (
          <>
            {" "}
            · Vermelho foi de {share(first)}% para <b className="text-fg">{share(last)}%</b>
          </>
        )}
      </p>
      <svg viewBox={`0 0 ${W} ${H}`} className="mt-3 h-auto w-full" role="img" aria-label="Escolhas ao longo do tempo">
        {[0, 0.5, 1].map((f) => (
          <g key={f}>
            <line x1={PAD.l} x2={W - PAD.r} y1={y(max * f)} y2={y(max * f)} stroke="var(--line)" />
            <text x={PAD.l - 6} y={y(max * f) + 4} textAnchor="end" fontSize="11" fill="var(--subtle)">
              {Math.round(max * f)}
            </text>
          </g>
        ))}
        <path d={line("lula")} fill="none" stroke="var(--red)" strokeWidth="2.5" strokeLinejoin="round" />
        <path d={line("bolsonaro")} fill="none" stroke="var(--green)" strokeWidth="2.5" strokeLinejoin="round" />
        <text x={PAD.l} y={H - 6} fontSize="11" fill="var(--subtle)">
          {fmt(first.day)}
        </text>
        <text x={W - PAD.r} y={H - 6} textAnchor="end" fontSize="11" fill="var(--subtle)">
          {fmt(last.day)}
        </text>
        <text x={W - PAD.r} y={y(last.lula) - 6} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--red)">
          Vermelho {last.lula}
        </text>
        <text x={W - PAD.r} y={y(last.bolsonaro) + (last.bolsonaro === last.lula ? 16 : -6)} textAnchor="end" fontSize="12" fontWeight="700" fill="var(--green)">
          Verde {last.bolsonaro}
        </text>
      </svg>
      {events.length > 0 && (
        <ul className="mt-3 grid max-h-64 gap-1.5 overflow-y-auto text-sm">
          {events.map((e, i) => (
            <li key={i} className="flex items-center gap-2">
              {e.avatar ? <img src={e.avatar} alt="" className="h-6 w-6 rounded-full" /> : <span className="h-6 w-6 rounded-full bg-muted" />}
              <span className="min-w-0 flex-1 truncate">
                <a href={sharePath(e.username)} className="font-semibold">
                  @{e.username}
                </a>{" "}
                {e.kind === "joined" ? (
                  "entrou"
                ) : (
                  <>
                    escolheu{" "}
                    <b style={{ color: e.vote === "lula" ? "var(--red)" : "var(--green)" }}>
                      {e.vote ? SIDE[e.vote] : ""}
                    </b>
                  </>
                )}
              </span>
              <span className="shrink-0 text-xs text-subtle">{ago(e.at)}</span>
            </li>
          ))}
        </ul>
      )}
    </section>
  );
}
