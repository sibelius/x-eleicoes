import type { Metadata } from "next";
import { Geist, Geist_Mono } from "next/font/google";
import { Analytics } from "@vercel/analytics/next";
import { ViewBeacon } from "@/components/ViewBeacon";
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


const REPO_URL = "https://github.com/sibelius/x-eleicoes";

export const metadata: Metadata = {
  title: "Minha Rede Vota",
  description: "Entre com o X, vote Lula ou Bolsonaro e veja como a sua rede vota.",
};

export default function RootLayout({ children }: LayoutProps<"/">) {
  return (
    <html lang="pt-BR" className={`${geistSans.variable} ${geistMono.variable} h-full antialiased`}>
      <body className="flex min-h-full flex-col font-sans">
        {children}
        <footer className="mt-auto px-4 py-6 text-center text-xs text-subtle">
          Código aberto ·{" "}
          <a href={REPO_URL} target="_blank" rel="noreferrer" className="underline">
            github.com/sibelius/x-eleicoes
          </a>
        </footer>
        <Analytics />
        <ViewBeacon ids={[SITE]} />
      </body>
    </html>
  );
}
