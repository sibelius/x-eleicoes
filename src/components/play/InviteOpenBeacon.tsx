"use client";

import { useEffect } from "react";

/** Landed on an invite link: tell the server so the inviter knows the link is working. */
export function InviteOpenBeacon({ inviter }: { inviter: string }) {
  useEffect(() => {
    fetch("/api/invite-open", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify({ ref: inviter }),
      keepalive: true,
    }).catch(() => {});
  }, [inviter]);
  return null;
}
