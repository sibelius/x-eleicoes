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

/** Swipeable ad carousel: starts on a random ad, advances every few seconds, pauses while hovered or touched. */
export function AdCarousel({ placement }: { placement: string }) {
  const track = useRef<HTMLDivElement>(null);
  const [index, setIndex] = useState(0);
  const [paused, setPaused] = useState(false);
  const [onScreen, setOnScreen] = useState(false);
  const seen = useRef(new Set<string>());

  const go = (i: number, smooth = true) => {
    const el = track.current;
    if (!el) return;
    el.scrollTo({ left: i * el.clientWidth, behavior: smooth ? "smooth" : "instant" });
  };

  // Random first ad so every brand gets seen, even by people who leave fast.
  useEffect(() => {
    go(Math.floor(Math.random() * ADS.length), false);
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
      if (document.visibilityState === "visible") go((index + 1) % ADS.length);
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
