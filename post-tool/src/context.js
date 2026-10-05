// 生成に使う「事実シート」を、選択された1店舗の登録情報と投稿入力だけから組み立てる。
// 店舗固有情報はブランド共通情報より優先する。他店舗の情報はここに入らない。
import { seasonPlan } from './season.js';

const STORE_FACT_LABELS = {
  name: '店舗名',
  area: '地域名（キャッチコピー・本文で使う地名）',
  address: '住所',
  google_maps_url: 'GoogleマップURL',
  access: 'アクセス',
  floor_info: '施設名・階数',
  parking: '駐車場',
  business_hours: '営業時間',
  regular_holidays: '定休日',
  temporary_closures: '臨時休業日',
  reservation_method: '予約方法',
  reservation_url: '予約URL',
  atmosphere: '店舗の雰囲気',
  use_scenes: '主な利用シーン',
  target: 'ターゲット',
  features: '店舗独自の特徴',
  services: 'サービス',
  facilities: '設備',
};

export const REQUEST_LABELS = {
  purpose: '投稿目的',
  theme: '投稿テーマ',
  mainItem: '主役の商品・メニュー',
  features: '伝えたい特徴',
  price: '価格',
  salesPeriod: '販売期間',
  eventDate: '開催日',
  cta: '希望するCTA',
  ctaUrl: 'CTAのURL',
  tone: '希望する文章トーン',
  postDate: '投稿予定日',
  useSeason: '季節表現を使う',
  setCount: '生成する案の数',
};

const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
const norm = (s) => String(s ?? '').replace(/\s+/g, '').toLowerCase();
const digits = (s) => String(s ?? '').replace(/[,，]/g, '').match(/\d+/g)?.join('/') ?? '';

export function parseCtaOptions(raw) {
  if (!raw) return [];
  try {
    const v = typeof raw === 'string' ? JSON.parse(raw) : raw;
    return Array.isArray(v) ? v.filter((o) => o && o.type) : [];
  } catch {
    return [];
  }
}

export function findMenuItem(menu, name) {
  if (!has(name)) return null;
  const n = norm(name);
  return menu.find((m) => norm(m.name) === n)
    || menu.find((m) => norm(m.name).includes(n) || n.includes(norm(m.name)))
    || null;
}

// 投稿入力と店舗登録情報の食い違いを洗い出す。担当者がどちらを使うか選ぶ。
export function detectConflicts(bundle, req) {
  const conflicts = [];
  const item = findMenuItem(bundle.menu, req.mainItem);
  if (item) {
    if (has(req.price) && has(item.price) && digits(req.price) !== digits(item.price)) {
      conflicts.push({ field: 'price', label: `価格（${item.name}）`, input: req.price, store: item.price });
    }
    if (has(req.salesPeriod) && has(item.sales_period) && norm(req.salesPeriod) !== norm(item.sales_period)) {
      conflicts.push({ field: 'salesPeriod', label: `販売期間（${item.name}）`, input: req.salesPeriod, store: item.sales_period });
    }
  }
  if (has(req.cta) && has(req.ctaUrl)) {
    const opt = parseCtaOptions(bundle.store.cta_options).find((o) => o.type === req.cta);
    if (opt?.url && opt.url !== req.ctaUrl) {
      conflicts.push({ field: 'ctaUrl', label: `CTAのURL（${req.cta}）`, input: req.ctaUrl, store: opt.url });
    }
  }
  return conflicts;
}

function pick(conflicts, resolutions, field, inputValue, storeValue) {
  const c = conflicts.find((x) => x.field === field);
  if (!c) return has(inputValue) ? inputValue : storeValue;
  return resolutions?.[field] === 'store' ? storeValue : inputValue;
}

export function unresolvedConflicts(conflicts, resolutions) {
  return conflicts.filter((c) => !['input', 'store'].includes(resolutions?.[c.field]));
}

