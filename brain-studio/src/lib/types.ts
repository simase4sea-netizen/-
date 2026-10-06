// データモデル定義。保存ファイル（data/store.json）もこの形をそのまま持つ。

export type Status = "plan" | "writing" | "review" | "approved" | "exported";

export const STATUS_LABELS: Record<Status, string> = {
  plan: "企画",
  writing: "執筆中",
  review: "要確認",
  approved: "承認済み",
  exported: "書き出し済み",
};

export const STATUS_ORDER: Status[] = ["plan", "writing", "review", "approved", "exported"];

export const FORMATS = [
  "実践マニュアル",
  "テンプレート集",
  "事例解説",
  "チェックリスト",
  "初心者ガイド",
  "考え方・判断基準",
] as const;
export type Format = (typeof FORMATS)[number] | string;

export const LEVELS = ["これから始める", "初心者", "中級者", "経験者・上級者"] as const;

/** 発信者・初期テーマなどの設定（設定画面で編集可能） */
export interface Settings {
  authorName: string;
  authorProfile: string;
  /** 発信者の経験・判断基準（新規企画フォームの初期値） */
  authorCriteria: string;
  themes: string[];
  /** 常に含めない内容・表現 */
  defaultExclusions: string;
  /** 1回のAPIリクエストで生成する企画数（負荷・料金を抑えるため） */
  ideasPerRequest: number;
  /** 一括生成の上限 */
  maxIdeas: number;
  /** 本文生成時の1章あたりの目安文字数 */
  chapterLength: number;
  onboardingDismissed?: boolean;
  /** APIキーがあってもデモ出力で動かす */
  forceDemo?: boolean;
}

/** 事例・根拠。ユーザーが入力したものだけを生成時に使う。 */
export interface CaseRecord {
  id: string;
  name: string;
  /** 対象期間（例：2024年4月〜6月） */
  period: string;
  /** ユーザーが入力した結果（数値は入力されたものだけ） */
  result: string;
  /** 実施内容 */
  actions: string;
  /** 出典・メモ */
  source: string;
  /** 情報の確認日（YYYY-MM-DD） */
  checkedAt: string;
  createdAt: string;
  updatedAt: string;
}

/** 企画作成時の入力内容 */
export interface Brief {
  audience: string;
  problem: string;
  desiredOutcome: string;
  theme: string;
  level: string;
  authorCriteria: string;
  caseIds: string[];
  /** 事例に関する補足（出典・対象期間など自由記述） */
  caseNotes: string;
  exclusions: string;
  priceRange: string;
  formats: string[];
}

export interface HistoryEntry {
  content: string;
  savedAt: string;
  reason: string;
}

export interface SectionState {
  content: string;
  updatedAt?: string;
  generatedAt?: string;
  /** 新しい順 */
  history: HistoryEntry[];
}

export interface Chapter {
  id: string;
  title: string;
  purpose: string;
  readerTask: string;
  materials: string;
  /** 章本文（Markdown） */
  content: string;
  updatedAt?: string;
  generatedAt?: string;
  history: HistoryEntry[];
}

export type SectionKey = "design" | "toc" | "free" | "sales" | "bonus" | "promo";

export const SECTION_DEFS: { key: SectionKey | "body"; label: string; step: number; help: string }[] = [
  { key: "design", step: 1, label: "商品の基本設計", help: "タイトル案5つ・想定読者・課題・購入後にできること・独自の価値・前提と対象外" },
  { key: "toc", step: 2, label: "目次と章構成", help: "各章の目的・読者が行う作業・必要な具体例やテンプレート" },
  { key: "body", step: 3, label: "有料本文（章ごと）", help: "章ごとに生成・保存・再生成。手順・判断基準・記入例・チェックリストを含める" },
  { key: "free", step: 4, label: "購入前の無料部分", help: "共感・扱う内容・対象読者と対象外・得られるもの・無料でも役立つ導入" },
  { key: "sales", step: 5, label: "販売ページ下書き", help: "商品名・説明・目次・おすすめする人/しない人・FAQ・参考価格と根拠" },
  { key: "bonus", step: 6, label: "特典・実務素材", help: "ワークシート・記入例・チェックリスト・テンプレート（内容に合うものだけ）" },
  { key: "promo", step: 7, label: "告知文", help: "X短文・Instagram告知・note紹介記事構成・Brain用短い要約" },
];

export const QUALITY_ITEMS = [
  { key: "readerClear", label: "読者と悩みが明確か" },
  { key: "actionClear", label: "読後に何を実行できるか明確か" },
  { key: "stepsConcrete", label: "手順が具体的か" },
  { key: "evidenceBacked", label: "事例・数値に根拠があるか（要確認が残っていないか）" },
  { key: "lowOverlap", label: "他商品との重複が少ないか" },
  { key: "salesHonest", label: "販売ページの表現が誤認を招かないか" },
] as const;
export type QualityKey = (typeof QUALITY_ITEMS)[number]["key"];

export interface Quality {
  checks: Partial<Record<QualityKey, boolean>>;
  notes: string;
  approvedBy?: string;
  approvedAt?: string;
  /** AIによる参考評価（承認には使わない） */
  aiReview?: { content: string; createdAt: string };
}

export interface Project {
  id: string;
  createdAt: string;
  updatedAt: string;
  status: Status;
  isSample?: boolean;
  title: string;
  theme: string;
  format: string;
  audience: string;
  problem: string;
  /** 読者が実行できるようになること */
  outcome: string;
  /** この商品固有の価値 */
  uniqueValue: string;
  /** 独自性の根拠（どの経験・判断基準・事例に基づくか） */
  uniquenessBasis: string;
  level: string;
  priceRange: string;
  brief: Brief;
  sections: Record<SectionKey, SectionState>;
  chapters: Chapter[];
  quality: Quality;
  exportedAt?: string;
}

export interface Store {
  version: 1;
  settings: Settings;
  cases: CaseRecord[];
  projects: Project[];
}

/** AIまたはデモで生成された企画案（ライブラリ保存前の候補） */
export interface IdeaDraft {
  tempId: string;
  title: string;
  audience: string;
  problem: string;
  outcome: string;
  format: string;
  uniqueValue: string;
  uniquenessBasis: string;
  level: string;
}
