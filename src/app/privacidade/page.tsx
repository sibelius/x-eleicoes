import type { Metadata } from "next";
import { Suspense } from "react";
import Link from "next/link";
import { DeleteAccount } from "@/components/DeleteAccount";
import { getUserId } from "@/lib/session";

export const metadata: Metadata = {
  title: "Privacidade e termos · Minha Bolha",
  description: "Quais dados a Minha Bolha usa, por quê, e como excluir os seus.",
};

const CONTACT = "https://x.com/messages/compose?recipient_id=2313873457";

export default function PrivacyPage() {
  return (
    <main className="mx-auto w-full max-w-2xl px-4 py-10 leading-relaxed">
      <Link href="/" className="text-sm text-subtle underline">
        Minha Bolha
      </Link>
      <h1 className="mt-2 text-3xl font-bold tracking-tight">Privacidade e termos</h1>

      <h2 className="mt-6 text-lg font-semibold">O que é</h2>
      <p className="mt-1 text-subtle">
        A Minha Bolha é um projeto pessoal, gratuito e de código aberto, para brincar com a sua rede do X: cada pessoa
        escolhe um lado (Vermelho ou Verde) e vê como estão as pessoas que segue e que a seguem. Não é pesquisa, não usa
        amostragem nem método científico, e os números não representam nenhum grupo além de quem entrou aqui.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Quais dados usamos</h2>
      <ul className="mt-1 list-disc pl-5 text-subtle">
        <li>Do seu login no X: id, @, nome e foto de perfil (públicos no X).</li>
        <li>Sua escolha (Vermelho ou Verde), que é pública e aparece com o seu @.</li>
        <li>Listas públicas de quem você segue e de quem te segue no X, para montar a sua bolha.</li>
        <li>Contagens anônimas de visitas (um identificador aleatório em cookie) e, se você ativar, a inscrição de notificações do navegador.</li>
        <li>
          Presença ao vivo: enquanto você está logado com o site aberto, outras pessoas veem que você está online, e quem
          é dono de uma bolha vê o seu @ se você estiver olhando a bolha dele agora. Visitantes sem login aparecem só
          como número.
        </li>
        <li>De onde você chegou (as marcações utm dos links que o app gera, como posts no X e notificações), para saber quais links funcionam.</li>
      </ul>

      <h2 className="mt-6 text-lg font-semibold">Base legal e cuidados (LGPD)</h2>
      <p className="mt-1 text-subtle">
        Usamos seus dados com o seu consentimento, dado ao fazer login e ao marcar a caixa antes de escolher um lado.
        Como a escolha pode revelar opinião pessoal, ela só é registrada depois desse consentimento expresso. Não vendemos
        nem compartilhamos seus dados com terceiros; anúncios no site não recebem nenhum dado seu.
      </p>

      <h2 className="mt-6 text-lg font-semibold">Seus direitos</h2>
      <p className="mt-1 text-subtle">
        Você pode trocar de lado quando quiser e excluir todos os seus dados a qualquer momento: conta, escolha, rede
        importada, inscrições de notificação e contagens ligadas a você. Dúvidas ou pedidos:{" "}
        <a href={CONTACT} target="_blank" rel="noreferrer" className="underline">
          mensagem no X
        </a>
        .
      </p>
      <Suspense>
        <Delete />
      </Suspense>

      <h2 className="mt-6 text-lg font-semibold">Termos de uso</h2>
      <ul className="mt-1 list-disc pl-5 text-subtle">
        <li>O site é oferecido como está, sem garantia, e pode sair do ar ou mudar a qualquer momento.</li>
        <li>Não use o site para assediar ninguém. Contas abusivas podem ser removidas.</li>
        <li>Doações via Pix são voluntárias, não dão direito a nada e não são reembolsáveis.</li>
      </ul>
    </main>
  );
}

async function Delete() {
  if (!(await getUserId())) return null;
  return (
    <div className="mt-3">
      <DeleteAccount />
    </div>
  );
}
