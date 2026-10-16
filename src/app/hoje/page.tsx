import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { cookies } from "next/headers";
import { connection } from "next/server";
import { Shimmer } from "@/components/Skeleton";
import { DailyGame } from "@/components/play/DailyGame";
import { DailyLeaderboard, StreakLeaderboard } from "@/components/play/DailyBoards";
import { adoptVisitorPlay, dailyLeaderboard, getDailyQuestion, getDailyResult, nextQuestionAt, playerKey, topStreaks } from "@/lib/daily";
import { appUrl, getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Pergunta do dia",
  description: "Todo dia uma bolha nova: chute a % Verde, compare com todo mundo e mantenha sua sequência 🔥",
  alternates: { canonical: "/hoje" },
};

export default function HojePage() {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-10">
      <p className="text-sm font-medium tracking-wide text-subtle uppercase">🎯 Pergunta do dia</p>
      <Suspense
        fallback={
          <div className="mt-4">
            <Shimmer className="h-16 w-full rounded-2xl" />
            <Shimmer className="mt-6 h-64 w-full rounded-2xl" />
          </div>
        }
      >
        <Daily />
      </Suspense>
    </main>
  );
}

async function Daily() {
  await connection();
  const [uid, jar] = await Promise.all([getUserId(), cookies()]);
  const vid = jar.get("xe_vid")?.value ?? null;
  // Played as a visitor, then signed in: that play now counts for the member.
  if (uid && vid) await adoptVisitorPlay(uid, vid);
  const player = playerKey(uid, vid);
  const q = await getDailyQuestion();
  if (!q) {
    return (
      <p className="mt-4 rounded-2xl border border-line bg-card p-4">
        Ainda não há uma bolha com escolhas suficientes para a pergunta de hoje. <Link href="/r" className="underline">Veja as bolhas</Link>.
      </p>
    );
  }
  const result = player ? await getDailyResult(player, uid) : null;
  const [leaders, streaks] = result ? await Promise.all([dailyLeaderboard(), topStreaks(5)]) : [null, null];
  return (
    <>
      <div className="mt-3 flex items-center gap-3">
        {q.avatar ? (
          <img src={q.avatar.replace("_normal.", "_bigger.")} alt="" className="h-16 w-16 rounded-full" />
        ) : (
          <span className="h-16 w-16 rounded-full bg-muted" />
        )}
        <div className="min-w-0">
          <div className="truncate text-lg font-bold">{q.name}</div>
          <div className="text-subtle">@{q.username}</div>
        </div>
      </div>
      <h1 className="mt-4 text-3xl font-bold tracking-tight">Qual a % Verde da bolha de @{q.username}?</h1>
      <p className="mt-1 text-subtle">Entre quem @{q.username} segue e quem segue @{q.username} no X, quantos % escolheram Verde?</p>
      <DailyGame key={`${q.day}:${result ? 1 : 0}`} target={q.target} username={q.username} base={appUrl()} nextAt={nextQuestionAt()} initial={result} />
      {leaders && streaks && (
        <div className="mt-6 grid gap-4">
          <DailyLeaderboard rows={leaders} title="🏆 Melhores de hoje" cta={false} />
          <StreakLeaderboard rows={streaks} cta={false} />
        </div>
      )}
      <p className="mt-6 text-center text-sm">
        <Link href="/ranking" className="underline">
          Ranking completo
        </Link>
        {!uid && !result && (
          <>
            {" · "}
            <a href="/api/auth/x" className="underline">
              Entrar com X para guardar sua sequência 🔥
            </a>
          </>
        )}
      </p>
    </>
  );
}
