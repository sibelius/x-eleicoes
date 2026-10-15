import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ViewBeacon } from "@/components/ViewBeacon";
import { LiveBar } from "@/components/LiveBar";
import { ShareTracker } from "@/components/ShareTracker";
import { UtmBeacon } from "@/components/UtmBeacon";
import { Inbox } from "@/components/play/Inbox";
import { SITE } from "@/lib/views-shared";
import "./globals.css";

const geistSans = Geist({
  variable: "--font-geist-sans",
  subsets: ["latin"],
});

const geistMono = Geist_Mono({
  variable: "--font-geist-mono",
  subsets: ["latin"],
});


const REPO_URL = "https://github.com/sibelius/x-green-red";

export const metadata: Metadata = {
  title: "Minha Bolha",
  description: "Entre com o X, escolha Vermelho ou Verde e veja de que lado está a sua rede.",
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
          <a href="/apoie" className="underline">
            Anuncie aqui
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
      </body>
    </html>
  );
}
