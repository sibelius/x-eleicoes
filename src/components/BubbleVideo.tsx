"use client";

import { useEffect, useState } from "react";
import { forceCollide, forceSimulation, forceX, forceY, type SimulationNodeDatum } from "d3-force";
import { bubbleVerdict, pct, sharePath } from "@/lib/links";
import type { Me, NetworkNode, Tally } from "@/lib/network";
import { trackShare } from "@/lib/share-client";

const S = 1080; // square: plays well in the X timeline
const FPS = 30;
const INTRO = 2.2; // seconds of the bubble forming, everyone still grey
const PER_VOTE = 0.32; // seconds per vote in the timeline (squeezed to fit MIN_VOTES..MAX_VOTES)
const MIN_VOTES = 3;
const MAX_VOTES = 9;
const HOLD = 3; // seconds of the final result
const COLORS = { bg: "#0c0c0e", fg: "#f2f2f0", subtle: "#9c9ca3", muted: "#222226", red: "#f0444f", green: "#2bb56b", none: "#5d5d64" };

type Dot = SimulationNodeDatum & {
  r: number;
  color: string;
  img: HTMLImageElement | null;
  me?: boolean;
  dim?: boolean;
  username?: string | null;
  /** Side picked, revealed when its turn in the timeline comes (time in video seconds). */
  vote?: "red" | "green" | null;
  votedAt?: number | null;
  revealAt?: number;
};
type Spark = { x: number; y: number; vx: number; vy: number; color: string; born: number };

const ease = (t: number) => 1 - Math.pow(1 - Math.min(1, Math.max(0, t)), 3);
const day = (ms: number) => new Date(ms).toLocaleDateString("pt-BR", { day: "numeric", month: "short", timeZone: "America/Sao_Paulo" });

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

// Pentatonic steps: each vote plays the next note, so the sound climbs as the count grows.
const SCALE = [0, 2, 4, 7, 9];
const note = (step: number, base: number) => base * Math.pow(2, (SCALE[step % 5] + 12 * Math.floor(step / 5)) / 12);

/**
 * Sound effects synthesized with Web Audio (no files) into a stream the recorder mixes in.
 * Nothing goes to the speakers: it only ends up in the video.
 */
function createSfx() {
  const Ctx = window.AudioContext ?? (window as unknown as { webkitAudioContext?: typeof AudioContext }).webkitAudioContext;
  if (!Ctx) return null;
  const ctx = new Ctx();
  const out = ctx.createMediaStreamDestination();
  const comp = ctx.createDynamicsCompressor();
  const master = ctx.createGain();
  master.gain.value = 0.8;
  master.connect(comp).connect(out);
  const noise = ctx.createBuffer(1, ctx.sampleRate, ctx.sampleRate);
  const ch = noise.getChannelData(0);
  for (let i = 0; i < ch.length; i++) ch[i] = Math.random() * 2 - 1;
  let lastVote = -1;

  const tone = (freq: number, at: number, dur: number, type: OscillatorType, vol: number, drop = 1.5) => {
    const o = ctx.createOscillator();
    const g = ctx.createGain();
    o.type = type;
    o.frequency.setValueAtTime(freq * drop, at);
    o.frequency.exponentialRampToValueAtTime(freq, at + 0.06);
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + 0.008);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    o.connect(g).connect(master);
    o.start(at);
    o.stop(at + dur + 0.05);
  };
  const hiss = (at: number, dur: number, from: number, to: number, vol: number) => {
    const src = ctx.createBufferSource();
    src.buffer = noise;
    src.loop = true;
    const f = ctx.createBiquadFilter();
    f.type = "bandpass";
    f.Q.value = 1.2;
    f.frequency.setValueAtTime(from, at);
    f.frequency.exponentialRampToValueAtTime(to, at + dur);
    const g = ctx.createGain();
    g.gain.setValueAtTime(0.0001, at);
    g.gain.exponentialRampToValueAtTime(vol, at + dur * 0.6);
    g.gain.exponentialRampToValueAtTime(0.0001, at + dur);
    src.connect(f).connect(g).connect(master);
    src.start(at);
    src.stop(at + dur + 0.05);
  };

  return {
    track: out.stream.getAudioTracks()[0],
    start: () => ctx.resume(),
    /** The bubble flying together. */
    whoosh(dur: number) {
      hiss(ctx.currentTime, dur, 180, 2400, 0.25);
    },
    /** A vote landing: a pop plus a click; Red a register lower than Green. Dense timelines skip some so it doesn't turn to noise. */
    vote(side: "red" | "green", n: number) {
      const at = ctx.currentTime;
      if (at - lastVote < 0.07) return;
      lastVote = at;
      const f = note(n % 15, side === "red" ? 220 : 440);
      tone(f, at, 0.32, side === "red" ? "triangle" : "sine", 0.35);
      tone(f * 2, at, 0.12, "sine", 0.08, 1);
      hiss(at, 0.06, 3000, 1500, 0.12);
    },
    /** The verdict: an arpeggiated chord leaning to the winning side's register. */
    finale(side: "red" | "green" | null) {
      const at = ctx.currentTime;
      const base = side === "red" ? 196 : side === "green" ? 392 : 262;
      [0, 4, 7, 12].forEach((st, i) => tone(base * Math.pow(2, st / 12), at + i * 0.09, 1.6, "triangle", 0.18, 1));
      hiss(at, 0.5, 4000, 800, 0.08);
    },
    close: () => void ctx.close(),
  };
}

