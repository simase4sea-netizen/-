"use client";

import { VersionedEditor, type GenResult } from "@/components/VersionedEditor";
import { headingLengths } from "@/lib/checks";
import { callGenerate, type ChapterPlan } from "@/lib/generation";
import { applyToc, editVersioned, replaceVersioned, restoreVersioned, snapshotVersioned, updateSection } from "@/lib/projectOps";
import { SECTION_DEFS, type Project, type SectionKey } from "@/lib/types";

const PROMO_LIMITS: Record<string, string> = { X: "全角140字以内が目安（1案あたり）", Instagram: "キャプションは2,200字以内", Brain: "120字程度が目安" };

export function SectionTab({ project, sectionKey, update }: { project: Project; sectionKey: SectionKey; update: (fn: (p: Project) => Project) => void }) {
  const def = SECTION_DEFS.find((d) => d.key === sectionKey)!;
  const s = project.sections[sectionKey];

  const prereq =
    sectionKey !== "design" && !project.sections.design.content.trim()
      ? "先に「商品の基本設計」を作ると、内容の一貫性が高まります。"
      : (sectionKey === "free" || sectionKey === "sales" || sectionKey === "promo") && project.chapters.length === 0
        ? "目次（章構成）を先に作ると、扱う内容や目次が反映されます。"
        : undefined;

  const generate = async (signal: AbortSignal): Promise<GenResult> => {
    const r = await callGenerate({ task: "section", project, section: sectionKey }, signal);
    return { text: r.text ?? "", demo: r.demo, truncated: r.truncated, payload: r.chapters };
  };

  const onAccept = (r: GenResult, mode: "replace" | "append") => {
    if (sectionKey === "toc" && mode === "replace" && Array.isArray(r.payload)) {
      update((p) => applyToc(p, r.payload as ChapterPlan[], r.text));
      return;
    }
    update((p) =>
      updateSection(p, sectionKey, (sec) =>
        mode === "replace"
          ? replaceVersioned(sec, r.text, "再生成前の内容", true)
          : replaceVersioned(sec, `${sec.content.trimEnd()}\n\n${r.text}`, "追加前の内容", true),
      ),
    );
  };

  const promoExtra =
    sectionKey === "promo" && s.content.trim() ? (
      <div className="rounded bg-stone-50 p-2 text-xs">
        <p className="font-semibold">媒体ごとの文字数（見出し単位）</p>
        <ul className="mt-1 space-y-0.5">
          {headingLengths(s.content).map((h) => {
            const key = Object.keys(PROMO_LIMITS).find((k) => h.heading.includes(k));
            const over = key === "X" && h.xWeighted > 300;
            return (
              <li key={h.heading} className={over ? "text-red-700" : ""}>
                {h.heading}：{h.chars}字{key === "X" && `（X換算 ${h.xWeighted}、2案合計）`}
                {key && <span className="ml-1 text-stone-500">— {PROMO_LIMITS[key]}</span>}
              </li>
            );
          })}
        </ul>
      </div>
    ) : null;

  const tocExtra =
    sectionKey === "toc" ? (
      <div className="rounded bg-stone-50 p-2 text-xs text-stone-600">
        <p>
          生成した章構成を「置き換える」と、本文タブの章一覧にも反映されます（同じタイトルの章は本文を引き継ぎ、本文がある章で一致しないものは「（旧）」として残ります）。
          章の追加・削除・並べ替えは本文タブで行えます。現在の章数：{project.chapters.length}
        </p>
      </div>
    ) : null;

  return (
    <section className="card space-y-2">
      <div>
        <h2 className="font-bold">
          {def.step}. {def.label}
        </h2>
        <p className="text-xs text-stone-500">{def.help}</p>
      </div>
      <VersionedEditor
        label={def.label}
        content={s.content}
        history={s.history}
        updatedAt={s.updatedAt}
        generatedAt={s.generatedAt}
        onEdit={(c) => update((p) => updateSection(p, sectionKey, (sec) => editVersioned(sec, c)))}
        onAccept={onAccept}
        onRestore={(i) => update((p) => updateSection(p, sectionKey, (sec) => restoreVersioned(sec, i)))}
        onSnapshot={() => update((p) => updateSection(p, sectionKey, (sec) => snapshotVersioned(sec)))}
        generate={generate}
        sendWhat="この企画の概要・入力した根拠・選択した事例・作成済みのセクション"
        generateHint={prereq}
        allowAppend={sectionKey !== "toc"}
        extra={promoExtra ?? tocExtra}
      />
    </section>
  );
}
