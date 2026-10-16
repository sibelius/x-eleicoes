"use client";

import Link from "next/link";
import { useEffect, useMemo, useRef, useState, useSyncExternalStore } from "react";
import type { EstadosLive } from "@/app/api/estados/route";
import { SIDE, sharePath } from "@/lib/links";
import type { MapEvent, StateCount } from "@/lib/places";
import { REGIONS, decodeDay, redShare, sumStates } from "@/lib/regions";
import { UFS, type UF } from "@/lib/uf";
import { BrazilMap, StateNumbers } from "./BrazilMap";

// /mapa?ver=estados: the states map as a live board. Left: the split of members with a known state and
// its line over time; right: regions and the latest public picks; bottom: replay by day and who's here now.
// Everything here is per-state totals of 3+ people (or regions summed from them), never a person's state.

const fmtDay = (day: string, long = false) =>
  new Date(`${day}T12:00:00Z`).toLocaleDateString("pt-BR", long ? { day: "numeric", month: "long" } : { day: "2-digit", month: "2-digit" });
const fmtTime = (at: number) =>
  new Date(at).toLocaleTimeString("pt-BR", { timeZone: "America/Sao_Paulo", hour: "2-digit", minute: "2-digit" }).replace(":", "h");
const n = (v: number) => v.toLocaleString("pt-BR");

export function StatesLive({ initial }: { initial: EstadosLive }) {
  const [data, setData] = useState(initial);
  const { history, feed } = data;
  const last = history.days.length - 1;
  const [at, setAt] = useState<number | null>(null); // day index while replaying, null = live
  const [playing, setPlaying] = useState(false);
  const [selected, setSelected] = useState<UF | null>(null);
  const [full, setFull] = useState(false);
  const online = useOnline();
  const wide = useWide();

  // Fresh numbers every minute while the tab is visible.
  useEffect(() => {
    const t = setInterval(() => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/estados")
        .then((r) => (r.ok ? r.json() : null))
        .then((v: EstadosLive | null) => v && setData(v))
        .catch(() => {});
    }, 60_000);
    return () => clearInterval(t);
  }, []);

  // Replay: one day every 700ms, stopping live at the end.
  useEffect(() => {
    if (!playing) return;
    const t = setInterval(() => {
      setAt((i) => {
        const next = (i ?? -1) + 1;
        if (next >= last) {
          setPlaying(false);
          return null;
        }
        return next;
      });
    }, 700);
    return () => clearInterval(t);
  }, [playing, last]);

  useEffect(() => {
    if (!full) return;
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setFull(false);
    window.addEventListener("keydown", onKey);
    document.body.style.overflow = "hidden";
    return () => {
      window.removeEventListener("keydown", onKey);
      document.body.style.overflow = "";
    };
  }, [full]);

  const day = at ?? last;
  const states = useMemo(() => decodeDay(history.states[day] ?? {}), [history, day]);
  const live = at === null;
  const sum = sumStates(states);

  const board = (
    <div className={full ? "fixed inset-0 z-50 flex flex-col gap-2 bg-bg p-3" : "flex min-h-0 flex-col gap-2 lg:h-full"}>
      <div className={`relative flex flex-col rounded-2xl border border-line bg-card p-3 ${full ? "min-h-0 flex-1" : "lg:min-h-0 lg:flex-1"}`}>
        <div className="mb-1 flex items-center justify-between gap-2">
          <h2 className="text-sm font-semibold">
            <span style={{ color: "var(--red)" }}>{SIDE.red}</span> × <span style={{ color: "var(--green)" }}>{SIDE.green}</span> por estado
          </h2>
          <span className="text-xs text-subtle">{live ? "agora" : `até ${fmtDay(history.days[day], true)}`}</span>
        </div>
        <BrazilMap
          states={states}
          selected={selected}
          onSelect={setSelected}
          fill={full || wide}
          full={full}
          onFull={() => setFull((f) => !f)}
          emptyCta={live ? "Ainda há poucos estados conhecidos — escolha o seu" : null}
          ariaLabel="Estados de todo mundo"
          tools={<ShareButton />}
        />
      </div>
      <Scrubber
        days={history.days}
        at={at}
        playing={playing}
        online={online}
        onAt={(i) => {
          setPlaying(false);
          setAt(i >= last ? null : i);
        }}
        onPlay={() => {
          if (playing) return setPlaying(false);
          if (at === null) setAt(0);
          setPlaying(true);
        }}
      />
    </div>
  );

  return (
    <div className="grid gap-3 lg:h-full lg:min-h-0 lg:grid-cols-[minmax(260px,300px)_minmax(0,1fr)_minmax(260px,300px)]">
      <div className="lg:col-start-2 lg:row-start-1 lg:min-h-0">{board}</div>
      <aside className="flex flex-col gap-3 lg:col-start-1 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
        <Headline sum={sum} states={states} selected={selected} onClear={() => setSelected(null)} live={live} day={history.days[day]} />
        <ShareChart history={history} at={day} selected={selected} onAt={(i) => setAt(i >= last ? null : i)} />
      </aside>
      <aside className="flex flex-col gap-3 lg:col-start-3 lg:row-start-1 lg:min-h-0 lg:overflow-y-auto">
        <Regions states={states} onPick={setSelected} />
        <Updates feed={feed} history={history} />
      </aside>
    </div>
  );
}

