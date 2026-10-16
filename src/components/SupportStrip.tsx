import { Suspense } from "react";
import { AdCarousel } from "./AdCarousel";
import { DonateMini } from "./Donate";
import { DonationGoal } from "./DonationGoal";

/** On every main screen: the ad slot (dashed, with a "buy an ad" link) and a compact Pix donation with the monthly goal. */
export function SupportStrip({ placement }: { placement: string }) {
  return (
    <div className="grid gap-3 sm:grid-cols-2">
      <div className="rounded-2xl border-2 border-dashed border-line p-2">
        <div className="mb-1 flex items-center justify-between px-1 text-[10px] tracking-widest text-subtle uppercase">
          <span>Patrocinado</span>
          <a href="/anuncie" className="normal-case tracking-normal underline">
            📢 Anuncie aqui
          </a>
        </div>
        <AdCarousel placement={placement} />
      </div>
      <div className="rounded-2xl border border-line bg-card p-4">
        <DonateMini
          goal={
            <Suspense fallback={null}>
              <DonationGoal compact />
            </Suspense>
          }
        />
      </div>
    </div>
  );
}
