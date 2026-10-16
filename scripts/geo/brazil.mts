// Generates src/lib/brazil-geo.ts: one SVG path per state, label anchors and bounding boxes.
// Source: IBGE's open state boundaries (malhas API, lowest detail). Run once, commit the output:
//   npx -y tsx scripts/geo/brazil.mts            (fetches from IBGE)
//   npx -y tsx scripts/geo/brazil.mts file.json  (from a saved copy)
// IBGE's server sends an incomplete certificate chain that Node's fetch rejects; if so, save it with
// curl (curl -o br.json '<SOURCE below>') and pass the file.
// Projection: equirectangular with a cos(15°S) correction, scaled to 1000 units wide, integer coordinates.
import { readFileSync, writeFileSync } from "node:fs";

const SOURCE = "https://servicodados.ibge.gov.br/api/v3/malhas/paises/BR?formato=application/vnd.geo+json&qualidade=minima&intrarregiao=UF";
const OUT = new URL("../../src/lib/brazil-geo.ts", import.meta.url);

// IBGE state codes → UF.
const CODES: Record<string, string> = {
  "11": "RO", "12": "AC", "13": "AM", "14": "RR", "15": "PA", "16": "AP", "17": "TO",
  "21": "MA", "22": "PI", "23": "CE", "24": "RN", "25": "PB", "26": "PE", "27": "AL", "28": "SE", "29": "BA",
  "31": "MG", "32": "ES", "33": "RJ", "35": "SP", "41": "PR", "42": "SC", "43": "RS",
  "50": "MS", "51": "MT", "52": "GO", "53": "DF",
};

type Pt = [number, number];
type Feature = { properties: { codarea: string }; geometry: { type: "Polygon" | "MultiPolygon"; coordinates: number[][][] | number[][][][] } };

const src = process.argv[2] ? readFileSync(process.argv[2], "utf8") : await (await fetch(SOURCE)).text();
const features = (JSON.parse(src) as { features: Feature[] }).features;

const polys = (f: Feature): Pt[][][] =>
  (f.geometry.type === "Polygon" ? [f.geometry.coordinates] : f.geometry.coordinates) as Pt[][][];

// Bounds of the whole country, for the projection.
let [lon0, lon1, lat0, lat1] = [180, -180, 90, -90];
for (const f of features)
  for (const poly of polys(f))
    for (const ring of poly)
      for (const [lon, lat] of ring) {
        lon0 = Math.min(lon0, lon);
        lon1 = Math.max(lon1, lon);
        lat0 = Math.min(lat0, lat);
        lat1 = Math.max(lat1, lat);
      }
const COS = Math.cos((15 * Math.PI) / 180);
const W = 1000;
const K = W / ((lon1 - lon0) * COS);
const H = Math.ceil((lat1 - lat0) * K);
const project = ([lon, lat]: Pt): Pt => [Math.round((lon - lon0) * COS * K), Math.round((lat1 - lat) * K)];

/** Integer points without repeats or straight-line middles (the same on both sides of a shared border). */
function clean(ring: Pt[]): Pt[] {
  const pts = ring.map(project).filter((p, i, a) => i === 0 || p[0] !== a[i - 1][0] || p[1] !== a[i - 1][1]);
  if (pts.length > 1 && pts[0][0] === pts.at(-1)![0] && pts[0][1] === pts.at(-1)![1]) pts.pop();
  return pts.filter((p, i) => {
    const a = pts[(i - 1 + pts.length) % pts.length];
    const b = pts[(i + 1) % pts.length];
    return (p[0] - a[0]) * (b[1] - a[1]) - (p[1] - a[1]) * (b[0] - a[0]) !== 0;
  });
}

/** "M x y l dx dy …z" per ring: relative integer steps keep the file small. */
function path(rings: Pt[][]) {
  return rings
    .filter((r) => r.length >= 3)
    .map((r) => {
      let d = `M${r[0][0]} ${r[0][1]}l`;
      for (let i = 1; i < r.length; i++) {
        const dx = r[i][0] - r[i - 1][0];
        const dy = r[i][1] - r[i - 1][1];
        d += `${i > 1 && dx >= 0 ? " " : ""}${dx}${dy >= 0 ? " " : ""}${dy}`;
      }
      return `${d}z`;
    })
    .join("");
}

const area = (r: Pt[]) => Math.abs(r.reduce((s, p, i) => s + p[0] * r[(i + 1) % r.length][1] - r[(i + 1) % r.length][0] * p[1], 0)) / 2;

