import Link from "next/link";
import { sharePath } from "@/lib/links";
import { dailyLeaderboard, topStreaks, type LeaderRow, type StreakRow } from "@/lib/daily";

// "Pergunta do dia" leaderboards: today's best scores and the longest streaks still alive.

function Row({ i, username, avatar, stat }: { i: number; username: string; avatar: string | null; stat: string }) {
  return (
    <li>
      <a href={sharePath(username)} className="flex items-center gap-3 rounded-xl p-1 hover:bg-muted">
        <span className="w-5 text-right text-sm text-subtle">{i + 1}</span>
        {avatar ? <img src={avatar} alt="" className="h-9 w-9 rounded-full" /> : <span className="h-9 w-9 rounded-full bg-muted" />}
        <b className="min-w-0 flex-1 truncate">@{username}</b>
        <span className="shrink-0 text-sm font-bold">{stat}</span>
      </a>
    </li>
  );
}

export function DailyLeaderboard({
  rows,
  title = "🎯 Pergunta do dia: melhores de hoje",
  cta = true,
}: {
  rows: LeaderRow[];
  title?: string;
  cta?: boolean;
}) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">{title}</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">
          Nenhum membro jogou hoje ainda.{" "}
          {cta && (
            <Link href="/hoje" className="underline">
              Jogue a pergunta de hoje
            </Link>
          )}
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <Row key={r.uid} i={i} username={r.username} avatar={r.avatar} stat={`${r.score}/100`} />
          ))}
        </ol>
      )}
    </section>
  );
}

export function StreakLeaderboard({ rows, cta = true }: { rows: StreakRow[]; cta?: boolean }) {
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">🔥 Maiores sequências</h2>
      {rows.length === 0 ? (
        <p className="mt-2 text-sm text-subtle">
          Ninguém em sequência ainda.{" "}
          {cta && (
            <Link href="/hoje" className="underline">
              Jogue a pergunta de hoje
            </Link>
          )}
        </p>
      ) : (
        <ol className="mt-3 grid gap-2">
          {rows.map((r, i) => (
            <Row key={r.uid} i={i} username={r.username} avatar={r.avatar} stat={`🔥 ${r.current} ${r.current === 1 ? "dia" : "dias"}`} />
          ))}
        </ol>
      )}
    </section>
  );
}

/** Both boards, for /ranking (call under connection()). */
export async function DailyBoards() {
  const [today, streaks] = await Promise.all([dailyLeaderboard(), topStreaks()]);
  return (
    <>
      <DailyLeaderboard rows={today} />
      <StreakLeaderboard rows={streaks} />
    </>
  );
}
