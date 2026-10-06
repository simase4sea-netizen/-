"use client";

import Link from "next/link";
import { useParams } from "next/navigation";
import { useMemo, useState } from "react";
import { SaveIndicator, SimilarityBadge, StatusBadge } from "@/components/common";
import { BodyTab } from "@/components/project/BodyTab";
import { ExportTab } from "@/components/project/ExportTab";
import { OverviewTab } from "@/components/project/OverviewTab";
import { QualityTab } from "@/components/project/QualityTab";
import { SectionTab } from "@/components/project/SectionTab";
import { useStore } from "@/components/StoreProvider";
import { findSimilar, projectToComparable } from "@/lib/similarity";
import { SECTION_DEFS, STATUS_LABELS, type Project, type SectionKey, type Status } from "@/lib/types";

type Tab = "overview" | SectionKey | "body" | "quality" | "export";

export default function ProjectPage() {
  const { id } = useParams<{ id: string }>();
  const { store, getProject, updateProject, saveStates } = useStore();
  const [tab, setTab] = useState<Tab>("overview");
  const project = getProject(id);
  const projects = useMemo(() => store?.projects ?? [], [store]);
  const similar = useMemo(() => findSimilar(projects.map(projectToComparable)), [projects]);

  if (!project) {
    return (
      <div className="card">
        <p>企画が見つかりません（削除された可能性があります）。</p>
        <Link href="/library" className="btn mt-3">
          ライブラリへ戻る
        </Link>
      </div>
    );
  }

  const update = (fn: (p: Project) => Project) => updateProject(project.id, fn);
  const hits = similar.get(project.id);

  const tabs: { key: Tab; label: string; done?: boolean }[] = [
    { key: "overview", label: "概要" },
    ...SECTION_DEFS.map((d) => ({
      key: d.key as Tab,
      label: `${d.step}. ${d.label}`,
      done: d.key === "body" ? project.chapters.length > 0 && project.chapters.every((c) => c.content.trim()) : Boolean(project.sections[d.key as SectionKey].content.trim()),
    })),
    { key: "quality", label: "品質確認" },
    { key: "export", label: "書き出し" },
  ];

  const changeStatus = (s: Status) => update((p) => ({ ...p, status: s }));
  const approvedEditedLater =
    project.quality.approvedAt && (project.status === "approved" || project.status === "exported") && project.updatedAt > project.quality.approvedAt;

  return (
    <div className="space-y-4">
      <div className="flex flex-wrap items-center gap-2 text-sm">
        <Link href="/library" className="text-stone-500 hover:underline">
          ← ライブラリ
        </Link>
        <span className="ml-auto">
          <SaveIndicator state={saveStates[project.id]} />
        </span>
      </div>

      <div className="space-y-2">
        <input
          className="w-full rounded border border-transparent bg-transparent px-1 text-xl font-bold hover:border-stone-200 focus:border-emerald-700 focus:outline-none"
          value={project.title}
          onChange={(e) => update((p) => ({ ...p, title: e.target.value, updatedAt: new Date().toISOString() }))}
          aria-label="仮タイトル"
        />
        <div className="flex flex-wrap items-center gap-2">
          <StatusBadge status={project.status} />
          <select
            className="input w-auto py-1 text-xs"
            value={project.status}
            onChange={(e) => changeStatus(e.target.value as Status)}
            aria-label="ステータス変更"
          >
            {(["plan", "writing", "review"] as Status[]).map((s) => (
              <option key={s} value={s}>
                {STATUS_LABELS[s]}
              </option>
            ))}
            <option value="approved" disabled={project.status !== "approved"}>
              承認済み（品質確認タブで承認）
            </option>
            <option value="exported" disabled={project.status !== "exported"}>
              書き出し済み（承認後の書き出しで設定）
            </option>
          </select>
          <SimilarityBadge hits={hits} />
          {project.isSample && <span className="badge bg-stone-100 text-stone-600">サンプル</span>}
          <span className="text-xs text-stone-500">{project.format}／{project.theme}</span>
        </div>
        {approvedEditedLater && (
          <p className="rounded bg-amber-50 p-2 text-xs text-amber-900">
            承認後に内容が編集されています。書き出し前に品質確認タブで再確認してください。
          </p>
        )}
      </div>

      <nav className="-mx-4 overflow-x-auto px-4">
        <div className="flex min-w-max gap-1 border-b border-stone-200">
          {tabs.map((t) => (
            <button
              key={t.key}
              onClick={() => setTab(t.key)}
              className={`-mb-px border-b-2 px-3 py-2 text-sm whitespace-nowrap ${
                tab === t.key ? "border-emerald-700 font-semibold text-emerald-900" : "border-transparent text-stone-600 hover:text-stone-900"
              }`}
            >
              {t.label}
              {t.done && <span className="ml-1 text-emerald-600">✓</span>}
            </button>
          ))}
        </div>
      </nav>

      {tab === "overview" && <OverviewTab project={project} update={update} hits={hits} />}
      {tab === "body" && <BodyTab project={project} update={update} />}
      {(["design", "toc", "free", "sales", "bonus", "promo"] as SectionKey[]).includes(tab as SectionKey) && (
        <SectionTab key={tab} project={project} sectionKey={tab as SectionKey} update={update} />
      )}
      {tab === "quality" && <QualityTab project={project} update={update} hits={hits} />}
      {tab === "export" && <ExportTab project={project} update={update} />}
    </div>
  );
}
