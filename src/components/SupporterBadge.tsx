import { isSupporter } from "@/lib/donations";

/** "💚 Apoiador" pill, for someone who made a public, confirmed donation. */
export function SupporterBadge({ className = "" }: { className?: string }) {
  return (
    <span
      title="Apoiou a Minha Bolha com uma doação"
      className={`inline-flex items-center gap-1 rounded-full border border-[var(--green)] px-2 py-0.5 text-[11px] font-semibold whitespace-nowrap text-[var(--green)] ${className}`}
    >
      💚 Apoiador
    </span>
  );
}

/** The badge only when `uid` is a supporter (cached lookup); wrap in <Suspense fallback={null}>. */
export async function SupporterBadgeFor({ uid, className }: { uid: string | null | undefined; className?: string }) {
  return (await isSupporter(uid)) ? <SupporterBadge className={className} /> : null;
}
