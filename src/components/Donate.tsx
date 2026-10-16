"use client";

import { withUtm } from "@/lib/links";
import { useEffect, useState, type ReactNode } from "react";
import QRCode from "qrcode";
import { pixPayload } from "@/lib/pix";

export const PIX = {
  key: "c78052c6-43e5-4732-a9ef-90fd615ed638",
  name: "Sibelius Seraphini",
  city: "Sao Paulo",
  txid: "MINHABOLHA",
};
const PRESETS = [5, 10, 25, 50, 100];

/** Posting "I just donated" on X. The link renders with the production origin (same on server and client) and switches to this one on click. */
function donatedTweetUrl(amount: number | null, origin = "https://x-eleicoes.vercel.app") {
  const text = `Acabei de doar${amount ? ` R$ ${amount.toFixed(2).replace(".", ",").replace(",00", "")}` : ""} para o projeto Minha Bolha 💚 Apoie também e veja de que lado está a sua rede do X: Vermelho ou Verde?`;
  return `https://x.com/intent/post?text=${encodeURIComponent(text)}&url=${encodeURIComponent(withUtm(`${origin}/apoie`, "donate"))}`;
}

function SharedDonation({ amount, className = "", children }: { amount: number | null; className?: string; children?: ReactNode }) {
  return (
    <a
      href={donatedTweetUrl(amount)}
      onClick={(e) => (e.currentTarget.href = donatedTweetUrl(amount, location.origin))}
      target="_blank"
      rel="noreferrer"
      className={`inline-block rounded-full border border-line px-4 py-1.5 text-sm ${className}`}
    >
      {children ?? "💚 Já doei, compartilhar no X"}
    </a>
  );
}

const reais = (v: number) => v.toFixed(2).replace(".", ",").replace(",00", "");

/**
 * "Já doei": the donor tells us amount, display name and whether to show it on the supporter wall.
 * It stays pending until the Pix shows up on the statement; posting on X is offered either way.
 */
export function ClaimDonation({ amount, compact = false }: { amount: number | null; compact?: boolean }) {
  const [open, setOpen] = useState(false);
  const [value, setValue] = useState("");
  const [name, setName] = useState("");
  const [pub, setPub] = useState(false); // opt-in: the wall shows names
  const [state, setState] = useState<"idle" | "sending" | "done">("idle");
  const [error, setError] = useState<string | null>(null);

  async function start() {
    setValue(amount ? reais(amount) : "");
    setOpen(true);
    if (!name) {
      const r = await fetch("/api/donation").then((x) => x.json()).catch(() => null);
      if (r?.handle) setName((n) => n || `@${r.handle}`);
    }
  }

  async function send(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    setState("sending");
    const r = await fetch("/api/donation", {
      method: "POST",
      headers: { "content-type": "application/json" },
      body: JSON.stringify({ amount: value, name, public: pub }),
    })
      .then((x) => x.json())
      .catch(() => ({ ok: false, error: "Sem conexão. Tente de novo." }));
    if (r.ok) setState("done");
    else {
      setError(r.error ?? "Não deu certo. Tente de novo.");
      setState("idle");
    }
  }

  const shown = Number(value.replace(/\./g, "").replace(",", ".")) || amount;
  if (state === "done") {
    return (
      <div className={`rounded-xl border border-line bg-muted p-3 text-sm ${compact ? "mt-2" : "mt-3"}`}>
        <b>Obrigado! 💚</b> Vamos conferir no extrato e, confirmado, seu apoio entra na meta do mês
        {pub ? " e no mural de apoiadores" : ""}.
        <div className="mt-2">
          <SharedDonation amount={shown}>💚 Contar no X</SharedDonation>
        </div>
      </div>
    );
  }
  if (!open) {
    return (
      <div className={`flex flex-wrap items-center gap-2 ${compact ? "mt-2" : "mt-3"}`}>
        <button onClick={start} className="rounded-full border border-line px-4 py-1.5 text-sm font-semibold">
          💚 Já doei
        </button>
        <SharedDonation amount={amount} className="border-0 px-1 text-xs text-subtle underline">
          compartilhar no X
        </SharedDonation>
      </div>
    );
  }
  return (
    <form onSubmit={send} className={`grid gap-2 rounded-xl border border-line p-3 text-sm ${compact ? "mt-2" : "mt-3"}`}>
      <div className="flex flex-wrap gap-2">
        <label className="flex items-center gap-1 rounded-lg border border-line px-2">
          R$
          <input
            required
            inputMode="decimal"
            value={value}
            onChange={(e) => setValue(e.target.value)}
            placeholder="valor"
            aria-label="Valor doado"
            className="w-20 bg-transparent py-1.5 outline-none"
          />
        </label>
        <input
          value={name}
          onChange={(e) => setName(e.target.value)}
          maxLength={40}
          placeholder="nome ou @ (opcional)"
          aria-label="Nome no mural"
          className="min-w-0 flex-1 rounded-lg border border-line bg-transparent px-2 py-1.5 outline-none"
        />
      </div>
      <label className="flex items-center gap-2 text-subtle">
        <input type="checkbox" checked={pub} onChange={(e) => setPub(e.target.checked)} />
        mostrar meu nome no mural de apoiadores
      </label>
      {error && <p className="text-[var(--red)]">{error}</p>}
      <div className="flex flex-wrap items-center gap-2">
        <button disabled={state === "sending"} className="rounded-full bg-fg px-4 py-1.5 font-semibold text-bg disabled:opacity-60">
          {state === "sending" ? "Enviando…" : "Avisar que doei"}
        </button>
        <button type="button" onClick={() => setOpen(false)} className="px-2 text-subtle underline">
          cancelar
        </button>
      </div>
      <p className="text-xs text-subtle">Conferimos no extrato antes de contar na meta. O valor de cada pessoa não aparece no mural.</p>
    </form>
  );
}

