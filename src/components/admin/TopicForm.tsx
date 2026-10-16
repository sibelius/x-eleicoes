"use client";

import { useRouter } from "next/navigation";
import { useState, useTransition } from "react";
import type { Topic, TopicStatus } from "@/lib/topics";

const STATUS: Record<TopicStatus, string> = { draft: "Rascunho", live: "No ar", closed: "Encerrado" };

const EMPTY = {
  id: "",
  title: "",
  question: "",
  a_label: "",
  a_color: "#e11d48",
  b_label: "",
  b_color: "#16a34a",
  status: "draft" as TopicStatus,
};

/** Create (no topic) or edit a topic, with a live preview of the two sides. */
export function TopicForm({ topic, onDone }: { topic?: Topic; onDone?: () => void }) {
  const router = useRouter();
  const [f, setF] = useState(topic ? { ...EMPTY, ...topic } : EMPTY);
  const [error, setError] = useState<string | null>(null);
  const [pending, start] = useTransition();
  const set = (k: keyof typeof EMPTY) => (e: React.ChangeEvent<HTMLInputElement | HTMLSelectElement>) => setF({ ...f, [k]: e.target.value });

  function save(e: React.FormEvent) {
    e.preventDefault();
    setError(null);
    start(async () => {
      const res = await fetch("/api/topics", {
        method: "POST",
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({ ...f, create: !topic }),
      });
      const out = (await res.json().catch(() => ({}))) as { error?: string };
      if (!res.ok) return setError(out.error ?? "Não foi possível salvar.");
      if (!topic) setF(EMPTY);
      onDone?.();
      router.refresh();
    });
  }

  const input = "w-full rounded-lg border border-line bg-bg px-3 py-1.5 text-sm";
  return (
    <form onSubmit={save} className="grid gap-4 lg:grid-cols-[1fr_300px]">
      <div className="grid gap-3 sm:grid-cols-2">
        <label className="grid gap-1 text-xs text-subtle">
          Slug (endereço /t/…)
          <input className={input} value={f.id} onChange={set("id")} disabled={!!topic} placeholder="corinthians-palmeiras" required />
        </label>
        <label className="grid gap-1 text-xs text-subtle">
          Status
          <select className={input} value={f.status} onChange={set("status")}>
            {(Object.keys(STATUS) as TopicStatus[]).map((s) => (
              <option key={s} value={s}>
                {STATUS[s]}
              </option>
            ))}
          </select>
        </label>
        <label className="grid gap-1 text-xs text-subtle sm:col-span-2">
          Título
          <input className={input} value={f.title} onChange={set("title")} maxLength={80} required />
        </label>
        <label className="grid gap-1 text-xs text-subtle sm:col-span-2">
          Pergunta
          <input className={input} value={f.question} onChange={set("question")} maxLength={160} required />
        </label>
        {(["a", "b"] as const).map((s) => (
          <div key={s} className="grid grid-cols-[1fr_auto] items-end gap-2">
            <label className="grid gap-1 text-xs text-subtle">
              Lado {s.toUpperCase()}
              <input className={input} value={f[`${s}_label`]} onChange={set(`${s}_label`)} maxLength={30} required />
            </label>
            <input
              type="color"
              aria-label={`Cor do lado ${s.toUpperCase()}`}
              className="h-9 w-12 cursor-pointer rounded-lg border border-line bg-bg"
              value={f[`${s}_color`]}
              onChange={set(`${s}_color`)}
            />
          </div>
        ))}
        <div className="flex items-center gap-3 sm:col-span-2">
          <button disabled={pending} className="rounded-full bg-fg px-4 py-2 text-sm text-bg disabled:opacity-50">
            {topic ? "Salvar" : "Criar tema"}
          </button>
          {topic && onDone && (
            <button type="button" onClick={onDone} className="text-sm text-subtle underline">
              Cancelar
            </button>
          )}
          {error && <span className="text-sm text-[var(--red)]">{error}</span>}
        </div>
      </div>
      <TopicPreview {...f} />
    </form>
  );
}

/** How the topic's header and split will look. */
function TopicPreview(t: typeof EMPTY) {
  return (
    <div className="rounded-xl border border-dashed border-line p-3">
      <div className="text-xs text-subtle">Prévia</div>
      <div className="mt-1 font-bold">{t.title || "Título"}</div>
      <div className="text-sm text-subtle">{t.question || "Pergunta?"}</div>
      <div className="mt-3 grid grid-cols-2 gap-2">
        {(["a", "b"] as const).map((s) => (
          <div key={s} className="rounded-lg px-2 py-3 text-center text-sm font-bold text-white" style={{ background: t[`${s}_color`] }}>
            {t[`${s}_label`] || `Lado ${s.toUpperCase()}`}
          </div>
        ))}
      </div>
      <div className="mt-3 flex justify-between text-xs font-semibold">
        <span style={{ color: t.a_color }}>{t.a_label || "A"} 60%</span>
        <span style={{ color: t.b_color }}>{t.b_label || "B"} 40%</span>
      </div>
      <div className="mt-1 flex h-3 overflow-hidden rounded-full bg-muted">
        <div style={{ width: "60%", background: t.a_color }} />
        <div style={{ width: "40%", background: t.b_color }} />
      </div>
    </div>
  );
}

/** One row of the admin list: summary, or the form while editing. */
export function TopicRow({ topic, counts }: { topic: Topic; counts: { a: number; b: number } }) {
  const [editing, setEditing] = useState(false);
  if (editing) return <TopicForm topic={topic} onDone={() => setEditing(false)} />;
  const total = counts.a + counts.b;
  const a = total ? Math.round((counts.a / total) * 100) : 0;
  return (
    <div className="flex flex-wrap items-center gap-x-4 gap-y-2">
      <div className="min-w-0 flex-1">
        <div className="flex items-center gap-2">
          <b className="truncate">{topic.title}</b>
          <span
            className={`rounded-full px-2 py-0.5 text-xs ${topic.status === "live" ? "bg-[var(--green)] text-white" : "bg-muted text-subtle"}`}
          >
            {STATUS[topic.status]}
          </span>
        </div>
        <div className="truncate text-sm text-subtle">
          /t/{topic.id} · {topic.question}
        </div>
      </div>
      <div className="w-56 text-xs">
        <div className="flex justify-between font-semibold tabular-nums">
          <span style={{ color: topic.a_color }}>
            {topic.a_label} {counts.a}
          </span>
          <span style={{ color: topic.b_color }}>
            {counts.b} {topic.b_label}
          </span>
        </div>
        <div className="mt-1 flex h-2 overflow-hidden rounded-full bg-muted">
          <div style={{ width: `${a}%`, background: topic.a_color }} />
          <div style={{ width: `${total ? 100 - a : 0}%`, background: topic.b_color }} />
        </div>
      </div>
      <div className="flex gap-3 text-sm">
        <a href={`/t/${topic.id}`} target="_blank" className="underline">
          Ver página
        </a>
        <button onClick={() => setEditing(true)} className="underline">
          Editar
        </button>
      </div>
    </div>
  );
}
