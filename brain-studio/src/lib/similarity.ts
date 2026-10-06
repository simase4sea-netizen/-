// ローカルで動く類似チェック。
// 日本語は単語区切りがないため、文字2-gram/3-gramと英数字の単語をトークンとして
// TF-IDFベクトルを作り、コサイン類似度で比較する。APIは使わない。

import type { Project } from "./types";

const STRIP = /[\s\p{P}\p{S}「」『』【】（）()［］\[\]・、。！？!?:：;；"'`~＿_\-－ー—…]+/gu;

export function normalize(text: string): string {
  return (text || "")
    .normalize("NFKC")
    .toLowerCase()
    .replace(/【(サンプル|要確認)】/g, "")
    .replace(/https?:\/\/\S+/g, "");
}

export function tokenize(text: string): string[] {
  const norm = normalize(text);
  const tokens: string[] = [];
  for (const w of norm.match(/[a-z0-9]{2,}/g) ?? []) tokens.push(`w:${w}`);
  const segments = norm.replace(/[a-z0-9]+/g, " ").split(STRIP).filter(Boolean);
  for (const seg of segments) {
    const chars = Array.from(seg);
    for (let i = 0; i < chars.length - 1; i++) tokens.push(chars[i] + chars[i + 1]);
    for (let i = 0; i < chars.length - 2; i++) tokens.push(chars[i] + chars[i + 1] + chars[i + 2]);
  }
  return tokens;
}

type Vec = Map<string, number>;

/** 文書集合からTF-IDFベクトルを作る */
export function tfidfVectors(docs: string[]): Vec[] {
  const tfs = docs.map((d) => {
    const tf: Vec = new Map();
    for (const t of tokenize(d)) tf.set(t, (tf.get(t) ?? 0) + 1);
    return tf;
  });
  const df = new Map<string, number>();
  for (const tf of tfs) for (const t of tf.keys()) df.set(t, (df.get(t) ?? 0) + 1);
  const n = docs.length;
  return tfs.map((tf) => {
    const v: Vec = new Map();
    for (const [t, c] of tf) {
      // 文書数が少なくてもゼロにならないよう平滑化したIDF
      const idf = Math.log((n + 1) / ((df.get(t) ?? 0) + 1)) + 1;
      v.set(t, (1 + Math.log(c)) * idf);
    }
    return v;
  });
}

export function cosine(a: Vec, b: Vec): number {
  if (a.size === 0 || b.size === 0) return 0;
  let dot = 0;
  let na = 0;
  let nb = 0;
  for (const [, x] of a) na += x * x;
  for (const [, y] of b) nb += y * y;
  const [small, large] = a.size < b.size ? [a, b] : [b, a];
  for (const [t, x] of small) {
    const y = large.get(t);
    if (y) dot += x * y;
  }
  return dot / (Math.sqrt(na) * Math.sqrt(nb));
}

/** 2つの文字列だけを比較する簡易版（候補同士の比較などに使用） */
export function similarity(a: string, b: string, corpus: string[] = []): number {
  const vecs = tfidfVectors([a, b, ...corpus]);
  return cosine(vecs[0], vecs[1]);
}

export interface Comparable {
  id: string;
  title: string;
  audience: string;
  problem: string;
  /** 目次・本文など（空でもよい） */
  content?: string;
}

export type SimilarityLevel = "high" | "medium";

export interface SimilarityHit {
  otherId: string;
  otherTitle: string;
  titleAudience: number;
  problem: number;
  content: number;
  level: SimilarityLevel;
  reasons: string[];
}

export const THRESHOLDS = {
  titleAudience: { high: 0.55, medium: 0.38 },
  problem: { high: 0.55, medium: 0.38 },
  content: { high: 0.5, medium: 0.35 },
};

export function projectToComparable(p: Project): Comparable {
  const content = [
    p.sections.toc.content,
    ...p.chapters.map((c) => `${c.title}\n${c.content}`),
  ].join("\n");
  return { id: p.id, title: p.title, audience: p.audience, problem: `${p.problem}\n${p.outcome}`, content };
}

/**
 * 全組み合わせの類似度を計算し、警告対象のみを返す。
 * 返り値：id → 類似している相手の一覧（類似度の高い順）
 */
export function findSimilar(items: Comparable[]): Map<string, SimilarityHit[]> {
  const result = new Map<string, SimilarityHit[]>();
  if (items.length < 2) return result;
  const ta = tfidfVectors(items.map((i) => `${i.title}\n${i.audience}`));
  const pr = tfidfVectors(items.map((i) => i.problem));
  const ct = tfidfVectors(items.map((i) => i.content ?? ""));
  const hasContent = items.map((i) => (i.content ?? "").replace(/\s/g, "").length >= 80);

  for (let i = 0; i < items.length; i++) {
    for (let j = i + 1; j < items.length; j++) {
      const s1 = cosine(ta[i], ta[j]);
      const s2 = cosine(pr[i], pr[j]);
      const s3 = hasContent[i] && hasContent[j] ? cosine(ct[i], ct[j]) : 0;
      const reasons: string[] = [];
      let level: SimilarityLevel | null = null;
      const bump = (l: SimilarityLevel) => {
        if (l === "high" || level === null) level = l;
      };
      if (s1 >= THRESHOLDS.titleAudience.high) { reasons.push("タイトル・想定読者がほぼ同じ"); bump("high"); }
      else if (s1 >= THRESHOLDS.titleAudience.medium) { reasons.push("タイトル・想定読者が似ている"); bump("medium"); }
      if (s2 >= THRESHOLDS.problem.high) { reasons.push("解決する課題がほぼ同じ"); bump("high"); }
      else if (s2 >= THRESHOLDS.problem.medium) { reasons.push("解決する課題が似ている"); bump("medium"); }
      if (s3 >= THRESHOLDS.content.high) { reasons.push("目次・本文が似ている"); bump("high"); }
      else if (s3 >= THRESHOLDS.content.medium) { reasons.push("目次・本文に共通部分が多い"); bump("medium"); }
      if (!level) continue;
      const push = (a: number, b: number) => {
        const list = result.get(items[a].id) ?? [];
        list.push({
          otherId: items[b].id,
          otherTitle: items[b].title,
          titleAudience: s1,
          problem: s2,
          content: s3,
          level: level!,
          reasons,
        });
        result.set(items[a].id, list);
      };
      push(i, j);
      push(j, i);
    }
  }
  for (const list of result.values()) {
    list.sort((a, b) => Math.max(b.titleAudience, b.problem, b.content) - Math.max(a.titleAudience, a.problem, a.content));
  }
  return result;
}

/** 類似時の対応提案 */
export function suggestionsFor(hit: SimilarityHit): string[] {
  const out: string[] = [];
  if (hit.level === "high") {
    out.push("統合：2つの企画を1つにまとめ、内容の厚い方を残す");
    out.push("削除：独自性の根拠が弱い方を削除する");
  }
  if (hit.titleAudience >= THRESHOLDS.titleAudience.medium) {
    out.push("差別化：想定読者の状況（業態・経験・店舗規模など）を絞り込む");
  }
  if (hit.problem >= THRESHOLDS.problem.medium) {
    out.push("差別化：解決する課題を別の段階（準備／実行／検証）に分ける");
  }
  if (hit.content >= THRESHOLDS.content.medium) {
    out.push("差別化：共通する章を片方に寄せ、もう片方は記入例・テンプレート中心にする");
  }
  if (out.length === 0) out.push("差別化：形式（マニュアル／テンプレート集など）や到達目標を変える");
  return out;
}

export function pct(n: number): string {
  return `${Math.round(n * 100)}%`;
}