function inside([x, y]: Pt, poly: Pt[][]) {
  let c = false;
  for (const r of poly)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++)
      if (r[i][1] > y !== r[j][1] > y && x < ((r[j][0] - r[i][0]) * (y - r[i][1])) / (r[j][1] - r[i][1]) + r[i][0]) c = !c;
  return c;
}

function edgeDist([x, y]: Pt, poly: Pt[][]) {
  let best = Infinity;
  for (const r of poly)
    for (let i = 0, j = r.length - 1; i < r.length; j = i++) {
      const [ax, ay] = r[j];
      const [bx, by] = r[i];
      const l = (bx - ax) ** 2 + (by - ay) ** 2;
      const t = l ? Math.max(0, Math.min(1, ((x - ax) * (bx - ax) + (y - ay) * (by - ay)) / l)) : 0;
      best = Math.min(best, Math.hypot(x - ax - t * (bx - ax), y - ay - t * (by - ay)));
    }
  return best;
}

/** The point inside the main polygon farthest from its edges (a coarse "pole of inaccessibility"). */
function anchor(poly: Pt[][]): Pt {
  const xs = poly[0].map((p) => p[0]);
  const ys = poly[0].map((p) => p[1]);
  let best: Pt = [xs[0], ys[0]];
  let bestD = -1;
  const step = Math.max(1, Math.min(Math.max(...xs) - Math.min(...xs), Math.max(...ys) - Math.min(...ys)) / 40);
  for (let x = Math.min(...xs); x <= Math.max(...xs); x += step)
    for (let y = Math.min(...ys); y <= Math.max(...ys); y += step) {
      if (!inside([x, y], poly)) continue;
      const d = edgeDist([x, y], poly);
      if (d > bestD) [best, bestD] = [[x, y], d];
    }
  return [Math.round(best[0]), Math.round(best[1])];
}

// Hand nudges where the most open point reads oddly (GO leaves room for DF; long coastal states).
const NUDGE: Record<string, Pt> = { GO: [-14, 14], DF: [0, 0], PA: [0, -10], MG: [0, 8] };

const paths: Record<string, string> = {};
const labels: Record<string, Pt> = {};
const boxes: Record<string, [number, number, number, number]> = {};
for (const f of features) {
  const uf = CODES[f.properties.codarea];
  if (!uf) throw new Error(`unknown code ${f.properties.codarea}`);
  const ps = polys(f).map((poly) => poly.map(clean).filter((r) => r.length >= 3)).filter((p) => p.length);
  paths[uf] = ps.map(path).join("");
  const main = ps.reduce((a, b) => (area(b[0]) > area(a[0]) ? b : a));
  const [x, y] = anchor(main);
  const [nx, ny] = NUDGE[uf] ?? [0, 0];
  labels[uf] = [x + nx, y + ny];
  const all = ps.flatMap((p) => p[0]);
  boxes[uf] = [Math.min(...all.map((p) => p[0])), Math.min(...all.map((p) => p[1])), Math.max(...all.map((p) => p[0])), Math.max(...all.map((p) => p[1]))];
}

const ufs = Object.keys(paths).sort();
const rec = (o: Record<string, unknown>, f: (v: never) => string) => `{\n${ufs.map((uf) => `  ${uf}: ${f(o[uf] as never)},`).join("\n")}\n}`;
const out = `// Generated by scripts/geo/brazil.mts from IBGE's open state boundaries (Fonte: IBGE). Do not edit.
import type { UF } from "./uf";

/** The map's size in SVG units (equirectangular, cos 15°S). */
export const GEO = { w: ${W}, h: ${H} } as const;

/** One SVG path per state. */
export const UF_PATHS: Record<UF, string> = ${rec(paths, (v: string) => JSON.stringify(v))};

/** Where each state's label sits. */
export const UF_LABEL: Record<UF, [number, number]> = ${rec(labels, (v: Pt) => `[${v.join(", ")}]`)};

/** Each state's bounding box: x0, y0, x1, y1. */
export const UF_BOX: Record<UF, [number, number, number, number]> = ${rec(boxes, (v: number[]) => `[${v.join(", ")}]`)};
`;
writeFileSync(OUT, out);
console.log(`${ufs.length} states, ${W}×${H}, ${(out.length / 1024).toFixed(1)} KB → ${OUT.pathname}`);
