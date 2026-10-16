// The ads in rotation. UTMs tell each advertiser the visit came from here (and from which screen).
// Images: 1200×630 WebP plus a 640px-wide "-640.webp" for phones (the PNG/JPG originals stay in public/ads).
export const ADS = [
  {
    name: "Hodle",
    href: "https://hodle.com.br/",
    image: "/ads/hodle.webp",
    alt: "Hodle: cripto que funciona como Pix. Receba, guarde e pague em real ou em stablecoin.",
  },
  {
    name: "iVendas",
    href: "https://app.ivendas.app/broker",
    image: "/ads/ivendas.webp",
    alt: "iVendas: todos os fornecedores de produtos Apple num só lugar, para revendedores.",
  },
  {
    name: "conta.vc",
    href: "https://www.conta.vc/",
    image: "/ads/contavc.webp",
    alt: "conta.vc: seja o dono do seu dinheiro. Conta de pagamentos em reais, sem dívidas e sem bloqueios.",
  },
  {
    name: "Rica",
    href: "https://base.pro.rica.com.br/open-finance",
    image: "/ads/rica.webp",
    alt: "Rica para profissionais: com Open Finance, todo o dinheiro do cliente num só lugar.",
  },
  {
    name: "AtletIn",
    href: "https://atletin.com/",
    image: "/ads/atletin.webp",
    alt: "AtletIn: a vaquinha do atleta brasileiro. Doe via Pix e ganhe cupom das marcas que apoiam o esporte.",
  },
  {
    name: "Guara Cloud",
    href: "https://guaracloud.com/",
    image: "/ads/guara.webp",
    alt: "Guara Cloud: deploy em segundos na cloud brasileira, com preços em Real.",
  },
  {
    name: "Woovi",
    href: "https://woovi.com/",
    image: "/ads/woovi.webp",
    alt: "Woovi: acelere seu negócio com a conta digital que mais entende de Pix. Regulada pelo Banco Central.",
  },
  {
    name: "Avenia",
    href: "https://avenia.io/pt-br/",
    image: "/ads/avenia.webp",
    alt: "Avenia: borderless liquidity.",
  },
  {
    name: "Real Oficial",
    href: "https://realoficial.com.br/pt",
    image: "/ads/realoficial.webp",
    alt: "Real Oficial: faz um xablau no seu vídeo. Troque personagem, cenário ou estilo, sem regravar.",
  },
  {
    name: "Revi",
    href: "https://www.userevi.com/",
    image: "/ads/revi.webp",
    alt: "Revi: CRM e marketing conversacional com IA. WhatsApp, e-mail e SMS a partir dos dados da loja, com receita atribuída.",
  },
];

/** srcSet for an ad image: the 640px version and the full one. */
export const adSrcSet = (image: string) => `${image.replace(/\.webp$/, "-640.webp")} 640w, ${image} 1200w`;

export const AD_NAMES: ReadonlySet<string> = new Set(ADS.map((a) => a.name));
