import "server-only";
import { createHmac, randomBytes } from "node:crypto";

// "Sign in with X" via OAuth 1.0a. The access_token response already carries user_id + screen_name,
// so login needs no billed v2 call (/2/users/me). Keys: "API Key and Secret" (consumer keys) in the portal.
const REQUEST_TOKEN = "https://api.x.com/oauth/request_token";
const AUTHENTICATE = "https://api.x.com/oauth/authenticate";
const ACCESS_TOKEN = "https://api.x.com/oauth/access_token";

export function oauth1Configured() {
  return Boolean(process.env.X_API_KEY && process.env.X_API_SECRET);
}

// RFC 3986 percent-encoding, as OAuth 1.0a requires.
function enc(s: string) {
  return encodeURIComponent(s).replace(/[!'()*]/g, (c) => `%${c.charCodeAt(0).toString(16).toUpperCase()}`);
}

function authHeader(url: string, extra: Record<string, string>, tokenSecret = "") {
  const params: Record<string, string> = {
    oauth_consumer_key: process.env.X_API_KEY!,
    oauth_nonce: randomBytes(16).toString("hex"),
    oauth_signature_method: "HMAC-SHA1",
    oauth_timestamp: String(Math.floor(Date.now() / 1000)),
    oauth_version: "1.0",
    ...extra,
  };
  const paramString = Object.keys(params)
    .sort()
    .map((k) => `${enc(k)}=${enc(params[k])}`)
    .join("&");
  const base = ["POST", enc(url), enc(paramString)].join("&");
  const key = `${enc(process.env.X_API_SECRET!)}&${enc(tokenSecret)}`;
  params.oauth_signature = createHmac("sha1", key).update(base).digest("base64");
  return (
    "OAuth " +
    Object.keys(params)
      .sort()
      .map((k) => `${enc(k)}="${enc(params[k])}"`)
      .join(", ")
  );
}

async function post(url: string, extra: Record<string, string>, tokenSecret?: string) {
  const res = await fetch(url, { method: "POST", headers: { Authorization: authHeader(url, extra, tokenSecret) } });
  const text = await res.text();
  if (!res.ok) throw new Error(`X ${new URL(url).pathname} failed: ${res.status} ${text}`);
  return new URLSearchParams(text);
}

export async function requestToken(callbackUrl: string) {
  const r = await post(REQUEST_TOKEN, { oauth_callback: callbackUrl });
  if (r.get("oauth_callback_confirmed") !== "true") throw new Error("X request_token: callback not confirmed");
  const token = r.get("oauth_token")!;
  return { token, secret: r.get("oauth_token_secret")!, url: `${AUTHENTICATE}?oauth_token=${enc(token)}` };
}

export async function accessToken(token: string, tokenSecret: string, verifier: string) {
  const r = await post(ACCESS_TOKEN, { oauth_token: token, oauth_verifier: verifier }, tokenSecret);
  return { userId: r.get("user_id")!, screenName: r.get("screen_name")! };
}