/** Desktop layout (three columns): the map takes the height left between the header and the bar. */
function useWide() {
  return useSyncExternalStore(
    (cb) => {
      const m = matchMedia("(min-width: 1024px)");
      m.addEventListener("change", cb);
      return () => m.removeEventListener("change", cb);
    },
    () => matchMedia("(min-width: 1024px)").matches,
    () => false,
  );
}

/** "N pessoas agora": the site's presence heartbeat (same as the bar at the top of every page). */
function useOnline() {
  const [online, setOnline] = useState<number | null>(null);
  useEffect(() => {
    let stop = false;
    const beat = () => {
      if (document.visibilityState !== "visible") return;
      fetch("/api/presence", { method: "POST" })
        .then((r) => (r.ok ? r.json() : null))
        .then((v: { online: number } | null) => !stop && v && setOnline(v.online))
        .catch(() => {});
    };
    beat();
    const t = setInterval(beat, 45_000);
    return () => {
      stop = true;
      clearInterval(t);
    };
  }, []);
  return online;
}

function Panel({ children, className = "" }: { children: React.ReactNode; className?: string }) {
  return <section className={`rounded-2xl border border-line bg-card p-4 ${className}`}>{children}</section>;
}

function Headline({
  sum,
  states,
  selected,
  onClear,
  live,
  day,
}: {
  sum: ReturnType<typeof sumStates>;
  states: StateCount[];
  selected: UF | null;
  onClear: () => void;
  live: boolean;
  day: string;
}) {
  const r = redShare(sum);
  const red = r === null ? null : Math.round(r * 1000) / 10;
  const st = selected ? states.find((s) => s.uf === selected) : undefined;
  return (
    <Panel>
      <div className="flex items-center justify-between gap-2 text-xs text-subtle">
        <span>Brasil · quem tem estado conhecido</span>
        <span className="flex shrink-0 items-center gap-1.5 rounded-full bg-muted px-2 py-0.5 whitespace-nowrap">
          <span className={`h-1.5 w-1.5 rounded-full ${live ? "bg-[var(--green)]" : "bg-[var(--subtle)]"}`} />
          {live ? "Ao vivo" : fmtDay(day)}
        </span>
      </div>
      {red === null ? (
        <div className="mt-3">
          <p className="text-lg font-semibold leading-snug">Ainda há poucos estados conhecidos — escolha o seu</p>
          <p className="mt-1 text-sm text-subtle">
            Um estado entra no mapa quando tem pelo menos 3 pessoas. O seu só aparece somado com o de outras pessoas.
          </p>
          <Link href="/app#estado" className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg">
            Escolher meu estado
          </Link>
        </div>
      ) : (
        <>
          <div className="mt-3 grid grid-cols-2 gap-2">
            <Side label={SIDE.red} color="var(--red)" pct={red} count={sum.red} />
            <Side label={SIDE.green} color="var(--green)" pct={Math.round((100 - red) * 10) / 10} count={sum.green} right />
          </div>
          <div className="relative mt-3 flex h-2 gap-0.5">
            <span className="rounded-l-full" style={{ width: `${red}%`, background: "var(--red)" }} />
            <span className="flex-1 rounded-r-full" style={{ background: "var(--green)" }} />
            <span className="absolute -top-1 left-1/2 h-4 w-0.5 -translate-x-1/2 rounded bg-fg" aria-hidden />
          </div>
          <dl className="mt-4 grid gap-1.5 border-t border-line pt-3 text-sm">
            <Row label="Diferença">{Math.abs(Math.round((red - (100 - red)) * 10) / 10).toLocaleString("pt-BR")} pontos</Row>
            <Row label="Estados no mapa">{sum.shown} de 27</Row>
            {sum.few > 0 && <Row label="Com poucos dados">{sum.few}</Row>}
            <Row label="Pessoas nesses estados">{n(sum.total)}</Row>
            {sum.none > 0 && <Row label="Ainda sem lado">{n(sum.none)}</Row>}
          </dl>
        </>
      )}
      {selected && (
        <div className="mt-4 rounded-xl bg-muted p-3">
          <div className="flex items-center justify-between gap-2">
            <span className="font-semibold">{UFS[selected]}</span>
            <button type="button" onClick={onClear} className="text-xs text-subtle underline">
              Ver o Brasil todo
            </button>
          </div>
          {!st ? (
            <p className="mt-1 text-xs text-subtle">Ninguém com estado conhecido aqui ainda.</p>
          ) : "few" in st ? (
            <p className="mt-1 text-xs text-subtle">Poucos dados: menos de 3 pessoas, então não mostramos números.</p>
          ) : (
            <StateNumbers st={st} labels={SIDE} />
          )}
        </div>
      )}
    </Panel>
  );
}

