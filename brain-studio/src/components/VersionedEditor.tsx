"use client";

import { useRef, useState } from "react";
import { countNeedsCheck, findRiskyExpressions } from "@/lib/checks";
import { GenerateError } from "@/lib/generation";
import type { HistoryEntry } from "@/lib/types";
import { formatDate } from "./common";
import { Markdown } from "./Markdown";
import { useStore } from "./StoreProvider";
import { useUI } from "./UIProvider";

export interface GenResult {
  text: string;
  demo?: boolean;
  truncated?: boolean;
  payload?: unknown;
}

interface Props {
  label: string;
  content: string;
  history: HistoryEntry[];
  updatedAt?: string;
  generatedAt?: string;
  onEdit: (content: string) => void;
  onAccept: (result: GenResult, mode: "replace" | "append") => void;
  onRestore: (index: number) => void;
  onSnapshot: () => void;
  generate?: (signal: AbortSignal) => Promise<GenResult>;
  /** API送信確認に表示する、送信内容の説明 */
  sendWhat?: string;
  generateHint?: string;
  allowAppend?: boolean;
  rows?: number;
  placeholder?: string;
  extra?: React.ReactNode;
  disabledReason?: string;
}

export function VersionedEditor(p: Props) {
  const { usesApi } = useStore();
  const { confirm, notify, confirmApiSend } = useUI();
  const [mode, setMode] = useState<"edit" | "preview">("edit");
  const [candidate, setCandidate] = useState<GenResult | null>(null);
  const [busy, setBusy] = useState(false);
  const [showHistory, setShowHistory] = useState(false);
  const ctrl = useRef<AbortController | null>(null);

  const risky = findRiskyExpressions(p.content);
  const needs = countNeedsCheck(p.content);
  const chars = Array.from(p.content.replace(/\s/g, "")).length;

  const run = async () => {
    if (!p.generate) return;
    if (p.content.trim()) {
      const ok = await confirm({
        title: `「${p.label}」を再生成しますか？`,
        message: "現在の内容は消えません。生成結果は「生成候補」として表示され、置き換え・末尾に追加・破棄を選べます。置き換えた場合も、元の内容は履歴から戻せます。",
        confirmLabel: "生成する",
      });
      if (!ok) return;
    }
    if (!(await confirmApiSend(p.sendWhat ?? "この企画の内容"))) return;
    setBusy(true);
    ctrl.current = new AbortController();
    try {
      const r = await p.generate(ctrl.current.signal);
      if (!p.content.trim()) {
        p.onAccept(r, "replace");
        notify(`「${p.label}」を生成しました${r.demo ? "（デモ出力）" : ""}`, "success");
      } else {
        setCandidate(r);
      }
      if (r.truncated) notify("出力が長さの上限で途中終了しました。内容を確認し、必要なら再生成してください。", "error");
    } catch (e) {
      if (e instanceof GenerateError && e.code === "ABORTED") notify("生成を停止しました");
      else notify(`生成に失敗しました：${(e as Error).message}`, "error");
    } finally {
      setBusy(false);
      ctrl.current = null;
    }
  };

  const restore = async (i: number) => {
    const h = p.history[i];
    const ok = await confirm({
      title: "この版に戻しますか？",
      message: `${formatDate(h.savedAt)}（${h.reason}）の内容に戻します。現在の内容は履歴に残ります。`,
      confirmLabel: "戻す",
    });
    if (ok) {
      p.onRestore(i);
      notify("履歴の版に戻しました", "success");
    }
  };

  return (
    <div className="space-y-2">
      <div className="flex flex-wrap items-center gap-2">
        <div className="inline-flex overflow-hidden rounded-md border border-stone-300 text-xs">
          <button className={`px-3 py-1 ${mode === "edit" ? "bg-stone-800 text-white" : "bg-white"}`} onClick={() => setMode("edit")}>
            編集
          </button>
          <button className={`px-3 py-1 ${mode === "preview" ? "bg-stone-800 text-white" : "bg-white"}`} onClick={() => setMode("preview")}>
            プレビュー
          </button>
        </div>
        <span className="text-xs text-stone-500">{chars.toLocaleString()}字</span>
        {needs > 0 && <span className="badge bg-yellow-100 text-yellow-900">要確認 {needs}</span>}
        {risky.length > 0 && <span className="badge bg-red-100 text-red-800">表現チェック {risky.length}</span>}
        <div className="ml-auto flex flex-wrap gap-2">
          {p.generate && !busy && (
            <button className="btn btn-sm btn-primary" onClick={() => void run()} disabled={Boolean(p.disabledReason)} title={p.disabledReason}>
              {p.content.trim() ? "再生成" : "生成"}
              {usesApi ? "（API）" : "（デモ）"}
            </button>
          )}
          {busy && (
            <button className="btn btn-sm" onClick={() => ctrl.current?.abort()}>
              生成中…停止
            </button>
          )}
          <button
            className="btn btn-sm"
            disabled={!p.history.length}
            onClick={() => void restore(0)}
            title="直前に保存された版に戻します"
          >
            直前の内容へ戻す
          </button>
          <button className="btn btn-sm" onClick={() => setShowHistory(!showHistory)}>
            履歴（{p.history.length}）
          </button>
          <button
            className="btn btn-sm"
            disabled={!p.content.trim()}
            onClick={() => {
              p.onSnapshot();
              notify("現在の内容を版として保存しました", "success");
            }}
          >
            版を保存
          </button>
        </div>
      </div>
      {p.disabledReason && <p className="text-xs text-amber-800">{p.disabledReason}</p>}
      {p.generateHint && <p className="hint">{p.generateHint}</p>}

      {candidate && (
        <div className="rounded-md border-2 border-sky-300 bg-sky-50 p-3">
          <div className="mb-2 flex flex-wrap items-center gap-2">
            <strong className="text-sm">生成候補{candidate.demo ? "（デモ出力）" : ""}</strong>
            <span className="text-xs text-stone-600">まだ反映されていません。現在の内容と比べて選んでください。</span>
            <div className="ml-auto flex flex-wrap gap-2">
              <button
                className="btn btn-sm btn-primary"
                onClick={() => {
                  p.onAccept(candidate, "replace");
                  setCandidate(null);
                  notify("置き換えました（元の内容は履歴にあります）", "success");
                }}
              >
                置き換える
              </button>
              {p.allowAppend !== false && (
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    p.onAccept(candidate, "append");
                    setCandidate(null);
                  }}
                >
                  末尾に追加
                </button>
              )}
              <button className="btn btn-sm" onClick={() => setCandidate(null)}>
                破棄
              </button>
            </div>
          </div>
          <div className="max-h-96 overflow-y-auto rounded bg-white p-3">
            <Markdown text={candidate.text} />
          </div>
        </div>
      )}

      {mode === "edit" ? (
        <textarea
          className="input font-mono text-[13px] leading-relaxed"
          rows={p.rows ?? 16}
          value={p.content}
          placeholder={p.placeholder ?? "Markdownで入力できます。「生成」でたたき台を作ることもできます。"}
          onChange={(e) => p.onEdit(e.target.value)}
        />
      ) : (
        <div className="min-h-32 rounded-md border border-stone-200 bg-white p-4">
          {p.content.trim() ? <Markdown text={p.content} /> : <p className="text-sm text-stone-400">まだ内容がありません</p>}
        </div>
      )}

      {p.extra}

      {risky.length > 0 && (
        <div className="rounded bg-red-50 p-2 text-xs text-red-900">
          <p className="font-semibold">誤認を招くおそれのある表現（ローカルチェック）</p>
          <ul className="ml-4 list-disc">
            {risky.map((r) => (
              <li key={r.phrase}>
                「{r.phrase}」{r.count > 1 ? `×${r.count}` : ""}：{r.reason}
              </li>
            ))}
          </ul>
        </div>
      )}

      <p className="text-xs text-stone-400">
        最終更新：{formatDate(p.updatedAt)}
        {p.generatedAt && `／最終生成：${formatDate(p.generatedAt)}`}
      </p>

      {showHistory && (
        <div className="rounded border border-stone-200 bg-stone-50 p-2">
          {p.history.length === 0 ? (
            <p className="text-xs text-stone-500">履歴はまだありません。再生成・復元の前や、編集から5分以上たったときに自動で残ります。</p>
          ) : (
            <ul className="space-y-1 text-xs">
              {p.history.map((h, i) => (
                <li key={`${h.savedAt}-${i}`} className="flex flex-wrap items-center gap-2 rounded bg-white p-2">
                  <span className="font-medium">{formatDate(h.savedAt)}</span>
                  <span className="text-stone-500">{h.reason}</span>
                  <span className="min-w-0 flex-1 truncate text-stone-400">{h.content.slice(0, 80)}</span>
                  <button className="btn btn-sm" onClick={() => void restore(i)}>
                    この版に戻す
                  </button>
                </li>
              ))}
            </ul>
          )}
        </div>
      )}
    </div>
  );
}
