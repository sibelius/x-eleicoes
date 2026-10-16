import { describe, expect, it } from "vitest";
import { UFS, UF_TILES, isUf, parseUf } from "@/lib/uf";

describe("parseUf", () => {
  it.each([
    ["São Paulo, Brasil", "SP"],
    ["sao paulo", "SP"],
    ["SÃO PAULO - SP", "SP"],
    ["Curitiba - PR", "PR"],
    ["Rio de Janeiro", "RJ"],
    ["Rio", "RJ"],
    ["Niterói/RJ", "RJ"],
    ["rio grande do sul", "RS"],
    ["Porto Alegre, RS 🇧🇷", "RS"],
    ["Natal, Rio Grande do Norte", "RN"],
    ["Mato Grosso do Sul", "MS"],
    ["Cuiabá", "MT"],
    ["BH", "MG"],
    ["Belo Horizonte, Brazil", "MG"],
    ["Minas", "MG"],
    ["Brasília", "DF"],
    ["Distrito Federal, Brasil", "DF"],
    ["Floripa", "SC"],
    ["Recife", "PE"],
    ["Belém do Pará", "PA"],
    ["Pará", "PA"],
    ["Goiânia - GO", "GO"],
    ["Palmas TO", "TO"],
    ["Vitória da Conquista", "BA"],
    ["Vitória, ES", "ES"],
    ["Manaus", "AM"],
    ["Espírito Santo", "ES"],
    ["São Luís do Maranhão", "MA"],
    ["Rio Branco - Acre", "AC"],
    ["sp", "SP"],
  ])("%s → %s", (loc, uf) => {
    expect(parseUf(loc)).toBe(uf);
  });

  it.each([
    [""],
    [null],
    ["Brasil"],
    ["Lisboa, Portugal"],
    ["New York, USA"],
    ["vou para casa"],
    ["onde o vento me levar"],
    ["to the moon"],
    ["se liga"],
  ])("%s → null", (loc) => {
    expect(parseUf(loc)).toBeNull();
  });

  it("a code beats a city; the first state named wins", () => {
    expect(parseUf("Campo Grande, RJ")).toBe("RJ");
    expect(parseUf("Recife → São Paulo")).toBe("SP"); // state name over city
    expect(parseUf("SP | RJ")).toBe("SP");
  });
});

describe("UF tiles", () => {
  it("every state has its own tile", () => {
    expect(Object.keys(UF_TILES).sort()).toEqual(Object.keys(UFS).sort());
    const cells = Object.values(UF_TILES).map(([c, r]) => `${c},${r}`);
    expect(new Set(cells).size).toBe(27);
    expect(isUf("SP")).toBe(true);
    expect(isUf("XX")).toBe(false);
    expect(isUf("toString")).toBe(false);
  });
});
