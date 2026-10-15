import { SIDE, comparePath, twinTweetUrl } from "@/lib/links";
import type { Twin } from "@/lib/social";
import { Face } from "./Face";

/** "Seu gêmeo de bolha" and "seu oposto": the most similar network, and the most similar on the other side. */
export function Twins({ twin, opposite, base, owner, own }: { twin: Twin | null; opposite: Twin | null; base: string; owner: string; own: boolean }) {
  if (!twin && !opposite) return null;
  const row = (t: Twin, label: string, isOpposite: boolean) => (
    <div className="flex items-center gap-3">
      <Face src={t.avatar} size={44} vote={t.vote} />
      <div className="min-w-0 flex-1">
        <div className="text-xs text-subtle">{label}</div>
        <a href={comparePath(owner, t.username)} className="block truncate font-semibold">
          @{t.username}
        </a>
        <div className="text-xs text-subtle">
          {Math.max(1, Math.round(t.similarity * 100))}% das redes em comum · {t.shared} contas
          {t.vote && <> · <b style={{ color: `var(--${t.vote})` }}>{SIDE[t.vote]}</b></>}
        </div>
      </div>
      {own ? (
        <a className="shrink-0 rounded-full bg-fg px-3 py-1 text-sm text-bg" href={twinTweetUrl(base, owner, t.username, t.similarity, isOpposite)} target="_blank" rel="noreferrer">
          Postar
        </a>
      ) : (
        <a className="shrink-0 rounded-full border border-line px-3 py-1 text-sm" href={comparePath(owner, t.username)}>
          Comparar
        </a>
      )}
    </div>
  );
  const sameAsTwin = twin && opposite && twin.id === opposite.id;
  return (
    <section data-tour="twins" className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">{own ? "Seu gêmeo de bolha" : `O gêmeo de bolha de @${owner}`}</h2>
      <p className="mt-1 text-sm text-subtle">Quem segue e é seguido pelas mesmas pessoas.</p>
      <div className="mt-3 grid gap-3">
        {twin && row(twin, sameAsTwin ? "Gêmeo, e do outro lado 👀" : "Gêmeo 🫧", Boolean(sameAsTwin))}
        {opposite && !sameAsTwin && row(opposite, "Gêmeo do outro lado 👀", true)}
      </div>
    </section>
  );
}
