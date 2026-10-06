"use client";

import { useState } from "react";
import type { SimilarityHit } from "@/lib/similarity";
import { STATUS_LABELS, type Status } from "@/lib/types";
import type { SaveState } from "./StoreProvider";

const STATUS_COLORS: Record<Status, string> = {
  plan: "bg-stone-100 text-stone-700",
  writing: "bg-sky-100 text-sky-900",
  review: "bg-amber-100 text-amber-900",
  approved: "bg-emerald-100 text-emerald-900",
  exported: "bg-violet-100 text-violet-900",
};

export function StatusBadge({ status }: { status: Status }) {
  return <span className={`badge ${STATUS_COLORS[status]}`}>{STATUS_LABELS[status]}</span>;
}

export function SaveIndicator({ state }: { state?: SaveState }) {
  const map: Record<SaveState, [string, string]> = {
    saved: ["保存済み", "text-emerald-700"],
    pending: ["編集中…", "text-stone-500"],
    saving: ["保存中…", "text-stone-500"],
    error: ["保存に失敗しました（再編集で再試行）", "text-red-700 font-semibold"],
  };
  const [label, cls] = map[state ?? "saved"];
  return (
    <span className={`text-xs ${cls}`} aria-live="polite">
      {label}
    </span>
  );
}

export function SimilarityBadge({ hits }: { hits?: SimilarityHit[] }) {
  if (!hits?.length) return <span className="badge bg-emerald-50 text-emerald-800">重複なし</span>;
  const high = hits.some((h) => h.level === "high");
  return (
    <span className={`badge ${high ? "bg-red-100 text-red-800" : "bg-amber-100 text-amber-900"}`}>
      {high ? "重複の疑い" : "類似あり"}（{hits.length}件）
    </span>
  );
}

export function Collapsible({
  title,
  defaultOpen = false,
  children,
  right,
}: {
  title: React.ReactNode;
  defaultOpen?: boolean;
  children: React.ReactNode;
  right?: React.ReactNode;
}) {
  const [open, setOpen] = useState(defaultOpen);
  return (
    <section className="card">
      <div className="flex items-center gap-2">
        <button type="button" className="flex flex-1 items-center gap-2 text-left font-semibold" onClick={() => setOpen(!open)} aria-expanded={open}>
          <span className="inline-block w-4 text-stone-400">{open ? "▾" : "▸"}</span>
          {title}
        </button>
        {right}
      </div>
      {open && <div className="mt-3">{children}</div>}
    </section>
  );
}

export function Field({ label, hint, children }: { label: string; hint?: string; children: React.ReactNode }) {
  return (
    <div>
      <label className="block">
        <span className="label">{label}</span>
        {children}
      </label>
      {hint && <p className="hint">{hint}</p>}
    </div>
  );
}

export function formatDate(iso?: string): string {
  if (!iso) return "-";
  const d = new Date(iso);
  return `${d.getFullYear()}/${String(d.getMonth() + 1).padStart(2, "0")}/${String(d.getDate()).padStart(2, "0")} ${String(d.getHours()).padStart(2, "0")}:${String(d.getMinutes()).padStart(2, "0")}`;
}
