import type { Brief, CaseRecord, Chapter, Project, SectionKey, Settings } from "../types";

// 全生成に共通するルール。捏造・成果保証を防ぐことを最優先にする。
export function systemPrompt(settings: Settings): string {
  return `あなたは、Brainで販売する日本語の有料コンテンツを企画・執筆する編集者です。
目的は「読者の課題解決と購入価値を高めるコンテンツ」を作ることです。販売数や収益を保証することではありません。

# 発信者
名前：${settings.authorName || "（未設定）"}
プロフィール：${settings.authorProfile || "（未設定）"}

# 厳守するルール
1. 入力に含まれていない実績・顧客名・売上・フォロワー増加数・成功談・お客様の声・レビューを作らない。架空の体験談で補わない。
2. 数値や事例を使うのは、入力された「事例」に記載がある場合だけ。その場合は事例名と対象期間を本文中に併記する。
3. 記述の性質を区別し、必要に応じて行頭や文中に次のラベルを付ける：
   【事実】（入力された事例・出典に基づく）／【経験則】（発信者の経験・判断基準として入力された内容）／【仮説】（検証が必要な考え）／【一般的な説明】
4. 根拠が必要なのに入力が不足している箇所は、内容を作らずに「【要確認：何を確認・入力すべきか】」と書く。
5. 出典のない市場規模・平均値・統計・プラットフォームの仕様や最新ルール（Instagram、Meta広告、Googleマップ等）は断定しない。仕様に触れる場合は「【要確認：執筆時点の公式情報で確認】」を付ける。
6. 「必ず成功」「誰でも簡単に稼げる」「売上が倍増」など、成果を保証・断定する表現、根拠のない煽り、優位性表示（No.1等）を使わない。
7. 他者の著作物の転載、競合教材の模倣をしない。
8. 抽象論で終わらせず、手順・判断基準・記入例・チェックリストなど読者が実行できる具体性を優先する。記入例の数値は「例：」と明示した仮の値であることが分かるように書く。
9. 読者の状況（想定読者・課題）に合わせた固有の内容にする。他の商品と同じ説明の使い回しを避ける。
10. 出力は指定された形式だけを返す。前置きや後書きの挨拶は不要。`;
}

export function casesText(cases: CaseRecord[]): string {
  if (cases.length === 0) return "（使用してよい事例は入力されていません。事例・数値・体験談は一切使わないでください）";
  return cases
    .map(
      (c, i) =>
        `事例${i + 1}：${c.name}\n- 対象期間：${c.period || "【未入力】"}\n- 実施内容：${c.actions || "【未入力】"}\n- ユーザーが入力した結果：${c.result || "【未入力】"}\n- 出典・メモ：${c.source || "【未入力】"}\n- 確認日：${c.checkedAt || "【未入力】"}`,
    )
    .join("\n\n");
}

function briefText(b: Brief): string {
  return `- 誰に向けるか：${b.audience || "（未入力）"}
- 読者が困っていること：${b.problem || "（未入力）"}
- 読者が得たい結果：${b.desiredOutcome || "（未入力）"}
- テーマ：${b.theme || "（未入力）"}
- 読者の経験レベル：${b.level || "（未入力）"}
- 発信者の経験・判断基準：${b.authorCriteria || "（未入力。経験則として書ける内容はありません）"}
- 事例に関する補足：${b.caseNotes || "（なし）"}
- 含めてはいけない内容・表現：${b.exclusions || "（なし）"}
- 希望価格帯：${b.priceRange || "（指定なし）"}`;
}

export function ideasPrompt(b: Brief, cases: CaseRecord[], count: number, avoidTitles: string[]): string {
  const formats = b.formats.length ? b.formats.join("／") : "実践マニュアル";
  return `次の入力をもとに、Brainで販売する有料コンテンツの企画案を${count}件作ってください。完成原稿ではなく企画案だけを作ります。

# 入力
${briefText(b)}
- 形式の候補：${formats}

# 使用してよい事例
${casesText(cases)}

# 既にある企画（タイトル・切り口が重ならないようにする）
${avoidTitles.length ? avoidTitles.map((t) => `- ${t}`).join("\n") : "（なし）"}

# 作り方
- ${count}件はそれぞれ、異なる読者課題・読者の状況・到達目標を扱う。タイトルの言い換えだけの重複は不可。
- 形式は候補から内容に合うものを選ぶ。
- uniqueValue には「この商品固有の価値」を1〜2文で書く。
- uniquenessBasis には、その独自性が入力のどの経験・判断基準・事例に基づくかを書く。入力に根拠がなければ「【要確認：○○の経験・事例の入力が必要】」と書く。
- 実績・数値を作らない。`;
}

