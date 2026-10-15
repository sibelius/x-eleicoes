import "server-only";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import type { NetworkNode, Vote } from "./network";

// Static bubble rendering for next/og images (Satori: absolutely positioned divs, no SVG filters).
export const OG = {
  bg: "#0c0c0e",
  fg: "#f2f2f0",
  subtle: "#9c9ca3",
  muted: "#222226",
  lula: "#f0444f",
  bolso: "#2bb56b",
  none: "#5d5d64",
};

export type ArtNode = { id: string; vote: Vote | null; r: number; avatar?: string | null; me?: boolean; dim?: boolean };
type Sim = SimulationNodeDatum & ArtNode;

function fill(d: ArtNode) {
  if (d.vote === "lula") return OG.lula;
  if (d.vote === "bolsonaro") return OG.bolso;
  return d.me ? OG.fg : OG.none;
}

/** Same forces as the in-app Bubble, then scaled to fit w×h. */
function layout(nodes: ArtNode[], w: number, h: number) {
  const sim: Sim[] = nodes.map((n, i) =>
    n.me ? { ...n, x: 0, y: 0, fx: 0, fy: 0 } : { ...n, x: Math.cos(i * 2.39) * (40 + i), y: Math.sin(i * 2.39) * (40 + i) },
  );
  forceSimulation(sim)
    .force("x", forceX<Sim>((d) => (d.vote === "lula" ? -150 : d.vote === "bolsonaro" ? 150 : 0)).strength((d) => (d.vote ? 0.12 : 0.05)))
    .force("y", forceY<Sim>(0).strength(0.09))
    .force("collide", forceCollide<Sim>((d) => d.r + 2).iterations(3))
    .stop()
    .tick(320);
  const x0 = Math.min(...sim.map((d) => d.x! - d.r));
  const x1 = Math.max(...sim.map((d) => d.x! + d.r));
  const y0 = Math.min(...sim.map((d) => d.y! - d.r));
  const y1 = Math.max(...sim.map((d) => d.y! + d.r));
  const s = Math.min(w / (x1 - x0), h / (y1 - y0), 2.2);
  const cx = (x0 + x1) / 2;
  const cy = (y0 + y1) / 2;
  return sim.map((d) => ({ ...d, x: (d.x! - cx) * s + w / 2, y: (d.y! - cy) * s + h / 2, r: d.r * s }));
}

export function BubbleArt({ nodes, width, height }: { nodes: ArtNode[]; width: number; height: number }) {
  return (
    <div style={{ position: "relative", display: "flex", width, height }}>
      {layout(nodes, width, height).map((d) => {
        const ring = d.avatar ? Math.max(2, d.r * 0.12) : 0;
        return (
          <div
            key={d.id}
            style={{
              position: "absolute",
              display: "flex",
              left: d.x - d.r,
              top: d.y - d.r,
              width: d.r * 2,
              height: d.r * 2,
              padding: ring,
              borderRadius: "50%",
              background: fill(d),
              opacity: d.dim ? 0.7 : 1,
              alignItems: "center",
              justifyContent: "center",
            }}
          >
            {d.me && (
              <span style={{ color: d.vote ? "#fff" : OG.bg, fontSize: d.r * 0.42, fontWeight: 800 }}>VOCÊ</span>
            )}
            {d.avatar && (
              // eslint-disable-next-line @next/next/no-img-element -- Satori renders plain <img>
              <img
                src={d.avatar}
                alt=""
                width={d.r * 2 - ring * 2}
                height={d.r * 2 - ring * 2}
                style={{ borderRadius: "50%" }}
              />
            )}
          </div>
        );
      })}
    </div>
  );
}

/** Downloads an X avatar as a data URI; null on any failure so one bad image can't break the card. */
export async function inlineAvatar(url: string | null | undefined, size = "_bigger"): Promise<string | null> {
  if (!url) return null;
  try {
    const res = await fetch(url.replace("_normal.", `${size}.`), { signal: AbortSignal.timeout(2500) });
    const type = res.headers.get("content-type") ?? "";
    if (!res.ok || !/^image\/(jpeg|png|gif)/.test(type)) return null;
    return `data:${type};base64,${Buffer.from(await res.arrayBuffer()).toString("base64")}`;
  } catch {
    return null;
  }
}

/** The user's real bubble, like the in-app one: avatar in every dot, "VOCÊ" in the middle. */
export async function networkArt(me: { id: string; vote: Vote | null }, nodes: NetworkNode[]) {
  const others = await Promise.all(
    nodes.slice(0, 160).map(async (n): Promise<ArtNode> => {
      const r = n.member ? 12 + n.strength * 3 : 3 + n.strength * 1.5;
      return { id: n.id, vote: n.vote, r, dim: !n.member, avatar: await inlineAvatar(n.avatar, r > 12 ? "_200x200" : "_bigger") };
    }),
  );
  return [{ id: me.id, vote: me.vote, r: 34, me: true }, ...others];
}

/** A made-up but deterministic network for the site-wide card. */
export function demoArt(): ArtNode[] {
  let seed = 7;
  const rand = () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
  const nodes: ArtNode[] = [{ id: "me", vote: null, r: 34, me: true }];
  for (let i = 0; i < 150; i++) {
    const p = rand();
    const vote: Vote | null = p < 0.42 ? "lula" : p < 0.8 ? "bolsonaro" : null;
    const member = rand() < 0.22;
    nodes.push({ id: `n${i}`, vote: member ? vote : rand() < 0.35 ? vote : null, r: member ? 12 + rand() * 12 : 3 + rand() * 5 });
  }
  return nodes;
}
