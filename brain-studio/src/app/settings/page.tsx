"use client";

import { useState } from "react";
import { Field } from "@/components/common";
import { useStore } from "@/components/StoreProvider";
import { useUI } from "@/components/UIProvider";
import { DEFAULT_SETTINGS, nowIso, sampleProjects } from "@/lib/defaults";
import { download } from "@/lib/export";
import type { Settings } from "@/lib/types";

export default function SettingsPage() {
  const { store, status, saveSettings, addProjects, usesApi } = useStore();
  const { notify, confirm } = useUI();
  const [s, setS] = useState<Settings>(() => store!.settings);
  const [newTheme, setNewTheme] = useState("");
  const dirty = JSON.stringify(s) !== JSON.stringify(store!.settings);

  const save = async () => {
    try {
      await saveSettings(s);
      notify("設定を保存しました", "success");
    } catch (e) {
      notify(`保存に失敗しました：${(e as Error).message}`, "error");
    }
  };

  const clearAuthor = async () => {
    const ok = await confirm({
      title: "発信者情報を空にしますか？",
      message: "名前・プロフィール・判断基準・テーマ候補を空にします（保存ボタンを押すまで確定しません）。",
      confirmLabel: "空にする",
      danger: true,
    });
    if (ok) setS({ ...s, authorName: "", authorProfile: "", authorCriteria: "", themes: [] });
  };

  const restoreSamples = async () => {
    const existing = new Set(store!.projects.map((p) => p.id));
    const missing = sampleProjects().filter((p) => !existing.has(p.id));
    if (!missing.length) {
      notify("サンプル企画はすべて残っています");
      return;
    }
    await addProjects(missing);
    notify(`サンプル企画を${missing.length}件追加しました`, "success");
  };

  return (
    <div className="space-y-4">
      <h1 className="text-xl font-bold">設定</h1>

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">AI生成（Anthropic API）</h2>
        <p>
          状態：
          {status?.hasApiKey ? (
            <span className="badge bg-emerald-100 text-emerald-900">APIキー設定済み（モデル：{status.model}）</span>
          ) : (
            <span className="badge bg-amber-100 text-amber-900">APIキー未設定（デモモード）</span>
          )}
        </p>
        {!status?.hasApiKey && (
          <div className="rounded bg-stone-50 p-3 text-xs leading-relaxed">
            <p className="font-semibold">設定方法</p>
            <ol className="ml-4 list-decimal">
              <li>
                アプリのフォルダにある <code>.env.example</code> を <code>.env.local</code> という名前でコピーします。
              </li>
              <li>
                <code>ANTHROPIC_API_KEY=</code> の後ろにAPIキーを書きます。
              </li>
              <li>アプリを再起動します。</li>
            </ol>
            <p className="mt-1">APIキーはサーバー側でのみ使われ、ブラウザや書き出しファイルには含まれません。</p>
          </div>
        )}
        <label className="flex items-center gap-2">
          <input type="checkbox" checked={Boolean(s.forceDemo)} onChange={(e) => setS({ ...s, forceDemo: e.target.checked })} disabled={!status?.hasApiKey} />
          APIキーがあってもデモ出力で動かす（操作確認用・API料金なし）
        </label>
        <p className="hint">
          {usesApi
            ? "生成ボタンを押したときだけ、その生成に必要な入力内容がAnthropic APIへ送信されます（送信前に確認画面を表示します）。"
            : "現在はAPIを使用しません。生成は定型のデモ出力になり、データは外部へ送信されません。"}
        </p>
      </section>

      <section className="card space-y-3">
        <div className="flex items-center gap-2">
          <h2 className="font-semibold">発信者</h2>
          <button className="btn btn-sm ml-auto" onClick={() => void clearAuthor()}>
            発信者情報を空にする
          </button>
        </div>
        <p className="text-xs text-stone-500">初期値は仮設定です。実績・数値はここではなく「事例・根拠」に、対象期間と出典つきで登録してください。</p>
        <Field label="名前">
          <input className="input" value={s.authorName} onChange={(e) => setS({ ...s, authorName: e.target.value })} />
        </Field>
        <Field label="プロフィール">
          <textarea className="input" rows={3} value={s.authorProfile} onChange={(e) => setS({ ...s, authorProfile: e.target.value })} />
        </Field>
        <Field label="経験・判断基準（新規企画フォームの初期値）" hint="例：撮影は仕込み中の手が空く時間に限る、など">
          <textarea className="input" rows={3} value={s.authorCriteria} onChange={(e) => setS({ ...s, authorCriteria: e.target.value })} />
        </Field>
        <div>
          <span className="label">テーマ候補</span>
          <ul className="space-y-1">
            {s.themes.map((t, i) => (
              <li key={i} className="flex gap-2">
                <input
                  className="input"
                  value={t}
                  onChange={(e) => setS({ ...s, themes: s.themes.map((x, j) => (j === i ? e.target.value : x)) })}
                />
                <button className="btn btn-sm" onClick={() => setS({ ...s, themes: s.themes.filter((_, j) => j !== i) })}>
                  削除
                </button>
              </li>
            ))}
          </ul>
          <div className="mt-2 flex gap-2">
            <input className="input" placeholder="テーマを追加" value={newTheme} onChange={(e) => setNewTheme(e.target.value)} />
            <button
              className="btn"
              onClick={() => {
                if (newTheme.trim()) setS({ ...s, themes: [...s.themes, newTheme.trim()] });
                setNewTheme("");
              }}
            >
              追加
            </button>
          </div>
          <button className="btn btn-sm btn-ghost mt-1" onClick={() => setS({ ...s, themes: DEFAULT_SETTINGS.themes })}>
            初期テーマに戻す
          </button>
        </div>
        <Field label="常に含めない内容・表現（新規企画フォームの初期値）">
          <textarea className="input" rows={3} value={s.defaultExclusions} onChange={(e) => setS({ ...s, defaultExclusions: e.target.value })} />
        </Field>
      </section>

      <section className="card grid gap-3 sm:grid-cols-3">
        <h2 className="font-semibold sm:col-span-3">生成量</h2>
        <Field label="1回あたりの企画生成数（1〜10）">
          <input type="number" min={1} max={10} className="input" value={s.ideasPerRequest} onChange={(e) => setS({ ...s, ideasPerRequest: Number(e.target.value) })} />
        </Field>
        <Field label="一括生成の上限（1〜30）">
          <input type="number" min={1} max={30} className="input" value={s.maxIdeas} onChange={(e) => setS({ ...s, maxIdeas: Number(e.target.value) })} />
        </Field>
        <Field label="1章あたりの目安文字数">
          <input type="number" min={500} max={8000} step={100} className="input" value={s.chapterLength} onChange={(e) => setS({ ...s, chapterLength: Number(e.target.value) })} />
        </Field>
      </section>

      <div className="sticky bottom-2 flex items-center gap-2 rounded-lg bg-white/90 p-2 shadow">
        <button className="btn btn-primary" onClick={() => void save()} disabled={!dirty}>
          設定を保存
        </button>
        {dirty && <span className="text-xs text-amber-800">未保存の変更があります</span>}
      </div>

      <section className="card space-y-2 text-sm">
        <h2 className="font-semibold">データ</h2>
        <p>
          保存場所：<code className="break-all">{status?.dataPath}</code>
        </p>
        <p className="text-xs text-stone-500">入力・生成物はこのPC内のJSONファイルに保存されます。外部へ送られるのは、APIを使った生成時のリクエストだけです。</p>
        <div className="flex flex-wrap gap-2">
          <button className="btn btn-sm" onClick={() => download(`brain-studio-全データ-${nowIso().slice(0, 10)}.json`, JSON.stringify(store, null, 2), "application/json;charset=utf-8")}>
            全データをJSONでバックアップ
          </button>
          <button className="btn btn-sm" onClick={() => void restoreSamples()}>
            サンプル企画を再追加
          </button>
          <button className="btn btn-sm" onClick={() => void saveSettings({ ...store!.settings, onboardingDismissed: false }).then(() => notify("ダッシュボードに使い方を表示します"))}>
            使い方の案内を再表示
          </button>
        </div>
      </section>
    </div>
  );
}