/** Compact Pix for every screen: R$ 10 preselected, small QR on desktop, copy button first on phones. */
export function DonateMini({ goal }: { goal?: ReactNode }) {
  const [amount, setAmount] = useState(10);
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const payload = pixPayload({ ...PIX, amount });
  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 160 }).then(setQr, () => setQr(null));
  }, [payload]);
  async function copy() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }
  return (
    <div>
      <div className="flex items-center gap-3">
        {qr && <img src={qr} alt="QR code Pix" className="hidden h-24 w-24 shrink-0 rounded-lg bg-white p-1 sm:block" />}
        <div className="min-w-0 flex-1">
          <div className="font-semibold">💚 Apoie com Pix</div>
          <div className="mt-1 flex flex-wrap gap-1.5 text-sm">
            {[5, 10, 25].map((v) => (
              <button
                key={v}
                onClick={() => setAmount(v)}
                className={`rounded-full px-3 py-1 ${amount === v ? "bg-fg text-bg" : "border border-line"}`}
              >
                R$ {v}
              </button>
            ))}
            <a href="/apoie" className="self-center px-1 text-xs text-subtle underline">
              outro valor
            </a>
          </div>
          <button onClick={copy} className="mt-2 rounded-full bg-[var(--green)] px-4 py-1.5 text-sm font-semibold text-white">
            {copied ? "Copiado ✓ cole no app do banco" : `Copiar Pix de R$ ${amount}`}
          </button>
          {/* Desktop donors scan the QR without copying, so "Já doei" is always there. */}
          <ClaimDonation amount={amount} compact />
        </div>
      </div>
      {goal}
    </div>
  );
}

export function Donate() {
  const [amount, setAmount] = useState<number | null>(10);
  const [custom, setCustom] = useState("");
  const [qr, setQr] = useState<string | null>(null);
  const [copied, setCopied] = useState(false);
  const payload = pixPayload({ ...PIX, amount: amount ?? undefined });

  useEffect(() => {
    QRCode.toDataURL(payload, { margin: 1, width: 280 }).then(setQr, () => setQr(null));
  }, [payload]);

  async function copy() {
    await navigator.clipboard.writeText(payload);
    setCopied(true);
    setTimeout(() => setCopied(false), 2000);
  }

  return (
    <div>
      <div className="flex flex-wrap gap-2 text-sm">
        {PRESETS.map((v) => (
          <button
            key={v}
            onClick={() => {
              setAmount(v);
              setCustom("");
            }}
            className={`rounded-full px-4 py-2 ${amount === v && !custom ? "bg-fg text-bg" : "border border-line"}`}
          >
            R$ {v}
          </button>
        ))}
        <label className="flex items-center gap-1 rounded-full border border-line px-3">
          R$
          <input
            inputMode="decimal"
            placeholder="outro valor"
            value={custom}
            onChange={(e) => {
              setCustom(e.target.value);
              const v = Number(e.target.value.replace(",", "."));
              setAmount(v > 0 ? Math.round(v * 100) / 100 : null);
            }}
            className="w-24 bg-transparent py-2 outline-none"
          />
        </label>
      </div>
      <div className="mt-4 flex flex-col items-center gap-3 sm:flex-row sm:items-start">
        {qr && <img src={qr} alt="QR code Pix" className="h-56 w-56 rounded-xl bg-white p-2" />}
        <div className="min-w-0 flex-1 text-sm">
          <p className="text-subtle">
            {amount ? (
              <>
                Valor: <b className="text-fg">R$ {amount.toFixed(2).replace(".", ",")}</b>
              </>
            ) : (
              "Sem valor: você escolhe no app do banco."
            )}
          </p>
          <p className="mt-1 text-subtle">Aponte a câmera do app do seu banco, ou copie o código:</p>
          <code className="mt-2 block break-all rounded-lg bg-muted p-2 text-xs">{payload}</code>
          <button onClick={copy} className="mt-2 rounded-full bg-fg px-4 py-2 text-bg">
            {copied ? "Copiado ✓" : "Copiar Pix copia e cola"}
          </button>
          <p className="mt-4 text-subtle">Doou? Avise aqui para entrar na meta do mês e no mural, e conte pra sua rede:</p>
          <ClaimDonation amount={amount} />
        </div>
      </div>
    </div>
  );
}
