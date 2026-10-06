import { emptySections, newId, nowIso } from "./defaults";
import type { ChapterPlan } from "./generation";
import type { Brief, Chapter, HistoryEntry, IdeaDraft, Project, SectionKey } from "./types";

export const HISTORY_LIMIT = 30;
/** 手入力の編集で自動的に版を残す間隔 */
export const AUTO_SNAPSHOT_MS = 5 * 60 * 1000;

interface Versioned {
  content: string;
  history: HistoryEntry[];
  updatedAt?: string;
  generatedAt?: string;
}

function pushHistory<T extends Versioned>(target: T, reason: string): T {
  if (!target.content.trim()) return target;
  if (target.history[0]?.content === target.content) return target;
  const entry: HistoryEntry = { content: target.content, savedAt: nowIso(), reason };
  return { ...target, history: [entry, ...target.history].slice(0, HISTORY_LIMIT) };
}

/**
 * 手入力による編集。前回の版から一定時間たっていれば編集前の内容を履歴に残す。
 */
export function editVersioned<T extends Versioned>(target: T, content: string): T {
  const last = target.history[0]?.savedAt;
  const stale = !last || Date.now() - new Date(last).getTime() > AUTO_SNAPSHOT_MS;
  const base = stale && target.content !== content ? pushHistory(target, "自動保存（編集前の内容）") : target;
  return { ...base, content, updatedAt: nowIso() };
}

/** 生成結果などで置き換える（現在の内容は必ず履歴へ） */
export function replaceVersioned<T extends Versioned>(target: T, content: string, reason: string, generated = false): T {
  const base = pushHistory(target, reason);
  return { ...base, content, updatedAt: nowIso(), ...(generated ? { generatedAt: nowIso() } : {}) };
}

export function snapshotVersioned<T extends Versioned>(target: T, reason = "手動で版を保存"): T {
  return pushHistory(target, reason);
}

/** 履歴の版に戻す（戻す前の内容も履歴に残す） */
export function restoreVersioned<T extends Versioned>(target: T, index: number): T {
  const entry = target.history[index];
  if (!entry) return target;
  const base = pushHistory(target, "復元前の内容");
  return { ...base, content: entry.content, updatedAt: nowIso() };
}

function touch(p: Project): Project {
  const hasContent =
    Object.values(p.sections).some((s) => s.content.trim()) || p.chapters.some((c) => c.content.trim());
  return { ...p, updatedAt: nowIso(), status: p.status === "plan" && hasContent ? "writing" : p.status };
}

export function updateSection(p: Project, key: SectionKey, fn: (s: Project["sections"][SectionKey]) => Project["sections"][SectionKey]): Project {
  return touch({ ...p, sections: { ...p.sections, [key]: fn(p.sections[key]) } });
}

export function updateChapter(p: Project, chapterId: string, fn: (c: Chapter) => Chapter): Project {
  return touch({ ...p, chapters: p.chapters.map((c) => (c.id === chapterId ? fn(c) : c)) });
}

export function newChapter(plan: Partial<ChapterPlan> = {}): Chapter {
  return {
    id: newId("ch"),
    title: plan.title ?? "新しい章",
    purpose: plan.purpose ?? "",
    readerTask: plan.readerTask ?? "",
    materials: plan.materials ?? "",
    content: "",
    history: [],
  };
}

/**
 * 生成した章構成を適用する。
 * 同じタイトルの章は本文と履歴を引き継ぎ、本文がある章で一致しないものは「（旧）」として末尾に残す。
 */
export function applyToc(p: Project, plans: ChapterPlan[], tocText: string): Project {
  const byTitle = new Map(p.chapters.map((c) => [c.title.trim(), c]));
  const used = new Set<string>();
  const chapters: Chapter[] = plans.map((plan) => {
    const prev = byTitle.get(plan.title.trim());
    if (prev && !used.has(prev.id)) {
      used.add(prev.id);
      return { ...prev, ...plan };
    }
    return newChapter(plan);
  });
  for (const c of p.chapters) {
    if (!used.has(c.id) && c.content.trim()) {
      chapters.push({ ...c, title: c.title.startsWith("（旧）") ? c.title : `（旧）${c.title}` });
    }
  }
  const withToc = updateSection(p, "toc", (s) => replaceVersioned(s, tocText, "章構成の再生成前", true));
  return touch({ ...withToc, chapters });
}

export function projectFromIdea(idea: IdeaDraft, brief: Brief): Project {
  const t = nowIso();
  return {
    id: newId("prj"),
    createdAt: t,
    updatedAt: t,
    status: "plan",
    title: idea.title,
    theme: brief.theme,
    format: idea.format,
    audience: idea.audience,
    problem: idea.problem,
    outcome: idea.outcome,
    uniqueValue: idea.uniqueValue,
    uniquenessBasis: idea.uniquenessBasis,
    level: idea.level || brief.level,
    priceRange: brief.priceRange,
    brief: { ...brief },
    sections: emptySections(),
    chapters: [],
    quality: { checks: {}, notes: "" },
  };
}

export function duplicateProject(p: Project): Project {
  const t = nowIso();
  return {
    ...structuredClone(p),
    id: newId("prj"),
    title: `${p.title}（コピー）`,
    createdAt: t,
    updatedAt: t,
    status: p.status === "approved" || p.status === "exported" ? "review" : p.status,
    isSample: false,
    exportedAt: undefined,
    // 承認は複製先に引き継がない
    quality: { checks: {}, notes: p.quality.notes },
  };
}

export function totalChars(p: Project): number {
  const all = [...Object.values(p.sections).map((s) => s.content), ...p.chapters.map((c) => c.content)].join("");
  return Array.from(all.replace(/\s/g, "")).length;
}
