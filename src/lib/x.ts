import "server-only";
import type { Client } from "@libsql/client";

// X OAuth 2.0 (Authorization Code + PKCE). Creating the app on developer.x.com is free;
// API reads are pay-per-use since 2026 (~$0.001 for /users/me, ~$0.01 per follower/following returned).
export const X_AUTHORIZE = "https://x.com/i/oauth2/authorize";
export const X_TOKEN = "https://api.x.com/2/oauth2/token";
export const X_API = "https://api.x.com/2";

export function xConfigured() {
  return Boolean(process.env.X_CLIENT_ID);
}

export function fetchFollowsEnabled() {
  return process.env.X_FETCH_FOLLOWS === "1";
}

export function scopes() {
  return ["users.read", "tweet.read", ...(fetchFollowsEnabled() ? ["follows.read"] : [])].join(" ");
}

function b64url(bytes: Uint8Array) {
  return Buffer.from(bytes).toString("base64url");
}

export function randomToken(len = 32) {
  return b64url(crypto.getRandomValues(new Uint8Array(len)));
}

export async function pkceChallenge(verifier: string) {
  const digest = await crypto.subtle.digest("SHA-256", new TextEncoder().encode(verifier));
  return b64url(new Uint8Array(digest));
}

export async function exchangeCode(code: string, verifier: string, redirectUri: string) {
  const headers: Record<string, string> = { "Content-Type": "application/x-www-form-urlencoded" };
  const id = process.env.X_CLIENT_ID!;
  const secret = process.env.X_CLIENT_SECRET;
  if (secret) headers.Authorization = `Basic ${Buffer.from(`${id}:${secret}`).toString("base64")}`;
  const res = await fetch(X_TOKEN, {
    method: "POST",
    headers,
    body: new URLSearchParams({
      grant_type: "authorization_code",
      code,
      redirect_uri: redirectUri,
      code_verifier: verifier,
      client_id: id,
    }),
  });
  if (!res.ok) throw new Error(`X token exchange failed: ${res.status} ${await res.text()}`);
  return (await res.json()) as { access_token: string };
}

export type XUser = { id: string; username: string; name: string; profile_image_url?: string };

export async function getMe(token: string): Promise<XUser> {
  const res = await fetch(`${X_API}/users/me?user.fields=profile_image_url`, {
    headers: { Authorization: `Bearer ${token}` },
  });
  if (!res.ok) throw new Error(`X /users/me failed: ${res.status} ${await res.text()}`);
  return ((await res.json()) as { data: XUser }).data;
}

/** Paid (pay-per-use): crawls up to X_FETCH_MAX following + followers and stores edges/profiles. */
export async function importFollowsFromApi(client: Client, token: string, uid: string) {
  const configuredMax = Number(process.env.X_FETCH_MAX ?? 100);
  const max = Number.isFinite(configuredMax) ? Math.max(0, Math.floor(configuredMax)) : 100;
  const configuredPageSize = Number(process.env.X_FETCH_PAGE_SIZE ?? 1000);
  const pageSize = Number.isFinite(configuredPageSize)
    ? Math.min(Math.max(1, Math.floor(configuredPageSize)), 1000)
    : 1000;
  const totals: Record<"following" | "followers", number> = { following: 0, followers: 0 };

  for (const kind of ["following", "followers"] as const) {
    let paginationToken: string | undefined;
    while (totals[kind] < max) {
      const params = new URLSearchParams({
        max_results: String(Math.min(pageSize, max - totals[kind])),
        "user.fields": "profile_image_url",
      });
      if (paginationToken) params.set("pagination_token", paginationToken);

      const res = await fetch(`${X_API}/users/${uid}/${kind}?${params}`, {
        headers: { Authorization: `Bearer ${token}` },
      });
      if (!res.ok) {
        console.warn(`X ${kind} fetch failed`, res.status, await res.text());
        break;
      }

      const body = (await res.json()) as {
        data?: XUser[];
        meta?: { next_token?: string };
      };
      const users = body.data ?? [];
      if (users.length) {
        await client.batch(
          users.flatMap((u) => [
            {
              sql: "INSERT OR IGNORE INTO edges (src, dst) VALUES (?, ?)",
              args: kind === "following" ? [uid, u.id] : [u.id, uid],
            },
            {
              sql: `INSERT INTO profiles (id, username, name, avatar) VALUES (?, ?, ?, ?)
                    ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar`,
              args: [u.id, u.username, u.name, u.profile_image_url ?? null],
            },
          ]),
          "write",
        );
      }
      totals[kind] += users.length;
      paginationToken = body.meta?.next_token;
      if (!paginationToken || users.length === 0) break;
    }
  }
  return totals;
}