export const IDEAS_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["ideas"],
  properties: {
    ideas: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "audience", "problem", "outcome", "format", "uniqueValue", "uniquenessBasis", "level"],
        properties: {
          title: { type: "string", description: "仮タイトル（40字程度まで）" },
          audience: { type: "string", description: "想定読者（状況まで具体的に）" },
          problem: { type: "string", description: "解決する課題" },
          outcome: { type: "string", description: "読者が実行できるようになること" },
          format: { type: "string" },
          uniqueValue: { type: "string" },
          uniquenessBasis: { type: "string" },
          level: { type: "string", description: "想定する読者の経験レベル" },
        },
      },
    },
  },
} as const;

export const TOC_SCHEMA = {
  type: "object",
  additionalProperties: false,
  required: ["chapters", "notes"],
  properties: {
    chapters: {
      type: "array",
      items: {
        type: "object",
        additionalProperties: false,
        required: ["title", "purpose", "readerTask", "materials"],
        properties: {
          title: { type: "string", description: "章タイトル" },
          purpose: { type: "string", description: "この章の目的" },
          readerTask: { type: "string", description: "この章で読者が行う作業" },
          materials: { type: "string", description: "必要な具体例・テンプレート・記入例" },
        },
      },
    },
    notes: { type: "string", description: "章間の重複・不足を避けるために配慮した点、要確認事項" },
  },
} as const;

function projectText(p: Project): string {
  return `# この商品
- 仮タイトル：${p.title}
- テーマ：${p.theme}
- 形式：${p.format}
- 想定読者：${p.audience}
- 解決する課題：${p.problem}
- 読者が実行できるようになること：${p.outcome}
- この商品固有の価値：${p.uniqueValue}
- 独自性の根拠：${p.uniquenessBasis}
- 読者の経験レベル：${p.level}
- 希望価格帯：${p.priceRange || p.brief.priceRange || "（指定なし）"}

# 企画時の入力
${briefText(p.brief)}`;
}

function others(otherProjects: Project[]): string {
  if (otherProjects.length === 0) return "（なし）";
  return otherProjects
    .slice(0, 30)
    .map((o) => `- ${o.title}（読者：${o.audience.slice(0, 40)}／課題：${o.problem.slice(0, 40)}）`)
    .join("\n");
}

function chaptersOutline(chapters: Chapter[]): string {
  return chapters.map((c, i) => `第${i + 1}章 ${c.title}\n  目的：${c.purpose}\n  読者の作業：${c.readerTask}\n  素材：${c.materials}`).join("\n");
}

function existing(p: Project, keys: SectionKey[]): string {
  return keys
    .filter((k) => p.sections[k].content.trim())
    .map((k) => `## 既存の「${SECTION_NAMES[k]}」\n${p.sections[k].content.slice(0, 6000)}`)
    .join("\n\n");
}

const SECTION_NAMES: Record<SectionKey, string> = {
  design: "商品の基本設計",
  toc: "目次と章構成",
  free: "購入前に見せる無料部分",
  sales: "販売ページ用の下書き",
  bonus: "特典・実務素材",
  promo: "告知文",
};

const SECTION_INSTRUCTIONS: Record<SectionKey, string> = {
  design: `「商品の基本設計」をMarkdownで作成してください。次の見出しをこの順で使います。
## タイトル案（5つ。番号付き。誇張表現なし）
## 想定読者
## 読者の課題
## 購入後にできるようになること（箇条書き。行動として書く）
## 既存情報と異なる独自の価値（根拠のラベルを付ける）
## 内容の前提・対象外`,
  toc: `「目次と章構成」を作成してください。4〜8章程度。各章の目的・読者が行う作業・必要な具体例やテンプレートを決め、章間で内容が重複しないように、また到達目標に必要な内容が不足しないようにしてください。`,
  free: `Brainの「購入前に見せる無料部分」をMarkdownで作成してください。次の見出しを使います。
## こんな悩みはありませんか（読者の悩みへの共感。煽らない）
## この記事で扱う内容
## 対象読者と対象外
## 得られるもの（成果の保証ではなく、できるようになる作業として書く）
## はじめに：無料部分だけでも役立つ導入（読者がすぐ試せる小さな手順や判断のポイントを1つ以上）`,
  sales: `Brainの「販売ページ用の下書き」をMarkdownで作成してください。次の見出しを使います。
## 商品名
## 説明文
## 目次
## 購入がおすすめの人
## 購入をおすすめしない人
## 購入前によくある質問（Q&A形式で4〜6個。返金や成果について断定しない）
## 価格の参考値（参考値であること、根拠、不確実性を明記。相場や平均値は出典がない限り断定しない）
過剰な煽り、成果保証、根拠のない限定表現は使わないでください。`,
  bonus: `「特典・実務素材」をMarkdownで作成してください。候補はワークシート、記入例、チェックリスト、コピーして使えるテンプレートです。
内容に合うものだけを作り、合わないものは作らないでください（無理に追加しない）。各素材は「## 素材名」の見出しで区切り、冒頭に「使う場面」を1行書き、すぐ使える形（表・チェックボックス・空欄付きテンプレート）にしてください。記入例の値は「例：」と明記した仮の値にしてください。`,
  promo: `告知文をMarkdownで作成してください。各媒体の特性に合わせ、同じ文章の焼き直しにしないでください。成果保証や煽りは禁止です。
## X向け短文（全角140字以内を目安に2案。ハッシュタグは2個まで）
## Instagram向け告知文（キャプション本文。改行を使い、最後に保存・プロフィールへの導線。ハッシュタグは5個まで）
## note向け無料紹介記事の構成（見出し構成と各見出しで書く要点。本文は書かない）
## Brain商品ページ用の短い要約（120字程度）`,
};

