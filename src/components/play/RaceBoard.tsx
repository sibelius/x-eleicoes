import { daysToBigDay, sharePath } from "@/lib/links";
import type { Racer } from "@/lib/race";
import { Face } from "./Face";

const plural = (n: number, one: string, many: string) => `${n} ${n === 1 ? one : many}`;

/** This week's invite race, with a countdown to the big day. */
export function RaceBoard({ racers, end, now }: { racers: Racer[]; end: number; now: number }) {
  const left = Math.max(0, end - now);
  const days = Math.floor(left / 86_400_000);
  const hours = Math.floor((left % 86_400_000) / 3600_000);
  const big = daysToBigDay(now);
  return (
    <section data-tour="race" className="rounded-2xl border border-line bg-card p-4 md:col-span-2">
      <div className="flex flex-wrap items-baseline justify-between gap-2">
        <h2 className="text-lg font-semibold">🏁 Corrida dos convites da semana</h2>
        <span className="text-sm text-subtle">
          fecha em {days ? `${plural(days, "dia", "dias")} e ` : ""}
          {plural(hours, "hora", "horas")}
          {big > 0 && <> · faltam <b className="text-fg">{plural(big, "dia", "dias")}</b> para 25/10</>}
        </span>
      </div>
      <p className="mt-1 text-sm text-subtle">Quem mais trouxe gente pelo próprio link desde segunda. Quem for ultrapassado recebe um aviso.</p>
      {racers.length === 0 ? (
        <p className="mt-3 text-sm text-subtle">Ninguém pontuou ainda esta semana. Poste seu convite e saia na frente!</p>
      ) : (
        <ol className="mt-3 grid gap-2 sm:grid-cols-2">
          {racers.slice(0, 10).map((r) => (
            <li key={r.id}>
              <a href={sharePath(r.username)} className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted">
                <span className="w-6 text-right text-sm font-bold">{r.rank <= 3 ? ["🥇", "🥈", "🥉"][r.rank - 1] : `${r.rank}º`}</span>
                <Face src={r.avatar} size={36} vote={r.vote} />
                <span className="min-w-0 flex-1 truncate font-semibold">@{r.username}</span>
                <span className="shrink-0 text-sm font-bold">{plural(r.invites, "convite", "convites")}</span>
              </a>
            </li>
          ))}
        </ol>
      )}
    </section>
  );
}
