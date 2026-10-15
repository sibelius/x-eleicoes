"use client";

import { useEffect, useState } from "react";
import QRCode from "qrcode";
import { pixPayload } from "@/lib/pix";

export const PIX = {
  key: "c78052c6-43e5-4732-a9ef-90fd615ed638",
  name: "Sibelius Seraphini",
  city: "Sao Paulo",
  txid: "ELEICOES2026",
};
const PRESETS = [5, 10, 25, 50, 100];

/** Compact Pix for every screen: R$ 10 preselected, small QR on desktop, copy button first on phones. */
export function DonateMini() {
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
        <button onClick={copy} className="mt-2 rounded-full bg-[var(--bolso)] px-4 py-1.5 text-sm font-semibold text-white">
          {copied ? "Copiado ✓ cole no app do banco" : `Copiar Pix de R$ ${amount}`}
        </button>
      </div>
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
        </div>
      </div>
    </div>
  );
}
