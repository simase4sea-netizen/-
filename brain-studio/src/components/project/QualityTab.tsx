"use client";

import Link from "next/link";
import { useState } from "react";
import { formatDate } from "@/components/common";
import { Markdown } from "@/components/Markdown";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { countNeedsCheck, findRiskyExpressions } from "@/lib/checks";
import { nowIso } from "@/lib/defaults";
import { callGenerate, GenerateError } from "@/lib/generation";
import { pct, type SimilarityHit } from "@/lib/similarity";
import { QUALITY_ITEMS, type Project, type QualityKey } from "@/lib/types";

export function QualityTab({ project, update, hits }: { project: Project; update: (fn: (p: Project) => Project) => void; hits?: SimilarityHit[] }) {
  const { usesApi } = useStore();
  const { confirm, notify, confirmApiSend } = useUI();
  const [approver, setApprover] = useState(project.quality.approvedBy ?? "");
  const [busy, setBusy] = useState(false);
  const q = project.quality;

  const setQ = (patch: Partial<Project["quality"]>) => update((p) => ({ ...p, quality: { ...p.quality, ...patch } }));
  const setCheck = (k: QualityKey, v: boolean) => setQ({ checks: { ...q.checks, [k]: v } });

  // ローカルの自動チェック（参考表示）
  const body = project.chapters.map((c) => c.content).join("\n");
  const all = [project.sections.design.content, project.sections.free.content, body, project.sections.sales.content, project.sections.bonus.content, project.sections.promo.content].join("\n");
  const needs = countNeedsCheck(all);
  const salesRisky = findRiskyExpressions([project.sections.sales.content, project.sections.free.content, project.sections.promo.content].join("\n"));
  const bodyRisky = findRiskyExpressions(body);
  const steps = (body.match(/^\s*\d+[.)]\s/gm) ?? []).length;
  const checklists = (body.match(/^\s*- \[[ xX]\]/gm) ?? []).length;
  const emptyChapters = project.chapters.filter((c) => !c.content.trim()).length;
  const highDup = hits?.filter((h) => h.level === "high") ?? [];

  const auto: { label: string; ok: boolean; detail: string }[] = [
    { label: "読者と悩みの入力", ok: Boolean(project.audience.trim() && project.problem.trim()), detail: project.audience ? "入力あり" : "想定読者が未入力" },
    { label: "実行できることの入力", ok: Boolean(project.outcome.trim()), detail: project.outcome ? "入力あり" : "未入力" },
    { label: "本文の具体性", ok: steps >= 3 && checklists >= 1 && emptyChapters === 0, detail: `番号付き手順 ${steps}行／チェックリスト ${checklists}項目／未執筆の章 ${emptyChapters}` },
    { label: "【要確認】の残り", ok: needs === 0, detail: `${needs}件` },
    { label: "他商品との重複", ok: highDup.length === 0, detail: hits?.length ? hits.map((h) => `${h.otherTitle}（最大${pct(Math.max(h.titleAudience, h.problem, h.content))}）`).join("、") : "類似なし" },
    {
      label: "誤認を招く表現",
      ok: salesRisky.length + bodyRisky.length === 0,
      detail: [...salesRisky, ...bodyRisky].map((r) => `「${r.phrase}」`).join(" ") || "検出なし",
    },
  ];

  const approve = async () => {
    if (!approver.trim()) {
      notify("最終確認者の名前を入力してください", "error");
      return;
    }
    const unchecked = QUALITY_ITEMS.filter((i) => !q.checks[i.key]);
    const warns = auto.filter((a) => !a.ok);
    const ok = await confirm({
      title: "この内容を承認しますか？",
      message: (
        <div className="space-y-2">
          <p>承認は、あなた自身が内容・表現・根拠を確認したことを記録するものです。</p>
          {unchecked.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">未チェックの確認項目：</p>
              <ul className="ml-4 list-disc text-xs">
                {unchecked.map((u) => (
                  <li key={u.key}>{u.label}</li>
                ))}
              </ul>
            </div>
          )}
          {warns.length > 0 && (
            <div>
              <p className="font-semibold text-amber-800">自動チェックの注意：</p>
              <ul className="ml-4 list-disc text-xs">
                {warns.map((w) => (
                  <li key={w.label}>
                    {w.label}：{w.detail}
                  </li>
                ))}
              </ul>
            </div>
          )}
        </div>
      ),
      confirmLabel: "確認したので承認する",
    });
    if (!ok) return;
    update((p) => ({ ...p, status: "approved", quality: { ...p.quality, approvedBy: approver.trim(), approvedAt: nowIso() } }));
    notify("承認しました", "success");
  };

  const revoke = async () => {
    if (!(await confirm({ title: "承認を取り消しますか？", message: "ステータスは「要確認」に戻ります。", confirmLabel: "取り消す" }))) return;
    update((p) => ({ ...p, status: "review", quality: { ...p.quality, approvedBy: undefined, approvedAt: undefined } }));
  };

  const aiReview = async () => {
    if (!(await confirmApiSend("この企画の全セクションの本文"))) return;
    setBusy(true);
    try {
      const r = await callGenerate({ task: "review", project });
      setQ({ aiReview: { content: r.text ?? "", createdAt: nowIso() } });
    } catch (e) {
      if (!(e instanceof GenerateError && e.code === "ABORTED")) notify(`評価に失敗しました：${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
    }
  };

  const approved = project.status === "approved" || project.status === "exported";

  return (
    <div className="space-y-4">
      <section className="card space-y-3">
        <h2 className="font-bold">品質確認（人が確認する項目）</h2>
        <ul className="space-y-2">
          {QUALITY_ITEMS.map((i) => (
            <li key={i.key}>
              <label className="flex items-center gap-2 text-sm">
                <input type="checkbox" checked={Boolean(q.checks[i.key])} onChange={(e) => setCheck(i.key, e.target.checked)} />
                {i.label}
              </label>
            </li>
          ))}
        </ul>
        <label className="block text-sm">
          確認メモ
          <textarea className="input mt-1" rows={3} value={q.notes} onChange={(e) => setQ({ notes: e.target.value })} />
        </label>
        <div className="rounded border border-stone-200 p-3">
          <p className="text-sm font-semibold">最終確認者の承認</p>
          {approved && q.approvedBy ? (
            <div className="mt-2 flex flex-wrap items-center gap-2 text-sm">
              <span className="badge bg-emerald-100 text-emerald-900">承認済み</span>
              {q.approvedBy}（{formatDate(q.approvedAt)}）
              <button className="btn btn-sm ml-auto" onClick={() => void revoke()}>
                承認を取り消す
              </button>
            </div>
          ) : (
            <div className="mt-2 flex flex-wrap items-center gap-2">
              <input className="input max-w-xs" placeholder="最終確認者の名前" value={approver} onChange={(e) => setApprover(e.target.value)} />
              <button className="btn btn-primary" onClick={() => void approve()}>
                承認する
              </button>
              {project.status !== "review" && (
                <button className="btn" onClick={() => update((p) => ({ ...p, status: "review" }))}>
                  「要確認」にする
                </button>
              )}
            </div>
          )}
          <p className="hint">自動チェックやAI評価の結果だけで「承認済み」になることはありません。</p>
        </div>
      </section>

      <section className="card space-y-2">
        <h2 className="font-bold">自動チェック（ローカル・参考）</h2>
        <ul className="space-y-1 text-sm">
          {auto.map((a) => (
            <li key={a.label} className="flex gap-2">
              <span className={a.ok ? "text-emerald-700" : "text-amber-700"}>{a.ok ? "✓" : "!"}</span>
              <span className="w-36 shrink-0 font-medium">{a.label}</span>
              <span className="text-stone-600">{a.detail}</span>
            </li>
          ))}
        </ul>
        <p className="hint">
          APIを使わずに判定しています。数値・事例の根拠は
          <Link className="underline" href="/cases">
            事例・根拠
          </Link>
          の登録内容と照らしてご自身で確認してください。
        </p>
      </section>

      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">AIによる参考評価</h2>
          <button className="btn btn-sm ml-auto" onClick={() => void aiReview()} disabled={busy}>
            {busy ? "評価中…" : usesApi ? "AIで評価する（API使用・料金が発生します）" : "評価する（デモ出力）"}
          </button>
        </div>
        <p className="hint">参考表示です。承認状態は変わりません。</p>
        {q.aiReview && (
          <div className="rounded bg-stone-50 p-3">
            <p className="mb-1 text-xs text-stone-500">{formatDate(q.aiReview.createdAt)} の評価</p>
            <Markdown text={q.aiReview.content} />
          </div>
        )}
      </section>
    </div>
  );
}
