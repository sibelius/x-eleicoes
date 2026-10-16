import type { DayStates, StateCount } from "./places";
import { UFS, type UF } from "./uf";

// Brazil's five regions (IBGE), and sums over the per-state totals the server already made public.
// Region numbers only add up states shown with 3+ people, so they never reveal a "poucos dados" state.

export const REGIONS: [string, UF[]][] = [
  ["Norte", ["AC", "AM", "AP", "PA", "RO", "RR", "TO"]],
  ["Nordeste", ["AL", "BA", "CE", "MA", "PB", "PE", "PI", "RN", "SE"]],
  ["Centro-Oeste", ["DF", "GO", "MS", "MT"]],
  ["Sudeste", ["ES", "MG", "RJ", "SP"]],
  ["Sul", ["PR", "RS", "SC"]],
];

export const regionOf = (uf: UF) => REGIONS.find(([, ufs]) => ufs.includes(uf))![0];

/** A day of the replay as the same shape the live map uses. */
export function decodeDay(d: DayStates): StateCount[] {
  return (Object.keys(d) as UF[])
    .filter((uf) => Object.hasOwn(UFS, uf))
    .sort()
    .map((uf) => {
      const c = d[uf];
      return c ? { uf, red: c[0], green: c[1], none: c[2], total: c[0] + c[1] + c[2] } : { uf, few: true as const };
    });
}

export type Sum = { red: number; green: number; none: number; total: number; shown: number; few: number };

/** Totals over the states shown (3+ people), optionally only some states; "few" counts the hidden ones. */
export function sumStates(states: StateCount[], only?: UF[]): Sum {
  const out: Sum = { red: 0, green: 0, none: 0, total: 0, shown: 0, few: 0 };
  for (const s of states) {
    if (only && !only.includes(s.uf)) continue;
    if ("few" in s) {
      out.few++;
      continue;
    }
    out.red += s.red;
    out.green += s.green;
    out.none += s.none;
    out.total += s.total;
    out.shown++;
  }
  return out;
}

/** Red's share among those who picked a side, 0–1, or null when nobody did. */
export const redShare = (c: { red: number; green: number }) => (c.red + c.green ? c.red / (c.red + c.green) : null);
