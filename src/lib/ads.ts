// The ads in rotation. UTMs tell each advertiser the visit came from here (and from which screen).
export const ADS = [
  {
    name: "Hodle",
    href: "https://hodle.com.br/",
    image: "/ads/hodle.png",
    alt: "Hodle: cripto que funciona como Pix. Receba, guarde e pague em real ou em stablecoin.",
  },
  {
    name: "iVendas",
    href: "https://app.ivendas.app/broker",
    image: "/ads/ivendas.png",
    alt: "iVendas: todos os fornecedores de produtos Apple num só lugar, para revendedores.",
  },
  {
    name: "conta.vc",
    href: "https://www.conta.vc/",
    image: "/ads/contavc.png",
    alt: "conta.vc: seja o dono do seu dinheiro. Conta de pagamentos em reais, sem dívidas e sem bloqueios.",
  },
  {
    name: "Rica",
    href: "https://base.pro.rica.com.br/open-finance",
    image: "/ads/rica.png",
    alt: "Rica para profissionais: com Open Finance, todo o dinheiro do cliente num só lugar.",
  },
  {
    name: "AtletIn",
    href: "https://atletin.com/",
    image: "/ads/atletin.png",
    alt: "AtletIn: a vaquinha do atleta brasileiro. Doe via Pix e ganhe cupom das marcas que apoiam o esporte.",
  },
  {
    name: "Guara Cloud",
    href: "https://guaracloud.com/",
    image: "/ads/guara.png",
    alt: "Guara Cloud: deploy em segundos na cloud brasileira, com preços em Real.",
  },
  {
    name: "Woovi",
    href: "https://woovi.com/",
    image: "/ads/woovi.png",
    alt: "Woovi: acelere seu negócio com a conta digital que mais entende de Pix. Regulada pelo Banco Central.",
  },
  {
    name: "Avenia",
    href: "https://avenia.io/pt-br/",
    image: "/ads/avenia.png",
    alt: "Avenia: borderless liquidity.",
  },
  {
    name: "Real Oficial",
    href: "https://realoficial.com.br/pt",
    image: "/ads/realoficial.jpg",
    alt: "Real Oficial: faz um xablau no seu vídeo. Troque personagem, cenário ou estilo, sem regravar.",
  },
];

export const AD_NAMES: ReadonlySet<string> = new Set(ADS.map((a) => a.name));
