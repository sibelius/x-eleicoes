import { NextResponse } from "next/server";
import { appUrl, sign } from "@/lib/session";
import { X_AUTHORIZE, pkceChallenge, randomToken, scopes, xConfigured } from "@/lib/x";
import { oauth1Configured, requestToken } from "@/lib/x-oauth1";

const tempCookie = {
  httpOnly: true,
  sameSite: "lax" as const,
  secure: process.env.NODE_ENV === "production",
  path: "/",
  maxAge: 600,
};

export async function GET(req: Request) {
  const origin = appUrl(req);
  const ref = new URL(req.url).searchParams.get("ref");
  const callback = `${origin}/api/auth/x/callback`;

  // Preferred: OAuth 1.0a — identifies the user without a billed API call.
  if (oauth1Configured()) {
    try {
      const { token, secret, url } = await requestToken(callback);
      const res = NextResponse.redirect(url);
      res.cookies.set("xe_oauth", await sign({ v: 1, token, secret, ref }, "10m"), tempCookie);
      return res;
    } catch (e) {
      console.error("[auth] login failed", e);
      return NextResponse.redirect(`${origin}/?erro=login`);
    }
  }

  if (!xConfigured()) return NextResponse.redirect(`${origin}/?erro=x-nao-configurado`);
  const state = randomToken(16);
  const verifier = randomToken(48);
  const url = new URL(X_AUTHORIZE);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: callback,
    scope: scopes(),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("xe_oauth", await sign({ v: 2, state, verifier, ref }, "10m"), tempCookie);
  return res;
}
