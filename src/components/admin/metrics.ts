import type { AnalyzedNode } from "@/lib/graph";

// How each graph metric is named, explained and formatted on the admin screens.

export type MetricKey = "pagerank" | "betweenness" | "closeness" | "inDeg" | "core" | "crossTies" | "cascade";

const pct = (x: number, d = 1) => `${(x * 100).toFixed(d).replace(".", ",")}%`;

export const METRICS: { key: MetricKey; label: string; desc: string; fmt: (v: number) => string }[] = [
  { key: "pagerank", label: "PageRank", desc: "Seguido por quem é muito seguido. O centro de influência.", fmt: (v) => pct(v, 2) },
  { key: "betweenness", label: "Intermediação", desc: "Quantos caminhos mais curtos passam pela pessoa. A ponte entre grupos.", fmt: (v) => pct(v, 2) },
  { key: "closeness", label: "Proximidade", desc: "Quão perto de todo mundo ela está (proximidade harmônica).", fmt: (v) => pct(v, 1) },
  { key: "inDeg", label: "Seguidores membros", desc: "Membros que seguem a pessoa.", fmt: (v) => String(v) },
  { key: "core", label: "k-core", desc: "O núcleo mais denso de que ela faz parte (k = cada um ali tem ≥ k ligações dentro).", fmt: (v) => String(v) },
  { key: "crossTies", label: "Laços com o outro lado", desc: "Ligações com quem votou diferente dela.", fmt: (v) => String(v) },
  { key: "cascade", label: "Cascata de convites", desc: "Todos que entraram por ela, direta ou indiretamente.", fmt: (v) => String(v) },
];

export const metric = (key: MetricKey) => METRICS.find((m) => m.key === key)!;

// Categorical hues for communities, fixed order (validated palette); past 8 they fold into "other".
export const COMMUNITY = ["#2a78d6", "#eb6834", "#1baf7a", "#eda100", "#e87ba4", "#008300", "#6250d6", "#e34948"];
export const communityColor = (c: number) => COMMUNITY[c] ?? "var(--none)";

export const voteColor = (n: Pick<AnalyzedNode, "vote">) => (n.vote ? `var(--${n.vote})` : "var(--none)");
export const voteLabel = (n: Pick<AnalyzedNode, "vote">) => (n.vote === "red" ? "Vermelho" : n.vote === "green" ? "Verde" : "Sem voto");