export function sectionPrompt(p: Project, key: SectionKey, cases: CaseRecord[], otherProjects: Project[], settings: Settings): string {
  const context = key === "design" ? existing(p, []) : existing(p, ["design"]);
  const toc = p.chapters.length ? `# 現在の章構成\n${chaptersOutline(p.chapters)}` : "";
  const extra = key === "sales" || key === "promo" || key === "free" ? existing(p, key === "free" ? [] : ["free"]) : "";
  return `${projectText(p)}

# 使用してよい事例
${casesText(cases)}

# 他の商品（内容・説明の使い回しを避けるために参照）
${others(otherProjects)}

${context}
${toc}
${extra}

# 依頼
${SECTION_INSTRUCTIONS[key]}
${key === "toc" ? "" : `\n本文全体の目安は${key === "design" ? "1500" : "2500"}字程度です。`}
${settings.authorCriteria && !p.brief.authorCriteria ? `\n発信者の判断基準（設定）：${settings.authorCriteria}` : ""}`;
}

export function chapterPrompt(p: Project, chapterIndex: number, cases: CaseRecord[], otherProjects: Project[], settings: Settings): string {
  const ch = p.chapters[chapterIndex];
  const prev = p.chapters[chapterIndex - 1];
  const written = p.chapters
    .filter((c, i) => i !== chapterIndex && c.content.trim())
    .map((c) => `- ${c.title}：${c.content.replace(/\s+/g, " ").slice(0, 200)}…`)
    .join("\n");
  return `${projectText(p)}

# 使用してよい事例
${casesText(cases)}

# 他の商品（説明の使い回しを避ける）
${others(otherProjects)}

${existing(p, ["design"])}

# 章構成（全体）
${chaptersOutline(p.chapters)}

# 他の章で既に書いた内容（重複させない）
${written || "（なし）"}
${prev?.content ? `\n# 直前の章の末尾\n${prev.content.slice(-800)}` : ""}

# 依頼
第${chapterIndex + 1}章「${ch.title}」の本文をMarkdownで書いてください。
- この章の目的：${ch.purpose}
- 読者が行う作業：${ch.readerTask}
- 必要な素材：${ch.materials}
- 見出しは「## 」から始めない（章タイトルは自動で付きます）。小見出しは「### 」を使う。
- 手順（番号付き）、判断基準、記入例、チェックリスト（- [ ]）のうち、この章に合うものを必ず含める。
- 目安は${settings.chapterLength}字程度。
- 根拠のない数値・事例・体験談は書かず、必要な箇所は【要確認：…】とする。`;
}

export function reviewPrompt(p: Project, otherProjects: Project[]): string {
  const body = p.chapters.map((c, i) => `## 第${i + 1}章 ${c.title}\n${c.content}`).join("\n\n");
  const all = [
    `# 基本設計\n${p.sections.design.content}`,
    `# 無料部分\n${p.sections.free.content}`,
    `# 本文\n${body}`,
    `# 販売ページ\n${p.sections.sales.content}`,
    `# 告知文\n${p.sections.promo.content}`,
  ].join("\n\n");
  return `${projectText(p)}

# 他の商品
${others(otherProjects)}

# 評価対象
${all.slice(0, 60000)}

# 依頼
この商品の内容を、編集者として参考評価してください。採点や承認はしません（承認は人が行います）。Markdownで次の見出しを使い、各項目は「良い点」「改善点（具体的に）」を簡潔に書いてください。
## 読者と悩みが明確か
## 読後に何を実行できるか明確か
## 手順が具体的か
## 事例・数値に根拠があるか（根拠のない数値・断定・要確認の残りを列挙）
## 他商品との重複が少ないか
## 販売ページの表現が誤認を招かないか（問題のある表現を引用して指摘）
## 優先して直すべき3点`;
}
