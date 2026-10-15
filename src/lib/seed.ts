import "server-only";
import { db } from "./db";

// Fake network so the app can be explored locally without X credentials.
export const DEV_UID = "dev_me";

const FIRST = ["Ana", "Bruno", "Carla", "Diego", "Elisa", "Fábio", "Gabi", "Heitor", "Iara", "João", "Karen", "Lucas", "Marina", "Nando", "Olívia", "Paulo", "Quésia", "Rafa", "Sofia", "Tiago", "Ursula", "Vitor", "Wesley", "Xênia", "Yuri", "Zé"];
const LAST = ["Silva", "Souza", "Lima", "Costa", "Rocha", "Alves", "Melo", "Dias", "Nunes", "Pires"];

function rng(seed: number) {
  return () => ((seed = (seed * 1664525 + 1013904223) % 2 ** 32) / 2 ** 32);
}

export async function ensureDevSeed() {
  const client = await db();
  const exists = await client.execute({ sql: "SELECT 1 FROM users WHERE id = ?", args: [DEV_UID] });
  if (exists.rows.length) return;
  const rand = rng(42);
  const now = Date.now();
  const stmts: { sql: string; args: (string | number | null)[] }[] = [
    {
      sql: "INSERT OR IGNORE INTO users (id, username, name, avatar, created_at) VALUES (?, ?, ?, NULL, ?)",
      args: [DEV_UID, "voce_dev", "Você (dev)", now],
    },
  ];
  for (let i = 0; i < 48; i++) {
    const first = FIRST[i % FIRST.length];
    const name = `${first} ${LAST[Math.floor(rand() * LAST.length)]}`;
    const r = rand();
    const vote = r < 0.45 ? "red" : r < 0.85 ? "green" : null;
    const vis = rand() < 0.15 ? "private" : rand() < 0.3 ? "public" : "network";
    const id = `seed_${i}`;
    stmts.push({
      sql: `INSERT OR IGNORE INTO users (id, username, name, avatar, vote, visibility, voted_at, invited_by, created_at)
            VALUES (?, ?, ?, NULL, ?, ?, ?, ?, ?)`,
      args: [id, `${first.toLowerCase().normalize("NFD").replace(/[^a-z]/g, "")}${i}`, name, vote, vis, vote ? now : null, i < 4 ? DEV_UID : null, now],
    });
    const rel = rand();
    if (rel < 0.75) stmts.push({ sql: "INSERT OR IGNORE INTO edges VALUES (?, ?)", args: [DEV_UID, id] });
    if (rel > 0.35) stmts.push({ sql: "INSERT OR IGNORE INTO edges VALUES (?, ?)", args: [id, DEV_UID] });
  }
  // Accounts from the "archive" that have not joined yet — some with known profiles.
  for (let i = 0; i < 140; i++) {
    const id = String(1_000_000 + i);
    stmts.push({ sql: "INSERT OR IGNORE INTO edges VALUES (?, ?)", args: rand() < 0.6 ? [DEV_UID, id] : [id, DEV_UID] });
    if (i < 30) {
      stmts.push({
        sql: "INSERT OR IGNORE INTO profiles (id, username, name, avatar) VALUES (?, ?, ?, NULL)",
        args: [id, `amigo_${i}`, `Amigo ${i}`],
      });
    }
  }
  await client.batch(stmts, "write");
}