function Row({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-baseline justify-between gap-3">
      <dt className="text-subtle">{label}</dt>
      <dd className="text-right tabular-nums">{children}</dd>
    </div>
  );
}

function Side({ label, color, pct, count, right = false }: { label: string; color: string; pct: number; count: number; right?: boolean }) {
  return (
    <div className={right ? "text-right" : ""}>
      <div className="text-sm font-medium" style={{ color }}>
        {label}
      </div>
      <div className="text-4xl font-light tracking-tight tabular-nums">
        {pct.toLocaleString("pt-BR")}
        <span className="align-top text-base" style={{ color }}>
          %
        </span>
      </div>
      <div className="text-xs text-subtle tabular-nums">
        {n(count)} {count === 1 ? "pessoa" : "pessoas"}
      </div>
    </div>
  );
}

/** Red and Green's share by day: the whole app, or the picked state (only days it had 3+ people). */
function ShareChart({
  history,
  at,
  selected,
  onAt,
}: {
  history: EstadosLive["history"];
  at: number;
  selected: UF | null;
  onAt: (i: number) => void;
}) {
  const [hover, setHover] = useState<number | null>(null);
  const svg = useRef<SVGSVGElement>(null);
  const stateSeries = selected
    ? history.states.map((d) => {
        const c = d[selected];
        return c && c[0] + c[1] ? c[0] / (c[0] + c[1]) : null;
      })
    : null;
  const ofState = stateSeries && stateSeries.filter((v) => v !== null).length > 0;
  const series = ofState ? stateSeries! : history.app.map((d) => redShare(d));
  const W = 300;
  const H = 170;
  const L = 32;
  const R = 8;
  const T = 10;
  const B = 22;
  const vals = series.flatMap((v) => (v === null ? [] : [v * 100, 100 - v * 100]));
  let lo = vals.length ? Math.floor((Math.min(...vals) - 4) / 5) * 5 : 30;
  let hi = vals.length ? Math.ceil((Math.max(...vals) + 4) / 5) * 5 : 70;
  lo = Math.max(0, lo);
  hi = Math.min(100, Math.max(hi, lo + 10));
  const nDays = series.length;
  const x = (i: number) => L + (nDays <= 1 ? (W - L - R) / 2 : (i / (nDays - 1)) * (W - L - R));
  const y = (v: number) => T + ((hi - v) / (hi - lo)) * (H - T - B);
  const line = (f: (v: number) => number) => {
    let d = "";
    let pen = false;
    series.forEach((v, i) => {
      if (v === null) return void (pen = false);
      d += `${pen ? "L" : "M"}${x(i).toFixed(1)} ${y(f(v)).toFixed(1)}`;
      pen = true;
    });
    return d;
  };
  // Round ticks: 5, 10, 20 or 25 points apart.
  const step = [5, 10, 20, 25].find((v) => (hi - lo) / v <= 5) ?? 25;
  lo = Math.floor(lo / step) * step;
  hi = Math.ceil(hi / step) * step;
  const ticks = Array.from({ length: Math.round((hi - lo) / step) + 1 }, (_, i) => lo + step * i);
  const cursor = hover ?? at;
  const cv = series[cursor];
  const indexAt = (e: { clientX: number; clientY: number }) => {
    const m = svg.current!.getScreenCTM()!.inverse();
    const px = m.a * e.clientX + m.c * e.clientY + m.e;
    return Math.max(0, Math.min(nDays - 1, Math.round(((px - L) / (W - L - R)) * (nDays - 1))));
  };

  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Ao longo dos dias</h2>
        <span className="text-xs text-subtle">{ofState ? UFS[selected!] : "todo o app"}</span>
      </div>
      <div className="mt-1 flex gap-3 text-xs">
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 rounded" style={{ background: "var(--red)" }} />
          {SIDE.red}
        </span>
        <span className="inline-flex items-center gap-1">
          <span className="h-0.5 w-3 rounded" style={{ background: "var(--green)" }} />
          {SIDE.green}
        </span>
        {cv != null && (
          <span className="ml-auto text-subtle tabular-nums">
            {fmtDay(history.days[cursor])}: {Math.round(cv * 100)}% × {100 - Math.round(cv * 100)}%
          </span>
        )}
      </div>
      <svg
        ref={svg}
        viewBox={`0 0 ${W} ${H}`}
        className="mt-2 w-full touch-none"
        role="img"
        aria-label="Divisão entre Vermelho e Verde por dia"
        onPointerMove={(e) => setHover(indexAt(e))}
        onPointerLeave={() => setHover(null)}
        onClick={(e) => onAt(indexAt(e))}
      >
        {ticks.map((t) => (
          <g key={t}>
            <line x1={L} x2={W - R} y1={y(t)} y2={y(t)} style={{ stroke: "var(--line)" }} strokeWidth={1} />
            <text x={L - 6} y={y(t)} textAnchor="end" dominantBaseline="central" fontSize={9} style={{ fill: "var(--subtle)" }}>
              {Math.round(t)}%
            </text>
          </g>
        ))}
        {[0, Math.floor((nDays - 1) / 2), nDays - 1]
          .filter((v, i, a) => a.indexOf(v) === i)
          .map((i) => (
            <text key={i} x={x(i)} y={H - 6} textAnchor={nDays <= 1 ? "middle" : i === 0 ? "start" : i === nDays - 1 ? "end" : "middle"} fontSize={9} style={{ fill: "var(--subtle)" }}>
              {fmtDay(history.days[i])}
            </text>
          ))}
        <line x1={x(cursor)} x2={x(cursor)} y1={T} y2={H - B} style={{ stroke: "var(--subtle)" }} strokeDasharray="2 3" strokeWidth={1} />
        <path d={line((v) => v * 100)} fill="none" style={{ stroke: "var(--red)" }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        <path d={line((v) => 100 - v * 100)} fill="none" style={{ stroke: "var(--green)" }} strokeWidth={2} strokeLinejoin="round" strokeLinecap="round" />
        {cv != null && (
          <>
            <circle cx={x(cursor)} cy={y(cv * 100)} r={3.5} style={{ fill: "var(--red)", stroke: "var(--card)" }} strokeWidth={2} />
            <circle cx={x(cursor)} cy={y(100 - cv * 100)} r={3.5} style={{ fill: "var(--green)", stroke: "var(--card)" }} strokeWidth={2} />
          </>
        )}
      </svg>
      <p className="mt-1 text-xs text-subtle">
        {ofState
          ? "Só os dias em que o estado tinha 3 ou mais pessoas. Toque no gráfico para voltar no tempo."
          : selected
            ? `${UFS[selected]} ainda não tem dados por dia; aqui, o app todo.`
            : nDays <= 1
              ? "O gráfico ganha um ponto por dia."
              : "Todo mundo do app, com ou sem estado. Toque no gráfico para voltar no tempo."}
      </p>
    </Panel>
  );
}

