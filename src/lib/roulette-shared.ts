// Shared by server and client: the date in Brasília, and the roulette's conversation starters.

export function brDay(now = Date.now()) {
  return new Date(now - 3 * 3600_000).toISOString().slice(0, 10);
}

export const ICEBREAKERS = [
  "Qual conta do X você acha que todo mundo deveria seguir?",
  "O que te fez escolher o seu lado?",
  "Qual opinião sua surpreenderia quem é do outro lado?",
  "Se a sua bolha fosse uma pessoa, como ela seria?",
  "Qual foi o melhor post que você viu essa semana?",
  "Você segue alguém do outro lado? Quem?",
  "Qual assunto você acha que une os dois lados?",
  "O que você mudaria na sua timeline se pudesse?",
];
