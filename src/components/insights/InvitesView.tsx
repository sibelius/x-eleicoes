import { Card, HBars, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { InviteTree } from "@/components/admin/InviteTree";
import { voteColor } from "@/components/admin/metrics";
import type { GraphAnalysis } from "@/lib/graph";


export function InvitesView({ g, base }: { g: GraphAnalysis; base: string }) {
  const { nodes } = g;
  const invited = nodes.filter((n) => n.invitedBy);
  const inviters = nodes.filter((n) => n.invites > 0);
  const maxDepth = Math.max(0, ...nodes.map((n) => n.depth));
  const biggest = [...nodes].sort((a, b) => b.cascade - a.cascade)[0];
  const generations = Array.from({ length: maxDepth + 1 }, (_, d) => ({
    label: d === 0 ? "Vieram sozinhos" : `${d}ª geração`,
    value: nodes.filter((n) => n.depth === d).length,
  }));
  // Do invites keep people on the same side? Pairs where both picked one.
  const pairs = invited.flatMap((n) => {
    const p = nodes.find((x) => x.id === n.invitedBy);
    return p?.vote && n.vote ? [p.vote === n.vote] : [];
  });
  const same = pairs.filter(Boolean).length;
  const topCascades = [...nodes].filter((n) => n.cascade > 0).sort((a, b) => b.cascade - a.cascade).slice(0, 10);

  return (
    <>
      <PageTitle title="Árvore de convites" sub="Quem trouxe quem pelo link de convite, geração após geração." />
      <div data-tour="invites-kpis" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
        <Kpi label="Entraram por convite" value={invited.length} hint={nodes.length ? pctf(invited.length / nodes.length) + " dos membros" : undefined} />
        <Kpi label="Quem convidou" value={inviters.length} />
        <Kpi label="Convites por quem convidou" value={inviters.length ? (invited.length / inviters.length).toFixed(1).replace(".", ",") : "—"} />
        <Kpi label="Fator viral" value={nodes.length ? (invited.length / nodes.length).toFixed(2).replace(".", ",") : "—"} hint="convidados ÷ membros" />
        <Kpi label="Gerações" value={maxDepth} />
        <Kpi label="Mesmo lado de quem convidou" value={pairs.length ? pctf(same / pairs.length) : "—"} hint={`${pairs.length} pares com voto`} />
      </div>
      <InviteTree nodes={nodes} base={base} />
      <div className="mt-4 grid gap-4 md:grid-cols-2">
        <Card title="Membros por geração">
          <HBars rows={generations} />
        </Card>
        <Card tour="invites-cascades" title="Maiores cascatas" note={biggest?.cascade ? `@${biggest.username} puxou ${biggest.cascade} pessoas no total.` : undefined}>
          <HBars rows={topCascades.map((n) => ({ label: `@${n.username}`, value: n.cascade, color: voteColor(n), note: `${n.invites} diretos` }))} />
        </Card>
      </div>
    </>
  );
}
