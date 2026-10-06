"use client";

import Link from "next/link";
import { useRouter, useSearchParams } from "next/navigation";
import { Suspense, useEffect, useMemo, useState } from "react";
import { Collapsible, Field, SimilarityBadge } from "@/components/common";
import { QueuePanel } from "@/components/QueuePanel";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { useQueue, type JobDef } from "@/components/useQueue";
import { emptyBrief } from "@/lib/defaults";
import { callGenerate } from "@/lib/generation";
import { projectFromIdea } from "@/lib/projectOps";
import { findSimilar, pct, projectToComparable, suggestionsFor, type Comparable } from "@/lib/similarity";
import { FORMATS, LEVELS, type Brief, type IdeaDraft } from "@/lib/types";

const DRAFT_KEY = "brain-studio:new-drafts";

function NewPlanInner() {
  const { store, addProjects, usesApi } = useStore();
  const { notify, confirm, confirmApiSend } = useUI();
  const router = useRouter();
  const params = useSearchParams();
  const bulk = params.get("mode") === "bulk";
  const settings = store!.settings;

  const [brief, setBrief] = useState<Brief>(() => emptyBrief(settings));
  const [count, setCount] = useState(bulk ? 10 : 3);
  const [perRequest, setPerRequest] = useState(settings.ideasPerRequest);
  const [drafts, setDrafts] = useState<IdeaDraft[]>([]);
  const [selected, setSelected] = useState<Set<string>>(new Set());
  const [restored, setRestored] = useState(false);

  // 保存前の候補と入力内容は、このブラウザに一時保存しておく（ページ移動で消えないように）
  useEffect(() => {
    try {
      const raw = localStorage.getItem(DRAFT_KEY);
      if (raw) {
        const d = JSON.parse(raw) as { brief: Brief; drafts: IdeaDraft[] };
        if (d.brief) setBrief({ ...emptyBrief(settings), ...d.brief });
        if (d.drafts?.length) setDrafts(d.drafts);
      }
    } catch {}
    setRestored(true);
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);
  useEffect(() => {
    if (!restored) return;
    try {
      localStorage.setItem(DRAFT_KEY, JSON.stringify({ brief, drafts }));
    } catch {}
  }, [brief, drafts, restored]);

  const queue = useQueue<IdeaDraft[]>((_id, ideas) => setDrafts((d) => [...d, ...ideas]));

  const set = <K extends keyof Brief>(k: K, v: Brief[K]) => setBrief((b) => ({ ...b, [k]: v }));
  const maxIdeas = settings.maxIdeas;

  const similar = useMemo(() => {
    const items: Comparable[] = [
      ...drafts.map((d) => ({ id: d.tempId, title: d.title, audience: d.audience, problem: `${d.problem}\n${d.outcome}` })),
      ...store!.projects.map(projectToComparable),
    ];
    return findSimilar(items);
  }, [drafts, store]);

  const titleOf = (id: string) => drafts.find((d) => d.tempId === id)?.title ?? store!.projects.find((p) => p.id === id)?.title ?? id;

  const generate = async () => {
    if (!brief.audience.trim() || !brief.problem.trim()) {
      notify("「誰に向けるか」と「読者が困っていること」は必須です", "error");
      return;
    }
    const total = Math.max(1, Math.min(maxIdeas, count));
    if (!(await confirmApiSend("この画面の入力内容（読者・課題・判断基準・選択した事例など）"))) return;
    const per = Math.max(1, Math.min(10, perRequest));
    const jobs: JobDef<IdeaDraft[]>[] = [];
    for (let done = 0, i = 0; done < total; i++) {
      const n = Math.min(per, total - done);
      const start = done + 1;
      done += n;
      jobs.push({
        id: `batch-${Date.now()}-${i}`,
        label: `企画案 ${start}〜${done}件目`,
        run: async (signal) => {
          // 既存の企画とここまでの候補のタイトルを渡し、重複を避けさせる
          const avoidTitles = [...store!.projects.map((p) => p.title), ...draftsRef.current.map((d) => d.title)];
          const res = await callGenerate({ task: "ideas", brief, count: n, avoidTitles }, signal);
          return res.ideas ?? [];
        },
      });
    }
    queue.start(jobs);
  };

  // run 内から最新の候補を参照するための ref
  const draftsRef = useLatest(drafts);

  const toggle = (id: string) =>
    setSelected((s) => {
      const n = new Set(s);
      if (n.has(id)) n.delete(id);
      else n.add(id);
      return n;
    });

  const saveSelected = async () => {
    const chosen = drafts.filter((d) => selected.has(d.tempId));
    if (!chosen.length) return;
    const highDup = chosen.filter((d) => similar.get(d.tempId)?.some((h) => h.level === "high"));
    if (highDup.length) {
      const ok = await confirm({
        title: "重複の疑いがある企画が含まれています",
        message: `${highDup.length}件は既存の企画または他の候補とほぼ同じ内容の可能性があります。このまま保存しますか？（保存後にライブラリで統合・差別化・削除もできます）`,
        confirmLabel: "保存する",
      });
      if (!ok) return;
    }
    try {
      await addProjects(chosen.map((d) => projectFromIdea(d, brief)));
      setDrafts((ds) => ds.filter((d) => !selected.has(d.tempId)));
      setSelected(new Set());
      notify(`${chosen.length}件をライブラリに保存しました`, "success");
    } catch (e) {
      notify(`保存に失敗しました：${(e as Error).message}`, "error");
    }
  };

  const removeDrafts = async (ids: string[]) => {
    if (!ids.length) return;
    if (!(await confirm({ title: `候補${ids.length}件を削除しますか？`, message: "保存前の候補は元に戻せません。", confirmLabel: "削除", danger: true }))) return;
    setDrafts((ds) => ds.filter((d) => !ids.includes(d.tempId)));
    setSelected(new Set());
  };

  const createManual = async () => {
    if (!brief.audience.trim() && !brief.problem.trim()) {
      notify("「誰に向けるか」か「読者が困っていること」を入力してください", "error");
      return;
    }
    const p = projectFromIdea(
      {
        tempId: "",
        title: brief.theme ? `${brief.theme}（仮）` : "新しい企画（仮）",
        audience: brief.audience,
        problem: brief.problem,
        outcome: brief.desiredOutcome,
        format: brief.formats[0] ?? "実践マニュアル",
        uniqueValue: "",
        uniquenessBasis: brief.authorCriteria ? `発信者の判断基準：${brief.authorCriteria.slice(0, 80)}` : "【要確認】",
        level: brief.level,
      },
      brief,
    );
    await addProjects([p]);
    router.push(`/projects/${p.id}`);
  };

  const themes = settings.themes;

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">{bulk ? "テーマ案をまとめて出す" : "新しい企画を作る"}</h1>
        <p className="mt-1 text-sm text-stone-600">
          まず企画案だけを複数作り、良いものを選んでライブラリに保存します。本文の執筆は、保存した企画の編集画面で行います。
        </p>
      </div>

      <Collapsible title="1. 読者と課題（必須）" defaultOpen>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="誰に向けるか *" hint="例：SNS担当がいない個人経営のカフェ店主">
            <textarea className="input" rows={2} value={brief.audience} onChange={(e) => set("audience", e.target.value)} />
          </Field>
          <Field label="読者が困っていること *">
            <textarea className="input" rows={2} value={brief.problem} onChange={(e) => set("problem", e.target.value)} />
          </Field>
          <Field label="読者が得たい結果" hint="成果の保証ではなく、読者が実行できるようになることで書くのがおすすめです">
            <textarea className="input" rows={2} value={brief.desiredOutcome} onChange={(e) => set("desiredOutcome", e.target.value)} />
          </Field>
          <Field label="コンテンツのテーマ">
            <input className="input" list="theme-list" value={brief.theme} onChange={(e) => set("theme", e.target.value)} />
            <datalist id="theme-list">
              {themes.map((t) => (
                <option key={t} value={t} />
              ))}
            </datalist>
            <div className="mt-1 flex flex-wrap gap-1">
              {themes.map((t) => (
                <button key={t} type="button" className={`badge border ${brief.theme === t ? "border-emerald-700 bg-emerald-50" : "border-stone-200 bg-white"}`} onClick={() => set("theme", t)}>
                  {t}
                </button>
              ))}
            </div>
          </Field>
          <Field label="読者の経験レベル">
            <select className="input" value={brief.level} onChange={(e) => set("level", e.target.value)}>
              {LEVELS.map((l) => (
                <option key={l}>{l}</option>
              ))}
            </select>
          </Field>
        </div>
      </Collapsible>

      <Collapsible title="2. 経験・判断基準と事例" defaultOpen={!bulk}>
        <div className="space-y-4">
          <Field label={`${settings.authorName || "発信者"}の経験・判断基準`} hint="ここに書いた内容は【経験則】として使われます。書いていない経験は作られません。">
            <textarea className="input" rows={3} value={brief.authorCriteria} onChange={(e) => set("authorCriteria", e.target.value)} />
          </Field>
          <div>
            <span className="label">使用してよい事例</span>
            {store!.cases.length === 0 ? (
              <p className="text-sm text-stone-500">
                登録された事例はありません（事例・数値は使われません）。
                <Link href="/cases" className="ml-1 underline">
                  事例・根拠を登録する
                </Link>
              </p>
            ) : (
              <ul className="space-y-1">
                {store!.cases.map((c) => (
                  <li key={c.id}>
                    <label className="flex items-start gap-2 text-sm">
                      <input
                        type="checkbox"
                        className="mt-1"
                        checked={brief.caseIds.includes(c.id)}
                        onChange={(e) => set("caseIds", e.target.checked ? [...brief.caseIds, c.id] : brief.caseIds.filter((x) => x !== c.id))}
                      />
                      <span>
                        {c.name}
                        <span className="ml-2 text-xs text-stone-500">
                          対象期間：{c.period || "未入力"}／出典：{c.source || "未入力"}
                        </span>
                      </span>
                    </label>
                  </li>
                ))}
              </ul>
            )}
          </div>
          <Field label="事例についての補足（出典・対象期間など）">
            <textarea className="input" rows={2} value={brief.caseNotes} onChange={(e) => set("caseNotes", e.target.value)} />
          </Field>
        </div>
      </Collapsible>

      <Collapsible title="3. 表現の制限・形式・生成数" defaultOpen={bulk}>
        <div className="grid gap-4 md:grid-cols-2">
          <Field label="含めてはいけない内容・表現">
            <textarea className="input" rows={3} value={brief.exclusions} onChange={(e) => set("exclusions", e.target.value)} />
          </Field>
          <Field label="希望価格帯（任意）" hint="例：1,000〜3,000円">
            <input className="input" value={brief.priceRange} onChange={(e) => set("priceRange", e.target.value)} />
          </Field>
          <div>
            <span className="label">形式（複数選択可）</span>
            <div className="flex flex-wrap gap-2">
              {FORMATS.map((f) => (
                <label key={f} className="flex items-center gap-1 text-sm">
                  <input
                    type="checkbox"
                    checked={brief.formats.includes(f)}
                    onChange={(e) => set("formats", e.target.checked ? [...brief.formats, f] : brief.formats.filter((x) => x !== f))}
                  />
                  {f}
                </label>
              ))}
            </div>
          </div>
          <div className="grid grid-cols-2 gap-3">
            <Field label={`生成数（1〜${maxIdeas}件）`}>
              <input
                type="number"
                className="input"
                min={1}
                max={maxIdeas}
                value={count}
                onChange={(e) => setCount(Math.max(1, Math.min(maxIdeas, Number(e.target.value) || 1)))}
              />
            </Field>
            <Field label="1回あたりの生成数" hint="小さいほど1回の負荷と待ち時間が減ります">
              <input
                type="number"
                className="input"
                min={1}
                max={10}
                value={perRequest}
                onChange={(e) => setPerRequest(Math.max(1, Math.min(10, Number(e.target.value) || 1)))}
              />
            </Field>
            <p className="col-span-2 text-xs text-stone-500">
              {Math.ceil(count / perRequest)}回に分けて順番に生成します（
              {usesApi ? "各回でAnthropic APIを呼び出します" : "デモモードのためAPIは呼び出しません"}）。
            </p>
          </div>
        </div>
      </Collapsible>

      <div className="flex flex-wrap items-center gap-2">
        <button className="btn btn-primary" onClick={() => void generate()} disabled={queue.running}>
          {queue.running ? "生成中…" : `企画案を${count}件作る`}
        </button>
        <button className="btn" onClick={() => void createManual()} disabled={queue.running}>
          AIを使わず手入力で1件作成
        </button>
        <span className="text-xs text-stone-500">
          {usesApi ? "生成時は入力内容をAnthropic APIへ送信します（送信前に確認します）。" : "デモモード：定型の企画案を作ります。"}
        </span>
      </div>

      <QueuePanel jobs={queue.jobs} running={queue.running} counts={queue.counts} onStop={queue.stop} onRetry={queue.retryFailed} />

      {drafts.length > 0 && (
        <section className="space-y-3">
          <div className="flex flex-wrap items-center gap-2">
            <h2 className="font-bold">企画案の候補（{drafts.length}件・未保存）</h2>
            <button className="btn btn-sm" onClick={() => setSelected(new Set(drafts.map((d) => d.tempId)))}>
              すべて選択
            </button>
            <button
              className="btn btn-sm"
              onClick={() => setSelected(new Set(drafts.filter((d) => !similar.get(d.tempId)?.some((h) => h.level === "high")).map((d) => d.tempId)))}
            >
              重複の疑いがないものを選択
            </button>
            <button className="btn btn-sm" onClick={() => setSelected(new Set())}>
              選択解除
            </button>
            <div className="ml-auto flex gap-2">
              <button className="btn btn-sm" onClick={() => void removeDrafts([...selected])} disabled={!selected.size}>
                選択を削除
              </button>
              <button className="btn btn-sm btn-primary" onClick={() => void saveSelected()} disabled={!selected.size}>
                選択した{selected.size}件をライブラリに保存
              </button>
            </div>
          </div>
          <div className="grid gap-3 md:grid-cols-2">
            {drafts.map((d) => {
              const hits = similar.get(d.tempId);
              return (
                <article key={d.tempId} className={`card space-y-2 ${selected.has(d.tempId) ? "ring-2 ring-emerald-600" : ""}`}>
                  <div className="flex items-start gap-2">
                    <input type="checkbox" className="mt-1.5" checked={selected.has(d.tempId)} onChange={() => toggle(d.tempId)} aria-label="選択" />
                    <input
                      className="input font-semibold"
                      value={d.title}
                      onChange={(e) => setDrafts((ds) => ds.map((x) => (x.tempId === d.tempId ? { ...x, title: e.target.value } : x)))}
                    />
                  </div>
                  <dl className="grid grid-cols-[6.5rem_1fr] gap-x-2 gap-y-1 text-sm">
                    <dt className="text-stone-500">想定読者</dt>
                    <dd>{d.audience}</dd>
                    <dt className="text-stone-500">解決する課題</dt>
                    <dd>{d.problem}</dd>
                    <dt className="text-stone-500">できること</dt>
                    <dd>{d.outcome}</dd>
                    <dt className="text-stone-500">形式</dt>
                    <dd>{d.format}</dd>
                    <dt className="text-stone-500">固有の価値</dt>
                    <dd className="font-medium text-emerald-900">{d.uniqueValue}</dd>
                    <dt className="text-stone-500">独自性の根拠</dt>
                    <dd>{d.uniquenessBasis}</dd>
                  </dl>
                  <div className="flex flex-wrap items-center gap-2">
                    <SimilarityBadge hits={hits} />
                    <button className="btn btn-sm btn-ghost ml-auto" onClick={() => void removeDrafts([d.tempId])}>
                      削除
                    </button>
                  </div>
                  {hits?.slice(0, 2).map((h) => (
                    <div key={h.otherId} className="rounded bg-amber-50 p-2 text-xs">
                      <p>
                        「{titleOf(h.otherId)}」と{h.reasons.join("・")}（タイトル・読者 {pct(h.titleAudience)}／課題 {pct(h.problem)}）
                      </p>
                      <ul className="ml-4 list-disc text-stone-600">
                        {suggestionsFor(h).map((s) => (
                          <li key={s}>{s}</li>
                        ))}
                      </ul>
                    </div>
                  ))}
                </article>
              );
            })}
          </div>
        </section>
      )}
    </div>
  );
}

function useLatest<T>(value: T) {
  const [ref] = useState(() => ({ current: value }));
  ref.current = value;
  return ref;
}

export default function NewPlanPage() {
  return (
    <Suspense fallback={null}>
      <NewPlanInner />
    </Suspense>
  );
}
