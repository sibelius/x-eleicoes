"use client";

import { useEffect, useRef, useState } from "react";
import { ADS } from "@/lib/ads";

const CAMPAIGN = "minhabolha2026";
const EVERY_MS = 5000;
const SEEN_MS = 1000; // an ad counts as seen after this long on screen

// Ad events wait here and go out in one request (or a beacon when the page is closing).
const queue: { ad: string; placement: string; kind: "view" | "click" }[] = [];
let flushTimer: ReturnType<typeof setTimeout> | undefined;

function flush(beacon = false) {
  clearTimeout(flushTimer);
  if (!queue.length) return;
  const body = JSON.stringify({ events: queue.splice(0, 20) });
  if (beacon && navigator.sendBeacon) navigator.sendBeacon("/api/ad", new Blob([body], { type: "application/json" }));
  else fetch("/api/ad", { method: "POST", headers: { "Content-Type": "application/json" }, body, keepalive: true }).catch(() => {});
  if (queue.length) flush(beacon);
}

function trackAd(ad: string, placement: string, kind: "view" | "click") {
  queue.push({ ad, placement, kind });
  if (kind === "click") return flush(true);
  clearTimeout(flushTimer);
  flushTimer = setTimeout(flush, 3000);
}

function adUrl(href: string, placement: string) {
  const u = new URL(href);
  u.searchParams.set("utm_source", "minhabolha");
  u.searchParams.set("utm_medium", "display");
  u.searchParams.set("utm_campaign", CAMPAIGN);
  u.searchParams.set("utm_content", placement);
  return u.toString();
}

/** Swipeable ad carousel with prev/next arrows: ads in a random order per page view, advancing every few seconds, paused while hovered or touched. */
export function AdCarousel({ placement }: { placement: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const order = useRef<number[]>([]); // the visiting order, shuffled per page view
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const seen = useRef(new Set<string>());

  const go = (i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "instant" });
  };

  /** Next (or previous) ad in the shuffled order. */
  const step = (d: number) => {
    const o = order.current.length ? order.current : ADS.map((_, i) => i);
    const at = Math.max(0, o.indexOf(index));
    go(o[(at + d + o.length) % o.length]);
  };

  // Random order per page view: every brand gets to go first, even for people who leave fast.
  useEffect(() => {
    const o = ADS.map((_, i) => i);
    for (let i = o.length - 1; i > 0; i--) {
      const j = Math.floor(Math.random() * (i + 1));
      [o[i], o[j]] = [o[j], o[i]];
    }
    order.current = o;
    go(o[0], false);
  }, []);

  // Is the carousel at least half visible?
  useEffect(() => {
    const el = track.current;
    if (!el) return;
    const io = new IntersectionObserver(([e]) => setOnScreen(e.isIntersecting), { threshold: 0.5 });
    io.observe(el);
    const bye = () => flush(true);
    window.addEventListener("pagehide", bye);
    return () => {
      io.disconnect();
      window.removeEventListener("pagehide", bye);
    };
  }, []);

  // One impression per ad per page view, once it has been on screen for a moment.
  useEffect(() => {
    const ad = ADS[index]?.name;
    if (!ad || !onScreen || seen.current.has(ad)) return;
    const t = setTimeout(() => {
      if (document.visibilityState !== "visible") return;
      seen.current.add(ad);
      trackAd(ad, placement, "view");
    }, SEEN_MS);
    return () => clearTimeout(t);
  }, [index, onScreen, placement]);

  useEffect(() => {
    if (paused) return;
    const t = setInterval(() => {
      if (document.visibilityState === "visible") step(1);
    }, EVERY_MS);
    return () => clearInterval(t);
  }, [index, paused]);

  const onScroll = () => {
    const el = track.current;
    if (el) setIndex(Math.round(el.scrollLeft / el.clientWidth));
  };

  return (
    <div
      onMouseEnter={() => setPaused(true)}
      onMouseLeave={() => setPaused(false)}
      onTouchStart={() => setPaused(true)}
    >
      <div className="group relative">
        <div
          ref={track}
          onScroll={onScroll}
          className="flex snap-x snap-mandatory overflow-x-auto rounded-xl [scrollbar-width:none] [&::-webkit-scrollbar]:hidden"
        >
          {ADS.map((ad, i) => (
            <a
              key={ad.name}
              href={adUrl(ad.href, placement)}
              target="_blank"
              rel="noopener sponsored"
              onClick={() => trackAd(ad.name, placement, "click")}
              className="block w-full shrink-0 snap-center"
              aria-hidden={i !== index}
              tabIndex={i === index ? 0 : -1}
            >
              <img src={ad.image} alt={ad.alt} width={1200} height={630} className="h-auto w-full" draggable={false} loading="lazy" />
            </a>
          ))}
        </div>
        {[
          { label: "Anúncio anterior", step: -1, side: "left-2", path: "M15 18l-6-6 6-6" },
          { label: "Próximo anúncio", step: 1, side: "right-2", path: "M9 18l6-6-6-6" },
        ].map((b) => (
          <button
            key={b.step}
            type="button"
            onClick={() => step(b.step)}
            aria-label={b.label}
            className={`absolute top-1/2 ${b.side} grid size-8 -translate-y-1/2 place-items-center rounded-full bg-black/45 text-white backdrop-blur-sm transition-opacity hover:bg-black/65 focus-visible:opacity-100 [@media(hover:hover)]:opacity-0 [@media(hover:hover)]:group-hover:opacity-100`}
          >
            <svg viewBox="0 0 24 24" className="size-4" fill="none" stroke="currentColor" strokeWidth={2.5} strokeLinecap="round" strokeLinejoin="round" aria-hidden>
              <path d={b.path} />
            </svg>
          </button>
        ))}
      </div>
      <div className="mt-2 flex justify-center gap-1.5">
        {ADS.map((ad, i) => (
          <button
            key={ad.name}
            type="button"
            onClick={() => go(i)}
            aria-label={`Anúncio ${i + 1}: ${ad.name}`}
            aria-current={i === index}
            className={`h-1.5 rounded-full transition-all ${i === index ? "w-5 bg-subtle" : "w-1.5 bg-line"}`}
          />
        ))}
      </div>
    </div>
  );
}
