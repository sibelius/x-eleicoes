// Brazilian states (UF) and a parser for the free-text "location" of an X profile.

export const UFS = {
  AC: "Acre",
  AL: "Alagoas",
  AP: "Amapá",
  AM: "Amazonas",
  BA: "Bahia",
  CE: "Ceará",
  DF: "Distrito Federal",
  ES: "Espírito Santo",
  GO: "Goiás",
  MA: "Maranhão",
  MT: "Mato Grosso",
  MS: "Mato Grosso do Sul",
  MG: "Minas Gerais",
  PA: "Pará",
  PB: "Paraíba",
  PR: "Paraná",
  PE: "Pernambuco",
  PI: "Piauí",
  RJ: "Rio de Janeiro",
  RN: "Rio Grande do Norte",
  RS: "Rio Grande do Sul",
  RO: "Rondônia",
  RR: "Roraima",
  SC: "Santa Catarina",
  SP: "São Paulo",
  SE: "Sergipe",
  TO: "Tocantins",
} as const;

export type UF = keyof typeof UFS;

export function isUf(s: unknown): s is UF {
  return typeof s === "string" && Object.hasOwn(UFS, s);
}

// Two-letter codes that are also everyday words ("to", "se", "pa"…) only count when written in capitals.
const SAFE_LOWER = new Set(["sp", "rj", "mg", "rs", "sc", "pr", "df", "ms", "mt", "pb", "rn", "rr"]);

// State names (accent-free), capitals and big cities, and nicknames. "para" (a preposition) is handled apart.
const PLACES: Record<string, UF> = {
  ...Object.fromEntries(
    Object.entries(UFS)
      .filter(([uf]) => uf !== "PA")
      .map(([uf, name]) => [norm(name), uf as UF]),
  ),
  "estado do para": "PA",
  minas: "MG",
  brasilia: "DF",
  "espirito santo": "ES",
  // São Paulo
  sampa: "SP", campinas: "SP", guarulhos: "SP", "sao bernardo do campo": "SP", "santo andre": "SP", osasco: "SP",
  "ribeirao preto": "SP", sorocaba: "SP", "sao jose dos campos": "SP", santos: "SP", jundiai: "SP", piracicaba: "SP",
  bauru: "SP", "sao jose do rio preto": "SP", "mogi das cruzes": "SP", diadema: "SP", "sao carlos": "SP", abc: "SP",
  // Rio de Janeiro
  rio: "RJ", niteroi: "RJ", "sao goncalo": "RJ", "duque de caxias": "RJ", "nova iguacu": "RJ", petropolis: "RJ",
  "volta redonda": "RJ", "campos dos goytacazes": "RJ", macae: "RJ", "cabo frio": "RJ",
  // Minas Gerais
  bh: "MG", "belo horizonte": "MG", uberlandia: "MG", contagem: "MG", "juiz de fora": "MG", betim: "MG",
  "montes claros": "MG", uberaba: "MG", "governador valadares": "MG", ipatinga: "MG",
  // South
  "porto alegre": "RS", poa: "RS", "caxias do sul": "RS", pelotas: "RS", canoas: "RS", "santa maria": "RS",
  "passo fundo": "RS", curitiba: "PR", cwb: "PR", londrina: "PR", maringa: "PR", "ponta grossa": "PR", cascavel: "PR",
  "foz do iguacu": "PR", florianopolis: "SC", floripa: "SC", joinville: "SC", blumenau: "SC", chapeco: "SC",
  itajai: "SC", criciuma: "SC", "balneario camboriu": "SC",
  // Center-West
  goiania: "GO", anapolis: "GO", "aparecida de goiania": "GO", cuiaba: "MT", "varzea grande": "MT", rondonopolis: "MT",
  "campo grande": "MS", dourados: "MS", taguatinga: "DF", ceilandia: "DF", bsb: "DF",
  // Northeast
  salvador: "BA", "feira de santana": "BA", "vitoria da conquista": "BA", ilheus: "BA", recife: "PE", olinda: "PE",
  caruaru: "PE", petrolina: "PE", "jaboatao dos guararapes": "PE", fortaleza: "CE", "juazeiro do norte": "CE",
  sobral: "CE", "sao luis": "MA", imperatriz: "MA", teresina: "PI", parnaiba: "PI", natal: "RN", mossoro: "RN",
  "joao pessoa": "PB", "campina grande": "PB", maceio: "AL", arapiraca: "AL", aracaju: "SE",
  // North
  manaus: "AM", belem: "PA", ananindeua: "PA", santarem: "PA", maraba: "PA", macapa: "AP", "porto velho": "RO",
  "rio branco": "AC", "boa vista": "RR", palmas: "TO", araguaina: "TO",
  // Espírito Santo
  vitoria: "ES", "vila velha": "ES", cariacica: "ES",
};

