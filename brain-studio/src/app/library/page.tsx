"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useMemo, useRef, useState } from "react";
import { formatDate, SimilarityBadge, StatusBadge } from "@/components/common";
import { QueuePanel } from "@/components/QueuePanel";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { useQueue } from "@/components/useQueue";
import { countNeedsCheck } from "@/lib/checks";
import { newId, nowIso } from "@/lib/defaults";
import { download, projectsCsv, projectsZip } from "@/lib/export";
import { callGenerate } from "@/lib/generation";
import { duplicateProject, replaceVersioned, updateSection } from "@/lib/projectOps";
import { findSimilar, pct, projectToComparable, suggestionsFor } from "@/lib/similarity";
import { STATUS_LABELS, STATUS_ORDER, type Project, type Status } from "@/lib/types";

function LibraryInner() {
  const { store, addProjects, deleteProject, updateProject, flushProject, usesApi } = useStore();
  const { confirm, notify, confirmApiSend } = useUI();
  const params = useSearchParams();
  const router = useRouter();
  const [q, setQ] = useState("");
  const [theme, setTheme] = useState("");
  const [status, setStatus] = useState<Status | "">((params.get("status") as Status) ?? "");
  const [dupOnly, setDupOnly] = useState(false);
  const [sort, setSort] = useState<"updated" | "created" | "title">("updated");
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const fileRef = useRef<HTMLInputElement>(null);

  const projects = useMemo(() => store?.projects ?? [], [store]);
  const similar = useMemo(() => findSimilar(projects.map(projectToComparable)), [projects]);
  const themes = useMemo(() => [...new Set(projects.map((p) => p.theme).filter(Boolean))], [projects]);

  const queue = useQueue<{ projectId: string; text: string }>((_id, r) => {
    updateProject(r.projectId, (p) => updateSection(p, "design", (s) => replaceVersioned(s, r.text, "一括生成前の内容", true)));
  });

  const filtered = useMemo(() => {
    const words = q.trim().toLowerCase().split(/\s+/).filter(Boolean);
    return projects
      .filter((p) => !theme || p.theme === theme)
      .filter((p) => !status || p.status === status)
      .filter((p) => !dupOnly || similar.get(p.id)?.length)
      .filter((p) => {
        if (!words.length) return true;
        const hay = [p.title, p.audience, p.problem, p.outcome, p.uniqueValue, p.theme, p.format].join(" ").toLowerCase();
        return words.every((w) => hay.includes(w));
      })
      .sort((a, b) => (sort === "title" ? a.title.localeCompare(b.title, "ja") : sort === "created" ? b.createdAt.localeCompare(a.createdAt) : b.updatedAt.localeCompare(a.updatedAt)));
  }, [projects, q, theme, status, dupOnly, sort, similar]);

  if (!store) return null;
  const titleOf = (id: string) => projects.find((p) => p.id === id)?.title ?? id;
  const chosen = projects.filter((p) => selected.has(p.id));

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const remove = async (ids: string[]) => {
    const names = ids.map(titleOf);
    const ok = await confirm({
      title: `${ids.length}件の企画を削除しますか？`,
      message: (
        <div>
          <p>削除すると元に戻せません。必要ならJSONで書き出してから削除してください。</p>
          <ul className="mt-2 ml-4 list-disc text-xs">
            {names.slice(0, 8).map((n) => (
              <li key={n}>{n}</li>
            ))}
            {names.length > 8 && <li>ほか{names.length - 8}件</li>}
          </ul>
        </div>
      ),
      confirmLabel: "削除する",
      danger: true,
    });
    if (!ok) return;
    try {
      for (const id of ids) await deleteProject(id);
      setSelected(new Set());
      notify(`${ids.length}件を削除しました`, "success");
    } catch (e) {
      notify(`削除に失敗しました：${(e as Error).message}`, "error");
    }
  };

  const duplicate = async (p: Project) => {
    const copy = duplicateProject(p);
    await addProjects([copy]);
    notify("複製しました（承認状態は引き継ぎません）", "success");
  };

  const exportZip = async () => {
    for (const p of chosen) await flushProject(p.id);
    const zip = projectsZip(chosen, store.cases);
    download(`brain-contents-${nowIso().slice(0, 10)}.zip`, zip, "application/zip");
    markExported(chosen);
  };

  const markExported = (list: Project[]) => {
    for (const p of list) {
      updateProject(p.id, (x) => ({ ...x, exportedAt: nowIso(), status: x.status === "approved" ? "exported" : x.status }));
    }
    const unapproved = list.filter((p) => p.status !== "approved" && p.status !== "exported").length;
    notify(unapproved ? `書き出しました（未承認${unapproved}件はステータスを変えていません）` : "書き出しました", "success");
  };

  const bulkDesign = async () => {
    const targets = chosen.filter((p) => !p.sections.design.content.trim());
    const skipped = chosen.length - targets.length;
    if (!targets.length) {
      notify("選択した企画はすべて基本設計が作成済みです。個別の編集画面から再生成してください。", "info");
      return;
    }
    if (!(await confirmApiSend(`選択した${targets.length}件の企画内容と、選択済みの事例`))) return;
    queue.start(
      targets.map((p) => ({
        id: newId("job"),
        label: `基本設計：${p.title}`,
        run: async (signal) => {
          const res = await callGenerate({ task: "section", project: p, section: "design" }, signal);
          return { projectId: p.id, text: res.text ?? "" };
        },
      })),
    );
    if (skipped) notify(`作成済みの${skipped}件はスキップしました`);
  };

  const importJson = async (file: File) => {
    try {
      const data = JSON.parse(await file.text()) as { project?: Project; projects?: Project[] };
      const list = data.project ? [data.project] : (data.projects ?? []);
      if (!list.length || !list.every((p) => p.title && p.sections && p.brief)) throw new Error("このツールのJSONバックアップではありません");
      const fresh = list.map((p) => ({ ...p, id: newId("prj"), title: p.title, updatedAt: nowIso() }));
      await addProjects(fresh);
      notify(`${fresh.length}件を読み込みました（事例はインポートされません）`, "success");
    } catch (e) {
      notify(`読み込めませんでした：${(e as Error).message}`, "error");
    }
  };

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2">
        <h1 className="text-xl font-bold">企画ライブラリ</h1>
        <span className="text-sm text-stone-500">
          {filtered.length}/{projects.length}件
        </span>
        <div className="ml-auto flex flex-wrap gap-2">
          <Link href="/new" className="btn btn-primary btn-sm">
            新しい企画
          </Link>
          <button className="btn btn-sm" onClick={() => download(`企画一覧-${nowIso().slice(0, 10)}.csv`, projectsCsv(filtered), "text/csv;charset=utf-8")}>
            一覧をCSV書き出し
          </button>
          <button className="btn btn-sm" onClick={() => fileRef.current?.click()}>
            JSONバックアップを読み込む
          </button>
          <input
            ref={fileRef}
            type="file"
            accept="application/json,.json"
            className="hidden"
            onChange={(e) => {
              const f = e.target.files?.[0];
              if (f) void importJson(f);
              e.target.value = "";
            }}
          />
        </div>
      </div>

      <div className="card grid gap-2 sm:grid-cols-2 lg:grid-cols-5">
        <input className="input lg:col-span-2" placeholder="検索（タイトル・読者・課題・価値）" value={q} onChange={(e) => setQ(e.target.value)} />
        <select className="input" value={theme} onChange={(e) => setTheme(e.target.value)} aria-label="テーマ">
          <option value="">すべてのテーマ</option>
          {themes.map((t) => (
            <option key={t}>{t}</option>
          ))}
        </select>
        <select className="input" value={status} onChange={(e) => setStatus(e.target.value as Status | "")} aria-label="ステータス">
          <option value="">すべての状態</option>
          {STATUS_ORDER.map((s) => (
            <option key={s} value={s}>
              {STATUS_LABELS[s]}
            </option>
          ))}
        </select>
        <select className="input" value={sort} onChange={(e) => setSort(e.target.value as typeof sort)} aria-label="並び順">
          <option value="updated">更新が新しい順</option>
          <option value="created">作成が新しい順</option>
          <option value="title">タイトル順</option>
        </select>
        <label className="flex items-center gap-2 text-sm">
          <input type="checkbox" checked={dupOnly} onChange={(e) => setDupOnly(e.target.checked)} />
          類似の警告があるものだけ
        </label>
      </div>

      <div className="flex flex-wrap items-center gap-2 text-sm">
        <button className="btn btn-sm" onClick={() => setSelected(new Set(filtered.map((p) => p.id)))}>
          表示中をすべて選択
        </button>
        <button className="btn btn-sm" onClick={() => setSelected(new Set())} disabled={!selected.size}>
          選択解除
        </button>
        <span className="text-stone-500">{selected.size}件選択中</span>
        <div className="ml-auto flex flex-wrap gap-2">
          <button className="btn btn-sm" disabled={!selected.size || queue.running} onClick={() => void bulkDesign()} title={usesApi ? "APIを使用します" : "デモ出力"}>
            選択した企画の基本設計を順番に生成{usesApi ? "（API使用）" : ""}
          </button>
          <button className="btn btn-sm" disabled={!selected.size} onClick={() => void exportZip()}>
            選択をZIPで書き出し
          </button>
          <button className="btn btn-sm" disabled={!selected.size} onClick={() => void remove([...selected])}>
            選択を削除
          </button>
        </div>
      </div>

      <QueuePanel jobs={queue.jobs} running={queue.running} counts={queue.counts} onStop={queue.stop} onRetry={queue.retryFailed} />

      {filtered.length === 0 && <p className="card text-sm text-stone-500">条件に合う企画がありません。</p>}

      <div className="grid gap-3 lg:grid-cols-2">
        {filtered.map((p) => {
          const hits = similar.get(p.id);
          const needs = countNeedsCheck([p.uniquenessBasis, p.sections.design.content, ...p.chapters.map((c) => c.content)].join("\n"));
          return (
            <article key={p.id} className={`card flex flex-col gap-2 ${selected.has(p.id) ? "ring-2 ring-emerald-600" : ""}`}>
              <div className="flex items-start gap-2">
                <input type="checkbox" className="mt-1.5" checked={selected.has(p.id)} onChange={() => toggle(p.id)} aria-label="選択" />
                <Link href={`/projects/${p.id}`} className="flex-1 font-semibold hover:underline">
                  {p.title}
                </Link>
                <StatusBadge status={p.status} />
              </div>
              <dl className="grid grid-cols-[7.5rem_1fr] gap-x-2 gap-y-1 text-sm">
                <dt className="text-stone-500">想定読者</dt>
                <dd>{p.audience || "-"}</dd>
                <dt className="text-stone-500">解決する課題</dt>
                <dd>{p.problem || "-"}</dd>
                <dt className="text-stone-500">実行できること</dt>
                <dd>{p.outcome || "-"}</dd>
                <dt className="text-stone-500">形式</dt>
                <dd>{p.format}</dd>
                <dt className="text-stone-500">この商品固有の価値</dt>
                <dd className="font-medium text-emerald-900">{p.uniqueValue || "-"}</dd>
                <dt className="text-stone-500">独自性の根拠</dt>
                <dd>{p.uniquenessBasis || "-"}</dd>
                <dt className="text-stone-500">作成日時</dt>
                <dd>{formatDate(p.createdAt)}</dd>
              </dl>
              <div className="flex flex-wrap items-center gap-2">
                <SimilarityBadge hits={hits} />
                {needs > 0 && <span className="badge bg-yellow-100 text-yellow-900">要確認 {needs}</span>}
                {p.isSample && <span className="badge bg-stone-100 text-stone-600">サンプル</span>}
              </div>
              {hits?.slice(0, 2).map((h) => (
                <details key={h.otherId} className="rounded bg-amber-50 p-2 text-xs">
                  <summary className="cursor-pointer">
                    「{h.otherTitle}」と{h.reasons.join("・")}
                  </summary>
                  <p className="mt-1 text-stone-600">
                    タイトル・読者 {pct(h.titleAudience)}／課題 {pct(h.problem)}／目次・本文 {pct(h.content)}
                  </p>
                  <ul className="mt-1 ml-4 list-disc text-stone-700">
                    {suggestionsFor(h).map((s) => (
                      <li key={s}>{s}</li>
                    ))}
                  </ul>
                  <Link href={`/projects/${h.otherId}`} className="mt-1 inline-block underline">
                    相手の企画を開く
                  </Link>
                </details>
              ))}
              <div className="mt-auto flex flex-wrap gap-2 pt-1">
                <button className="btn btn-sm btn-primary" onClick={() => router.push(`/projects/${p.id}`)}>
                  編集
                </button>
                <button className="btn btn-sm" onClick={() => void duplicate(p)}>
                  複製
                </button>
                <button className="btn btn-sm" onClick={() => void remove([p.id])}>
                  削除
                </button>
              </div>
            </article>
          );
        })}
      </div>
    </div>
  );
}

export default function LibraryPage() {
  return (
    <Suspense fallback={null}>
      <LibraryInner />
    </Suspense>
  );
}
