import type { Db, Stmt } from "@/lib/sql";

// A small, deterministic network: 24 members (numeric X ids), 120 known non-member profiles,
// follows among them, invites, picks and switches, views, messages, pushes, UTM and ad stats.

export const NOW = Date.UTC(2026, 9, 15, 15, 0); // Thu Oct 15 2026, 12:00 in Brasília
export const DAY = 86_400_000;

export const MEMBERS = Array.from({ length: 24 }, (_, i) => ({
  id: String(1000 + i),
  username: `member${i}`,
  name: `Member ${i}`,
  // A few without a side; the rest split 1 red : 2 green.
  vote: i % 7 === 6 ? null : i % 3 === 0 ? "red" : "green",
  invitedBy: i > 0 && i % 4 !== 0 ? String(1000 + Math.floor(i / 4) * 4) : null,
  createdAt: NOW - (30 - i) * DAY / 3,
}));
export const PROFILES = Array.from({ length: 120 }, (_, i) => ({ id: String(5000 + i), username: `person${i}`, name: `Person ${i}` }));

function rng(seed: number) {
  return () => ((seed = (seed * 16807) % 2147483647) - 1) / 2147483646;
}

export function fixture(): Stmt[] {
  const rand = rng(42);
  const s: Stmt[] = [];
  for (const m of MEMBERS) {
    s.push({
      sql: `INSERT INTO users (id, username, name, avatar, vote, visibility, voted_at, invited_by, created_at)
            VALUES (?, ?, ?, ?, ?, 'public', ?, ?, ?)`,
      args: [m.id, m.username, m.name, `https://pbs.twimg.com/profile_images/${m.id}/a_normal.jpg`, m.vote, m.vote ? m.createdAt + 3600_000 : null, m.invitedBy, m.createdAt],
    });
  }
  for (const p of PROFILES) {
    s.push({ sql: "INSERT INTO profiles (id, username, name, avatar) VALUES (?, ?, ?, NULL)", args: [p.id, p.username, p.name] });
  }
  const edges = new Set<string>();
  const edge = (a: string, b: string) => {
    if (a !== b) edges.add(`${a}>${b}`);
  };
  for (const m of MEMBERS) {
    // Members follow each other mostly within their side, plus a share of the profiles.
    for (const o of MEMBERS) if (rand() < (o.vote === m.vote ? 0.35 : 0.08)) edge(m.id, o.id);
    for (const p of PROFILES) {
      const r = rand();
      if (r < 0.12) edge(m.id, p.id);
      else if (r < 0.2) edge(p.id, m.id);
    }
  }
  for (const e of edges) {
    const [src, dst] = e.split(">");
    s.push({ sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)", args: [src, dst] });
  }
  // A popular account everyone follows.
  for (const m of MEMBERS) s.push({ sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)", args: [m.id, "5000"] });
  // Picks and a few switches.
  MEMBERS.forEach((m, i) => {
    if (!m.vote) return;
    if (i % 5 === 1) {
      const other = m.vote === "red" ? "green" : "red";
      s.push({ sql: "INSERT INTO vote_changes (uid, from_vote, to_vote, at) VALUES (?, NULL, ?, ?)", args: [m.id, other, m.createdAt + 1000] });
      s.push({ sql: "INSERT INTO vote_changes (uid, from_vote, to_vote, at) VALUES (?, ?, ?, ?)", args: [m.id, other, m.vote, m.createdAt + 3600_000] });
    } else {
      s.push({ sql: "INSERT INTO vote_changes (uid, from_vote, to_vote, at) VALUES (?, NULL, ?, ?)", args: [m.id, m.vote, m.createdAt + 3600_000] });
    }
  });
  // Views: the site and some bubbles, over a few days.
  for (let d = 0; d < 5; d++) {
    const day = new Date(NOW - d * DAY).toISOString().slice(0, 10);
    for (let v = 0; v < 12; v++) {
      s.push({ sql: "INSERT OR IGNORE INTO views (uid, visitor, day) VALUES ('_site', ?, ?)", args: [v % 3 ? `vis${v}` : `u:${1000 + v}`, day] });
      s.push({ sql: "INSERT OR IGNORE INTO views (uid, visitor, day) VALUES (?, ?, ?)", args: [String(1000 + (v % 6)), `vis${v}`, day] });
    }
  }
  // Online now: some members and visitors.
  for (let i = 0; i < 6; i++) s.push({ sql: "INSERT INTO presence (visitor, at) VALUES (?, ?)", args: [i < 4 ? `u:${1000 + i * 3}` : `anon${i}`, NOW - i * 10_000] });
  // Invite link opens, guesses.
  s.push({ sql: "INSERT INTO invite_opens (ref, visitor, day) VALUES ('1000', 'vis1', '2026-10-15'), ('1000', 'vis2', '2026-10-15'), ('1004', 'vis1', '2026-10-14')" });
  s.push({ sql: "INSERT INTO guesses (bubble, visitor, guess, actual, at) VALUES ('1001', 'vis1', 60, 70, ?), ('1001', 'vis2', 80, 70, ?)", args: [NOW - 5000, NOW - 4000] });
  // Messages between members.
  s.push({
    sql: `INSERT INTO messages (id, at, from_uid, to_uid, kind, preset, body, side, via, live_at, seen_at)
          VALUES (1, ?, '1000', '1001', 'ask', 'vem', 'Vem pro Vermelho! 🙏', 'red', 'push', NULL, NULL),
                 (2, ?, '1001', '1000', 'reply', 'pensar', 'Vou pensar 🤔', 'green', 'live', ?, ?),
                 (3, ?, '1003', '1002', 'ask', 'acho', 'Eu acho que no fundo você é Vermelho 👀', 'red', 'live', NULL, NULL)`,
    args: [NOW - 50_000, NOW - 40_000, NOW - 39_000, NOW - 30_000, NOW - 20_000],
  });
  s.push({
    sql: `INSERT INTO push_log (id, at, uid, campaign, title, body, url, devices, delivered)
          VALUES (1, ?, '1000', 'invite', 'T1', 'B1', 'https://x/app', 2, 1), (2, ?, '1001', 'ask', 'T2', 'B2', 'https://x/mensagens', 1, 0),
                 (3, ?, '1000', 'daily', 'T3', 'B3', 'https://x/app', 1, 1)`,
    args: [NOW - 3 * DAY, NOW - DAY, NOW - 1000],
  });
  s.push({
    sql: `INSERT INTO utm_events (at, day, kind, visitor, source, medium, campaign, content, path)
          VALUES (?, '2026-10-14', 'visit', 'vis1', 'x', 'social', 'bubble', 'own', '/r/member1'),
                 (?, '2026-10-14', 'signup', 'u:1001', 'x', 'social', 'bubble', 'own', '/r/member1'),
                 (?, '2026-10-15', 'visit', 'vis2', 'push', 'webpush', 'daily', '', '/app')`,
    args: [NOW - DAY, NOW - DAY + 1000, NOW - 1000],
  });
  s.push({
    sql: `INSERT INTO ad_stats (ad, placement, visitor, day, views, clicks)
          VALUES ('Hodle', 'home', 'vis1', '2026-10-15', 3, 1), ('Hodle', 'app', 'vis2', '2026-10-14', 2, 0), ('Rica', 'ranking', 'vis1', '2026-10-15', 1, 0)`,
  });
  s.push({ sql: "INSERT INTO shares (at, sharer, kind, targets, via) VALUES (?, 'u:1000', 'bubble', '1000', 'x')", args: [NOW - 2000] });
  s.push({ sql: "INSERT INTO push_subs (endpoint, uid, p256dh, auth, created_at) VALUES ('https://push/1', '1000', 'k', 'a', ?)", args: [NOW - DAY] });
  s.push({ sql: "INSERT INTO ask_mutes (uid, at) VALUES ('1005', ?)", args: [NOW - DAY] });
  return s;
}

export async function seed(db: Db) {
  const stmts = fixture();
  for (let i = 0; i < stmts.length; i += 200) await db.batch(stmts.slice(i, i + 200), "write");
}
