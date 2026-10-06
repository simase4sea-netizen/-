"use client";

import { useCallback, useRef, useState } from "react";
import { GenerateError } from "@/lib/generation";

export type JobStatus = "waiting" | "running" | "done" | "failed" | "stopped";

export interface JobView {
  id: string;
  label: string;
  status: JobStatus;
  error?: string;
}

export interface JobDef<T> {
  id: string;
  label: string;
  run: (signal: AbortSignal) => Promise<T>;
}

/**
 * API負荷・料金に配慮して、ジョブを1件ずつ順番に処理するキュー。
 * 停止（実行中のリクエストも中断）と、失敗・停止分だけの再試行ができる。
 */
export function useQueue<T>(onResult: (jobId: string, result: T) => void, gapMs = 300) {
  const defs = useRef(new Map<string, JobDef<T>>());
  const [jobs, setJobs] = useState<JobView[]>([]);
  const [running, setRunning] = useState(false);
  const controller = useRef<AbortController | null>(null);
  const stopFlag = useRef(false);
  const onResultRef = useRef(onResult);
  onResultRef.current = onResult;
  const jobsRef = useRef<JobView[]>([]);

  const setJob = (id: string, patch: Partial<JobView>) => {
    jobsRef.current = jobsRef.current.map((j) => (j.id === id ? { ...j, ...patch } : j));
    setJobs(jobsRef.current);
  };

  const process = useCallback(async () => {
    setRunning(true);
    stopFlag.current = false;
    while (!stopFlag.current) {
      const next = jobsRef.current.find((j) => j.status === "waiting");
      if (!next) break;
      const def = defs.current.get(next.id);
      if (!def) {
        setJob(next.id, { status: "failed", error: "ジョブ定義がありません" });
        continue;
      }
      controller.current = new AbortController();
      setJob(next.id, { status: "running", error: undefined });
      try {
        const result = await def.run(controller.current.signal);
        setJob(next.id, { status: "done" });
        onResultRef.current(next.id, result);
      } catch (e) {
        const aborted = e instanceof GenerateError && e.code === "ABORTED";
        setJob(next.id, { status: aborted ? "stopped" : "failed", error: aborted ? undefined : (e as Error).message });
        // APIキー未設定・利用上限は続けても失敗するので止める
        if (e instanceof GenerateError && (e.code === "NO_API_KEY" || e.code === "RATE_LIMIT")) {
          stopFlag.current = true;
          for (const j of jobsRef.current) if (j.status === "waiting") setJob(j.id, { status: "stopped" });
        }
      }
      if (gapMs > 0 && !stopFlag.current) await new Promise((r) => setTimeout(r, gapMs));
    }
    controller.current = null;
    setRunning(false);
  }, [gapMs]);

  const start = useCallback(
    (list: JobDef<T>[]) => {
      defs.current = new Map(list.map((d) => [d.id, d]));
      jobsRef.current = list.map((d) => ({ id: d.id, label: d.label, status: "waiting" as const }));
      setJobs(jobsRef.current);
      void process();
    },
    [process],
  );

  const stop = useCallback(() => {
    stopFlag.current = true;
    controller.current?.abort();
    for (const j of jobsRef.current) if (j.status === "waiting") setJob(j.id, { status: "stopped" });
  }, []);

  const retryFailed = useCallback(() => {
    for (const j of jobsRef.current) if (j.status === "failed" || j.status === "stopped") setJob(j.id, { status: "waiting", error: undefined });
    void process();
  }, [process]);

  const clear = useCallback(() => {
    jobsRef.current = [];
    setJobs([]);
  }, []);

  const counts = {
    total: jobs.length,
    done: jobs.filter((j) => j.status === "done").length,
    failed: jobs.filter((j) => j.status === "failed").length,
    stopped: jobs.filter((j) => j.status === "stopped").length,
  };

  return { jobs, running, start, stop, retryFailed, clear, counts };
}
