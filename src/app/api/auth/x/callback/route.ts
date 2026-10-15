import { NextResponse, after, type NextRequest } from "next/server";
import { apifyEnabled, importFollowsFromApify } from "@/lib/apify";
import { db } from "@/lib/db";
import { appUrl, createSessionToken, sessionCookie, verify } from "@/lib/session";
import { exchangeCode, fetchFollowsEnabled, getMe, importFollowsFromApi } from "@/lib/x";
import { accessToken } from "@/lib/x-oauth1";

// The Apify follow import runs in after() and needs up to ~4 minutes.
export const maxDuration = 300;

type OAuthCookie =
  | { v: 1; token: string; secret: string; ref?: string | null }
  | { v: 2; state: string; verifier: string; ref?: string | null };

type Identity = { id: string; username: string; name: string; avatar: string | null };

export async function GET(req: NextRequest) {
  const origin = appUrl(req);
  const params = req.nextUrl.searchParams;
  const oauth = await verify<OAuthCookie>(req.cookies.get("xe_oauth")?.value);
  const fail = (why: unknown) => {
    console.error("[auth] login failed", why);
    const res = NextResponse.redirect(`${origin}/?erro=login`);
    res.cookies.delete("xe_oauth");
    return res;
  };
  if (!oauth) return fail("missing or expired oauth cookie");

  try {
    const client = await db();
    let who: Identity;
    if (oauth.v === 1) {
      const verifier = params.get("oauth_verifier");
      if (params.get("denied") || !verifier || params.get("oauth_token") !== oauth.token) {
        return fail(`oauth1 denied/mismatch ${params.get("denied") ? "(user cancelled)" : ""}`);
      }
      const { userId, screenName } = await accessToken(oauth.token, oauth.secret, verifier);
      who = { id: userId, username: screenName, name: screenName, avatar: null };
    } else {
      const code = params.get("code");
      if (!code || params.get("state") !== oauth.state) return fail(`bad state/code ${params.get("error") ?? ""}`);
      const { access_token } = await exchangeCode(code, oauth.verifier, `${origin}/api/auth/x/callback`);
      const me = await getMe(access_token);
      who = { id: me.id, username: me.username, name: me.name, avatar: me.profile_image_url ?? null };
      if (fetchFollowsEnabled() && !apifyEnabled()) await importFollowsFromApi(client, access_token, me.id);
    }

    const ref = oauth.ref && oauth.ref !== who.id ? oauth.ref : null;
    // OAuth 1.0a gives no display name/photo: keep what we already know instead of overwriting it.
    await client.execute({
      sql: `INSERT INTO users (id, username, name, avatar, invited_by, created_at)
            VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE id = ?), ?)
            ON CONFLICT(id) DO UPDATE SET username = excluded.username,
              name = CASE WHEN excluded.avatar IS NULL THEN users.name ELSE excluded.name END,
              avatar = COALESCE(excluded.avatar, users.avatar)`,
      args: [who.id, who.username, who.name, who.avatar, ref, Date.now()],
    });
    if (apifyEnabled()) {
      // Scraping can take minutes: run it after the redirect instead of blocking the login.
      after(async () => {
        try {
          const totals = await importFollowsFromApify(client, who.id, who.username);
          console.log(
            totals
              ? `[apify] @${who.username} following=${totals.following} followers=${totals.followers}`
              : `[apify] @${who.username} skipped, fetched recently`,
          );
        } catch (e) {
          console.error("[apify] follow import failed", e);
        }
      });
    }
    console.log(`[auth] login ok @${who.username} (oauth${oauth.v === 1 ? "1.0a" : "2"})`);
    const res = NextResponse.redirect(`${origin}/app`);
    res.cookies.set(sessionCookie.name, await createSessionToken(who.id), sessionCookie.options);
    res.cookies.delete("xe_oauth");
    return res;
  } catch (e) {
    return fail(e);
  }
}
