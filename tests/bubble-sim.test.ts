import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { describe, expect, it } from "vitest";
import { simulate, type SimInput } from "@/components/bubble-sim";

// The worker's layout must place every dot exactly where the old inline simulation did.

type Old = SimulationNodeDatum & { vote: "red" | "green" | null; me: boolean; r: number };

function oldLayout(dots: Old[], w: number, h: number) {
  forceSimulation(dots)
    .force("x", forceX<Old>((d) => (d.me ? w / 2 : d.vote === "red" ? w * 0.28 : d.vote === "green" ? w * 0.72 : w / 2)).strength((d) => (d.vote ? 0.12 : 0.05)))
    .force("y", forceY<Old>(h / 2).strength(w < h ? 0.03 : 0.07))
    .force("collide", forceCollide<Old>((d) => d.r + (d.me ? 10 : 2)).iterations(3))
    .stop()
    .tick(320);
  return dots.flatMap((d) => [d.x!, d.y!]);
}

describe("bubble layout", () => {
  it("matches the inline d3 simulation", () => {
    const w = 400;
    const h = 620;
    const votes = ["red", "green", null] as const;
    const make = (): Old[] => [
      { me: true, vote: null, r: 30, x: w / 2, y: h / 2, fx: w / 2, fy: h / 2 },
      ...Array.from({ length: 150 }, (_, i) => ({
        me: false,
        vote: votes[i % 3],
        r: i % 4 ? 3 + (i % 3) * 1.5 : 12 + (i % 3) * 3,
        x: w / 2 + Math.cos(i) * 120,
        y: h / 2 + Math.sin(i) * 120,
      })),
    ];
    const dots = make();
    const input: SimInput = {
      r: dots.map((d) => d.r),
      x: dots.map((d) => d.x!),
      y: dots.map((d) => d.y!),
      tx: dots.map((d) => (d.me ? w / 2 : d.vote === "red" ? w * 0.28 : d.vote === "green" ? w * 0.72 : w / 2)),
      sx: dots.map((d) => (d.vote ? 0.12 : 0.05)),
      pad: dots.map((d) => (d.me ? 10 : 2)),
      fixed: dots.map((d) => d.me),
      cy: h / 2,
      sy: 0.03,
      ticks: 320,
    };
    expect(Array.from(simulate(input))).toEqual(oldLayout(make(), w, h));
  });
});
