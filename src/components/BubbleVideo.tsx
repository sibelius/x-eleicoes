"use client";

import { useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { bubbleVerdict, pct } from "@/lib/links";
import type { Me, NetworkNode, Tally } from "@/lib/network";

const S = 1080; // square: plays well in the X timeline
const FPS = 30;
const FORM = 6; // seconds of the bubble forming
const HOLD = 2.5; // seconds of the final frame
const COLORS = { bg: "#0c0c0e", fg: "#f2f2f0", subtle: "#9c9ca3", muted: "#222226", red: "#f0444f", green: "#2bb56b", none: "#5d5d64" };

type Dot = SimulationNodeDatum & { r: number; color: string; img: HTMLImageElement | null; me?: boolean; dim?: boolean };

function loadImage(src: string | null | undefined): Promise<HTMLImageElement | null> {
  if (!src) return Promise.resolve(null);
  return new Promise((resolve) => {
    const img = new Image();
    img.crossOrigin = "anonymous";
    img.onload = () => resolve(img);
    img.onerror = () => resolve(null);
    img.src = src.replace("_normal.", "_bigger.");
  });
}

function pickMime() {
  // X accepts MP4; Chrome (recent) and Safari can record it, older Chrome/Firefox only WebM.
  for (const t of ["video/mp4;codecs=avc1", "video/mp4", "video/webm;codecs=vp9", "video/webm"]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/** Records a short video of the bubble forming (photos flying into place, then the result) to post on X. */
export function BubbleVideo({ me, nodes, tally, title }: { me: Me | null; nodes: NetworkNode[]; tally: Tally; title: string }) {
  const [state, setState] = useState<"idle" | "loading" | "recording" | "done" | "unsupported">("idle");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob } | null>(null);

  async function record() {
    const mime = pickMime();
    if (!mime) return setState("unsupported");
    setState("loading");
    const top = nodes.slice(0, 140);
    const colorOf = (v: string | null, isMe = false) => (v === "red" ? COLORS.red : v === "green" ? COLORS.green : isMe ? COLORS.fg : COLORS.none);
    const dots: Dot[] = await Promise.all([
      ...(me ? [loadImage(me.avatar).then((img): Dot => ({ r: 46, color: colorOf(me.vote, true), img, me: true, x: 0, y: 0, fx: 0, fy: 0 }))] : []),
      ...top.map((n, i) =>
        loadImage(n.member ? n.avatar : null).then((img): Dot => {
          const a = i * 2.39996;
          return {
            r: n.member ? 16 + n.strength * 4 : 5 + n.strength * 2,
            color: colorOf(n.vote),
            img,
            dim: !n.member,
            // Start scattered far outside the frame, then fly in.
            x: Math.cos(a) * (700 + (i % 7) * 60),
            y: Math.sin(a) * (700 + (i % 5) * 60),
            vote: n.vote,
          } as Dot;
        }),
      ),
    ]);
    const sim = forceSimulation(dots)
      .force("x", forceX<Dot>((d) => (d.color === COLORS.red ? -170 : d.color === COLORS.green ? 170 : 0)).strength((d) => (d.color === COLORS.none ? 0.04 : 0.1)))
      .force("y", forceY<Dot>(0).strength(0.08))
      .force("collide", forceCollide<Dot>((d) => d.r + 2).iterations(3))
      .alphaDecay(1 - Math.pow(0.001, 1 / (FORM * FPS)))
      .stop();

    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(FPS);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

    const l = pct(tally.red, tally.total);
    const b = tally.total ? 100 - l : 0;
    const verdict = bubbleVerdict(tally).label;
    let scale = 1;

    const draw = (t: number) => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, S, S);
      // Fit the bubble into the middle area, easing the zoom so it doesn't jump.
      const box = dots.reduce((m, d) => Math.max(m, Math.abs(d.x!) + d.r, Math.abs(d.y!) + d.r), 1);
      scale += (Math.min(1.6, 380 / box) - scale) * 0.15;
      ctx.save();
      ctx.translate(S / 2, S / 2 + 30);
      ctx.scale(scale, scale);
      for (const d of dots) {
        ctx.globalAlpha = d.dim ? 0.55 : 1;
        ctx.beginPath();
        ctx.arc(d.x!, d.y!, d.r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.muted;
        ctx.fill();
        if (d.img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(d.x!, d.y!, d.r * 0.84, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(d.img, d.x! - d.r, d.y! - d.r, d.r * 2, d.r * 2);
          ctx.restore();
        }
        ctx.lineWidth = d.me ? 6 : Math.max(1.5, d.r * 0.16);
        ctx.strokeStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x!, d.y!, d.r - ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();
      ctx.globalAlpha = 1;
      // Header.
      ctx.fillStyle = COLORS.fg;
      ctx.font = "800 54px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, S / 2, 92);
      // Result fades in as the bubble settles.
      const reveal = Math.min(1, Math.max(0, (t - FORM * 0.6) / (FORM * 0.4)));
      ctx.globalAlpha = reveal;
      ctx.font = "800 64px system-ui, sans-serif";
      ctx.fillStyle = COLORS.red;
      ctx.textAlign = "left";
      ctx.fillText(`Vermelho ${l}%`, 70, S - 150);
      ctx.fillStyle = COLORS.green;
      ctx.textAlign = "right";
      ctx.fillText(`Verde ${b}%`, S - 70, S - 150);
      ctx.fillStyle = COLORS.muted;
      ctx.fillRect(70, S - 120, S - 140, 22);
      ctx.fillStyle = COLORS.red;
      ctx.fillRect(70, S - 120, ((S - 140) * l) / 100, 22);
      ctx.fillStyle = COLORS.green;
      ctx.fillRect(70 + ((S - 140) * l) / 100, S - 120, ((S - 140) * b) / 100, 22);
      ctx.fillStyle = COLORS.fg;
      ctx.textAlign = "center";
      ctx.font = "700 40px system-ui, sans-serif";
      ctx.fillText(verdict, S / 2, 150);
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.subtle;
      ctx.font = "500 30px system-ui, sans-serif";
      ctx.fillText(`${location.host} · E a sua bolha?`, S / 2, S - 50);
    };

    setState("recording");
    rec.start();
    const total = (FORM + HOLD) * FPS;
    for (let f = 0; f < total; f++) {
      if (f < FORM * FPS) sim.tick();
      draw(f / FPS);
      setProgress(f / total);
      await new Promise((r) => setTimeout(r, 1000 / FPS));
    }
    rec.stop();
    await stopped;
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    setFile({ url: URL.createObjectURL(blob), name: `minha-bolha.${ext}`, blob });
    setState("done");
  }

  async function share() {
    if (!file) return;
    const f = new File([file.blob], file.name, { type: file.blob.type });
    if (navigator.canShare?.({ files: [f] })) {
      await navigator.share({ files: [f], text: "Minha bolha no X 🔴🟢 E a sua?" }).catch(() => {});
    }
  }

  return (
    <div className="mt-3 flex flex-wrap items-center gap-2 text-sm">
      {state === "idle" && (
        <button onClick={record} className="rounded-full border border-line px-3 py-1.5">
          🎬 Gerar vídeo da bolha
        </button>
      )}
      {(state === "loading" || state === "recording") && (
        <span className="text-subtle">{state === "loading" ? "Carregando fotos…" : `Gravando vídeo… ${Math.round(progress * 100)}%`}</span>
      )}
      {state === "unsupported" && <span className="text-subtle">Este navegador não grava vídeo. Tente no Chrome.</span>}
      {state === "done" && file && (
        <>
          <video src={file.url} autoPlay loop muted playsInline className="w-full max-w-xs rounded-xl" />
          <div className="flex flex-col gap-2">
            <a href={file.url} download={file.name} className="rounded-full bg-fg px-3 py-1.5 text-center text-bg">
              Baixar vídeo
            </a>
            {typeof navigator !== "undefined" && "share" in navigator && (
              <button onClick={share} className="rounded-full border border-line px-3 py-1.5">
                Compartilhar
              </button>
            )}
            <span className="max-w-48 text-xs text-subtle">Baixe e poste no X junto com o seu link.</span>
          </div>
        </>
      )}
    </div>
  );
}
