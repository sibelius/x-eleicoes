"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const TABS = [
  { href: "/admin", label: "Visão geral" },
  { href: "/admin/anuncios", label: "Anúncios" },
  { href: "/admin/origem", label: "Origem (UTM)" },
  { href: "/admin/grafo", label: "Grafo" },
  { href: "/admin/centro", label: "Quem é o centro" },
  { href: "/admin/convites", label: "Convites" },
  { href: "/admin/polarizacao", label: "Polarização" },
  { href: "/admin/mensagens", label: "Mensagens" },
  { href: "/admin/push", label: "Push" },
  { href: "/admin/banco", label: "Banco de dados" },
];

export function AdminNav() {
  const path = usePathname();
  return (
    <nav className="mb-6 flex items-center gap-1 overflow-x-auto border-b border-line pb-2 text-sm [scrollbar-width:none]">
      <Link href="/app" className="mr-2 shrink-0 text-subtle underline">
        ← App
      </Link>
      {TABS.map((t) => (
        <Link
          key={t.href}
          href={t.href}
          className={`shrink-0 rounded-full px-3 py-1 ${path === t.href ? "bg-fg font-semibold text-bg" : "text-subtle hover:bg-muted"}`}
        >
          {t.label}
        </Link>
      ))}
    </nav>
  );
}
