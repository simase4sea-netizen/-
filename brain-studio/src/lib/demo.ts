// APIキー未設定時のデモ出力。画面操作の確認用の定型文で、実績・数値は一切含めない。

import type { ChapterPlan } from "./generation";
import type { Brief, IdeaDraft, Project, SectionKey } from "./types";
import { newId } from "./defaults";

const ANGLES = [
  { tag: "準備編", focus: "始める前に決めておくこと", out: "実施前の準備項目を1枚のシートに整理できる" },
  { tag: "実行編", focus: "毎週の作業手順", out: "週ごとの作業手順を自分の店舗に当てはめて実行できる" },
  { tag: "検証編", focus: "結果の振り返り方", out: "実施後に見る指標と振り返りの手順を決められる" },
  { tag: "テンプレート", focus: "そのまま使える型", out: "テンプレートに記入して自店舗用の計画を作れる" },
  { tag: "判断基準", focus: "やる・やらないの判断", out: "施策を実施するかどうかを判断基準に沿って決められる" },
  { tag: "スタッフ共有", focus: "スタッフへの引き継ぎ", out: "作業をスタッフに引き継ぐためのマニュアルを作れる" },
  { tag: "つまずき対処", focus: "よくあるつまずきと対処", out: "止まりやすい場面ごとの対処を事前に決められる" },
  { tag: "撮影", focus: "スマホ撮影の段取り", out: "営業の流れに合わせた撮影リストを作れる" },
  { tag: "導線", focus: "来店・注文までの導線", out: "投稿から来店・注文までの導線を図に書き出せる" },
  { tag: "効果測定", focus: "数字の記録の仕方", out: "記録する項目と記録表を決め、毎週記入できる" },
];

const SEGMENTS = [
  "個人経営で店主が1人で発信している",
  "スタッフ数名で交代しながら運用している",
  "開業準備中でまだ発信を始めていない",
  "発信はしているが来店につながっている実感がない",
  "複数店舗を運営し、店舗ごとに担当が違う",
];

export function demoIdeas(brief: Brief, count: number, avoidTitles: string[], offset = 0): IdeaDraft[] {
  const theme = brief.theme || "飲食店の販促";
  const formats = brief.formats.length ? brief.formats : ["実践マニュアル"];
  const out: IdeaDraft[] = [];
  for (let i = 0; i < count; i++) {
    const n = offset + avoidTitles.length + i;
    const a = ANGLES[n % ANGLES.length];
    const seg = SEGMENTS[Math.floor(n / ANGLES.length) % SEGMENTS.length];
    const shortTheme = theme.length > 24 ? theme.slice(0, 24) + "…" : theme;
    out.push({
      tempId: newId("idea"),
      title: `【デモ】${shortTheme}：${a.focus}（${a.tag}）`,
      audience: `${brief.audience || "飲食店の経営者・スタッフ"}のうち、${seg}人`,
      problem: `${brief.problem || "販促の進め方が分からない"}。特に「${a.focus}」が決まっていない`,
      outcome: a.out,
      format: formats[n % formats.length],
      uniqueValue: `「${a.focus}」に絞り、${seg}店舗の状況に合わせた手順にする`,
      uniquenessBasis: brief.authorCriteria
        ? `入力された判断基準：${brief.authorCriteria.slice(0, 60)}`
        : "【要確認：発信者の経験・判断基準の入力が必要】",
      level: brief.level || "初心者",
    });
  }
  return out;
}

export function demoToc(p: Project): ChapterPlan[] {
  return [
    { title: "現状を書き出す", purpose: `${p.audience}の現状を整理する`, readerTask: "現状シートに今の取り組みを記入する", materials: "現状シート（記入例付き）" },
    { title: "目的と判断基準を決める", purpose: "何をもって進めるかを決める", readerTask: "目的・やらないことを3行で書く", materials: "判断基準チェックリスト" },
    { title: "手順を組み立てる", purpose: p.outcome || "実行手順を作る", readerTask: "週単位の手順表を作る", materials: "手順表テンプレート" },
    { title: "実行して記録する", purpose: "記録の習慣をつくる", readerTask: "記録表に1週間分記入する", materials: "記録表（例：の値入り）" },
    { title: "振り返りと次の一手", purpose: "結果をもとに見直す", readerTask: "振り返りの質問に答える", materials: "振り返りシート" },
  ];
}

export function demoChapter(p: Project, chapterIndex: number): string {
  const ch = p.chapters[chapterIndex];
  return `> デモ出力です。APIキーを設定すると、入力内容に基づいた本文が生成されます。

### この章でやること
【一般的な説明】${ch?.purpose || "この章の目的"}のために、${ch?.readerTask || "作業"}を行います。

### 手順
1. 今の状況を3行で書き出す
2. 判断基準に照らして、続ける・やめる・変えるに分ける
3. 次の1週間で試すことを1つだけ決める

### 判断基準
- 店舗の営業オペレーションに負担がかからないか
- スタッフが交代しても同じ手順で実行できるか
- 【要確認：発信者の判断基準を入力すると、ここに具体的な基準が入ります】

### 記入例
| 項目 | 記入例 |
|---|---|
| 今週試すこと | 例：ランチ前の仕込み時間に料理写真を3枚撮る |
| 担当 | 例：ホールスタッフA |

### チェックリスト
- [ ] 手順を書き出した
- [ ] 判断基準を確認した
- [ ] 次の1週間で試すことを決めた

【要確認：この章で使える事例・数値がある場合は「事例・根拠」画面で入力してください】`;
}

