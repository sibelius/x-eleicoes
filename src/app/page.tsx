import { Suspense } from "react";
import { redirect } from "next/navigation";
import { devLoginEnabled, getUserId } from "@/lib/session";
import { xConfigured } from "@/lib/x";
import { oauth1Configured } from "@/lib/x-oauth1";

const ERRORS: Record<string, string> = {
  login: "Não foi possível entrar com o X. Tente de novo.",
  "x-nao-configurado": "Login com X ainda não configurado (faltam X_API_KEY / X_API_SECRET).",
};

export default function Home({ searchParams }: PageProps<"/">) {
  return (
    <main className="mx-auto flex w-full max-w-2xl flex-1 flex-col justify-center px-4 py-16">
      <p className="text-sm font-medium tracking-wide text-subtle uppercase">Eleições 2026</p>
      <h1 className="mt-2 text-4xl font-bold tracking-tight sm:text-5xl">
        Como a sua rede do X vota?
      </h1>
      <p className="mt-4 text-lg text-subtle">
        Entre com sua conta do X, escolha <b className="text-[var(--lula)]">Lula</b> ou{" "}
        <b className="text-[var(--bolso)]">Bolsonaro</b> e veja a bolha de quem você segue e quem te segue. Chame
        seus amigos pra votar e compartilhe o resultado da sua rede.
      </p>
      <Suspense fallback={<div className="mt-8 h-12" />}>
        <Actions searchParams={searchParams} />
      </Suspense>
      <p className="mt-10 text-xs text-subtle">
        Enquete informal entre usuários, sem valor estatístico — não é pesquisa eleitoral. Você escolhe quem vê seu
        voto e pode excluir seus dados quando quiser.
      </p>
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