function Regions({ states, onPick }: { states: StateCount[]; onPick: (uf: UF) => void }) {
  const all = sumStates(states);
  const national = redShare(all);
  return (
    <Panel>
      <div className="flex items-baseline justify-between gap-2">
        <h2 className="font-semibold">Por região</h2>
        <span className="text-xs text-subtle">lado mais escolhido</span>
      </div>
      <ul className="mt-2 divide-y divide-line">
        {REGIONS.map(([name, ufs]) => {
          const s = sumStates(states, ufs);
          const r = redShare(s);
          const best = s.shown ? ufs.filter((u) => states.some((x) => x.uf === u && "total" in x)).sort((a, b) => total(states, b) - total(states, a))[0] : ufs[0];
          if (r === null)
            return (
              <li key={name} className="flex items-center justify-between py-2 text-sm">
                <button type="button" className="text-left hover:underline" onClick={() => onPick(best)}>
                  {name}
                </button>
                <span className="text-xs text-subtle">poucos dados</span>
              </li>
            );
          const lead = r >= 0.5 ? "red" : "green";
          const share = Math.round((lead === "red" ? r : 1 - r) * 1000) / 10;
          const nat = national === null ? null : (lead === "red" ? national : 1 - national) * 100;
          const delta = nat === null ? null : Math.round((share - nat) * 10) / 10;
          return (
            <li key={name} className="py-2 text-sm">
              <div className="flex items-center gap-2">
                <button type="button" className="flex-1 text-left hover:underline" onClick={() => onPick(best)}>
                  {name}
                </button>
                <span className="text-xs font-medium" style={{ color: `var(--${lead})` }}>
                  {SIDE[lead]}
                </span>
                <span className="w-12 text-right font-semibold tabular-nums">{share.toLocaleString("pt-BR")}%</span>
                <span className="w-10 text-right text-xs text-subtle tabular-nums" title="Em relação ao Brasil">
                  {delta === null ? "" : `${delta > 0 ? "+" : delta < 0 ? "−" : "±"}${Math.abs(delta).toLocaleString("pt-BR")}`}
                </span>
              </div>
              <div className="mt-1 flex items-center justify-between gap-2 text-xs text-subtle">
                <span>
                  {n(s.total)} {s.total === 1 ? "pessoa" : "pessoas"} · {s.shown} de {ufs.length} estados
                </span>
                <span className="relative h-1 w-16 rounded-full bg-muted">
                  <span className="absolute inset-y-0 left-0 rounded-full" style={{ width: `${r * 100}%`, background: "var(--red)" }} />
                  <span className="absolute -top-0.5 left-1/2 h-2 w-px bg-fg" />
                </span>
              </div>
            </li>
          );
        })}
      </ul>
      <p className="mt-2 text-xs text-subtle">Soma só os estados com 3 ou mais pessoas. A diferença é em pontos, comparada ao Brasil.</p>
    </Panel>
  );
}

