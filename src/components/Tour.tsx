"use client";

import { TourProvider, useTour, type StepType } from "@reactour/tour";
import { useEffect } from "react";

// Guided tours (Reactour): each screen has its own, started from a "Como usar" button and once
// automatically on the first visit. Steps point at [data-tour="…"] marks; missing ones are skipped.

const step = (tour: string, content: string): StepType => ({ selector: `[data-tour="${tour}"]`, content });

const TOURS = {
  app: [
    step("me", "👋 Bem-vindo à Minha Bolha! Em um minuto: escolha um lado, veja de que lado está a sua rede do X e chame quem falta."),
    step("vote", "🔴🟢 Seu voto: Vermelho ou Verde. Dá para trocar quando quiser, e sua rede recebe um aviso quando você troca de lado."),
    step("tally", "📊 Sua rede: os votos de quem você segue, de quem te segue e de quem entrou pelo seu convite. Compartilhe no X ou abra sua página pública."),
    step("compare", "⚔️ Comparar: digite um @ para ver a sua bolha e a de outra pessoa lado a lado."),
    step("bubble", "🫧 Sua bolha: cada bolinha é alguém da sua rede. Arraste, dê zoom, toque numa pessoa para ver quem é e toque de novo para abrir a bolha dela."),
    step("bubble-filters", "🔎 Filtros: escolha quem aparece na bolha."),
    step("bubble-video", "🎬 Vídeo da bolha: os votos aparecendo um a um, com som, prontos para postar no X."),
    step("size", "📏 Tamanho da bolha: quantas contas da sua rede já entraram e votaram, e quem ainda falta cobrar."),
    step("timeline", "📈 Linha do tempo: como a sua bolha cresceu, dia após dia."),
    step("wrapped", "🎁 Sua retrospectiva: quão fechada é a sua bolha, seu gêmeo, sua ponte e quem chegou primeiro, num card para postar."),
    step("twins", "🫧 Seu gêmeo de bolha: quem segue e é seguido pelas mesmas pessoas que você. E o gêmeo que escolheu o outro lado."),
    step("bridge", "🌉 Ponte: a menor corrente de quem segue quem entre você e alguém do outro lado."),
    step("other-side", "🤝 O outro lado: gente da sua rede que votou diferente de você. Peça para trocar de cor ou desafie para comparar as bolhas."),
    step("messages", "💬 Mensagens: os pedidos para trocar de cor que você recebeu e enviou, e as respostas."),
    step("invite", "📣 Convide: quem entra pelo seu link cai direto na sua bolha e te dá selos 🥉🥈🥇. Você recebe um aviso a cada pessoa que entrar."),
    step("race-me", "🏁 Corrida dos convites: o ranking da semana de quem mais trouxe gente. Se alguém te passar, você recebe um aviso."),
    step("missing", "🙋 Quem falta: quem você segue e ainda não entrou, começando por quem te segue de volta. Um toque e o convite vai pro X."),
    step("analytics", "📊 Análises da rede: o grafo de todo mundo, você nos anéis da rede, polarização e a árvore de convites."),
    step("push", "🔔 Notificações: saiba quando alguém da rede entra, vota, troca de lado ou compartilha a sua bolha."),
    step("import", "📦 Arquivo do X: importe para trazer a lista completa de quem você segue e de quem te segue."),
    step("nav", "🧭 Explore: o ranking das bolhas mais fechadas, todas as bolhas, e A rede (o grafo, quem é o centro, os convites e a polarização)."),
    step("support", "💚 O app é gratuito e de código aberto. Apoie com Pix ou anuncie aqui."),
    step("tour", "Quer ver de novo? É só tocar em Como usar."),
  ],
  bubble: [
    step("r-header", "👀 Esta é a bolha de outra pessoa: de que lado está a rede de quem ela segue e de quem a segue."),
    step("guess", "🎯 Chute antes de ver: quanto % desta rede escolheu Verde? Depois veja quão perto chegou e desafie no X."),
    step("r-tally", "📊 O placar da rede dela: Vermelho × Verde entre quem já votou."),
    step("r-mine", "🫧 Quer a sua? Entre com o X e veja de que lado está a sua rede."),
    step("r-share", "📣 Compartilhe esta bolha no X. A dona ou o dono da bolha recebe um aviso."),
    step("r-compare", "⚔️ Compare esta bolha com a sua, lado a lado."),
    step("ask", "🙏 Do outro lado? Peça para a pessoa trocar de cor. Se ela estiver no site, vê na hora; se não, recebe uma notificação."),
    step("wrapped", "🎁 A retrospectiva desta bolha, num card para postar."),
    step("bubble", "🫧 Cada bolinha é alguém da rede. Toque para ver quem é e toque de novo para abrir a bolha da pessoa."),
    step("bubble-video", "🎬 Gere o vídeo desta bolha para postar."),
    step("timeline", "📈 Como esta bolha cresceu, dia após dia."),
  ],
  map: [
    step("map", "🗺️ Todas as contas de todas as bolhas num mapa só: Vermelho à esquerda, Verde à direita. Arraste e use dois dedos (ou a roda do mouse) para dar zoom."),
    step("map-search", "🔎 Busque um @ para ir direto até a pessoa."),
    step("map-zoom", "➕ Zoom e Ver tudo. Toque numa pessoa para ver quem é; um segundo toque abre a bolha dela."),
  ],
  graph: [
    step("graph-kpis", "🕸️ O grafo de quem segue quem entre todo mundo que entrou. Aqui ficam os números da rede: ligações, reciprocidade, comunidades…"),
    step("graph-controls", "🎨 Pinte por voto ou por comunidade (grupos achados só pelas ligações), mude o tamanho pela métrica que quiser e busque um @."),
    step("graph-canvas", "👆 Arraste, dê zoom e toque numa pessoa para acender as ligações dela."),
    step("graph-side", "📋 Os números da pessoa escolhida, com a posição dela em cada métrica."),
  ],
  center: [
    step("center-top", "🏆 Quem está no centro da rede: a média das posições em influência (PageRank), intermediação, proximidade e seguidores."),
    step("constellation", "🎯 A rede em anéis a partir de uma pessoa: cada anel é um passo a mais de distância. Troque o centro no menu ou com um toque duplo."),
    step("center-metrics", "📋 Os 10 primeiros em cada métrica. Toque num nome para centralizar nele."),
  ],
  invites: [
    step("invites-kpis", "📣 Quantos entraram por convite, quem convidou e por quantas gerações o convite foi passando."),
    step("invites-tree", "🌳 As árvores de convite: quem trouxe quem. O número no canto é a cascata, todo mundo que entrou por aquela pessoa."),
    step("invites-cascades", "🥇 As maiores cascatas da rede."),
  ],
  polarization: [
    step("pol-kpis", "🧲 As bolhas são fechadas? Quanto das ligações fica no mesmo lado e o tamanho da câmara de eco de cada lado."),
    step("pol-scatter", "📍 Uma bolinha por pessoa: a cor é o voto dela, a posição é como votou a rede dela. Passe o dedo ou o mouse para ver quem é."),
    step("pol-matrix", "🔁 Quem segue quem: Vermelho seguindo Verde, Verde seguindo Vermelho…"),
    step("pol-hist", "📊 Quantas bolhas há em cada faixa de % Vermelho."),
    step("pol-bridges", "🌉 As pontes: quem mais tem ligações com o outro lado."),
  ],
} satisfies Record<string, StepType[]>;

