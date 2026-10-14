import { NextResponse, type NextRequest } from "next/server";
import { db } from "@/lib/db";
import { appUrl, createSessionToken, sessionCookie, verify } from "@/lib/session";
import { exchangeCode, fetchFollowsEnabled, getMe, importFollowsFromApi } from "@/lib/x";

export async function GET(req: NextRequest) {
  const origin = appUrl(req);
  const params = req.nextUrl.searchParams;
  const oauth = await verify<{ state: string; verifier: string; ref?: string | null }>(
    req.cookies.get("xe_oauth")?.value,
  );
  const code = params.get("code");
  if (!oauth || !code || params.get("state") !== oauth.state) {
    console.error("[auth] login failed: bad state/code", params.get("error") ?? "");
    return NextResponse.redirect(`${origin}/?erro=login`);
  }
  try {
    const { access_token } = await exchangeCode(code, oauth.verifier, `${origin}/api/auth/x/callback`);
    const me = await getMe(access_token);
    const client = await db();
    const ref = oauth.ref && oauth.ref !== me.id ? oauth.ref : null;
    await client.execute({
      sql: `INSERT INTO users (id, username, name, avatar, invited_by, created_at)
            VALUES (?, ?, ?, ?, (SELECT id FROM users WHERE id = ?), ?)
            ON CONFLICT(id) DO UPDATE SET username=excluded.username, name=excluded.name, avatar=excluded.avatar`,
      args: [me.id, me.username, me.name, me.profile_image_url ?? null, ref, Date.now()],
    });
    if (fetchFollowsEnabled()) await importFollowsFromApi(client, access_token, me.id);
    console.log(`[auth] login ok @${me.username}`);
    const res = NextResponse.redirect(`${origin}/app`);
    res.cookies.set(sessionCookie.name, await createSessionToken(me.id), sessionCookie.options);
    res.cookies.delete("xe_oauth");
    return res;
  } catch (e) {
    console.error("[auth] login failed", e);
    return NextResponse.redirect(`${origin}/?erro=login`);
  }
}
