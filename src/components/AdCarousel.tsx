"use client";

import { useEffect, useRef, useState } from "react";

// The ads in rotation. UTMs tell each advertiser the visit came from here (and from which screen).
const ADS = [
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
];

const CAMPAIGN = "minhabolha2026";
const EVERY_MS = 5000;

function adUrl(href: string, placement: string) {
  const u = new URL(href);
  u.searchParams.set("utm_source", "minhabolha");
  u.searchParams.set("utm_medium", "display");
  u.searchParams.set("utm_campaign", CAMPAIGN);
  u.searchParams.set("utm_content", placement);
  return u.toString();
}

/** Swipeable ad carousel: starts on a random ad, advances every few seconds, pauses while hovered or touched. */
export function AdCarousel({ placement }: { placement: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);

  const go = (i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "instant" });
  };

  // Random first ad so every brand gets seen, even by people who leave fast.
  useEffect(() => {
    go(Math.floor(Math.random() * ADS.length), false);
  }, []);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") go((index + 1) % ADS.length);
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [index, paused]);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div
        ref={track}
        onScroll={onScroll}
        className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
      >
        {ADS.map((ad, i) => (
          <a
            key={ad.name}
            href={adUrl(ad.href, placement)}
            target="_blank"
            rel="noopener sponsored"
            className="block w-full shrink-0 snap-center"
            aria-hidden={i !== index}
            tabIndex={i === index ? 0 : -1}
          >
            <img src={ad.image} alt={ad.alt} width={1200} height={630} className="h-auto w-full" draggable={false} loading="lazy" />
          </a>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {ADS.map((ad, i) => (
          <button
            key={ad.name}
            type="button"
            onClick={() => go(i)}
            aria-label={`Anúncio ${i + 1}: ${ad.name}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-subtle" : "w-1.5 bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
