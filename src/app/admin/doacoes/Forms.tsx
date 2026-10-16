"use client";

import { useActionState } from "react";
import { addManual, saveGoal, type FormState } from "./actions";

const input = "rounded-lg border border-line bg-transparent px-2 py-1.5 outline-none";

function Status({ state }: { state: FormState }) {
  if (!state) return null;
  return <span className={`text-sm ${state.error ? "text-[var(--red)]" : "text-[var(--green)]"}`}>{state.error ?? state.ok}</span>;
}

export function AddDonationForm() {
  const [state, action, pending] = useActionState(addManual, null);
  return (
    <form action={action} className="grid gap-2 text-sm sm:grid-cols-2">
      <label className="grid gap-1">
        <span className="text-xs text-subtle">Valor (R$)</span>
        <input name="amount" required inputMode="decimal" placeholder="25,00" className={input} />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-subtle">@ no X (opcional, liga ao membro)</span>
        <input name="handle" placeholder="@fulano" className={input} />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-subtle">Nome no mural (opcional)</span>
        <input name="name" maxLength={40} placeholder="Fulana de Tal" className={input} />
      </label>
      <label className="grid gap-1">
        <span className="text-xs text-subtle">Nota interna (opcional)</span>
        <input name="note" maxLength={40} placeholder="extrato 15/10" className={input} />
      </label>
      <label className="flex items-center gap-2 sm:col-span-2">
        <input type="checkbox" name="public" defaultChecked /> mostrar no mural de apoiadores
      </label>
      <div className="flex items-center gap-3 sm:col-span-2">
        <button disabled={pending} className="rounded-full bg-fg px-4 py-1.5 font-semibold text-bg disabled:opacity-60">
          {pending ? "Salvando…" : "Adicionar confirmada"}
        </button>
        <Status state={state} />
      </div>
    </form>
  );
}

export function GoalForm({ current }: { current: number }) {
  const [state, action, pending] = useActionState(saveGoal, null);
  return (
    <form action={action} className="flex flex-wrap items-end gap-2 text-sm">
      <label className="grid gap-1">
        <span className="text-xs text-subtle">Meta mensal (R$)</span>
        <input name="goal" required inputMode="decimal" defaultValue={String(current / 100).replace(".", ",")} className={`${input} w-32`} />
      </label>
      <button disabled={pending} className="rounded-full border border-line px-4 py-1.5 disabled:opacity-60">
        {pending ? "Salvando…" : "Salvar meta"}
      </button>
      <Status state={state} />
    </form>
  );
}
