"use client";

import Link from "next/link";
import { useMemo } from "react";
import { formatDate, SimilarityBadge, StatusBadge } from "@/components/common";
import { useStore } from "@/components/StoreProvider";
import { findSimilar, projectToComparable } from "@/lib/similarity";
import { STATUS_LABELS, STATUS_ORDER } from "@/lib/types";

export default function Dashboard() {
  const { store, saveSettings, usesApi } = useStore();
  const projects = useMemo(() => store?.projects ?? [], [store]);
  const similar = useMemo(() => findSimilar(projects.map(projectToComparable)), [projects]);
  if (!store) return null;

  const count = (s: string) => projects.filter((p) => p.status === s).length;
  const recent = [...projects].sort((a, b) => b.updatedAt.localeCompare(a.updatedAt)).slice(0, 8);
  const warned = projects.filter((p) => similar.get(p.id)?.length).length;

  return (
    <div className="space-y-6">
      {!store.settings.onboardingDismissed && (
        <div className="card border-emerald-200 bg-emerald-50/50">
          <div className="flex items-start gap-3">
            <div className="flex-1 space-y-2 text-sm leading-relaxed">
              <p className="font-bold">はじめての方へ：このツールの使い方</p>
              <ol className="ml-5 list-decimal space-y-1">
                <li>
                  <Link className="underline" href="/settings">設定</Link>で発信者のプロフィールとテーマを確認・編集します（初期値は仮設定です）。
                </li>
                <li>
                  <Link className="underline" href="/cases">事例・根拠</Link>に、使ってよい実体験・数値を対象期間・出典つきで登録します。登録していない実績は本文に使われません。
                </li>
                <li>
                  <Link className="underline" href="/new">新規企画</Link>で、読者と課題を入力して企画案をまとめて作り、良いものだけをライブラリに保存します。
                </li>
                <li>企画を開き、基本設計→目次→本文（章ごと）→無料部分→販売ページ→特典→告知文の順に作成・編集します。</li>
                <li>品質確認で内容を確かめ、ご自身で承認してから書き出し、Brainへ手動で登録します。</li>
              </ol>
              <p className="text-stone-600">
                「【サンプル】」の企画は操作確認用です。2件目は1件目と意図的に似せてあり、重複警告の表示を確認できます。
                {!usesApi && " 現在はAPIキー未設定のため、生成は定型のデモ出力になります。"}
              </p>
            </div>
            <button className="btn btn-sm btn-ghost" onClick={() => void saveSettings({ ...store.settings, onboardingDismissed: true })}>
              閉じる
            </button>
          </div>
        </div>
      )}

      <div className="flex flex-wrap gap-2">
        <Link href="/new" className="btn btn-primary">
          新しい企画を作る
        </Link>
        <Link href="/new?mode=bulk" className="btn">
          テーマ案をまとめて出す
        </Link>
        <Link href="/library" className="btn">
          ライブラリを見る
        </Link>
      </div>

      <section>
        <h2 className="mb-2 text-sm font-bold text-stone-600">状況</h2>
        <div className="grid grid-cols-2 gap-3 sm:grid-cols-3 lg:grid-cols-6">
          <Link href="/library" className="card">
            <div className="text-xs text-stone-500">企画数（合計）</div>
            <div className="text-2xl font-bold">{projects.length}</div>
          </Link>
          {STATUS_ORDER.map((s) => (
            <Link key={s} href={`/library?status=${s}`} className={`card ${s === "review" || s === "approved" ? "ring-1 ring-emerald-200" : ""}`}>
              <div className="text-xs text-stone-500">{STATUS_LABELS[s]}</div>
              <div className="text-2xl font-bold">{count(s)}</div>
            </Link>
          ))}
        </div>
        <p className="hint">
          生成した件数ではなく、内容を確認した「要確認」「承認済み」の数を進み具合の目安にしてください。
          {warned > 0 && <span className="ml-1 font-semibold text-amber-800">類似の警告がある企画：{warned}件</span>}
        </p>
      </section>

      <section>
        <h2 className="mb-2 text-sm font-bold text-stone-600">直近に更新したコンテンツ</h2>
        {recent.length === 0 ? (
          <p className="card text-sm text-stone-500">まだ企画がありません。</p>
        ) : (
          <ul className="divide-y divide-stone-100 rounded-lg border border-stone-200 bg-white">
            {recent.map((p) => (
              <li key={p.id}>
                <Link href={`/projects/${p.id}`} className="flex flex-wrap items-center gap-2 px-4 py-3 hover:bg-stone-50">
                  <StatusBadge status={p.status} />
                  <span className="min-w-0 flex-1 truncate font-medium">{p.title}</span>
                  <SimilarityBadge hits={similar.get(p.id)} />
                  <span className="text-xs text-stone-500">{formatDate(p.updatedAt)}</span>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
    </div>
  );
}
