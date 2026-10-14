import { NextResponse } from "next/server";
import { appUrl, sign } from "@/lib/session";
import { X_AUTHORIZE, pkceChallenge, randomToken, scopes, xConfigured } from "@/lib/x";

export async function GET(req: Request) {
  const origin = appUrl(req);
  if (!xConfigured()) return NextResponse.redirect(`${origin}/?erro=x-nao-configurado`);
  const ref = new URL(req.url).searchParams.get("ref");
  const state = randomToken(16);
  const verifier = randomToken(48);
  const url = new URL(X_AUTHORIZE);
  url.search = new URLSearchParams({
    response_type: "code",
    client_id: process.env.X_CLIENT_ID!,
    redirect_uri: `${origin}/api/auth/x/callback`,
    scope: scopes(),
    state,
    code_challenge: await pkceChallenge(verifier),
    code_challenge_method: "S256",
  }).toString();
  const res = NextResponse.redirect(url);
  res.cookies.set("xe_oauth", await sign({ state, verifier, ref }, "10m"), {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production",
    path: "/",
    maxAge: 600,
  });
  return res;
}
