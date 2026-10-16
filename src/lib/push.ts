import "server-only";
import webpush from "web-push";
import { db } from "./db";
import { newId } from "./sql";
import { BADGE_STEPS, SIDE, daysToBigDay, pct, sharePath, withUtm } from "./links";
import { getShare } from "./network";
import type { Racer } from "./race";
import { allStreaks, getDailyQuestion } from "./daily";

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

/** `campaign` names the notification in the UTM tags its link carries (utm_source=push). */
export type Payload = { title: string; body: string; url: string; campaign: string };

/** Push to the given browser subscriptions (rows carry uid); dead ones (404/410) are removed; each member's push is logged. */
async function send(rows: Record<string, unknown>[], payload: Payload) {
  const client = await db();
  let sent = 0;
  const perUser = new Map<string, { devices: number; delivered: number }>();
  await Promise.all(
    rows.map(async (row) => {
      const endpoint = String(row.endpoint);
      const u = perUser.get(String(row.uid)) ?? perUser.set(String(row.uid), { devices: 0, delivered: 0 }).get(String(row.uid))!;
      u.devices++;
      try {
        await webpush.sendNotification(
          { endpoint, keys: { p256dh: String(row.p256dh), auth: String(row.auth) } },
          JSON.stringify({ ...payload, url: withUtm(payload.url, payload.campaign, { source: "push", medium: "webpush" }) }),
        );
        sent++;
        u.delivered++;
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
  if (perUser.size) {
    const at = Date.now();
    await client
      .batch(
        [...perUser].map(([uid, u]) => ({
          sql: "INSERT INTO push_log (id, at, uid, campaign, title, body, url, devices, delivered) VALUES (?, ?, ?, ?, ?, ?, ?, ?, ?)",
          args: [newId(), at, uid, payload.campaign, payload.title, payload.body, payload.url, u.devices, u.delivered],
        })),
        "write",
      )
      .catch((e) => console.error("[push] log", e));
  }
  return sent;
}

export async function sendTo(uid: string, payload: Payload) {
  const client = await db();
  const r = await client.execute({ sql: "SELECT uid, endpoint, p256dh, auth FROM push_subs WHERE uid = ?", args: [uid] });
  return send(r.rows, payload);
}

/** Tell every member whose bubble includes the newcomer (follows or followed by; the inviter gets their own push). */
export async function notifyNetworkJoined(newcomer: { id: string; username: string }, url: string) {
  if (!ready()) return 0;
  const client = await db();
  const r = await client.execute({
    sql: `WITH rel AS (
            SELECT src AS id FROM edges WHERE dst = :uid
            UNION SELECT dst FROM edges WHERE src = :uid
          )
          SELECT s.uid, s.endpoint, s.p256dh, s.auth FROM push_subs s
          JOIN rel ON rel.id = s.uid
          WHERE s.uid <> :uid AND s.uid NOT IN (SELECT invited_by FROM users WHERE id = :uid AND invited_by IS NOT NULL)`,
    args: { uid: newcomer.id },
  });
  return send(r.rows, {
    title: "Alguém da sua rede entrou",
    body: `@${newcomer.username} entrou na Minha Bolha. Veja como sua bolha mudou.`,
    url,
    campaign: "joined",
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
              SELECT s.uid, s.endpoint, s.p256dh, s.auth FROM push_subs s
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
    campaign: switched ? "switched" : "voted",
  });
}

/** Right when someone signs up through an invite link: tell the inviter, with their running total. */
export async function notifyInviteJoined(inviter: string, newcomer: { username: string }, origin: string) {
  if (!ready()) return 0;
  const client = await db();
  const r = await client.execute({ sql: "SELECT COUNT(*) AS n FROM users WHERE invited_by = ?", args: [inviter] });
  const n = Number(r.rows[0].n);
  const next = BADGE_STEPS.find((s) => s > n);
  return sendTo(inviter, {
    title: `@${newcomer.username} entrou pelo seu convite 🎉`,
    body:
      `${n === 1 ? "Sua primeira pessoa" : `Já são ${n} pessoas`} pelo seu link.` +
      (next ? ` Faltam ${next - n} para o próximo selo.` : " Você é recrutador ouro 🥇"),
    url: `${origin}/app`,
    campaign: "invite",
  });
}

export type ShareKind = "bubble" | "compare";

/**
 * Someone posted a bubble (or a comparison) that includes `owner`'s: tell the owner.
 * At most one per owner every 30 minutes, so nobody can spam it.
 */
export async function notifyShared(
  owner: string,
  share: { kind: ShareKind; sharer: string | null; other?: string | null; path: string },
  origin: string,
) {
  if (!ready()) return 0;
  const client = await db();
  const now = Date.now();
  const claim = await client.execute({
    sql: `INSERT INTO share_pushes (uid, at) VALUES (?, ?)
          ON CONFLICT(uid) DO UPDATE SET at = excluded.at WHERE share_pushes.at < ?`,
    args: [owner, now, now - 30 * 60 * 1000],
  });
  if (!claim.rowsAffected) return 0;
  const who = share.sharer ? `@${share.sharer}` : "Alguém";
  const challenge = share.kind === "compare" && share.sharer && share.other === share.sharer;
  const payload =
    share.kind === "bubble"
      ? { title: `${who} compartilhou sua bolha 📣`, body: "Sua bolha foi postada no X. Veja quem está olhando." }
      : challenge
        ? { title: `${who} te desafiou 👀`, body: "Postou no X uma comparação entre as bolhas de vocês. Quem está mais fechado?" }
        : {
            title: `${who} comparou sua bolha 📣`,
            body: share.other ? `Sua bolha foi comparada com a de @${share.other} no X.` : "Sua bolha foi comparada no X.",
          };
  return sendTo(owner, { ...payload, url: `${origin}${share.path}`, campaign: `shared-${share.kind}` });
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
    campaign: "viewed",
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
      campaign: "daily",
    });
  }
  return { users: subs.rows.length, sent };
}

/** Claims a per-member slot (`table` keyed by uid) unless one was claimed in the last `ms`; true when claimed. */
async function throttle(table: "open_pushes" | "race_pushes", uid: string, ms: number) {
  const client = await db();
  const now = Date.now();
  const claim = await client.execute({
    sql: `INSERT INTO ${table} (uid, at) VALUES (?, ?) ON CONFLICT(uid) DO UPDATE SET at = excluded.at WHERE ${table}.at < ?`,
    args: [uid, now, now - ms],
  });
  return claim.rowsAffected > 0;
}

/** Someone opened your invite link (at most one push every 30 minutes): it's working, keep posting it. */
export async function notifyInviteOpened(ref: string, origin: string) {
  if (!ready() || !(await throttle("open_pushes", ref, 30 * 60 * 1000))) return 0;
  const client = await db();
  const day = new Date().toISOString().slice(0, 10);
  const [today, total, joined] = await client.batch(
    [
      { sql: "SELECT COUNT(*) AS n FROM invite_opens WHERE ref = ? AND day = ?", args: [ref, day] },
      { sql: "SELECT COUNT(DISTINCT visitor) AS n FROM invite_opens WHERE ref = ?", args: [ref] },
      { sql: "SELECT COUNT(*) AS n FROM users WHERE invited_by = ?", args: [ref] },
    ],
    "read",
  );
  const n = Number(today.rows[0].n);
  const j = Number(joined.rows[0].n);
  return sendTo(ref, {
    title: "Alguém abriu o seu convite 👀",
    body:
      `${n} ${n === 1 ? "pessoa abriu" : "pessoas abriram"} seu link hoje (${Number(total.rows[0].n)} no total)` +
      (j ? `, ${j} já ${j === 1 ? "entrou" : "entraram"}.` : ". Falta entrarem!"),
    url: `${origin}/app`,
    campaign: "invite-opened",
  });
}

/** The inviter just passed these members in this week's invite race: tell each their new spot (one every 2 hours). */
export async function notifyRacePassed(inviter: string, passed: Racer[], origin: string) {
  if (!ready() || !passed.length) return 0;
  const client = await db();
  const who = (await client.execute({ sql: "SELECT username FROM users WHERE id = ?", args: [inviter] })).rows[0]?.username;
  if (!who) return 0;
  const days = daysToBigDay();
  let sent = 0;
  for (const p of passed) {
    if (!(await throttle("race_pushes", p.id, 2 * 3600_000))) continue;
    sent += await sendTo(p.id, {
      title: `@${who} te passou na corrida dos convites 🏁`,
      body: `Você caiu para ${p.rank}º na semana.${days ? ` Faltam ${days} ${days === 1 ? "dia" : "dias"} para 25/10:` : ""} chame mais gente pelo seu link.`,
      url: `${origin}/ranking`,
      campaign: "race",
    });
  }
  return sent;
}

/** The live night: one push per subscriber with how their own bubble stands (sent once per `key`). */
export async function sendLiveNight(origin: string, key: string) {
  if (!ready()) return { users: 0, sent: 0 };
  const client = await db();
  const subs = await client.execute({
    sql: `SELECT DISTINCT s.uid, u.vote FROM push_subs s JOIN users u ON u.id = s.uid
          WHERE NOT EXISTS (SELECT 1 FROM once_pushes o WHERE o.key = ? AND o.uid = s.uid)`,
    args: [key],
  });
  let sent = 0;
  for (const row of subs.rows) {
    const uid = String(row.uid);
    const claim = await client.execute({ sql: "INSERT OR IGNORE INTO once_pushes (key, uid) VALUES (?, ?)", args: [key, uid] });
    if (!claim.rowsAffected) continue;
    const share = await getShare(uid);
    if (!share) continue;
    const t = share.tally;
    const l = pct(t.red, t.total);
    const split = `${l}% Vermelho × ${t.total ? 100 - l : 0}% Verde`;
    const vote = row.vote as "red" | "green" | null;
    const mine = vote === "red" ? t.red : t.green;
    const theirs = vote === "red" ? t.green : t.red;
    const payload = !vote
      ? { title: "Hoje é o dia 🔴🟢", body: `Sua bolha: ${split}. Você ainda não escolheu um lado. Vem ver ao vivo.` }
      : mine > theirs
        ? { title: `Seu lado está ganhando na sua bolha ${vote === "red" ? "🔴" : "🟢"}`, body: `${split}. Acompanhe ao vivo com todo mundo.` }
        : mine < theirs
          ? { title: "Seu lado está perdendo na sua bolha 😬", body: `${split}. Ainda dá tempo de chamar sua rede.` }
          : { title: "Empate na sua bolha ⚖️", body: `${split}. Quem desempata? Acompanhe ao vivo.` };
    sent += await sendTo(uid, { ...payload, url: `${origin}/ao-vivo`, campaign: "live-night" });
  }
  return { users: subs.rows.length, sent };
}

/** An ask to change color, or the answer to one (the live toast covers members on the site right now). */
export async function notifyMessage(to: string, from: string, kind: "ask" | "reply", body: string, origin: string) {
  if (!ready()) return 0;
  return sendTo(to, {
    title: kind === "ask" ? `@${from} te pediu para trocar de cor 🔴🟢` : `@${from} respondeu seu pedido`,
    body,
    url: `${origin}/mensagens`,
    campaign: kind === "ask" ? "ask" : "ask-reply",
  });
}

/** "Pergunta do dia": nudge subscribed members who haven't played today (at most one per member per day). */
export async function sendDailyQuestion(origin: string) {
  if (!ready()) return { users: 0, sent: 0 };
  const q = await getDailyQuestion();
  if (!q) return { users: 0, sent: 0 };
  const key = `daily-question:${q.day}`;
  const client = await db();
  const [subs, streaks] = await Promise.all([
    client.execute({
      sql: `SELECT DISTINCT s.uid FROM push_subs s
            WHERE NOT EXISTS (SELECT 1 FROM daily_plays d WHERE d.uid = s.uid AND d.day = ?)
              AND NOT EXISTS (SELECT 1 FROM once_pushes o WHERE o.key = ? AND o.uid = s.uid)`,
      args: [q.day, key],
    }),
    allStreaks(),
  ]);
  let sent = 0;
  for (const row of subs.rows) {
    const uid = String(row.uid);
    const claim = await client.execute({ sql: "INSERT OR IGNORE INTO once_pushes (key, uid) VALUES (?, ?)", args: [key, uid] });
    if (!claim.rowsAffected) continue;
    const n = streaks.get(uid)?.current ?? 0;
    sent += await sendTo(uid, {
      title: "Pergunta do dia 🎯",
      body: n
        ? `Chute a bolha de @${q.username} · não perca sua sequência de ${n} ${n === 1 ? "dia" : "dias"} 🔥`
        : `Chute a bolha de @${q.username} e comece sua sequência 🔥`,
      url: `${origin}/hoje`,
      campaign: "daily-question",
    });
  }
  return { users: subs.rows.length, sent };
}
