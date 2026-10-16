"use client";

import { useRef, useState, useSyncExternalStore } from "react";
import { trackShare } from "@/lib/share-client";
import {
  analysisText,
  linkedinUrl,
  shareText,
  storyPath,
  targetLink,
  telegramUrl,
  whatsappUrl,
  type ShareTarget,
} from "@/lib/share-links";

const pill = "rounded-full border border-line px-4 py-2";
const noop = () => () => {};

async function copy(text: string) {
  try {
    await navigator.clipboard.writeText(text);
    return true;
  } catch {
    return false;
  }
}

/**
 * Share buttons beyond X: WhatsApp, Instagram Stories (bubbles only), LinkedIn, Telegram, copy link
 * and the phone share sheet. X clicks are tracked by ShareTracker; the rest call trackShare here.
 */
export function ShareMenu({
  base,
  target,
  xUrl,
  xLabel = "Compartilhar no X",
  telegram = false,
  className = "",
}: {
  base: string;
  target: ShareTarget;
  /** The x.com post intent (shareTweetUrl / compareTweetUrl). */
  xUrl?: string;
  xLabel?: string;
  telegram?: boolean;
  className?: string;
}) {
  const [note, setNote] = useState("");
  const [busy, setBusy] = useState(false);
  // A Stories image fetched but not shared yet (iOS drops the tap's permission while it downloads).
  const [pending, setPending] = useState<File | null>(null);
  const story = useRef<File | null>(null);
  const canNative = useSyncExternalStore(noop, () => typeof navigator.share === "function", () => false);

  const link = (via: Parameters<typeof targetLink>[2]) => targetLink(base, target, via);
  const handle = target.kind === "bubble" ? target.username : null;

  async function shareStory(f: File) {
    const ok = await navigator.share({ files: [f] }).then(
      () => true,
      (e: unknown) => (e instanceof DOMException && e.name === "NotAllowedError" ? null : false),
    );
    if (ok === null) {
      setPending(f);
      return;
    }
    setPending(null);
    if (ok) {
      trackShare(link("instagram"), "instagram");
      setNote("Escolha Instagram › Story e cole o link (já copiado) num sticker de link.");
    }
  }

  async function instagram() {
    if (!handle || busy) return;
    // Clipboard first, while the tap still counts as a user gesture.
    const copied = await copy(link("instagram"));
    setBusy(true);
    setNote("Gerando a imagem…");
    try {
      if (!story.current) {
        const res = await fetch(storyPath(handle));
        if (!res.ok) throw new Error(String(res.status));
        story.current = new File([await res.blob()], `bolha-${handle}.png`, { type: "image/png" });
      }
      const f = story.current;
      if (navigator.canShare?.({ files: [f] })) {
        setNote("");
        await shareStory(f);
        return;
      }
      const url = URL.createObjectURL(f);
      const a = document.createElement("a");
      a.href = url;
      a.download = f.name;
      a.click();
      setTimeout(() => URL.revokeObjectURL(url), 10_000);
      trackShare(link("instagram"), "instagram");
      setNote(
        copied
          ? "Imagem baixada. Poste nos Stories e cole o link (já copiado) num sticker de link."
          : `Imagem baixada. Poste nos Stories e cole o link: ${link("instagram")}`,
      );
    } catch {
      setNote("Não deu para gerar a imagem. Tente de novo.");
    } finally {
      setBusy(false);
    }
  }

  async function native() {
    const url = link("native");
    const ok = await navigator.share({ text: shareText(target), url }).then(
      () => true,
      () => false,
    );
    if (ok) trackShare(url, "native");
  }

  async function copyLink() {
    const url = link("copy");
    if (await copy(url)) {
      trackShare(url, "copy");
      setNote("Link copiado.");
    } else setNote(url);
  }

  return (
    <div className={className}>
      <div className="flex flex-wrap gap-2 text-sm">
        {xUrl && (
          <a className="rounded-full bg-fg px-4 py-2 text-bg" href={xUrl} target="_blank" rel="noreferrer">
            {xLabel}
          </a>
        )}
        <a
          className={pill}
          href={whatsappUrl(base, target)}
          target="_blank"
          rel="noreferrer"
          onClick={() => trackShare(link("whatsapp"), "whatsapp")}
        >
          WhatsApp
        </a>
        {handle && (
          <button type="button" className={pill} onClick={instagram} disabled={busy} aria-busy={busy}>
            {busy ? "Gerando…" : "Stories"}
          </button>
        )}
        <a
          className={pill}
          href={linkedinUrl(base, target)}
          target="_blank"
          rel="noreferrer"
          onClick={() => {
            trackShare(link("linkedin"), "linkedin");
            // LinkedIn ignores prefilled text: hand it over through the clipboard.
            void copy(analysisText(target)).then((ok) => ok && setNote("Texto copiado: cole no post do LinkedIn."));
          }}
        >
          LinkedIn
        </a>
        {telegram && (
          <a
            className={pill}
            href={telegramUrl(base, target)}
            target="_blank"
            rel="noreferrer"
            onClick={() => trackShare(link("telegram"), "telegram")}
          >
            Telegram
          </a>
        )}
        <button type="button" className={pill} onClick={copyLink}>
          Copiar link
        </button>
        {canNative && (
          <button type="button" className={pill} onClick={native} aria-label="Mais opções de compartilhamento">
            Mais…
          </button>
        )}
      </div>
      {pending && (
        <button type="button" className="mt-2 rounded-full bg-fg px-4 py-2 text-sm text-bg" onClick={() => shareStory(pending)}>
          Imagem pronta: abrir no Instagram
        </button>
      )}
      {note && (
        <p className="mt-2 text-xs break-all text-subtle" aria-live="polite">
          {note}
        </p>
      )}
    </div>
  );
}
