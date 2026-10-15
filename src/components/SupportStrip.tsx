import { AD_DM_URL } from "@/lib/links";
import { DonateMini } from "./Donate";

/** On every main screen: the ad slot (dashed, for sale) and a compact Pix donation. */
export function SupportStrip() {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <a
        href={AD_DM_URL}
        target="_blank"
        rel="noreferrer"
        className="flex min-h-28 flex-col items-center justify-center rounded-2xl border-2 border-dashed border-line p-4 text-center hover:bg-muted"
      >
        <span className="text-xs tracking-widest text-subtle uppercase">Espaço publicitário</span>
        <span className="mt-1 font-semibold">📢 Seu anúncio aqui</span>
        <span className="mt-1 text-xs text-subtle underline">Fale comigo no X</span>
      </a>
      <div className="rounded-2xl border border-line bg-card p-4">
        <DonateMini />
      </div>
    </div>
  );
}
