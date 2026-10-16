import { SupportStrip } from "@/components/SupportStrip";
import { Shimmer } from "@/components/Skeleton";
import { Suspense } from "react";
import { redirect } from "next/navigation";
import { devLoginEnabled, getUserId } from "@/lib/session";
import { xConfigured } from "@/lib/x";
import { oauth1Configured } from "@/lib/x-oauth1";
import Link from "next/link";
import { InviteOpenBeacon } from "@/components/play/InviteOpenBeacon";
import type { Metadata } from "next";
import { DEFINITION, JsonLd, siteGraph } from "@/lib/seo";

export const metadata: Metadata = {
  title: { absolute: "Minha Bolha: de que lado está a sua rede do X? Vermelho ou Verde" },
  alternates: { canonical: "/" },
};

const ERRORS: Record<string, string> = {
  login: "Não foi possível entrar com o X. Tente de novo.",
  "x-nao-configurado": "Login com X ainda não configurado (faltam X_API_KEY / X_API_SECRET).",
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-subtle uppercase">🔴 Vermelho ou Verde 🟢</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        De que lado está a sua rede do X?
      </h1>
      <p className="mt-4 text-lg text-subtle">
        Entre com sua conta do X, escolha <b className="text-[var(--red)]">Vermelho</b> ou{" "}
        <b className="text-[var(--green)]">Verde</b> e veja a bolha de quem você segue e quem te segue. Chame
        seus amigos pra escolher um lado e compartilhe o resultado da sua rede.
      </p>
      <Suspense fallback={<div className="mt-8 flex gap-2">
            <Shimmer className="h-12 w-56 rounded-full" />
            <Shimmer className="h-12 w-32 rounded-full" />
          </div>}>
        <Actions searchParams={searchParams} />
      </Suspense>
      <Link href="/r" className="mt-6 self-start text-sm underline">
        Ver todas as bolhas
      </Link>
      <p className="mt-10 text-xs text-subtle">
        Brincadeira entre usuários do X, sem valor estatístico. As escolhas são públicas e
        aparecem com o @ de quem escolheu. Você pode excluir seus dados quando quiser.
      </p>
      <p className="mt-2 text-xs text-subtle">
        {DEFINITION}{" "}
        <Link href="/sobre" className="underline">
          Como funciona e perguntas frequentes
        </Link>
      </p>
      <JsonLd data={siteGraph()} />
      <div className="mt-10">
        <SupportStrip placement="home" />
      </div>
    </main>
  );
}

async function Actions({ searchParams }: { searchParams: PageProps<"/">["searchParams"] }) {
  if (await getUserId()) redirect("/app");
  const sp = await searchParams;
  const ref = typeof sp.ref === "string" ? sp.ref : null;
  const erro = typeof sp.erro === "string" ? ERRORS[sp.erro] : null;
  const loginHref = `/api/auth/x${ref ? `?ref=${encodeURIComponent(ref)}` : ""}`;
  return (
    <div className="mt-8">
      {erro && <p className="mb-4 rounded-xl bg-muted p-3 text-sm">{erro}</p>}
      {ref && <InviteOpenBeacon inviter={ref} />}
      <div className="flex flex-wrap gap-3">
        {(oauth1Configured() || xConfigured()) && (
          <a href={loginHref} className="rounded-full bg-fg px-6 py-3 font-semibold text-bg">
            Entrar com X
          </a>
        )}
        {devLoginEnabled() && (
          <a href="/api/auth/dev" className="rounded-full border border-line px-6 py-3 font-semibold">
            Entrar como usuário de teste
          </a>
        )}
      </div>
    </div>
  );
}
