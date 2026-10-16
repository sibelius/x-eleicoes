import type { Metadata } from "next";
import Link from "next/link";
import { Suspense } from "react";
import { connection } from "next/server";
import { PageSkeleton } from "@/components/Skeleton";
import { listTopics } from "@/lib/topics";

export const metadata: Metadata = { title: "Temas" };

export default function TopicsPage() {
  return (
    <main className="mx-auto w-full max-w-3xl px-4 py-10">
      <h1 className="text-2xl font-bold tracking-tight">Temas</h1>
      <Suspense fallback={<PageSkeleton bubble={false} list={3} />}>
        <Topics />
      </Suspense>
    </main>
  );
}

async function Topics() {
  await connection();
  const topics = await listTopics();
  if (!topics.length) return <p className="mt-4 text-subtle">Em breve.</p>;
  return (
    <ul className="mt-4 grid gap-3">
      {topics.map((t) => (
        <li key={t.id}>
          <Link href={`/t/${t.id}`} className="block rounded-2xl border border-line bg-card p-4 hover:bg-muted">
            <div className="font-semibold">{t.title}</div>
            <div className="text-sm text-subtle">{t.question}</div>
            <div className="mt-2 flex gap-2 text-xs font-bold text-white">
              <span className="rounded-full px-2 py-0.5" style={{ background: t.a_color }}>
                {t.a_label}
              </span>
              <span className="rounded-full px-2 py-0.5" style={{ background: t.b_color }}>
                {t.b_label}
              </span>
            </div>
          </Link>
        </li>
      ))}
    </ul>
  );
}
