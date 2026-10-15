import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { SIDE, pct, sharePath } from "./links";
import { getShare } from "./network";

export function pushPublicKey() {
  return process.env.VAPID_PUBLIC_KEY ?? null;
}

let configured = false;
function ready() {
  const pub = process.env.VAPID_PUBLIC_KEY;
  const priv = process.env.VAPID_PRIVATE_KEY;
  if (!pub || !priv) return false;
  if (!configured) {
    webpush.setVapidDetails("mailto:sibelius@woovi.com", pub, priv);
    configured = true;
  }
  return true;
}

type Payload = { title: string; body: string; url: string };

/** Push to the given browser subscriptions; dead ones (404/410) are removed. */
async function send(rows: Record<string, unknown>[], payload: Payload) {
  const client = await db();
  let sent = 0;
  await Promise.all(
    rows.map(async (row) => {
      const endpoint = String(row.endpoint);
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh: String(row.p256dh), auth: String(row.auth) } },
          JSON.stringify(payload),
        );
        sent++;
      } catch (e) {
        const status = (e as { statusCode?: number }).statusCode;
        if (status === 404 || status === 410) {
          await client.execute({ sql: "DELETE FROM push_subs WHERE endpoint = ?", args: [endpoint] });
        } else {
          console.error("[push] send failed", status, e);
        }
      }
    }),
  );
  return sent;
}

async function sendTo(uid: string, payload: Payload) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT endpoint, p256dh, auth FROM push_subs WHERE uid = ?", args: [uid] });
  return send(r.rows, payload);
}

/** Tell every member whose bubble includes the newcomer (follows, followed by, or invite link). */
export async function notifyNetworkJoined(newcomer: { id: string; username: string }, url: string) {
  if (!ready()) return 0;
  const client = await db();
  const r = await client.execute({
    sql: `WITH rel AS (
            SELECT src AS id FROM edges WHERE dst = :uid
            UNION SELECT dst FROM edges WHERE src = :uid
            UNION SELECT invited_by FROM users WHERE id = :uid AND invited_by IS NOT NULL
          )
          SELECT s.endpoint, s.p256dh, s.auth FROM push_subs s
          JOIN rel ON rel.id = s.uid WHERE s.uid <> :uid`,
    args: { uid: newcomer.id },
  });
  return send(r.rows, {
    title: "Alguém da sua rede entrou",
    body: `@${newcomer.username} entrou na Minha Bolha. Veja como sua bolha mudou.`,
    url,
  });
}

/**
 * Tell the voter's network (follows, followed by, invite link) which side they picked, or that they
 * switched sides (`from` = their previous vote). At most one per voter every 30 minutes.
 */
export async function notifyNetworkVoted(voter: string, vote: "red" | "green", origin: string, from?: "red" | "green" | null) {
  if (!ready()) return 0;
  const client = await db();
  const now = Date.now();
  const claim = await client.execute({
    sql: `INSERT INTO vote_pushes (uid, at) VALUES (?, ?)
          ON CONFLICT(uid) DO UPDATE SET at = excluded.at WHERE vote_pushes.at < ?`,
    args: [voter, now, now - 30 * 60 * 1000],
  });
  if (!claim.rowsAffected) return 0;
  const [who, subs] = await client.batch(
    [
      { sql: "SELECT username FROM users WHERE id = ?", args: [voter] },
      {
        sql: `WITH rel AS (
                SELECT src AS id FROM edges WHERE dst = :uid
                UNION SELECT dst FROM edges WHERE src = :uid
                UNION SELECT invited_by FROM users WHERE id = :uid AND invited_by IS NOT NULL
                UNION SELECT id FROM users WHERE invited_by = :uid
              )
              SELECT s.endpoint, s.p256dh, s.auth FROM push_subs s
              JOIN rel ON rel.id = s.uid WHERE s.uid <> :uid`,
        args: { uid: voter },
      },
    ],
    "read",
  );
  const username = who.rows[0]?.username as string | undefined;
  if (!username) return 0;
  const switched = from && from !== vote;
  return send(subs.rows, {
    title: switched
      ? `@${username} trocou de lado ${from === "red" ? "🔴 → 🟢" : "🟢 → 🔴"}`
      : vote === "red"
        ? "Alguém da sua rede votou 🔴"
        : "Alguém da sua rede votou 🟢",
    body: switched
      ? `@${username} saiu do ${SIDE[from]} e foi pro ${SIDE[vote]}. Veja como sua bolha mudou.`
      : `@${username} escolheu o ${SIDE[vote]}. Veja como sua bolha mudou.`,
    url: `${origin}${sharePath(username)}`,
  });
}