export type TourName = keyof typeof TOURS;

const doneKey = (name: string) => `xe_tour_${name}`;

/** A "Como usar" button that runs the screen's tour; it also runs once by itself on the first visit. */
export function Tour({ name, autoStart = true }: { name: TourName; autoStart?: boolean }) {
  return (
    <TourProvider
      steps={[]}
      padding={{ mask: 6, popover: 12 }}
      scrollSmooth
      beforeClose={() => {
        try {
          localStorage.setItem(doneKey(name), "1");
        } catch {}
      }}
      styles={{
        popover: (base) => ({
          ...base,
          background: "var(--card)",
          color: "var(--fg)",
          borderRadius: 16,
          padding: "22px 20px 14px",
          maxWidth: "min(340px, calc(100vw - 32px))",
          boxShadow: "0 12px 40px rgb(0 0 0 / 0.25)",
          fontSize: 15,
          lineHeight: 1.45,
        }),
        maskArea: (base) => ({ ...base, rx: 14 }),
        maskWrapper: (base) => ({ ...base, color: "rgb(0 0 0 / 0.55)" }),
        badge: (base) => ({ ...base, background: "var(--fg)", color: "var(--bg)", fontWeight: 700 }),
        close: (base) => ({ ...base, color: "var(--subtle)", top: 10, right: 10 }),
        arrow: (base, state) => ({ ...base, color: state?.disabled ? "var(--line)" : "var(--fg)" }),
        dot: (base, state) => ({
          ...base,
          background: state?.current ? "var(--fg)" : "transparent",
          borderColor: state?.current ? "var(--fg)" : "var(--line)",
        }),
      }}
    >
      <Launcher name={name} autoStart={autoStart} />
    </TourProvider>
  );
}

function Launcher({ name, autoStart }: { name: TourName; autoStart: boolean }) {
  const { setIsOpen, setSteps, setCurrentStep } = useTour();

  const start = () => {
    // Only steps whose target is on screen (some sections show up only in some states).
    const steps = (TOURS[name] as StepType[]).filter((s) => typeof s.selector !== "string" || document.querySelector(s.selector));
    if (!steps.length) return;
    setSteps?.(steps);
    setCurrentStep(0);
    setIsOpen(true);
  };

  useEffect(() => {
    if (!autoStart) return;
    let seen = true;
    try {
      seen = localStorage.getItem(doneKey(name)) === "1";
    } catch {}
    if (seen) return;
    const t = setTimeout(start, 1200); // after the page has settled
    return () => clearTimeout(t);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [name, autoStart]);

  return (
    <button type="button" data-tour="tour" onClick={start} className="rounded-full border border-line px-3 py-1 text-sm whitespace-nowrap text-subtle hover:bg-muted">
      ❓ Como usar
    </button>
  );
}
