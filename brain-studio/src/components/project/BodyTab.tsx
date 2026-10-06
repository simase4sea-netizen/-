"use client";

import { useState } from "react";
import { QueuePanel } from "@/components/QueuePanel";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { useQueue } from "@/components/useQueue";
import { VersionedEditor, type GenResult } from "@/components/VersionedEditor";
import { callGenerate } from "@/lib/generation";
import { editVersioned, newChapter, replaceVersioned, restoreVersioned, snapshotVersioned, updateChapter } from "@/lib/projectOps";
import type { Chapter, Project } from "@/lib/types";

export function BodyTab({ project, update }: { project: Project; update: (fn: (p: Project) => Project) => void }) {
  const { confirm, confirmApiSend, notify } = useUI();
  const { getLatestProject, usesApi } = useStore();
  const [openId, setOpenId] = useState<string | null>(project.chapters[0]?.id ?? null);

  const queue = useQueue<{ chapterId: string; text: string }>((_id, r) => {
    update((p) => updateChapter(p, r.chapterId, (c) => (c.content.trim() ? c : replaceVersioned(c, r.text, "一括生成前", true))));
  });

  const move = (idx: number, dir: -1 | 1) =>
    update((p) => {
      const chapters = [...p.chapters];
      const j = idx + dir;
      if (j < 0 || j >= chapters.length) return p;
      [chapters[idx], chapters[j]] = [chapters[j], chapters[idx]];
      return { ...p, chapters, updatedAt: new Date().toISOString() };
    });

  const remove = async (c: Chapter) => {
    const ok = await confirm({
      title: `「${c.title}」を削除しますか？`,
      message: c.content.trim() ? "この章の本文と履歴も削除され、元に戻せません。" : "この章を削除します。",
      confirmLabel: "削除",
      danger: true,
    });
    if (ok) update((p) => ({ ...p, chapters: p.chapters.filter((x) => x.id !== c.id), updatedAt: new Date().toISOString() }));
  };

  const setMeta = (id: string, patch: Partial<Chapter>) => update((p) => updateChapter(p, id, (c) => ({ ...c, ...patch, updatedAt: new Date().toISOString() })));

  const generateEmpty = async () => {
    const empties = project.chapters.filter((c) => !c.content.trim());
    if (!empties.length) {
      notify("未執筆の章はありません。章ごとに再生成できます。");
      return;
    }
    if (!(await confirmApiSend(`この企画の内容と章構成（${empties.length}章分を1章ずつ順番に送信）`))) return;
    queue.start(
      empties.map((c) => ({
        id: c.id,
        label: c.title,
        run: async (signal) => {
          // 前の章の生成結果を反映した最新の企画を送る
          const latest = getLatestProject(project.id) ?? project;
          const r = await callGenerate({ task: "chapter", project: latest, chapterId: c.id }, signal);
          return { chapterId: c.id, text: r.text ?? "" };
        },
      })),
    );
  };

  return (
    <div className="space-y-3">
      <section className="card space-y-2">
        <div className="flex flex-wrap items-center gap-2">
          <h2 className="font-bold">3. 有料本文（章ごと）</h2>
          <div className="ml-auto flex flex-wrap gap-2">
            <button className="btn btn-sm" onClick={() => update((p) => ({ ...p, chapters: [...p.chapters, newChapter()], updatedAt: new Date().toISOString() }))}>
              章を追加
            </button>
            <button className="btn btn-sm btn-primary" disabled={queue.running || project.chapters.length === 0} onClick={() => void generateEmpty()}>
              未執筆の章を順番に生成{usesApi ? "（API）" : "（デモ）"}
            </button>
          </div>
        </div>
        <p className="text-xs text-stone-500">
          長文を一度に作らず、章ごとに生成・保存・再生成します。本文には手順・判断基準・記入例・チェックリストを含め、根拠のない箇所は【要確認】になります。
        </p>
        {project.chapters.length === 0 && (
          <p className="rounded bg-amber-50 p-2 text-sm text-amber-900">章がありません。「2. 目次と章構成」で生成するか、「章を追加」で手動で作ってください。</p>
        )}
      </section>

      <QueuePanel jobs={queue.jobs} running={queue.running} counts={queue.counts} onStop={queue.stop} onRetry={queue.retryFailed} />

      {project.chapters.map((c, i) => {
        const open = openId === c.id;
        return (
          <section key={c.id} className="card space-y-2">
            <div className="flex flex-wrap items-center gap-2">
              <button className="flex flex-1 items-center gap-2 text-left font-semibold" onClick={() => setOpenId(open ? null : c.id)} aria-expanded={open}>
                <span className="w-4 text-stone-400">{open ? "▾" : "▸"}</span>
                第{i + 1}章 {c.title}
                {c.content.trim() ? (
                  <span className="badge bg-emerald-50 text-emerald-800">{Array.from(c.content.replace(/\s/g, "")).length.toLocaleString()}字</span>
                ) : (
                  <span className="badge bg-stone-100 text-stone-500">未執筆</span>
                )}
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => move(i, -1)} disabled={i === 0} aria-label="上へ">
                ↑
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => move(i, 1)} disabled={i === project.chapters.length - 1} aria-label="下へ">
                ↓
              </button>
              <button className="btn btn-sm btn-ghost" onClick={() => void remove(c)}>
                削除
              </button>
            </div>
            {open && (
              <>
                <div className="grid gap-2 md:grid-cols-2">
                  <label className="text-xs">
                    章タイトル
                    <input className="input" value={c.title} onChange={(e) => setMeta(c.id, { title: e.target.value })} />
                  </label>
                  <label className="text-xs">
                    章の目的
                    <input className="input" value={c.purpose} onChange={(e) => setMeta(c.id, { purpose: e.target.value })} />
                  </label>
                  <label className="text-xs">
                    読者が行う作業
                    <input className="input" value={c.readerTask} onChange={(e) => setMeta(c.id, { readerTask: e.target.value })} />
                  </label>
                  <label className="text-xs">
                    必要な具体例・テンプレート
                    <input className="input" value={c.materials} onChange={(e) => setMeta(c.id, { materials: e.target.value })} />
                  </label>
                </div>
                <VersionedEditor
                  label={`第${i + 1}章`}
                  content={c.content}
                  history={c.history}
                  updatedAt={c.updatedAt}
                  generatedAt={c.generatedAt}
                  onEdit={(t) => update((p) => updateChapter(p, c.id, (x) => editVersioned(x, t)))}
                  onAccept={(r: GenResult, mode) =>
                    update((p) =>
                      updateChapter(p, c.id, (x) =>
                        mode === "replace"
                          ? replaceVersioned(x, r.text, "再生成前の内容", true)
                          : replaceVersioned(x, `${x.content.trimEnd()}\n\n${r.text}`, "追加前の内容", true),
                      ),
                    )
                  }
                  onRestore={(idx) => update((p) => updateChapter(p, c.id, (x) => restoreVersioned(x, idx)))}
                  onSnapshot={() => update((p) => updateChapter(p, c.id, (x) => snapshotVersioned(x)))}
                  generate={async (signal) => {
                    const r = await callGenerate({ task: "chapter", project, chapterId: c.id }, signal);
                    return { text: r.text ?? "", demo: r.demo, truncated: r.truncated };
                  }}
                  sendWhat="この企画の概要・根拠・選択した事例・章構成・他の章の要約"
                  rows={20}
                />
              </>
            )}
          </section>
        );
      })}
    </div>
  );
}