// Cache: the last video per bubble, in this browser's IndexedDB, so it isn't re-recorded on every visit.
// Bump VIDEO_VERSION when the video's look changes so old cached ones are re-made.
const VIDEO_VERSION = 3;
type Cached = { fp: string; blob: Blob; still: Blob | null; name: string };

function idb<T>(mode: IDBTransactionMode, run: (store: IDBObjectStore) => IDBRequest<T>): Promise<T | undefined> {
  return new Promise((resolve) => {
    try {
      const open = indexedDB.open("bubble-video", 1);
      open.onupgradeneeded = () => open.result.createObjectStore("videos");
      open.onerror = () => resolve(undefined);
      open.onsuccess = () => {
        const db = open.result;
        const req = run(db.transaction("videos", mode).objectStore("videos"));
        req.onsuccess = () => resolve(req.result);
        req.onerror = () => resolve(undefined);
        req.transaction!.oncomplete = () => db.close();
      };
    } catch {
      resolve(undefined); // private mode / storage blocked: just record again
    }
  });
}

/** Changes whenever what the video shows would change: the score, who voted which side and when. */
function fingerprint(me: Me | null, nodes: NetworkNode[], tally: Tally, title: string) {
  const votes = nodes
    .slice(0, 140)
    .map((n) => `${n.id}:${n.voted ? n.vote : ""}:${n.votedAt ?? ""}`)
    .join(",");
  let h = 2166136261;
  const str = `${VIDEO_VERSION}|${title}|${me?.avatar ?? ""}|${me?.vote ?? ""}|${tally.red}/${tally.green}|${votes}`;
  for (let i = 0; i < str.length; i++) h = Math.imul(h ^ str.charCodeAt(i), 16777619);
  return String(h >>> 0);
}

// Phones/tablets only: desktop share sheets (e.g. macOS) accept files but don't offer X.
function canShareFile(blob: Blob, name: string) {
  return (
    matchMedia("(pointer: coarse)").matches &&
    Boolean(navigator.canShare?.({ files: [new File([blob], name, { type: blob.type })] }))
  );
}

function pickMime() {
  // X accepts MP4; Chrome (recent) and Safari can record it, older Chrome/Firefox only WebM. With audio codecs first.
  for (const t of [
    "video/mp4;codecs=avc1,mp4a.40.2",
    "video/mp4",
    "video/webm;codecs=vp9,opus",
    "video/webm",
  ]) {
    if (typeof MediaRecorder !== "undefined" && MediaRecorder.isTypeSupported(t)) return t;
  }
  return null;
}

/** The post's text and link, taken from the X intent URL (so the video and the plain share say the same). */
function postText(shareUrl?: string) {
  if (!shareUrl) return "Minha bolha no X 🔴🟢 E a sua?";
  const q = new URL(shareUrl).searchParams;
  return [q.get("text"), q.get("url")].filter(Boolean).join(" ");
}

