"use client";

import { useEffect, useState } from "react";
import type { Me } from "@/lib/network";
import { VotePanel } from "./VotePanel";

/** Until the user votes, ask up front: Red or Green. Closes on its own once the vote is saved. */
export function VoteModal({ me }: { me: Me }) {
  const [open, setOpen] = useState(true);

  useEffect(() => {
    const onKey = (e: KeyboardEvent) => e.key === "Escape" && setOpen(false);
    window.addEventListener("keydown", onKey);
    return () => window.removeEventListener("keydown", onKey);
  }, []);

  if (me.vote || !open) return null;
  return (
    <div
      role="dialog"
      aria-modal="true"
      aria-labelledby="vote-modal-title"
      className="fixed inset-0 z-50 flex items-end justify-center bg-black/60 p-4 backdrop-blur-sm sm:items-center"
      onClick={(e) => e.target === e.currentTarget && setOpen(false)}
    >
      <div className="w-full max-w-md">
        <h2 id="vote-modal-title" className="mb-3 text-center text-2xl font-bold text-white">
          De que lado você está, @{me.username}?
        </h2>
        <VotePanel me={me} />
        <button onClick={() => setOpen(false)} className="mx-auto mt-3 block text-sm text-white/80 underline">
          Agora não
        </button>
      </div>
    </div>
  );
}
