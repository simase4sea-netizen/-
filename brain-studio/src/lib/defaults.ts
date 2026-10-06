import type { Brief, Project, SectionKey, SectionState, Settings, Store } from "./types";

export const DEFAULT_SETTINGS: Settings = {
  authorName: "嶋野成優",
  authorProfile:
    "飲食店専門のSNS集客支援と、飲食店経営の経験があります。（初期表示用の仮設定です。設定画面で編集・削除してください）",
  authorCriteria: "",
  themes: [
    "飲食店のSNSを来店・注文につなげる販促設計",
    "Instagram投稿・リールの企画と制作",
    "店舗スタッフでも続けられるスマホ撮影・投稿運用",
    "無料招待やクーポンなどの販促キャンペーン設計",
    "Meta広告の基本と効果測定",
    "Googleマップを含む店舗集客",
    "飲食店の現場運営や販促の実体験",
  ],
  defaultExclusions:
    "売上・利益・フォロワー増加の保証／「必ず」「誰でも簡単に」「絶対」などの断定／入力していない実績・顧客名・数値・お客様の声／競合教材の模倣",
  ideasPerRequest: 5,
  maxIdeas: 30,
  chapterLength: 2500,
};

export function nowIso(): string {
  return new Date().toISOString();
}

export function newId(prefix = "id"): string {
  const rand =
    typeof crypto !== "undefined" && "randomUUID" in crypto
      ? crypto.randomUUID().slice(0, 8)
      : Math.random().toString(36).slice(2, 10);
  return `${prefix}_${Date.now().toString(36)}${rand}`;
}

export function emptySection(content = ""): SectionState {
  return { content, history: [] };
}

export function emptySections(): Record<SectionKey, SectionState> {
  return {
    design: emptySection(),
    toc: emptySection(),
    free: emptySection(),
    sales: emptySection(),
    bonus: emptySection(),
    promo: emptySection(),
  };
}

export function emptyBrief(settings?: Settings): Brief {
  return {
    audience: "",
    problem: "",
    desiredOutcome: "",
    theme: settings?.themes[0] ?? "",
    level: "初心者",
    authorCriteria: settings?.authorCriteria ?? "",
    caseIds: [],
    caseNotes: "",
    exclusions: settings?.defaultExclusions ?? "",
    priceRange: "",
    formats: ["実践マニュアル"],
  };
}

function sample(partial: Partial<Project> & Pick<Project, "id" | "title">): Project {
  const t = "2026-01-01T09:00:00.000Z";
  return {
    createdAt: t,
    updatedAt: t,
    status: "plan",
    isSample: true,
    theme: "",
    format: "実践マニュアル",
    audience: "",
    problem: "",
    outcome: "",
    uniqueValue: "",
    uniquenessBasis: "",
    level: "初心者",
    priceRange: "",
    brief: emptyBrief(DEFAULT_SETTINGS),
    sections: emptySections(),
    chapters: [],
    quality: { checks: {}, notes: "" },
    ...partial,
  };
}

/**
 * 初回表示用のサンプル企画。
 * 実績・数値・顧客の声は一切含めず、根拠が必要な箇所は【要確認】にしている。
 */
export function sampleProjects(): Project[] {
  const s1 = sample({
    id: "sample_1",
    title: "【サンプル】スタッフ1人でも回るInstagram投稿の週次ルーティン",
    theme: "店舗スタッフでも続けられるスマホ撮影・投稿運用",
    format: "実践マニュアル",
    audience: "SNS担当が決まっておらず、営業の合間に投稿している個人経営の飲食店",
    problem: "投稿が思いつきで止まりがちで、何をいつ撮ればよいか決まっていない",
    outcome: "週1回15分の計画時間で、翌週分の撮影リストと投稿予定を作れるようになる",
    uniqueValue: "現場の仕込み・営業の流れに合わせて撮影タイミングを決める考え方（発信者の現場経験に基づく）",
    uniquenessBasis: "発信者の飲食店経営経験（具体的な数値・成果は【要確認】：事例ページで入力してください）",
    status: "writing",
    sections: {
      ...emptySections(),
      design: emptySection(
        [
          "## タイトル案",
          "1. スタッフ1人でも回るInstagram投稿の週次ルーティン",
          "2. 仕込みの合間に撮る：飲食店の投稿計画づくり",
          "3. 思いつき投稿をやめる、飲食店の週15分計画術",
          "4. 営業の流れに合わせたスマホ撮影リストの作り方",
          "5. 続けられる店のInstagram運用表",
          "",
          "## 想定読者",
          "SNS担当が決まっておらず、店主やスタッフが営業の合間に投稿している個人経営の飲食店。",
          "",
          "## 読者の課題",
          "- 投稿内容をその場で考えるため、忙しい週は止まる",
          "- 何を撮れば来店の判断材料になるか分からない",
          "",
          "## 購入後にできるようになること",
          "- 翌週の撮影リストと投稿予定を週1回の計画で作る",
          "- 仕込み・営業・片付けの各タイミングで撮る素材を決める",
          "",
          "## 既存情報と異なる独自の価値",
          "【経験則】店舗の営業オペレーションを起点に撮影タイミングを決める。（根拠となる事例は【要確認】）",
          "",
          "## 前提・対象外",
          "- 前提：スマートフォン1台で撮影・投稿する",
          "- 対象外：広告運用、外部への撮影外注、フォロワー数の増加保証",
        ].join("\n"),
      ),
    },
  });
  const s2 = sample({
    id: "sample_2",
    title: "【サンプル】スタッフでも続くInstagram投稿の週間ルーティン作り",
    theme: "店舗スタッフでも続けられるスマホ撮影・投稿運用",
    format: "チェックリスト",
    audience: "SNS担当が決まっていない個人経営の飲食店のスタッフ",
    problem: "投稿が続かず、何をいつ撮ればよいか決まっていない",
    outcome: "週ごとの撮影リストを作り、投稿を続けられるようになる",
    uniqueValue: "【要確認】サンプル1との違いが小さい例。差別化か統合を検討してください",
    uniquenessBasis: "【要確認】",
  });
  const s3 = sample({
    id: "sample_3",
    title: "【サンプル】無料招待キャンペーンを始める前の判断基準チェック",
    theme: "無料招待やクーポンなどの販促キャンペーン設計",
    format: "考え方・判断基準",
    audience: "無料招待やクーポン施策を検討しているが、実施するべきか迷っている飲食店オーナー",
    problem: "原価や来店後の導線を決めないまま施策を始め、何を判断材料にすればよいか分からない",
    outcome: "実施前に、目的・対象・費用上限・効果測定の方法を1枚のシートに書き出して判断できる",
    uniqueValue: "施策の可否を判断する観点を、店舗側の負担（仕込み・席数・スタッフ）から整理する",
    uniquenessBasis: "発信者の販促支援経験（具体的な事例・数値は【要確認】）",
    priceRange: "",
  });
  return [s1, s2, s3];
}

export function initialStore(): Store {
  return { version: 1, settings: { ...DEFAULT_SETTINGS }, cases: [], projects: sampleProjects() };
}