export function buildContext(bundle, req, spec, today = new Date()) {
  const { client, brand, store, menu } = bundle;
  const conflicts = detectConflicts(bundle, req);
  const resolutions = req.resolutions || {};
  const item = findMenuItem(menu, req.mainItem);
  const confirmations = [];

  const storeFacts = {};
  for (const [key, label] of Object.entries(STORE_FACT_LABELS)) {
    if (has(store[key])) storeFacts[label] = store[key];
  }

  const ctaOptions = parseCtaOptions(store.cta_options);
  const ctaSpec = spec.ctaTypes.find((t) => t.code === req.cta) || null;
  let cta = null;
  if (ctaSpec) {
    const opt = ctaOptions.find((o) => o.type === req.cta);
    const url = pick(conflicts, resolutions, 'ctaUrl', req.ctaUrl, opt?.url);
    cta = { type: ctaSpec.code, label: ctaSpec.ja, labelEn: ctaSpec.en, url: url || null };
    if (!opt) confirmations.push(`CTA「${ctaSpec.ja}」は店舗の「投稿で使用できるCTA」に登録されていません。使用してよいか確認してください。`);
    if (ctaSpec.needsUrl && !cta.url) confirmations.push(`CTA「${ctaSpec.ja}」のリンク先URLが未登録です。`);
  }

  const post = {
    purpose: req.purpose || null,
    theme: req.theme || null,
    mainItem: req.mainItem || null,
    mainItemRegistered: item ? { name: item.name, description: item.description || null, price: item.price || null, sales_period: item.sales_period || null } : null,
    features: req.features || null,
    price: pick(conflicts, resolutions, 'price', req.price, item?.price) || null,
    salesPeriod: pick(conflicts, resolutions, 'salesPeriod', req.salesPeriod, item?.sales_period) || null,
    eventDate: req.eventDate || null,
    cta,
    imageNotes: (req.images || []).map((i) => i.name).filter(Boolean),
  };

  if (has(req.mainItem) && !item) {
    confirmations.push(`主役メニュー「${req.mainItem}」は店舗のメニューに未登録です。投稿入力の内容だけを根拠に作成しています。`);
  }
  if (has(req.price) && !item) confirmations.push(`価格「${req.price}」は登録メニューと照合できていません。`);
  if (has(req.mainItem) && !has(item?.description) && !has(req.features) && !(req.images || []).length) {
    confirmations.push('主役メニューの説明・特徴・画像がないため、味や素材の具体的な描写は控えています。');
  }
  if (!has(store.area)) confirmations.push('地域名が未登録です。キャッチコピーと本文で地名を使えません。');
  if (!has(store.access) && !has(store.floor_info)) confirmations.push('アクセス・施設内の位置が未登録のため、場所の紹介は住所・地域名の範囲にとどめています。');
  if (!has(store.use_scenes)) confirmations.push('主な利用シーンが未登録です。利用シーンは投稿入力の範囲で控えめに表現しています。');
  if (!has(store.verified_at)) {
    confirmations.push('店舗情報の確認日が未登録です。最新の情報か確認してください。');
  } else {
    const ageDays = (today - new Date(store.verified_at)) / 86400000;
    if (ageDays > 90) confirmations.push(`店舗情報の最終確認日（${store.verified_at}）から90日以上経過しています。`);
  }
  if (has(store.temporary_closures)) confirmations.push(`臨時休業日（${store.temporary_closures}）が登録されています。投稿日・来店案内と重ならないか確認してください。`);

  const season = seasonPlan({ postDate: req.postDate, useSeason: req.useSeason !== false, address: store.address });
  confirmations.push(...season.notes);

  // 文章トーンの優先順位: 投稿入力 > 店舗固有 > ブランド共通
  const tone = req.tone || store.tone || brand?.tone || null;
  const toneSource = req.tone ? '投稿入力' : store.tone ? '店舗固有' : brand?.tone ? 'ブランド共通' : null;

  return {
    client: { id: client?.id, name: client?.name },
    brand: {
      id: brand?.id,
      name: brand?.name,
      industry: brand?.industry || null,
      features: brand?.features || null,
      preferredPhrases: brand?.preferred_phrases || null,
      avoidPhrases: brand?.avoid_phrases || null,
      referencePosts: brand?.reference_posts || null,
      notes: brand?.notes || null,
    },
    store: {
      id: store.id,
      code: store.store_code,
      name: store.name,
      area: store.area || null,
      facts: storeFacts,
      notes: store.notes || null,
      verifiedAt: store.verified_at || null,
      verifiedSource: store.verified_source || null,
      verifiedBy: store.verified_by || null,
    },
    menu: menu.map((m) => ({ name: m.name, description: m.description || null, price: m.price || null, sales_period: m.sales_period || null })),
    post,
    tone,
    toneSource,
    season,
    postDate: req.postDate || null,
    setCount: Number(req.setCount) === 3 ? 3 : 1,
    conflicts: conflicts.map((c) => ({ ...c, chosen: resolutions[c.field] || null })),
    confirmations,
    limits: {
      bodyMaxChars: spec.postBody.maxChars,
      jaRecommendedMin: spec.writingGuide.jaRecommendedMin,
      jaRecommendedMax: spec.writingGuide.jaRecommendedMax,
      catchcopyMaxChars: spec.writingGuide.catchcopyMaxChars,
    },
  };
}

// 生成結果の検証に使う「この店舗で使ってよい値」の集合。
export function allowedValues(ctx) {
  const texts = [
    ...Object.values(ctx.store.facts),
    ...ctx.menu.flatMap((m) => [m.name, m.description, m.price, m.sales_period]),
    ctx.post.price, ctx.post.salesPeriod, ctx.post.eventDate, ctx.post.features, ctx.post.theme,
    ctx.post.mainItem, ctx.post.cta?.url, ctx.post.purpose, ctx.brand.features, ctx.postDate,
  ].filter(has).map(String);
  return texts;
}