export function demoSection(p: Project, key: SectionKey): string {
  const head = "> デモ出力です（APIキー未設定）。実際の生成では入力内容に基づく文章になります。\n\n";
  switch (key) {
    case "design":
      return (
        head +
        `## タイトル案
1. ${p.title.replace(/^【[^】]+】/, "")}
2. ${p.outcome.slice(0, 30)}ための手順
3. ${p.audience.slice(0, 20)}向け：${p.format}
4. ${p.problem.slice(0, 24)}を整理する
5. 【要確認：5案目は入力内容に合わせて調整】

## 想定読者
${p.audience}

## 読者の課題
${p.problem}

## 購入後にできるようになること
- ${p.outcome}

## 既存情報と異なる独自の価値
【経験則】${p.uniqueValue}
（根拠：${p.uniquenessBasis}）

## 内容の前提・対象外
- 前提：【要確認】
- 対象外：売上・来店数の増加を保証する内容`
      );
    case "toc":
      return demoToc(p)
        .map((c, i) => `## 第${i + 1}章 ${c.title}\n- 目的：${c.purpose}\n- 読者の作業：${c.readerTask}\n- 素材：${c.materials}`)
        .join("\n\n");
    case "free":
      return (
        head +
        `## こんな悩みはありませんか
- ${p.problem}

## この記事で扱う内容
${p.chapters.map((c, i) => `- 第${i + 1}章 ${c.title}`).join("\n") || "- 【要確認：目次を先に作成してください】"}

## 対象読者と対象外
- 対象：${p.audience}
- 対象外：短期間での成果保証を求める方

## 得られるもの
- ${p.outcome}

## はじめに：無料部分だけでも役立つ導入
まず、今週の取り組みを3行で書き出してみてください。【一般的な説明】書き出すことで、続けること・やめることを分けやすくなります。`
      );
    case "sales":
      return (
        head +
        `## 商品名
${p.title.replace(/^【[^】]+】/, "")}

## 説明文
${p.audience}に向けて、${p.outcome}ための手順をまとめた${p.format}です。

## 目次
${p.chapters.map((c, i) => `${i + 1}. ${c.title}`).join("\n") || "【要確認：目次未作成】"}

## 購入がおすすめの人
- ${p.problem}と感じている方

## 購入をおすすめしない人
- 成果の保証を求める方
- すでに自分の運用手順が確立している方

## 購入前によくある質問
**Q. 読めば成果が出ますか？**
A. 成果を保証するものではありません。手順を自店舗に合わせて実行するための資料です。

## 価格の参考値
【要確認】価格は参考値です。分量・特典の有無・類似商品の価格帯（出典を確認のうえ）を踏まえてご自身で決めてください。`
      );
    case "bonus":
      return (
        head +
        `## 週次計画ワークシート
使う場面：毎週の計画時間に使う

| 曜日 | 撮るもの | 担当 | 投稿予定 |
|---|---|---|---|
| 月 |  |  |  |
| 火 |  |  |  |

## 実行チェックリスト
使う場面：投稿前の確認
- [ ] 写真の明るさを確認した
- [ ] 来店・注文につながる情報（営業時間・予約方法）を入れた`
      );
    case "promo":
      return (
        head +
        `## X向け短文
案1：${p.problem.slice(0, 40)}。そんな方向けに、${p.outcome.slice(0, 40)}手順をまとめました。
案2：${p.format}を公開しました。対象は${p.audience.slice(0, 30)}です。

## Instagram向け告知文
${p.problem.slice(0, 50)}…
そんなときに使える${p.format}を作りました。
詳しくはプロフィールのリンクから。

## note向け無料紹介記事の構成
1. 書いた理由
2. 対象読者と対象外
3. 内容の一部紹介
4. 購入前の注意点

## Brain商品ページ用の短い要約
${p.audience.slice(0, 30)}向けに、${p.outcome.slice(0, 50)}ための${p.format}です。`
      );
  }
}

export function demoReview(p: Project): string {
  const body = p.chapters.map((c) => c.content).join("\n");
  const needs = (body.match(/【要確認/g) ?? []).length;
  return `> デモ出力です。AIによる評価は参考表示で、承認には使われません。

## 読者と悩みが明確か
- 想定読者：${p.audience ? "入力あり" : "未入力"}

## 読後に何を実行できるか明確か
- ${p.outcome || "未入力"}

## 手順が具体的か
- 番号付き手順の数：${(body.match(/^\d+\./gm) ?? []).length}

## 事例・数値に根拠があるか
- 【要確認】の残り：${needs}件

## 他商品との重複が少ないか
- 画面の「類似チェック」を参照してください

## 販売ページの表現が誤認を招かないか
- 画面の「表現チェック」を参照してください

## 優先して直すべき3点
1. 【要確認】を解消する
2. 記入例を自店舗の内容に置き換える
3. 販売ページの価格根拠を確認する`;
}
