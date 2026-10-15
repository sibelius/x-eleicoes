// Opens every public page in a real browser and fails on any server error (e.g. HANGING_PROMISE_REJECTION).
// Usage: pnpm smoke [base-url]   (default http://localhost:3000)
import { chromium } from "playwright";

const base = (process.argv[2] ?? "http://localhost:3000").replace(/\/$/, "");
const PAGES = ["/", "/r", "/ranking", "/mapa", "/ao-vivo", "/virada", "/grafo", "/centro", "/convites", "/polarizacao", "/apoie", "/privacidade", "/c", "/r/sseraphini", "/w/sseraphini"];
const BROKEN = /This page couldn.t load|HANGING_PROMISE_REJECTION|Application error|Internal Server Error/;

const browser = await chromium.launch();
const page = await browser.newPage();
let failed = 0;
for (const path of PAGES) {
  const res = await page.goto(base + path, { waitUntil: "load" }).catch((e) => ({ status: () => 0, err: e }));
  await page.waitForTimeout(2500); // let streamed sections arrive
  const text = await page.evaluate(() => document.body?.innerText ?? "").catch(() => "");
  const status = res?.status?.() ?? 0;
  const ok = status > 0 && status < 500 && !BROKEN.test(text);
  if (!ok) failed++;
  console.log(`${ok ? "ok  " : "FAIL"} ${status} ${path}${ok ? "" : `  ${text.slice(0, 120).replace(/\n/g, " ")}`}`);
}
await browser.close();
if (failed) {
  console.error(`${failed} page(s) broken`);
  process.exit(1);
}
