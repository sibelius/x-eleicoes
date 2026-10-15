import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { redirect } from "next/navigation";
import { comparePath } from "@/lib/links";
import { getMe } from "@/lib/network";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Comparar bolhas · Minha Bolha",
  description: "Compare a sua bolha do X com a de qualquer pessoa: Vermelho ou Verde.",
};

const clean = (v: string | string[] | undefined) => (typeof v === "string" ? v.trim().replace(/^@/, "") : "");

export default function ComparePicker({ searchParams }: PageProps<"/c">) {
  return (
    <main className="mx-auto w-full max-w-xl px-4 py-16">
      <Link href="/r" className="text-sm text-subtle underline">
        Todas as bolhas
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Comparar bolhas</h1>
      <p className="mt-1 text-subtle">Duas pessoas, duas redes: qual é mais Vermelho? E mais Verde?</p>
      <Suspense fallback={<p className="mt-6 text-subtle">Carregando…</p>}>
        <Picker searchParams={searchParams} />
      </Suspense>
    </main>
  );
}

async function Picker({ searchParams }: { searchParams: PageProps<"/c">["searchParams"] }) {
  const sp = await searchParams;
  let a = clean(sp.a);
  const b = clean(sp.b);
  // "Compare with mine": fill in the signed-in user.
  if (!a) {
    const uid = await getUserId();
    const me = uid ? await getMe(uid) : null;
    if (me && me.username !== b) a = me.username;
  }
  if (a && b) redirect(comparePath(a, b));
  return (
    <form className="mt-6 grid gap-3">
      <input name="a" defaultValue={a} placeholder="@primeira pessoa" className="rounded-full border border-line bg-card px-4 py-2" />
      <input name="b" defaultValue={b} placeholder="@segunda pessoa" className="rounded-full border border-line bg-card px-4 py-2" />
      <button className="rounded-full bg-fg px-4 py-2 text-bg">Comparar</button>
      {!a && (
        <p className="text-sm text-subtle">
          <Link href="/" className="underline">
            Entre com o X
          </Link>{" "}
          para comparar com a sua bolha.
        </p>
      )}
    </form>
  );
}
