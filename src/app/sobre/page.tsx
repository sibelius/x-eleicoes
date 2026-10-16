import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { AUTHOR, DEFINITION, JsonLd, NOT_A_POLL, REPO_URL, ids } from "@/lib/seo";
import { appUrl } from "@/lib/session";
import { siteCounts } from "@/lib/views";

export const metadata: Metadata = {
  title: "Como funciona e perguntas frequentes",
  description:
    "O que é a Minha Bolha, como ela monta a bolha da sua rede do X, por que não é pesquisa, quais dados usa, como apagar os seus e quem fez.",
  alternates: { canonical: "/sobre" },
};

// Plain-text answers: the same strings go on the page and into the FAQPage JSON-LD, so they always match.
const FAQ: { q: string; a: string; link?: { href: string; label: string } }[] = [
  { q: "O que é a Minha Bolha?", a: DEFINITION },
  {
    q: "Como funciona?",
    a: "Você entra com a sua conta do X, concorda com o uso dos dados e escolhe Vermelho ou Verde. A partir das listas públicas de quem você segue e de quem te segue, o site monta a sua bolha: cada bolinha é uma pessoa da sua rede, pintada com o lado que ela escolheu, ou neutra se ainda não escolheu. Você pode comparar a sua bolha com a de qualquer pessoa e compartilhar a sua página pública.",
    link: { href: "/r", label: "Ver todas as bolhas" },
  },
  { q: "A Minha Bolha é uma pesquisa eleitoral?", a: `Não. ${NOT_A_POLL}` },
  {
    q: "Quais dados a Minha Bolha usa?",
    a: "Do login no X: id, @, nome e foto de perfil, que já são públicos no X. Também a sua escolha (Vermelho ou Verde), que é pública e aparece com o seu @, e as listas públicas de quem você segue e de quem te segue. As visitas são contadas com um identificador aleatório e anônimo. Nada é vendido nem compartilhado, e os anúncios não recebem nenhum dado seu.",
    link: { href: "/privacidade", label: "Privacidade e termos" },
  },
  {
    q: "Como apagar os meus dados?",
    a: "Entre com o X, abra a página de Privacidade e use o botão Excluir minha conta e meus dados. Isso apaga a conta, a escolha, a rede importada, as inscrições de notificação e as contagens ligadas a você. Você também pode trocar de lado quando quiser.",
    link: { href: "/privacidade", label: "Excluir meus dados" },
  },
  { q: "Minha escolha é pública?", a: "Sim. Quem entra concorda que a escolha fica pública: ela aparece com o seu @ na sua página, na lista de todas as bolhas e nas bolhas de quem está na sua rede." },
  {
    q: "A Minha Bolha é de graça?",
    a: "Sim, é gratuita para todo mundo. O site se mantém com doações voluntárias via Pix e com anúncios, que não recebem dados de ninguém.",
    link: { href: "/apoie", label: "Apoie com Pix" },
  },
  { q: "Quem fez a Minha Bolha?", a: `${AUTHOR.name} (@${AUTHOR.handle} no X), como projeto pessoal.` },
  {
    q: "O código é aberto?",
    a: "Sim. Todo o código está no GitHub em github.com/sibelius/x-green-red, com licença MIT: qualquer pessoa pode ler, conferir como os números são calculados e reutilizar.",
    link: { href: REPO_URL, label: "github.com/sibelius/x-green-red" },
  },
];

export default function AboutPage() {
  const base = appUrl();
  const faq = {
    "@context": "https://schema.org",
    "@type": "FAQPage",
    "@id": `${base}/sobre#faq`,
    url: `${base}/sobre`,
    inLanguage: "pt-BR",
    isPartOf: { "@id": ids().site },
    about: { "@id": ids().app },
    mainEntity: FAQ.map((f) => ({ "@type": "Question", name: f.q, acceptedAnswer: { "@type": "Answer", text: f.a } })),
  };
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Bolha
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Como funciona a Minha Bolha</h1>
      <p className="mt-3 text-lg">{DEFINITION}</p>
      <Suspense fallback={<p className="mt-3 text-sm text-subtle">&nbsp;</p>}>
        <Numbers />
      </Suspense>

      <h2 className="mt-8 text-xl font-semibold">Perguntas frequentes</h2>
      {FAQ.map((f) => (
        <section key={f.q} className="mt-5">
          <h3 className="font-semibold">{f.q}</h3>
          <p className="mt-1 text-subtle">{f.a}</p>
          {f.link && (
            <a href={f.link.href} className="mt-1 inline-block text-sm underline" {...(f.link.href.startsWith("http") ? { target: "_blank", rel: "noreferrer" } : {})}>
              {f.link.label}
            </a>
          )}
        </section>
      ))}

      <h2 className="mt-8 text-xl font-semibold">Para explorar</h2>
      <ul className="mt-2 list-disc pl-5 text-subtle">
        <li>
          <Link href="/r" className="underline">Todas as bolhas</Link>: a bolha e o lado de cada pessoa que entrou, com busca por @.
        </li>
        <li>
          <Link href="/c" className="underline">Comparar bolhas</Link>: duas bolhas lado a lado e quem elas têm em comum.
        </li>
        <li>
          <Link href="/ranking" className="underline">Ranking das bolhas</Link>: as mais fechadas, as mais mistas e quem mais trouxe gente.
        </li>
        <li>
          <Link href="/mapa" className="underline">Mapa</Link>: todas as contas de todas as bolhas num mapa só.
        </li>
        <li>
          <Link href="/virada" className="underline">Quem virou</Link>: quem trocou de lado e quando.
        </li>
        <li>
          <Link href="/hoje" className="underline">Pergunta do dia</Link>: chute como está a bolha do dia.
        </li>
      </ul>
      <JsonLd data={faq} />
    </main>
  );
}

// Live, dated count of who joined: something an answer engine can quote with its date.
async function Numbers() {
  await connection();
  const now = new Date();
  const { members } = await siteCounts(now.toISOString().slice(0, 10));
  const date = now.toLocaleDateString("pt-BR", { timeZone: "America/Sao_Paulo" });
  return (
    <p className="mt-3 text-sm text-subtle">
      Em {date}, {members.toLocaleString("pt-BR")} {members === 1 ? "pessoa já tinha entrado" : "pessoas já tinham entrado"} na Minha Bolha.
    </p>
  );
}
