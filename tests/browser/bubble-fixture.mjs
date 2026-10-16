import { spawn } from "node:child_process";
import { mkdir, mkdtemp, rm, writeFile } from "node:fs/promises";
import { createServer } from "node:net";
import { join } from "node:path";
import { createRequire } from "node:module";
import { fileURLToPath } from "node:url";
import { chromium } from "playwright";

const require = createRequire(import.meta.url);
const root = fileURLToPath(new URL("../../", import.meta.url));

// Render the real component in an isolated Next app, without database or X credentials.
export async function withBubbleFixture(run) {
  await mkdir(join(root, ".next"), { recursive: true });
  const fixture = await mkdtemp(join(root, ".next/bubble-browser-"));
  await mkdir(join(fixture, "app"));
  await writeFile(join(fixture, "package.json"), JSON.stringify({ private: true }));
  await writeFile(join(fixture, "tsconfig.json"), JSON.stringify({
    extends: "../../tsconfig.json",
    compilerOptions: { paths: { "@/*": ["../../src/*"] } },
  }));
  await writeFile(join(fixture, "next.config.mjs"), `export default {
    agentRules: false,
    turbopack: { root: ${JSON.stringify(root)}, rules: { "*.css": { loaders: ["@tailwindcss/turbopack"], as: "*.css" } } }
  };`);
  await writeFile(join(fixture, "app/globals.css"), '@import "../../../src/app/globals.css";\n@source "../../../src";\n@source "./page.tsx";\n');
  await writeFile(join(fixture, "app/layout.tsx"), `import "./globals.css";
    export default function Layout({ children }: { children: React.ReactNode }) {
      return <html lang="pt-BR"><body>{children}</body></html>;
    }`);
  await writeFile(join(fixture, "app/page.tsx"), `import { Bubble } from "@/components/Bubble";
    const nodes = Array.from({ length: 30 }, (_, i) => ({
      id: String(i), name: i === 0 ? "Ana Silva" : i === 1 ? null : "Pessoa " + i,
      username: i === 1 ? null : "pessoa" + i, avatar: null, member: i % 3 !== 1,
      vote: i % 3 === 0 ? "red" as const : i % 3 === 1 ? null : "green" as const,
      voted: i % 3 !== 1, following: true, follower: i % 2 === 0, invite: false, strength: 2,
    }));
    export default function Page() {
      return <main className="mx-auto max-w-3xl p-4">
        <input aria-label="Outside input" />
        <Bubble me={{ id: "owner", name: "Dona da bolha", username: "owner", avatar: null, vote: "green" }}
          nodes={nodes} shareBase="https://example.com" />
        <div className="h-screen" />
      </main>;
    }`);

  const portServer = createServer();
  await new Promise((resolve) => portServer.listen(0, "127.0.0.1", resolve));
  const { port } = portServer.address();
  await new Promise((resolve, reject) => portServer.close((error) => error ? reject(error) : resolve()));
  const server = spawn(process.execPath, [require.resolve("next/dist/bin/next"), "dev", fixture, "--hostname", "127.0.0.1", "--port", String(port)], {
    cwd: root, env: { ...process.env, NEXT_TELEMETRY_DISABLED: "1" }, stdio: ["ignore", "pipe", "pipe"],
  });
  const logs = [];
  const ready = new Promise((resolve, reject) => {
    const timer = setTimeout(() => reject(new Error("Fixture server did not start")), 30_000);
    server.once("error", reject);
    server.once("exit", () => { clearTimeout(timer); reject(new Error("Fixture server exited")); });
    server.stdout.on("data", (data) => {
      logs.push(String(data));
      if (String(data).includes("Ready in")) { clearTimeout(timer); resolve(); }
    });
  });
  server.stderr.on("data", (data) => logs.push(String(data)));
  const base = `http://127.0.0.1:${port}`;
  const resources = { browser: null };
  try {
    await ready;
    const browser = await chromium.launch({
      channel: process.env.PLAYWRIGHT_CHANNEL,
      executablePath: process.env.PLAYWRIGHT_EXECUTABLE_PATH,
    });
    resources.browser = browser;
    const page = await browser.newPage({ viewport: { width: 1100, height: 900 }, reducedMotion: "reduce" });
    await page.route("**/api/live", (route) => route.fulfill({ json: { watching: 0, online: [], people: [] } }));
    const errors = [];
    page.on("pageerror", (error) => errors.push(error.message));
    await page.goto(base, { waitUntil: "networkidle", timeout: 60_000 });
    await page.locator(".bubble-node").nth(1).waitFor();
    await run({ page, browser, base });
    if (errors.length) throw new Error(errors.join("\n"));
  } catch (error) {
    console.error(logs.join(""));
    throw error;
  } finally {
    await resources.browser?.close();
    const stopped = new Promise((resolve) => server.once("exit", resolve));
    server.kill("SIGTERM");
    if (server.exitCode === null) await stopped;
    await rm(fixture, { recursive: true, force: true });
  }
}
