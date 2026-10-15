import { Card, Kpi, PageTitle, pctf } from "@/components/admin/Card";
import { GraphExplorer } from "@/components/admin/GraphExplorer";
import type { GraphAnalysis } from "@/lib/graph";


export function GraphView({ g, base }: { g: GraphAnalysis; base: string }) {
  const s = g.stats;
  return (
    <>
      <PageTitle title="Grafo dos membros" sub="Quem segue quem entre os membros. Posições por simulação de forças, agrupadas por comunidade." />
      <div data-tour="graph-kpis" className="mb-4 grid grid-cols-2 gap-3 sm:grid-cols-4 lg:grid-cols-8">
        <Kpi label="Ligações" value={s.edges} hint={`${s.mutualPairs} pares mútuos`} />
        <Kpi label="Reciprocidade" value={pctf(s.reciprocity)} hint="seguem de volta" />
        <Kpi label="Densidade" value={pctf(s.density, 2)} />
        <Kpi label="Agrupamento médio" value={pctf(s.avgClustering)} />
        <Kpi label="Componente gigante" value={s.giant} hint={`${s.components} componentes, ${s.isolated} isolados`} />
        <Kpi label="Diâmetro" value={s.diameter} hint={`caminho médio ${s.avgPath.toFixed(2).replace(".", ",")}`} />
        <Kpi label="Comunidades" value={s.communities} hint={`modularidade ${s.modularity.toFixed(2).replace(".", ",")}`} />
        <Kpi label="Núcleo máximo" value={`${s.maxCore}-core`} />
      </div>
      <GraphExplorer graph={g} base={base} />
      <Card className="mt-4" title="Como ler">
        <ul className="grid gap-1 text-sm text-subtle sm:grid-cols-2">
          <li><b className="text-fg">Comunidades</b>: propagação de rótulos sobre as ligações (sem olhar o voto). Se as cores de comunidade batem com as de voto, as bolhas são reais.</li>
          <li><b className="text-fg">Modularidade</b> acima de 0,3 indica grupos bem separados.</li>
          <li><b className="text-fg">Reciprocidade</b>: fração das ligações que são mútuas.</li>
          <li><b className="text-fg">Agrupamento</b>: chance de dois amigos de alguém também serem amigos entre si.</li>
        </ul>
      </Card>
    </>
  );
}
