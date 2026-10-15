import type { Metadata } from "next";
import Link from "next/link";
import { Donate } from "@/components/Donate";

export const metadata: Metadata = {
  title: "Apoie · Minha Rede Vota",
  description: "Ajude a manter o Minha Rede Vota no ar: doe via Pix ou anuncie aqui.",
};

// @sseraphini on X.
const OWNER_X_ID = "2313873457";
const AD_DM = `https://x.com/messages/compose?recipient_id=${OWNER_X_ID}&text=${encodeURIComponent(
  "Olá! Quero anunciar no Minha Rede Vota. Meu produto/marca: ",
)}`;

export default function ApoiePage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Rede Vota
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Apoie o projeto</h1>
      <p className="mt-1 text-subtle">
        O Minha Rede Vota é gratuito e de código aberto. Servidores e a busca de quem você segue no X custam dinheiro:
        qualquer valor ajuda a manter tudo no ar.
      </p>

      <section className="mt-6 rounded-2xl border border-line bg-card p-4">
        <h2 className="mb-3 text-lg font-semibold">💚 Doe via Pix</h2>
        <Donate />
      </section>

      <section className="mt-4 rounded-2xl border border-line bg-card p-4">
        <h2 className="text-lg font-semibold">📢 Anuncie aqui</h2>
        <p className="mt-1 text-sm text-subtle">
          Milhares de pessoas vendo e compartilhando suas bolhas no X. Fale direto comigo para colocar sua marca aqui.
        </p>
        <a href={AD_DM} target="_blank" rel="noreferrer" className="mt-3 inline-block rounded-full bg-fg px-4 py-2 text-sm text-bg">
          Comprar anúncio (mensagem no X)
        </a>
      </section>
    </main>
  );
}