// Longest first, so "rio grande do sul" wins over "rio" and "mato grosso do sul" over "mato grosso".
const PHRASES = Object.keys(PLACES).sort((a, b) => b.length - a.length);

// Places abroad: a location naming one of these (and no Brazilian state) isn't guessed from a city name.
const ABROAD = /\b(portugal|lisboa|lisbon|porto portugal|usa|eua|estados unidos|united states|new york|nova york|london|londres|miami|orlando|paris|madrid|espanha|spain|argentina|buenos aires|canada|toronto|japao|japan|tokyo|alemanha|germany|berlin|italia|italy|irlanda|dublin|uk|england|australia)\b/;

/** Lowercase, accents removed, anything that isn't a letter or digit turned into a space. */
export function norm(s: string) {
  return s
    .normalize("NFD")
    .replace(/\p{M}/gu, "")
    .toLowerCase()
    .replace(/[^a-z0-9]+/g, " ")
    .trim();
}

/**
 * The state a free-text location points to ("São Paulo, Brasil", "Curitiba - PR", "BH", "rio grande do sul"),
 * or null when there's none or it's abroad. An explicit UF code beats a state name, which beats a city;
 * when two states are named, the first one wins.
 */
export function parseUf(location: string | null | undefined): UF | null {
  if (!location) return null;
  const raw = location.slice(0, 200);
  // 1. Explicit codes: "SP", "Rio/RJ", "rj"; ambiguous ones only in capitals.
  const codes: { at: number; uf: UF }[] = [];
  for (const m of raw.matchAll(/(?<![\p{L}\p{N}])([A-Za-z]{2})(?![\p{L}\p{N}])/gu)) {
    const t = m[1];
    const up = t.toUpperCase();
    if (!isUf(up)) continue;
    if (t === up || SAFE_LOWER.has(t)) codes.push({ at: m.index, uf: up });
  }
  if (codes.length) return codes.sort((a, b) => a.at - b.at)[0].uf;

  // "Pará" only with its accent ("para" is a preposition).
  let text = ` ${norm(raw.replace(/(?<!\p{L})pará(?!\p{L})/giu, " estado do para "))} `;
  const found: { at: number; uf: UF; state: boolean }[] = [];
  const states = new Set(Object.values(UFS).map(norm));
  for (const p of PHRASES) {
    const i = text.indexOf(` ${p} `);
    if (i < 0) continue;
    found.push({ at: i, uf: PLACES[p], state: states.has(p) || p === "estado do para" || p === "minas" });
    // Blank it out so shorter phrases inside it ("rio" in "rio grande do sul") don't match too.
    text = text.slice(0, i + 1) + " ".repeat(p.length) + text.slice(i + 1 + p.length);
  }
  if (!found.length) return null;
  const byState = found.filter((f) => f.state);
  if (!byState.length && ABROAD.test(norm(raw))) return null;
  return (byState.length ? byState : found).sort((a, b) => a.at - b.at)[0].uf;
}

/**
 * Tile-grid cartogram of Brazil: each state's [column, row] in a 7 × 8 grid, roughly where it is on the map.
 */
export const UF_TILES: Record<UF, [number, number]> = {
  RR: [1, 0], AP: [3, 0],
  AM: [1, 1], PA: [3, 1], MA: [4, 1], CE: [5, 1], RN: [6, 1],
  AC: [0, 2], RO: [1, 2], MT: [2, 2], TO: [3, 2], PI: [4, 2], PE: [5, 2], PB: [6, 2],
  MS: [2, 3], GO: [3, 3], BA: [4, 3], SE: [5, 3], AL: [6, 3],
  DF: [3, 4], MG: [4, 4], ES: [5, 4],
  PR: [2, 5], SP: [3, 5], RJ: [4, 5],
  SC: [2, 6],
  RS: [2, 7],
};
export const TILE_COLS = 7;
export const TILE_ROWS = 8;
