"use client";

import Link from "next/link";
import { Collapsible, Field } from "@/components/common";
import { useStore } from "@/components/StoreProvider";
import { nowIso } from "@/lib/defaults";
import { pct, suggestionsFor, type SimilarityHit } from "@/lib/similarity";
import { FORMATS, LEVELS, type Brief, type Project } from "@/lib/types";

export function OverviewTab({ project, update, hits }: { project: Project; update: (fn: (p: Project) => Project) => void; hits?: SimilarityHit[] }) {
  const { store } = useStore();
  const set = <K extends keyof Project>(k: K, v: Project[K]) => update((p) => ({ ...p, [k]: v, updatedAt: nowIso() }));
  const setBrief = <K extends keyof Brief>(k: K, v: Brief[K]) => update((p) => ({ ...p, brief: { ...p.brief, [k]: v }, updatedAt: nowIso() }));
  const cases = store?.cases ?? [];

  return (
    <div className="space-y-4">
      {hits && hits.length > 0 && (
        <div className="card border-amber-300 bg-amber-50">
          <p className="font-semibold text-amber-900">似ている企画があります（ローカル類似チェック）</p>
          <ul className="mt-2 space-y-2 text-sm">
            {hits.map((h) => (
              <li key={h.otherId} className="rounded bg-white p-2">
                <Link href={`/projects/${h.otherId}`} className="font-medium underline">
                  {h.otherTitle}
                </Link>
                <span className="ml-2 text-xs text-stone-600">
                  {h.reasons.join("・")}（タイトル・読者 {pct(h.titleAudience)}／課題 {pct(h.problem)}／目次・本文 {pct(h.content)}）
                </span>
                <ul className="mt-1 ml-4 list-disc text-xs text-stone-700">
                  {suggestionsFor(h).map((s) => (
                    <li key={s}>{s}</li>
                  ))}
                </ul>
              </li>
            ))}
          </ul>
        </div>
      )}

      <section className="card grid gap-4 md:grid-cols-2">
        <Field label="想定読者">
          <textarea className="input" rows={2} value={project.audience} onChange={(e) => set("audience", e.target.value)} />
        </Field>
        <Field label="解決する課題">
          <textarea className="input" rows={2} value={project.problem} onChange={(e) => set("problem", e.target.value)} />
        </Field>
        <Field label="読者が実行できるようになること">
          <textarea className="input" rows={2} value={project.outcome} onChange={(e) => set("outcome", e.target.value)} />
        </Field>
        <Field label="この商品固有の価値" hint="他の商品と何が違うかを1〜2文で">
          <textarea className="input" rows={2} value={project.uniqueValue} onChange={(e) => set("uniqueValue", e.target.value)} />
        </Field>
        <Field label="独自性の根拠" hint="どの経験・判断基準・事例に基づくか。根拠がなければ【要確認】のままにします">
          <textarea className="input" rows={2} value={project.uniquenessBasis} onChange={(e) => set("uniquenessBasis", e.target.value)} />
        </Field>
        <div className="grid grid-cols-2 gap-3">
          <Field label="テーマ">
            <input className="input" list="ov-themes" value={project.theme} onChange={(e) => set("theme", e.target.value)} />
            <datalist id="ov-themes">
              {store?.settings.themes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="形式">
            <input className="input" list="ov-formats" value={project.format} onChange={(e) => set("format", e.target.value)} />
            <datalist id="ov-formats">
              {FORMATS.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
          </Field>
          <Field label="読者の経験レベル">
            <select className="input" value={project.level} onChange={(e) => set("level", e.target.value)}>
              {[...new Set([project.level, ...LEVELS])].map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
          <Field label="希望価格帯">
            <input className="input" value={project.priceRange} onChange={(e) => set("priceRange", e.target.value)} />
          </Field>
        </div>
      </section>

      <Collapsible title="生成に使う根拠（経験・判断基準・事例・制限）" defaultOpen>
        <div className="space-y-4">
          <Field label="発信者の経験・判断基準" hint="【経験則】として使われます">
            <textarea className="input" rows={3} value={project.brief.authorCriteria} onChange={(e) => setBrief("authorCriteria", e.target.value)} />
          </Field>
          <div>
            <span className="label">この企画で使用してよい事例</span>
            {cases.length === 0 ? (
              <p className="text-sm text-stone-500">
                事例が登録されていません。生成時に事例・数値は使われません。
                <Link href="/cases" className="ml-1 underline">
                  事例を登録
                </Link>
              </p>
            ) : (
              <ul className="space-y-1">
                {cases.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={project.brief.caseIds.includes(c.id)}
                        onChange={(e) =>
                          setBrief("caseIds", e.target.checked ? [...project.brief.caseIds, c.id] : project.brief.caseIds.filter((x) => x !== c.id))
                        }
                      />
                      <span>
                        {c.name}
                        <span className="ml-2 text-xs text-stone-500">
                          対象期間：{c.period || "未入力"}／結果（入力値）：{c.result || "未入力"}／確認日：{c.checkedAt || "未入力"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field label="事例についての補足">
            <textarea className="input" rows={2} value={project.brief.caseNotes} onChange={(e) => setBrief("caseNotes", e.target.value)} />
          </Field>
          <Field label="含めてはいけない内容・表現">
            <textarea className="input" rows={2} value={project.brief.exclusions} onChange={(e) => setBrief("exclusions", e.target.value)} />
          </Field>
          <Field label="読者が得たい結果（企画時の入力）">
            <textarea className="input" rows={2} value={project.brief.desiredOutcome} onChange={(e) => setBrief("desiredOutcome", e.target.value)} />
          </Field>
        </div>
      </Collapsible>
    </div>
  );
}
