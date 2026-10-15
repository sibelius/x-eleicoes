"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";
import { Tour, type TourName } from "@/components/Tour";

const TABS = [
  { href: "/grafo", label: "Grafo" },
  { href: "/centro", label: "Quem é o centro" },
  { href: "/convites", label: "Convites" },
  { href: "/polarizacao", label: "Polarização" },
  { href: "/ranking", label: "Ranking" },
  { href: "/mapa", label: "Mapa" },
];

const TOUR: Record<string, TourName> = {
  "/grafo": "graph",
  "/centro": "center",
  "/convites": "invites",
  "/polarizacao": "polarization",
};

export function RedeNav() {
  const path = usePathname();
  const tour = TOUR[path];
  return (
    <div className="mb-6 flex items-center gap-2 border-b border-line pb-2">
      <nav className="flex min-w-0 flex-1 items-center gap-1 overflow-x-auto text-sm [scrollbar-width:none]">
        <Link href="/" className="mr-2 shrink-0 text-subtle underline">
          Minha Bolha
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
      {tour && (
        <span className="shrink-0">
          <Tour key={tour} name={tour} />
        </span>
      )}
    </div>
  );
}