const total = (states: StateCount[], uf: UF) => {
  const s = states.find((x) => x.uf === uf);
  return s && "total" in s ? s.total : 0;
};

/** Latest public picks and switches (who and which side, never where), plus states joining the map. */
function Updates({ feed, history }: { feed: MapEvent[]; history: EstadosLive["history"] }) {
  // A state "enters the map" on the first day it had 3+ people.
  const entered: { uf: UF; day: string }[] = [];
  for (let i = 1; i < history.days.length; i++)
    for (const uf of Object.keys(history.states[i]) as UF[])
      if (history.states[i][uf] && !history.states[i - 1][uf]) entered.push({ uf, day: history.days[i] });
  type Row = { at: number; key: string; node: React.ReactNode };
  const rows: Row[] = [
    ...feed.map((e) => ({
      at: e.at,
      key: `${e.username}${e.at}`,
      node: (
        <a href={sharePath(e.username)} className="flex items-start gap-2 hover:underline">
          {e.avatar ? <img src={e.avatar} alt="" className="mt-0.5 h-6 w-6 shrink-0 rounded-full" /> : <span className="mt-0.5 h-6 w-6 shrink-0 rounded-full bg-muted" />}
          <span>
            <b>@{e.username}</b>{" "}
            {e.from ? (
              <>
                trocou para o <Side2 v={e.to} />
              </>
            ) : (
              <>
                escolheu o <Side2 v={e.to} />
              </>
            )}
          </span>
        </a>
      ),
    })),
    ...entered.slice(-6).map((s) => ({
      at: Date.parse(`${s.day}T23:59:00-03:00`),
      key: `uf${s.uf}${s.day}`,
      node: (
        <span className="flex items-start gap-2">
          <span className="mt-0.5 grid h-6 w-6 shrink-0 place-items-center rounded-full bg-muted text-[10px] font-bold">{s.uf}</span>
          <span>
            <b>{UFS[s.uf]}</b> entrou no mapa (3 ou mais pessoas)
          </span>
        </span>
      ),
    })),
  ].sort((a, b) => b.at - a.at);

  return (
    <Panel className="min-h-0">
      <h2 className="font-semibold">Últimas atualizações</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">Nada por aqui ainda.</p>
      ) : (
        <ol className="mt-2 divide-y divide-line">
          {rows.slice(0, 12).map((r) => (
            <li key={r.key} className="grid grid-cols-[3.25rem_1fr] gap-2 py-2 text-sm">
              <span className="pt-0.5 text-xs text-subtle tabular-nums">{sameDay(r.at) ? fmtTime(r.at) : fmtDay(new Date(r.at - 3 * 3600_000).toISOString().slice(0, 10))}</span>
              {r.node}
            </li>
          ))}
        </ol>
      )}
      <p className="mt-2 text-xs text-subtle">Só perfis públicos. O estado de cada pessoa nunca aparece.</p>
    </Panel>
  );
}

