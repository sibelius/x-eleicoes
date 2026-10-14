"use client";

import { useRouter } from "next/navigation";
import { useState } from "react";

function parseIds(text: string) {
  return [...text.matchAll(/"accountId"\s*:\s*"(\d+)"/g)].map((m) => m[1]);
}

/** Reads only following.js / follower.js out of the X archive .zip (it can be GBs with media). */
async function filesFromZip(zip: File) {
  const { BlobReader, TextWriter, ZipReader, configure } = await import("@zip.js/zip.js");
  configure({ useWebWorkers: false });
  const reader = new ZipReader(new BlobReader(zip));
  const out: { name: string; text: string }[] = [];
  for (const entry of await reader.getEntries()) {
    const name = entry.filename.split("/").pop() ?? "";
    if (!entry.directory && /^follow(ing|er)(-part\d+)?\.js$/.test(name)) {
      out.push({ name, text: await entry.getData!(new TextWriter()) });
    }
  }
  await reader.close();
  return out;
}

export function ImportArchive({ counts }: { counts: { following: number; followers: number } }) {
  const router = useRouter();
  const [status, setStatus] = useState<string | null>(null);

  async function onFiles(files: FileList | null) {
    if (!files?.length) return;
    const following: string[] = [];
    const followers: string[] = [];
    setStatus("Lendo arquivo…");
    const texts: { name: string; text: string }[] = [];
    try {
      for (const f of Array.from(files)) {
        if (f.name.toLowerCase().endsWith(".zip")) texts.push(...(await filesFromZip(f)));
        else texts.push({ name: f.name, text: await f.text() });
      }
    } catch {
      return setStatus("Não consegui abrir esse arquivo. Envie o .zip do X ou os arquivos following.js e follower.js.");
    }
    for (const { name, text } of texts) {
      if (/YTD\.following\./.test(text) || name.startsWith("following")) following.push(...parseIds(text));
      else if (/YTD\.follower\./.test(text) || name.startsWith("follower")) followers.push(...parseIds(text));
    }
    if (!following.length && !followers.length) {
      return setStatus("Não encontrei seguidores nesse arquivo. Use o .zip do X ou data/following.js e data/follower.js.");
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
 e envie o <b>.zip</b> que o X mandar (ou só <code>data/following.js</code> e <code>data/follower.js</code>). O
        arquivo não sai do seu computador: o navegador lê apenas os IDs de quem você segue e de quem te segue.
      </p>
      <label className="mt-3 inline-block cursor-pointer rounded-full bg-fg px-4 py-2 text-sm text-bg">
        Enviar arquivo do X (.zip)
        <input type="file" accept=".zip,.js,.json" multiple className="hidden" onChange={(e) => onFiles(e.target.files)} />
      </label>
      {status && <p className="mt-2 text-sm">{status}</p>}
    </div>
  );
}
