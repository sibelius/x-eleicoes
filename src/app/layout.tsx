import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ViewBeacon } from "@/components/ViewBeacon";
import { LiveBar } from "@/components/LiveBar";
import { ShareTracker } from "@/components/ShareTracker";
import { UtmBeacon } from "@/components/UtmBeacon";
import { Inbox } from "@/components/play/Inbox";
import { PushPrompt } from "@/components/PushPrompt";
import { FeedbackButton } from "@/components/FeedbackButton";
import { pushPublicKey } from "@/lib/push";
import { SITE } from "@/lib/views-shared";
import { appUrl } from "@/lib/session";
import { REPO_URL } from "@/lib/seo";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


const DESCRIPTION =
  "Entre com o X, escolha Vermelho ou Verde e veja de que lado está a sua rede: quem você segue e quem te segue. Gratuito e de código aberto.";

export const metadata: Metadata = {
  metadataBase: new URL(appUrl()),
  title: { default: "Minha Bolha: de que lado está a sua rede do X?", template: "%s · Minha Bolha" },
  description: DESCRIPTION,
  applicationName: "Minha Bolha",
  authors: [{ name: "Sibelius Seraphini", url: "https://x.com/sseraphini" }],
  creator: "Sibelius Seraphini",
  keywords: ["Minha Bolha", "bolha do X", "rede do X", "Vermelho ou Verde", "quem eu sigo", "seguidores", "bolha social"],
  // No canonical here: it would be inherited by every page. Each page sets its own.
  openGraph: { type: "website", siteName: "Minha Bolha", locale: "pt_BR" },
  twitter: { card: "summary_large_image", creator: "@sseraphini" },
  formatDetection: { telephone: false },
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        <LiveBar />
        {children}
        <footer className="mt-auto px-4 py-6 text-center text-xs text-subtle">
          <a href="/apoie" className="font-semibold underline">
            💚 Apoie com Pix
          </a>{" "}
          ·{" "}
          <a href="/anuncie" className="underline">
            Anuncie aqui
          </a>{" "}
          ·{" "}
          <FeedbackButton className="font-semibold underline" />{" "}
          ·{" "}
          <a href="/sobre" className="underline">
            Como funciona
          </a>{" "}
          ·{" "}
          <a href="/privacidade" className="underline">
            Privacidade e termos
          </a>{" "}
          · Código aberto ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline">
            github.com/sibelius/x-green-red
          </a>
        </footer>
        <Analytics />
        <ViewBeacon ids={[SITE]} />
        <ShareTracker />
        <UtmBeacon />
        <Inbox />
        {pushPublicKey() && <PushPrompt publicKey={pushPublicKey()!} />}
      </body>
    </html>
  );
}
