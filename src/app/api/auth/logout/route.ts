import { NextResponse } from "next/server";
import { appUrl, sessionCookie } from "@/lib/session";

export async function POST(req: Request) {
  const res = NextResponse.redirect(`${appUrl(req)}/`, 303);
  res.cookies.delete(sessionCookie.name);
  return res;
}
