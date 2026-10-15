import { AD_DM_URL } from "@/lib/links";
import { DonateMini } from "./Donate";

// The ad currently in the slot. UTMs tell the advertiser the visit came from here (and from which screen).
const AD = {
  href: "https://hodle.com.br/",
  image: "/ads/hodle.png",
  alt: "Hodle: cripto que funciona como Pix. Receba, guarde e pague em real ou em stablecoin.",
  campaign: "eleicoes2026",
};

function adUrl(placement: string) {
  const u = new URL(AD.href);
  u.searchParams.set("utm_source", "minharedevota");
  u.searchParams.set("utm_medium", "display");
  u.searchParams.set("utm_campaign", AD.campaign);
  u.searchParams.set("utm_content", placement);
  return u.toString();
}

/** On every main screen: the ad slot (dashed, with a "buy an ad" link) and a compact Pix donation. */
export function SupportStrip({ placement }: { placement: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border-2 border-dashed border-line p-2">
        <div className="mb-1 flex items-center justify-between px-1 text-[10px] tracking-widest text-subtle uppercase">
          <span>Patrocinado</span>
          <a href={AD_DM_URL} target="_blank" rel="noreferrer" className="normal-case tracking-normal underline">
            📢 Comprar anúncio
          </a>
        </div>
        <a href={adUrl(placement)} target="_blank" rel="noopener sponsored" className="block overflow-hidden rounded-xl">
          <img src={AD.image} alt={AD.alt} width={1200} height={630} className="h-auto w-full" />
        </a>
      </div>
      <div className="rounded-2xl border border-line bg-card p-4">
        <DonateMini />
      </div>
    </div>
  );
}
