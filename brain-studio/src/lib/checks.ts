// 誤認を招く表現・根拠不足のローカルチェック（AIは使わない）

export interface ExpressionIssue {
  phrase: string;
  reason: string;
  count: number;
}

const RISKY: { pattern: RegExp; reason: string }[] = [
  { pattern: /必ず(成功|売れ|稼げ|集客|増え|伸び|儲)/g, reason: "成果を断定しています" },
  { pattern: /誰でも(簡単|すぐ|確実)/g, reason: "誰にでも当てはまると断定しています" },
  { pattern: /絶対に?(成功|売れ|稼げ|儲か|伸び|増え)/g, reason: "成果を断定しています" },
  { pattern: /確実に(稼|売|儲|集客|増|伸)/g, reason: "成果を保証する表現です" },
  { pattern: /(売上|利益|収益|フォロワー|来店数?)[^。\n]{0,10}(保証|倍増|爆増|爆伸び)/g, reason: "成果を保証・誇張する表現です" },
  { pattern: /(100|１００)\s*[%％]\s*(成功|効果|集客|稼)/g, reason: "根拠のない確率表現です" },
  { pattern: /(月収|年収|月商)\s*\d+/g, reason: "収入の具体額は根拠と対象期間が必要です" },
  { pattern: /(不労所得|ほったらかし|放置で)/g, reason: "過剰な期待を招く表現です" },
  { pattern: /(今だけ|残りわずか|限定\d+名|期間限定価格)/g, reason: "根拠のない煽りになっていないか確認してください" },
  { pattern: /(業界初|日本一|No\.?1|ナンバーワン)/gi, reason: "優位性の表示には客観的な根拠が必要です" },
];

// 「保証しません」「対象外」など、否定・注意書きの行は検出しない
const NEGATION = /(対象外|しません|ではありません|ありません|できません|しない|ではない|わけではない|禁止|避ける|使わない|NG|おすすめしない)/;

export function findRiskyExpressions(text: string): ExpressionIssue[] {
  const out: ExpressionIssue[] = [];
  const target = text
    .split("\n")
    .filter((line) => !NEGATION.test(line))
    .join("\n");
  for (const { pattern, reason } of RISKY) {
    const matches = target.match(pattern);
    if (!matches) continue;
    const counts = new Map<string, number>();
    for (const m of matches) counts.set(m, (counts.get(m) ?? 0) + 1);
    for (const [phrase, count] of counts) out.push({ phrase, reason, count });
  }
  return out;
}

export function countNeedsCheck(text: string): number {
  return (text.match(/【要確認[^】]*】|要確認[:：]/g) ?? []).length;
}

/** 全角を1、半角を0.5として数える（Xの文字数の目安） */
export function weightedLength(text: string): number {
  let n = 0;
  for (const ch of text) n += /[\u0000-ÿ｡-ﾟ]/.test(ch) ? 0.5 : 1;
  return Math.ceil(n);
}

/** Markdownを「## 見出し」単位に分割して文字数を数える */
export function headingLengths(markdown: string): { heading: string; chars: number; xWeighted: number }[] {
  const parts: { heading: string; body: string[] }[] = [];
  let cur: { heading: string; body: string[] } | null = null;
  for (const line of markdown.split("\n")) {
    const m = line.match(/^##\s+(.+)/);
    if (m) {
      cur = { heading: m[1].trim(), body: [] };
      parts.push(cur);
    } else if (cur) {
      cur.body.push(line);
    }
  }
  return parts.map((p) => {
    const body = p.body.join("\n").trim();
    return { heading: p.heading, chars: Array.from(body.replace(/\n/g, "")).length, xWeighted: weightedLength(body) };
  });
}
