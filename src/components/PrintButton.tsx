"use client";

export function PrintButton({ label = "Imprimir / salvar PDF" }: { label?: string }) {
  return (
    <button onClick={() => window.print()} className="rounded-full border border-line px-3 py-1 text-sm print:hidden">
      {label}
    </button>
  );
}