const sameDay = (at: number) => new Date(at - 3 * 3600_000).toISOString().slice(0, 10) === new Date(Date.now() - 3 * 3600_000).toISOString().slice(0, 10);

function Side2({ v }: { v: "red" | "green" }) {
  return (
    <b style={{ color: `var(--${v})` }}>
      {SIDE[v]}
    </b>
  );
}

function Scrubber({
  days,
  at,
  playing,
  online,
  onAt,
  onPlay,
}: {
  days: string[];
  at: number | null;
  playing: boolean;
  online: number | null;
  onAt: (i: number) => void;
  onPlay: () => void;
}) {
  const last = days.length - 1;
  const i = at ?? last;
  return (
    <div className="flex flex-wrap items-center gap-x-3 gap-y-2 rounded-2xl border border-line bg-card px-3 py-2 text-sm">
      <button
        type="button"
        onClick={onPlay}
        disabled={last < 1}
        aria-label={playing ? "Pausar" : "Rever dia a dia"}
        title={playing ? "Pausar" : "Rever dia a dia"}
        className="grid h-8 w-8 shrink-0 place-items-center rounded-full bg-fg text-bg disabled:opacity-40"
      >
        {playing ? "❚❚" : "▶"}
      </button>
      <span className="w-16 shrink-0 tabular-nums">{at === null ? "Hoje" : fmtDay(days[i])}</span>
      <input
        type="range"
        min={0}
        max={Math.max(last, 1)}
        value={last < 1 ? 1 : i}
        disabled={last < 1}
        onChange={(e) => onAt(Number(e.target.value))}
        aria-label="Dia do mapa"
        aria-valuetext={at === null ? "hoje" : fmtDay(days[i], true)}
        className="min-w-[120px] flex-1 accent-[var(--fg)]"
      />
      <span className="flex items-center gap-3">
        {online !== null && (
          <span className="flex items-center gap-1.5 text-subtle">
            <span className="relative flex h-2 w-2">
              <span className="absolute inline-flex h-full w-full animate-ping rounded-full bg-[var(--green)] opacity-60" />
              <span className="relative inline-flex h-2 w-2 rounded-full bg-[var(--green)]" />
            </span>
            {n(online)} {online === 1 ? "pessoa" : "pessoas"} agora
          </span>
        )}
        <button
          type="button"
          onClick={() => onAt(last)}
          className={`rounded-full px-3 py-1 text-xs font-medium ${at === null ? "bg-fg text-bg" : "border border-line"}`}
        >
          ● Ao vivo
        </button>
      </span>
    </div>
  );
}

function ShareButton() {
  const [note, setNote] = useState("");
  async function share() {
    const url = `${location.origin}/mapa?ver=estados`;
    const text = "Vermelho × Verde por estado, ao vivo no Minha Bolha";
    try {
      if (navigator.share) await navigator.share({ title: "Minha Bolha", text, url });
      else {
        await navigator.clipboard.writeText(url);
        setNote("Link copiado");
        setTimeout(() => setNote(""), 2000);
      }
    } catch {}
  }
  return (
    <div className="relative">
      <button
        type="button"
        onClick={share}
        aria-label="Compartilhar o mapa"
        title="Compartilhar o mapa"
        className="grid h-8 w-8 place-items-center rounded-lg border border-line bg-card/90 shadow-sm backdrop-blur hover:bg-muted"
      >
        <svg viewBox="0 0 24 24" className="h-4 w-4" fill="none" stroke="currentColor" strokeWidth={2} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
          <path d="M12 3v12M7 8l5-5 5 5M5 13v6a2 2 0 0 0 2 2h10a2 2 0 0 0 2-2v-6" />
        </svg>
      </button>
      {note && <span className="absolute top-1 right-10 rounded bg-fg px-2 py-1 text-xs whitespace-nowrap text-bg">{note}</span>}
    </div>
  );
}