/** "N people saw your bubble today": at most one push per owner every 30 minutes. */
export async function notifyBubbleViewed(uid: string, origin: string) {
  if (!ready()) return;
  const client = await db();
  const now = Date.now();
  // Claim the slot atomically so concurrent views don't both send.
  const claim = await client.execute({
    sql: `INSERT INTO view_pushes (uid, at) VALUES (?, ?)
          ON CONFLICT(uid) DO UPDATE SET at = excluded.at WHERE view_pushes.at < ?`,
    args: [uid, now, now - 30 * 60 * 1000],
  });
  if (!claim.rowsAffected) return;
  const day = new Date().toISOString().slice(0, 10);
  const [today, total] = await client.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM views WHERE uid = ? AND day = ?", args: [uid, day] },
      { sql: "SELECT COUNT(DISTINCT visitor) AS n FROM views WHERE uid = ?", args: [uid] },
    ],
    "read",
  );
  const n = Number(today.rows[0].n);
  await sendTo(uid, {
    title: "Estão vendo a sua bolha 👀",
    body: `${n} ${n === 1 ? "pessoa viu" : "pessoas viram"} sua bolha hoje (${Number(total.rows[0].n)} no total).`,
    url: `${origin}/app`,
  });
}

/** Daily: tell each subscriber how their bubble changed since the last summary (skipped when nothing did). */
export async function sendDailySummaries(origin: string) {
  if (!ready()) return { users: 0, sent: 0 };
  const client = await db();
  const subs = await client.execute(
    `SELECT DISTINCT s.uid, t.red, t.green, t.members FROM push_subs s LEFT JOIN tally_snapshots t ON t.uid = s.uid`,
  );
  let sent = 0;
  for (const row of subs.rows) {
    const uid = String(row.uid);
    const share = await getShare(uid);
    if (!share) continue;
    const now = { red: share.tally.red, green: share.tally.green, members: share.members };
    await client.execute({
      sql: `INSERT INTO tally_snapshots (uid, red, green, members, at) VALUES (?, ?, ?, ?, ?)
            ON CONFLICT(uid) DO UPDATE SET red = excluded.red, green = excluded.green,
              members = excluded.members, at = excluded.at`,
      args: [uid, now.red, now.green, now.members, Date.now()],
    });
    if (row.red == null) continue; // first snapshot: nothing to compare with yet
    const dl = now.red - Number(row.red);
    const db_ = now.green - Number(row.green);
    const dm = now.members - Number(row.members);
    if (!dl && !db_ && !dm) continue;
    const parts = [
      dm > 0 && `+${dm} ${dm === 1 ? "pessoa entrou" : "pessoas entraram"}`,
      dl && `${dl > 0 ? "+" : ""}${dl} Vermelho`,
      db_ && `${db_ > 0 ? "+" : ""}${db_} Verde`,
    ].filter(Boolean);
    const l = pct(now.red, now.red + now.green);
    sent += await sendTo(uid, {
      title: "Sua bolha hoje 🔴🟢",
      body: `${parts.join(" · ")}. Agora: ${l}% Vermelho × ${now.red + now.green ? 100 - l : 0}% Verde. Compartilhe!`,
      url: `${origin}/app`,
    });
  }
  return { users: subs.rows.length, sent };
}
