import { fileURLToPath } from "node:url";
import { defineConfig } from "vitest/config";

const at = (p: string) => fileURLToPath(new URL(p, import.meta.url));

export default defineConfig({
  test: {
    include: ["tests/**/*.test.ts"],
    testTimeout: 60_000,
    hookTimeout: 120_000,
    // One file at a time: each spins up a Postgres (PGlite) and a SQLite database.
    fileParallelism: false,
  },
  resolve: {
    alias: {
      "@": at("./src"),
      "server-only": at("./tests/stubs/empty.ts"),
      "next/cache": at("./tests/stubs/next-cache.ts"),
    },
  },
});
