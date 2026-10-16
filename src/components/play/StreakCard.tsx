import Link from "next/link";
import { cookies } from "next/headers";
import { adoptVisitorPlay, getDailyQuestion, getStreakCard } from "@/lib/daily";

/** Dashboard card: the member's "Pergunta do dia" streak, and whether today's is still open. */
export async function StreakCard({ uid }: { uid: string }) {
  // Played as a visitor before signing in: that play counts for the member.
  const vid = (await cookies()).get("xe_vid")?.value;
  if (vid) await adoptVisitorPlay(uid, vid);
  const [{ played, streak }, q] = await Promise.all([getStreakCard(uid), getDailyQuestion()]);
  if (!q && !streak.current) return null;
  return (
    <section className="rounded-2xl border border-line bg-card p-4">
      <div className="flex flex-wrap items-center gap-3">
        <span className="text-3xl" aria-hidden>
          {streak.current ? "🔥" : "🎯"}
        </span>
        <div className="min-w-0 flex-1 basis-48">
          <div className="font-semibold">
            {streak.current ? `${streak.current} ${streak.current === 1 ? "dia seguido" : "dias seguidos"}` : "Pergunta do dia"}
          </div>
          <div className="text-sm text-subtle">
            {played
              ? "Já jogou hoje, volte amanhã"
              : q
                ? `Qual a % Verde da bolha de @${q.username}?`
                : "Volte amanhã para a próxima pergunta"}
          </div>
        </div>
        {!played && q && (
          <Link href="/hoje" className="shrink-0 rounded-full bg-fg px-4 py-2 text-sm font-semibold text-bg">
            Jogar a pergunta de hoje
          </Link>
        )}
        {played && (
          <Link href="/hoje" className="shrink-0 text-sm underline">
            Ver resultado
          </Link>
        )}
      </div>
    </section>
  );
}
