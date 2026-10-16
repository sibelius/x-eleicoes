import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";

// The bubble's force layout, as plain numbers so it can run in a Web Worker (bubble-sim.worker.ts):
// a few hundred dots × 320 ticks of collision used to block the main thread for seconds on phones.

export type SimInput = {
  /** Per dot: radius, start position, target x and its strength, collision padding; fixed = pinned. */
  r: number[];
  x: number[];
  y: number[];
  tx: number[];
  sx: number[];
  pad: number[];
  fixed: boolean[];
  cy: number;
  sy: number;
  ticks: number;
};

type Dot = SimulationNodeDatum & { i: number };

/** Runs the simulation; returns [x0, y0, x1, y1, …]. Deterministic (d3's seeded random). */
export function simulate(p: SimInput): Float64Array {
  const dots: Dot[] = p.r.map((_, i) => ({ i, x: p.x[i], y: p.y[i], ...(p.fixed[i] ? { fx: p.x[i], fy: p.y[i] } : {}) }));
  forceSimulation(dots)
    .force("x", forceX<Dot>((d) => p.tx[d.i]).strength((d) => p.sx[d.i]))
    .force("y", forceY<Dot>(p.cy).strength(p.sy))
    .force("collide", forceCollide<Dot>((d) => p.r[d.i] + p.pad[d.i]).iterations(3))
    .stop()
    .tick(p.ticks);
  const out = new Float64Array(dots.length * 2);
  dots.forEach((d, i) => {
    out[i * 2] = d.x!;
    out[i * 2 + 1] = d.y!;
  });
  return out;
}
