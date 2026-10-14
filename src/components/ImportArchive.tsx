"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function parseIds(text: string) {
  return [...text.matchAll(/"accountId"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
}

export function ImportArchive({ counts }: { counts: { following: number; followers: number } }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const following: string[] = [];
    const followers: string[] = [];
    for (const f of Array.from(files)) {
      const text = await f.text();
      if (/YTD\.following\./.test(text) || f.name.startsWith("following")) following.push(...parseIds(text));
      else if (/YTD\.follower\./.test(text) || f.name.startsWith("follower")) followers.push(...parseIds(text));
    }
    if (!following.length && !followers.length) {
      return setStatus("Não encontrei contas nesses arquivos. Use data/following.js e data/follower.js.");
    }
    setStatus("Importando…");
    const res = await fetch("/api/import", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ following, followers }),
    });
    if (!res.ok) return setStatus("Falhou ao importar. Tente de novo.");
    const r = (await res.json()) as { following: number; followers: number };
    setStatus(`Pronto: ${r.following} seguindo e ${r.followers} seguidores importados.`);
    router.refresh();
  }

  return (
    <div className="rounded-2xl border border-line bg-card p-4">
      <h2 className="text-lg font-semibold">Monte sua rede (grátis)</h2>
      <p className="mt-1 text-sm text-subtle">
        Hoje: {counts.following} seguindo · {counts.followers} seguidores conhecidos. A API do X cobra por cada
        seguidor lido, então usamos o seu arquivo do X: em{" "}
        <a className="underline" href="https://x.com/settings/download_your_data" target="_blank" rel="noreferrer">
          Configurações → Baixar um arquivo dos seus dados
        </a>
        , abra o .zip e envie <code>data/following.js</code> e <code>data/follower.js</code>. Só os IDs das contas são
        lidos — no seu navegador.
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-full bg-fg px-4 py-2 text-sm text-bg">
        Enviar following.js / follower.js
        <input type="file" accept=".js,.json" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </label>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
}
