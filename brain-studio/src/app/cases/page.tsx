"use client";

import { useState } from "react";
import { Field, formatDate } from "@/components/common";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { newId, nowIso } from "@/lib/defaults";
import type { CaseRecord } from "@/lib/types";

const EMPTY = { name: "", period: "", result: "", actions: "", source: "", checkedAt: "" };

export default function CasesPage() {
  const { store, saveCases } = useStore();
  const { confirm, notify } = useUI();
  const [form, setForm] = useState<typeof EMPTY>(EMPTY);
  const [editing, setEditing] = useState<string | null>(null);
  if (!store) return null;
  const cases = store.cases;
  const usage = (id: string) => store.projects.filter((p) => p.brief.caseIds.includes(id)).length;

  const submit = async () => {
    if (!form.name.trim()) {
      notify("事例名を入力してください", "error");
      return;
    }
    const t = nowIso();
    const next: CaseRecord[] = editing
      ? cases.map((c) => (c.id === editing ? { ...c, ...form, updatedAt: t } : c))
      : [...cases, { id: newId("case"), ...form, createdAt: t, updatedAt: t }];
    try {
      await saveCases(next);
      notify(editing ? "更新しました" : "登録しました", "success");
      setForm(EMPTY);
      setEditing(null);
    } catch (e) {
      notify(`保存に失敗しました：${(e as Error).message}`, "error");
    }
  };

  const remove = async (c: CaseRecord) => {
    const used = usage(c.id);
    const ok = await confirm({
      title: `「${c.name}」を削除しますか？`,
      message: used ? `${used}件の企画で使用中です。削除すると、以降の生成ではこの事例は使われません（作成済みの本文は変わりません）。` : "削除すると元に戻せません。",
      confirmLabel: "削除",
      danger: true,
    });
    if (!ok) return;
    await saveCases(cases.filter((x) => x.id !== c.id));
    notify("削除しました", "success");
  };

  return (
    <div className="space-y-4">
      <div>
        <h1 className="text-xl font-bold">事例・根拠</h1>
        <p className="mt-1 text-sm text-stone-600">
          本文で使ってよい実体験・数値をここに登録します。生成時は、企画ごとに選択した事例だけがAIに渡されます。登録していない実績・顧客名・数値は使われず、架空の体験談で補うこともしません。
        </p>
      </div>

      <section className="card space-y-3">
        <h2 className="font-semibold">{editing ? "事例を編集" : "事例を登録"}</h2>
        <div className="grid gap-3 md:grid-cols-2">
          <Field label="事例名 *" hint="例：自店舗でのランチ告知の見直し">
            <input className="input" value={form.name} onChange={(e) => setForm({ ...form, name: e.target.value })} />
          </Field>
          <Field label="対象期間" hint="例：2024年4月〜6月">
            <input className="input" value={form.period} onChange={(e) => setForm({ ...form, period: e.target.value })} />
          </Field>
          <Field label="実施内容">
            <textarea className="input" rows={3} value={form.actions} onChange={(e) => setForm({ ...form, actions: e.target.value })} />
          </Field>
          <Field label="ユーザーが入力した結果" hint="数値は実際に確認できたものだけを、測り方とあわせて書いてください">
            <textarea className="input" rows={3} value={form.result} onChange={(e) => setForm({ ...form, result: e.target.value })} />
          </Field>
          <Field label="出典・メモ" hint="例：店舗のPOSデータ、Instagramのインサイト画面、顧客の掲載許可の有無など">
            <textarea className="input" rows={2} value={form.source} onChange={(e) => setForm({ ...form, source: e.target.value })} />
          </Field>
          <Field label="確認日" hint="プラットフォームの仕様など、古くなる可能性がある情報を確認した日">
            <input type="date" className="input" value={form.checkedAt} onChange={(e) => setForm({ ...form, checkedAt: e.target.value })} />
          </Field>
        </div>
        <div className="flex gap-2">
          <button className="btn btn-primary" onClick={() => void submit()}>
            {editing ? "更新する" : "登録する"}
          </button>
          {editing && (
            <button
              className="btn"
              onClick={() => {
                setEditing(null);
                setForm(EMPTY);
              }}
            >
              キャンセル
            </button>
          )}
        </div>
      </section>

      <section className="space-y-2">
        <h2 className="font-semibold">登録済みの事例（{cases.length}件）</h2>
        {cases.length === 0 && <p className="card text-sm text-stone-500">まだ登録がありません。事例がない場合、本文は経験則・一般的な説明・要確認の表示で構成されます。</p>}
        {cases.map((c) => (
          <article key={c.id} className="card space-y-1 text-sm">
            <div className="flex flex-wrap items-center gap-2">
              <strong>{c.name}</strong>
              <span className="badge bg-stone-100 text-stone-600">使用中の企画 {usage(c.id)}件</span>
              {!c.period && <span className="badge bg-yellow-100 text-yellow-900">対象期間 未入力</span>}
              {!c.source && <span className="badge bg-yellow-100 text-yellow-900">出典 未入力</span>}
              <div className="ml-auto flex gap-2">
                <button
                  className="btn btn-sm"
                  onClick={() => {
                    setEditing(c.id);
                    setForm({ name: c.name, period: c.period, result: c.result, actions: c.actions, source: c.source, checkedAt: c.checkedAt });
                    window.scrollTo({ top: 0, behavior: "smooth" });
                  }}
                >
                  編集
                </button>
                <button className="btn btn-sm" onClick={() => void remove(c)}>
                  削除
                </button>
              </div>
            </div>
            <dl className="grid grid-cols-[7rem_1fr] gap-x-2 gap-y-0.5">
              <dt className="text-stone-500">対象期間</dt>
              <dd>{c.period || "-"}</dd>
              <dt className="text-stone-500">実施内容</dt>
              <dd className="whitespace-pre-wrap">{c.actions || "-"}</dd>
              <dt className="text-stone-500">結果（入力値）</dt>
              <dd className="whitespace-pre-wrap">{c.result || "-"}</dd>
              <dt className="text-stone-500">出典・メモ</dt>
              <dd className="whitespace-pre-wrap">{c.source || "-"}</dd>
              <dt className="text-stone-500">確認日</dt>
              <dd>{c.checkedAt || "-"}</dd>
              <dt className="text-stone-500">更新</dt>
              <dd>{formatDate(c.updatedAt)}</dd>
            </dl>
          </article>
        ))}
      </section>
    </div>
  );
}
