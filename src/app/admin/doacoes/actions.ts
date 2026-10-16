"use server";

import { refresh, updateTag } from "next/cache";
import { isAdmin } from "@/lib/admin";
import { DONATIONS_TAG, addDonation, deleteDonation, setDonationStatus, setSetting, toCents, type DonationStatus } from "@/lib/donations";

// Admin-only mutations for /admin/doacoes (each checks again: actions are public endpoints).

async function guard() {
  if (!(await isAdmin())) throw new Error("not allowed");
}

function done() {
  updateTag(DONATIONS_TAG);
  refresh();
}

export async function setStatus(id: number, status: DonationStatus) {
  await guard();
  if (!["pending", "confirmed", "rejected"].includes(status)) return;
  await setDonationStatus(id, status);
  done();
}

export async function removeDonation(id: number) {
  await guard();
  await deleteDonation(id);
  done();
}

export type FormState = { error?: string; ok?: string } | null;

export async function addManual(_: FormState, form: FormData): Promise<FormState> {
  await guard();
  const amount = toCents(form.get("amount"));
  if (amount == null) return { error: "Valor entre R$ 1 e R$ 100.000." };
  const r = await addDonation({
    amount,
    name: form.get("name"),
    handle: form.get("handle"),
    public: form.get("public") === "on",
    note: form.get("note"),
  });
  done();
  return { ok: r.member ? `Adicionada e ligada a @${r.member}.` : form.get("handle") ? "Adicionada (esse @ não é membro)." : "Adicionada." };
}

export async function saveGoal(_: FormState, form: FormData): Promise<FormState> {
  await guard();
  const cents = toCents(form.get("goal"));
  if (cents == null) return { error: "Meta entre R$ 1 e R$ 100.000." };
  await setSetting("donation_goal", String(cents));
  done();
  return { ok: "Meta salva." };
}
