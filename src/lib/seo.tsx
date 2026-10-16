import { appUrl } from "./session";

// What search engines and AI answer engines read about the site: one definition, the same everywhere
// (home, /sobre, JSON-LD, public/llms.txt), and the structured data for it.

export const REPO_URL = "https://github.com/sibelius/x-green-red";
export const AUTHOR = { name: "Sibelius Seraphini", handle: "sseraphini", x: "https://x.com/sseraphini", github: "https://github.com/sibelius" };

export const DEFINITION =
  "A Minha Bolha é um site gratuito e de código aberto em que você entra com a sua conta do X, escolhe um lado, Vermelho ou Verde, e vê de que lado está a sua rede: as pessoas que você segue e as que te seguem.";

export const NOT_A_POLL =
  "A Minha Bolha não é pesquisa de opinião nem pesquisa eleitoral: não tem amostragem nem método científico, e os números mostram só as escolhas de quem decidiu entrar no site, sem representar nenhum grupo além dele.";

/** A JSON-LD block; `<` escaped so no string in it can close the script tag. */
export function JsonLd({ data }: { data: object }) {
  return <script type="application/ld+json" dangerouslySetInnerHTML={{ __html: JSON.stringify(data).replace(/</g, "\\u003c") }} />;
}

export const ids = () => {
  const base = appUrl();
  return { site: `${base}/#website`, app: `${base}/#app`, author: `${base}/#author` };
};

/** The site, the app and who made it, for the home page. */
export function siteGraph() {
  const base = appUrl();
  const id = ids();
  return {
    "@context": "https://schema.org",
    "@graph": [
      {
        "@type": "WebSite",
        "@id": id.site,
        url: `${base}/`,
        name: "Minha Bolha",
        description: DEFINITION,
        inLanguage: "pt-BR",
        publisher: { "@id": id.author },
        // /r?q= searches every bubble by @ or name.
        potentialAction: {
          "@type": "SearchAction",
          target: { "@type": "EntryPoint", urlTemplate: `${base}/r?q={search_term_string}` },
          "query-input": "required name=search_term_string",
        },
      },
      {
        "@type": "WebApplication",
        "@id": id.app,
        name: "Minha Bolha",
        url: `${base}/`,
        description: DEFINITION,
        applicationCategory: "SocialNetworkingApplication",
        operatingSystem: "Web",
        inLanguage: "pt-BR",
        isAccessibleForFree: true,
        offers: { "@type": "Offer", price: "0", priceCurrency: "BRL" },
        license: "https://opensource.org/licenses/MIT",
        author: { "@id": id.author },
        isBasedOn: { "@type": "SoftwareSourceCode", codeRepository: REPO_URL, license: "https://opensource.org/licenses/MIT", programmingLanguage: "TypeScript" },
      },
      {
        "@type": "Person",
        "@id": id.author,
        name: AUTHOR.name,
        alternateName: `@${AUTHOR.handle}`,
        url: AUTHOR.x,
        sameAs: [AUTHOR.x, AUTHOR.github],
      },
    ],
  };
}