/**
 * Records a short video of the bubble forming (photos flying into place, then the result) to post on X.
 * On phones the Web Share sheet sends the file straight to the X app; elsewhere "Postar no X" downloads it
 * and opens the post (X's web intent can't attach media). Browsers can't put a video on the clipboard,
 * so "Copiar imagem" copies the final frame as a PNG, which pastes into a post.
 */
export function BubbleVideo({
  me,
  nodes,
  tally,
  title,
  shareUrl,
}: {
  me: Me | null;
  nodes: NetworkNode[];
  tally: Tally;
  title: string;
  shareUrl?: string;
}) {
  const [state, setState] = useState<"idle" | "loading" | "recording" | "done" | "unsupported">("idle");
  const [progress, setProgress] = useState(0);
  const [file, setFile] = useState<{ url: string; name: string; blob: Blob; still: Blob | null; canShare: boolean } | null>(null);
  const [note, setNote] = useState("");
  const owner = me?.id ?? "all";
  const fp = fingerprint(me, nodes, tally, title);

  // Reuse the video recorded earlier in this browser if the bubble hasn't changed since.
  useEffect(() => {
    let alive = true;
    let url = "";
    idb<Cached>("readonly", (st) => st.get(owner)).then((c) => {
      if (!alive || !c || c.fp !== fp) return;
      url = URL.createObjectURL(c.blob);
      setFile({ url, name: c.name, blob: c.blob, still: c.still, canShare: canShareFile(c.blob, c.name) });
      setNote("Vídeo salvo neste aparelho. A bolha mudou? Ele é refeito sozinho.");
      setState("done");
    });
    return () => {
      alive = false;
      if (url) URL.revokeObjectURL(url);
    };
  }, [owner, fp]);

  async function record() {
    const mime = pickMime();
    if (!mime) return setState("unsupported");
    setState("loading");
    // Created inside the click, before any await, so the browser lets it start.
    const sfx = createSfx();
    const top = nodes.slice(0, 140);
    const sideColor = (v: string | null | undefined) => (v === "red" ? COLORS.red : v === "green" ? COLORS.green : COLORS.none);
    const dots: Dot[] = await Promise.all([
      ...(me
        ? [loadImage(me.avatar).then((img): Dot => ({ r: 46, color: me.vote ? sideColor(me.vote) : COLORS.fg, img, me: true, x: 0, y: 0 }))]
        : []),
      ...top.map((n, i) =>
        loadImage(n.member ? n.avatar : null).then((img): Dot => {
          const a = i * 2.39996;
          return {
            r: n.member ? 16 + n.strength * 4 : 5 + n.strength * 2,
            color: COLORS.none, // everyone starts grey; votes light them up one by one
            img,
            dim: !n.member,
            username: n.username,
            vote: n.voted ? n.vote : null,
            votedAt: n.votedAt ?? null,
            // Start scattered far outside the frame, then fly in.
            x: Math.cos(a) * (700 + (i % 7) * 60),
            y: Math.sin(a) * (700 + (i % 5) * 60),
          };
        }),
      ),
    ]);

    // The votes, in the order they happened (unknown dates last), spread evenly over the timeline.
    const voters = dots
      .filter((d) => !d.me && d.vote)
      .sort((a, b) => (a.votedAt ?? Infinity) - (b.votedAt ?? Infinity));
    const VOTES = voters.length ? Math.min(MAX_VOTES, Math.max(MIN_VOTES, voters.length * PER_VOTE)) : 0;
    voters.forEach((d, i) => (d.revealAt = INTRO + (VOTES * (i + 0.5)) / voters.length));
    const END = INTRO + VOTES;
    const TOTAL = END + HOLD;

    const target = (d: Dot) => (d.color === COLORS.red ? -190 : d.color === COLORS.green ? 190 : 0);
    const fx = forceX<Dot>(target).strength((d) => (d.color === COLORS.none ? 0.03 : 0.22));
    const sim = forceSimulation(dots)
      .force("x", fx)
      .force("y", forceY<Dot>(0).strength(0.08))
      .force("collide", forceCollide<Dot>((d) => d.r + 2).iterations(3))
      .alphaDecay(0.02)
      .stop();

    const canvas = document.createElement("canvas");
    canvas.width = S;
    canvas.height = S;
    const ctx = canvas.getContext("2d")!;
    const stream = canvas.captureStream(FPS);
    if (sfx?.track) stream.addTrack(sfx.track);
    const rec = new MediaRecorder(stream, { mimeType: mime, videoBitsPerSecond: 6_000_000 });
    const chunks: Blob[] = [];
    rec.ondataavailable = (e) => e.data.size && chunks.push(e.data);
    const stopped = new Promise<void>((resolve) => (rec.onstop = () => resolve()));

    const verdict = bubbleVerdict(tally).label;
    const sparks: Spark[] = [];
    const live = { red: 0, green: 0 }; // counted so far
    const shown = { red: 0, green: 0 }; // what the bar shows, easing toward live
    let scale = 1;
    let shake = 0;
    let last: Dot | null = null;

    const reveal = (d: Dot, t: number) => {
      d.color = sideColor(d.vote);
      live[d.vote!]++;
      sfx?.vote(d.vote!, live.red + live.green - 1);
      last = d;
      // Re-read the side targets and give the layout a nudge so the dot glides over.
      fx.x(target).strength((n) => (n.color === COLORS.none ? 0.03 : 0.22));
      sim.alpha(Math.max(sim.alpha(), 0.6));
      for (let k = 0; k < 14; k++) {
        const a = (k / 14) * Math.PI * 2 + Math.random() * 0.4;
        const v = 4 + Math.random() * 5;
        sparks.push({ x: d.x!, y: d.y!, vx: Math.cos(a) * v, vy: Math.sin(a) * v, color: d.color, born: t });
      }
      shake = 1;
    };

    const draw = (t: number) => {
      ctx.fillStyle = COLORS.bg;
      ctx.fillRect(0, 0, S, S);
      // Fit the bubble into the middle area, easing the zoom so it doesn't jump.
      const box = dots.reduce((m, d) => Math.max(m, Math.abs(d.x!) + d.r, Math.abs(d.y!) + d.r), 1);
      scale += (Math.min(1.6, 360 / box) - scale) * 0.12;
      shake *= 0.85;
      ctx.save();
      ctx.translate(S / 2 + (Math.random() - 0.5) * 10 * shake, S / 2 + 20 + (Math.random() - 0.5) * 10 * shake);
      ctx.scale(scale, scale);
      for (const d of dots) {
        const since = d.revealAt != null && t >= d.revealAt ? t - d.revealAt : null;
        // Pop: grows to 1.6× and settles back over ~0.5s when the vote lands.
        const pop = since != null && since < 0.5 ? 1 + 0.6 * Math.sin((since / 0.5) * Math.PI) : 1;
        const r = d.r * pop;
        ctx.globalAlpha = d.dim ? 0.55 : 1;
        if (since != null && since < 0.9) {
          // Shockwave ring in the side's color.
          const k = since / 0.9;
          ctx.globalAlpha = 1 - k;
          ctx.lineWidth = 6 * (1 - k) + 1;
          ctx.strokeStyle = d.color;
          ctx.beginPath();
          ctx.arc(d.x!, d.y!, d.r + 8 + ease(k) * 110, 0, Math.PI * 2);
          ctx.stroke();
          ctx.globalAlpha = 1;
          // Glow behind the dot.
          ctx.shadowColor = d.color;
          ctx.shadowBlur = 40 * (1 - k);
        }
        ctx.beginPath();
        ctx.arc(d.x!, d.y!, r, 0, Math.PI * 2);
        ctx.fillStyle = COLORS.muted;
        ctx.fill();
        ctx.shadowBlur = 0;
        if (d.img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(d.x!, d.y!, r * 0.84, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(d.img, d.x! - r, d.y! - r, r * 2, r * 2);
          ctx.restore();
        }
        ctx.lineWidth = d.me ? 6 : Math.max(1.5, r * 0.16);
        ctx.strokeStyle = d.color;
        ctx.beginPath();
        ctx.arc(d.x!, d.y!, r - ctx.lineWidth / 2, 0, Math.PI * 2);
        ctx.stroke();
      }
      // Sparks fly out of each new vote and fade.
      for (let i = sparks.length - 1; i >= 0; i--) {
        const p = sparks[i];
        const age = t - p.born;
        if (age > 0.8) {
          sparks.splice(i, 1);
          continue;
        }
        p.x += p.vx;
        p.y += p.vy;
        p.vx *= 0.92;
        p.vy *= 0.92;
        ctx.globalAlpha = 1 - age / 0.8;
        ctx.fillStyle = p.color;
        ctx.beginPath();
        ctx.arc(p.x, p.y, 4 * (1 - age / 0.8) + 1, 0, Math.PI * 2);
        ctx.fill();
      }
      ctx.restore();
      ctx.globalAlpha = 1;

      // Header: title, then the date of the vote being counted (or the verdict at the end).
      ctx.fillStyle = COLORS.fg;
      ctx.font = "800 54px system-ui, sans-serif";
      ctx.textAlign = "center";
      ctx.fillText(title, S / 2, 92);
      const done = t >= END;
      ctx.font = "700 40px system-ui, sans-serif";
      if (done) {
        const k = ease((t - END) / 0.6);
        ctx.globalAlpha = k;
        ctx.save();
        ctx.translate(S / 2, 150);
        ctx.scale(0.7 + 0.3 * k, 0.7 + 0.3 * k);
        ctx.fillText(verdict, 0, 0);
        ctx.restore();
        ctx.globalAlpha = 1;
      } else if (t >= INTRO && last) {
        const when = (last as Dot).votedAt;
        ctx.fillStyle = COLORS.subtle;
        ctx.fillText(when ? `📅 ${day(when)}` : "Contando os votos…", S / 2, 150);
      }

      // Toast for the latest vote: slides up, holds, fades.
      if (last && !done) {
        const d = last as Dot;
        const since = t - d.revealAt!;
        const k = ease(since / 0.25);
        ctx.globalAlpha = Math.min(1, since < 0.25 ? k : 1);
        const y = S - 250 + (1 - k) * 30;
        const label = `@${d.username ?? "alguém"} votou ${d.vote === "red" ? "Vermelho" : "Verde"}`;
        ctx.font = "700 36px system-ui, sans-serif";
        const w = ctx.measureText(label).width + 110;
        ctx.fillStyle = d.color;
        ctx.beginPath();
        ctx.roundRect(S / 2 - w / 2, y - 40, w, 68, 34);
        ctx.fill();
        if (d.img) {
          ctx.save();
          ctx.beginPath();
          ctx.arc(S / 2 - w / 2 + 40, y - 6, 24, 0, Math.PI * 2);
          ctx.clip();
          ctx.drawImage(d.img, S / 2 - w / 2 + 16, y - 30, 48, 48);
          ctx.restore();
        }
        ctx.fillStyle = "#fff";
        ctx.textAlign = "left";
        ctx.fillText(label, S / 2 - w / 2 + 80, y + 7);
        ctx.globalAlpha = 1;
      }

      // Live scoreboard: counts and bar ease toward the votes counted so far.
      shown.red += (live.red - shown.red) * 0.2;
      shown.green += (live.green - shown.green) * 0.2;
      const sum = shown.red + shown.green;
      const l = sum ? (shown.red / sum) * 100 : 50;
      const lp = Math.round(l);
      ctx.globalAlpha = t < INTRO ? ease((t - INTRO + 0.6) / 0.6) : 1;
      ctx.font = "800 60px system-ui, sans-serif";
      ctx.fillStyle = COLORS.red;
      ctx.textAlign = "left";
      ctx.fillText(sum ? `Vermelho ${lp}%` : "Vermelho", 70, S - 140);
      ctx.fillStyle = COLORS.green;
      ctx.textAlign = "right";
      ctx.fillText(sum ? `Verde ${100 - lp}%` : "Verde", S - 70, S - 140);
      ctx.fillStyle = COLORS.muted;
      ctx.fillRect(70, S - 115, S - 140, 22);
      if (sum) {
        ctx.fillStyle = COLORS.red;
        ctx.fillRect(70, S - 115, ((S - 140) * l) / 100, 22);
        ctx.fillStyle = COLORS.green;
        ctx.fillRect(70 + ((S - 140) * l) / 100, S - 115, ((S - 140) * (100 - l)) / 100, 22);
      }
      ctx.globalAlpha = 1;
      ctx.fillStyle = COLORS.subtle;
      ctx.font = "500 30px system-ui, sans-serif";
      ctx.textAlign = "center";
      const counted = Math.round(shown.red + shown.green);
      ctx.fillText(
        done || !voters.length
          ? `${location.host}${me ? sharePath(me.username) : ""} · E a sua bolha?`
          : `${counted} de ${voters.length} votos`,
        S / 2,
        S - 50,
      );
    };

    setState("recording");
    await sfx?.start();
    rec.start();
    sfx?.whoosh(INTRO);
    const total = Math.round(TOTAL * FPS);
    let next = 0;
    for (let f = 0; f < total; f++) {
      const t = f / FPS;
      while (next < voters.length && voters[next].revealAt! <= t) reveal(voters[next++], t);
      // The video only animates the top of the bubble; the final scoreboard is the whole bubble's.
      if (t >= END) Object.assign(live, { red: tally.red, green: tally.green });
      if (f === Math.round(END * FPS))
        sfx?.finale(tally.red === tally.green ? null : tally.red > tally.green ? "red" : "green");
      // Keep the layout moving through the hold so the two sides finish pulling apart.
      if (f === Math.round(END * FPS)) sim.alpha(0.8);
      sim.tick();
      draw(t);
      setProgress(f / total);
      await new Promise((r) => setTimeout(r, 1000 / FPS));
    }
    rec.stop();
    await stopped;
    sfx?.close();
    const still = await new Promise<Blob | null>((r) => canvas.toBlob(r, "image/png"));
    const blob = new Blob(chunks, { type: mime.split(";")[0] });
    const ext = mime.startsWith("video/mp4") ? "mp4" : "webm";
    const name = `${me ? `bolha-${me.username}` : "minha-bolha"}.${ext}`;
    setFile({ url: URL.createObjectURL(blob), name, blob, still, canShare: canShareFile(blob, name) });
    setNote("");
    setState("done");
    // One per bubble: replaces the previous one for this owner.
    void idb("readwrite", (st) => st.put({ fp, blob, still, name } satisfies Cached, owner));
  }

  function download() {
    if (!file) return;
    const a = document.createElement("a");
    a.href = file.url;
    a.download = file.name;
    a.click();
  }

  async function post() {
    if (!file) return;
    if (file.canShare) {
      // Share sheet: pick X and the video is already attached.
      const f = new File([file.blob], file.name, { type: file.blob.type });
      const shared = await navigator.share({ files: [f], text: postText(shareUrl) }).then(() => true, () => false);
      if (shared && shareUrl) trackShare(shareUrl, "native");
      return;
    }
    download();
    if (shareUrl) {
      trackShare(shareUrl);
      window.open(shareUrl, "_blank", "noopener");
    }
    setNote("Vídeo baixado. No post que abriu no X, anexe o vídeo (ou cole a imagem copiada).");
  }

  async function copy() {
    if (!file?.still) return;
    try {
      await navigator.clipboard.write([new ClipboardItem({ "image/png": file.still })]);
      setNote("Imagem copiada! Cole (Ctrl/⌘+V) no post do X.");
    } catch {
      setNote("Não deu para copiar neste navegador. Use Baixar vídeo.");
    }
  }

  return (
    <div data-tour="bubble-video" className="mt-3 flex flex-wrap items-center gap-2 text-sm">
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
            <button onClick={post} className="rounded-full bg-fg px-3 py-1.5 text-bg">
              𝕏 Postar no X
            </button>
            {file.still && typeof ClipboardItem !== "undefined" && (
              <button onClick={copy} className="rounded-full border border-line px-3 py-1.5">
                📋 Copiar imagem
              </button>
            )}
            <button onClick={download} className="rounded-full border border-line px-3 py-1.5">
              ⬇️ Baixar vídeo
            </button>
            <button
              onClick={() => {
                URL.revokeObjectURL(file.url);
                setFile(null);
                setNote("");
                void record();
              }}
              className="text-xs text-subtle underline"
            >
              Gerar de novo
            </button>
            <span className="max-w-52 text-xs text-subtle" aria-live="polite">
              {note ||
                (file.canShare
                  ? "Toque em Postar no X e escolha o X: o vídeo já vai anexado."
                  : file.name.endsWith(".webm")
                    ? "Este navegador gravou em WebM, que o X não aceita. Para postar o vídeo, gere no Chrome ou Safari atualizado."
                    : "Postar no X baixa o vídeo e abre o post com o seu link: é só anexar.")}
            </span>
          </div>
        </>
      )}
    </div>
  );
}
