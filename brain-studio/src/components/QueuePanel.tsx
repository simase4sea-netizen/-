"use client";

import type { JobView } from "./useQueue";

const LABEL: Record<JobView["status"], [string, string]> = {
  waiting: ["待機中", "text-stone-500"],
  running: ["生成中…", "text-sky-700 font-semibold"],
  done: ["完了", "text-emerald-700"],
  failed: ["失敗", "text-red-700 font-semibold"],
  stopped: ["停止", "text-stone-500"],
};

export function QueuePanel({
  jobs,
  running,
  counts,
  onStop,
  onRetry,
}: {
  jobs: JobView[];
  running: boolean;
  counts: { total: number; done: number; failed: number; stopped: number };
  onStop: () => void;
  onRetry: () => void;
}) {
  if (jobs.length === 0) return null;
  const pct = counts.total ? Math.round((counts.done / counts.total) * 100) : 0;
  return (
    <div className="card space-y-3" aria-live="polite">
      <div className="flex flex-wrap items-center gap-3">
        <strong className="text-sm">
          進捗 {counts.done}/{counts.total}
          {counts.failed > 0 && <span className="ml-2 text-red-700">失敗 {counts.failed}</span>}
          {counts.stopped > 0 && <span className="ml-2 text-stone-500">停止 {counts.stopped}</span>}
        </strong>
        <div className="ml-auto flex gap-2">
          {running && (
            <button className="btn btn-sm" onClick={onStop}>
              停止
            </button>
          )}
          {!running && counts.failed + counts.stopped > 0 && (
            <button className="btn btn-sm btn-primary" onClick={onRetry}>
              失敗・停止分だけ再試行
            </button>
          )}
        </div>
      </div>
      <div className="h-2 overflow-hidden rounded bg-stone-100">
        <div className="h-full bg-emerald-600 transition-all" style={{ width: `${pct}%` }} />
      </div>
      <ul className="max-h-48 space-y-1 overflow-y-auto text-xs">
        {jobs.map((j) => (
          <li key={j.id} className="flex gap-2">
            <span className={`w-14 shrink-0 ${LABEL[j.status][1]}`}>{LABEL[j.status][0]}</span>
            <span className="flex-1">{j.label}</span>
            {j.error && <span className="text-red-700">{j.error}</span>}
          </li>
        ))}
      </ul>
    </div>
  );
}
