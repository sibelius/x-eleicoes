import { NextResponse, connection } from "next/server";
import { DEV_UID, ensureDevSeed } from "@/lib/seed";
import { appUrl, createSessionToken, devLoginEnabled, sessionCookie } from "@/lib/session";

export async function GET(req: Request) {
  await connection();
  if (!devLoginEnabled()) return new NextResponse("Not found", { status: 404 });
  await ensureDevSeed();
  const res = NextResponse.redirect(`${appUrl(req)}/app`);
  res.cookies.set(sessionCookie.name, await createSessionToken(DEV_UID), sessionCookie.options);
  return res;
}
