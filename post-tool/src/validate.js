// 生成結果の自動チェック。Google仕様、登録情報との照合、他店舗情報の混入、季節表現を確認する。
import { countChars } from './spec.js';
import { allowedValues } from './context.js';
import { findSeasonWords, SEASONS } from './season.js';

const ABSTRACT_PRAISE = ['絶品', '最高', '極上', '至高', '究極', '神レベル'];
const URL_RE = /https?:\/\/[^\s)）」』、。]+/g;
const PHONE_RE = /(?:\+81[-\s]?|0)\d{1,4}[-\s(（)）]\d{1,4}[-\s)）]\d{3,4}|\b0\d{9,10}\b/g;
// 単位付きの数値（価格・所要時間・階数・席数など）。登録情報にない数値は創作の可能性がある。
const UNIT_NUMBER_RE = /(?:[¥￥$]\s?([\d,，]+))|([\d,，]+)\s?(?:円|分|階|F|名|席|時|%|％|km|m\b|yen|min|minutes?)/gi;

function numbersIn(text) {
  const out = new Set();
  for (const m of String(text).matchAll(/\d[\d,，]*/g)) out.add(m[0].replace(/[,，]/g, ''));
  return out;
}

function unitNumbers(text) {
  const out = [];
  for (const m of String(text).matchAll(UNIT_NUMBER_RE)) {
    const raw = (m[1] || m[2] || '').replace(/[,，]/g, '');
    if (raw) out.push({ value: raw, match: m[0].trim() });
  }
  return out;
}

const stripTrailing = (u) => u.replace(/[.,!?]+$/, '');

function splitPhrases(text) {
  return String(text || '').split(/[\n、，,／/]/).map((s) => s.trim()).filter((s) => s.length >= 2);
}

function contentWords(text) {
  // 漢字・カタカナ・英字の2文字以上の連なりを内容語とみなす（形態素解析なしの簡易判定）。
  return [...new Set(String(text).match(/[\p{Script=Han}\p{Script=Katakana}ー]{2,}|[A-Za-z]{3,}/gu) || [])];
}

// 他店舗の固有情報（店名・住所・URL・その店舗にしかないメニュー名）。
export function otherStoreMarkers(db, ctx) {
  const markers = [];
  const ownMenu = new Set(ctx.menu.map((m) => m.name));
  const ownTexts = allowedValues(ctx).join('\n') + ctx.store.name;
  const stores = db.prepare('SELECT id, store_code, name, address, reservation_url, google_maps_url FROM stores WHERE id != ?').all(ctx.store.id);
  for (const s of stores) {
    const add = (value, kind) => {
      if (value && String(value).length >= 3 && !ownTexts.includes(value)) markers.push({ value: String(value), kind, store: `${s.name}（${s.store_code}）` });
    };
    add(s.name, '店舗名');
    add(s.address, '住所');
    add(s.reservation_url, '予約URL');
    add(s.google_maps_url, 'GoogleマップURL');
    for (const m of db.prepare('SELECT name, price FROM menu_items WHERE store_id = ?').all(s.id)) {
      if (!ownMenu.has(m.name)) add(m.name, 'メニュー名');
    }
  }
  return markers;
}

export function validateSet(set, ctx, spec, { otherMarkers = [], siblings = [] } = {}) {
  const checks = [];
  const add = (level, code, message) => checks.push({ level, code, message });
  const maxChars = spec.postBody.maxChars;
  const g = spec.writingGuide;
  const jaChars = countChars(set.body_ja);
  const enChars = countChars(set.body_en);
  const copyChars = countChars(set.catchcopy);
  const all = `${set.catchcopy}\n${set.body_ja}\n${set.body_en}`;

  // --- 必須要素 ---
  if (!set.catchcopy?.trim()) add('error', 'missing_catchcopy', '画像用キャッチコピーがありません。');
  if (!set.body_ja?.trim()) add('error', 'missing_ja', '日本語投稿文がありません。');
  if (!set.body_en?.trim()) add('error', 'missing_en', '英語投稿文がありません。');

  // --- Google 仕様 ---
  if (jaChars > maxChars) add('error', 'ja_over_limit', `日本語投稿文が ${jaChars} 文字で、Google仕様の上限 ${maxChars} 文字を超えています。`);
  if (enChars > maxChars) add('error', 'en_over_limit', `英語投稿文が ${enChars} 文字で、Google仕様の上限 ${maxChars} 文字を超えています。`);
  if (spec.policyChecks?.phoneNumberInBody?.enabled && PHONE_RE.test(all)) {
    add('warn', 'phone_number', spec.policyChecks.phoneNumberInBody.message);
  }
  PHONE_RE.lastIndex = 0;

  // --- 社内ルール（文字量・キャッチコピー） ---
  if (jaChars && jaChars < g.jaRecommendedMin) add('info', 'ja_short', `日本語投稿文が ${jaChars} 文字です（目安 ${g.jaRecommendedMin}〜${g.jaRecommendedMax} 文字）。`);
  if (jaChars > g.jaRecommendedMax && jaChars <= maxChars) add('info', 'ja_long', `日本語投稿文が ${jaChars} 文字で、目安の ${g.jaRecommendedMax} 文字を超えています（Google上限内）。`);
  if (copyChars > g.catchcopyMaxChars) add('warn', 'copy_long', `キャッチコピーが ${copyChars} 文字です。画像に載せるには長い可能性があります（目安 ${g.catchcopyMaxChars} 文字）。`);
  for (const w of ABSTRACT_PRAISE) {
    if (set.catchcopy?.includes(w)) add('warn', 'abstract_praise', `キャッチコピーに抽象的な褒め言葉「${w}」が含まれています。具体的な魅力に置き換えを検討してください。`);
  }
  const firstLine = (set.body_ja || '').trim().split('\n')[0];
  if (!/^＼.+／$/.test(firstLine)) add('warn', 'no_heading', '日本語投稿文の1行目に「＼…／」形式の見出しがありません。');
  const bodyRest = (set.body_ja || '').split('\n').slice(1).join('\n');
  const words = contentWords(set.catchcopy).filter((w) => !(ctx.store.area && w === ctx.store.area));
  const hit = words.filter((w) => bodyRest.includes(w));
  if (words.length && hit.length === 0) {
    add('warn', 'copy_body_mismatch', 'キャッチコピーの語句が本文で触れられていません。内容が一致しているか確認してください。');
  }
  if (siblings.length > 1) {
    const sameType = siblings.filter((s) => s.catchcopy?.includes('で味わう')).length;
    if (sameType > 1 && set.catchcopy?.includes('で味わう')) add('info', 'copy_pattern', '複数案で「〜で味わう」の型が重なっています。切り口を変えることを検討してください。');
  }

  // --- 登録情報との照合 ---
  const allowed = allowedValues(ctx);
  const allowedNums = new Set(allowed.flatMap((t) => [...numbersIn(t)]));
  const allowedText = allowed.join('\n');
  for (const { value, match } of unitNumbers(`${set.catchcopy}\n${set.body_ja}`)) {
    if (!allowedNums.has(value)) add('error', 'unregistered_number', `本文の「${match}」は登録情報・投稿入力にない数値です（価格・距離・階数などの創作の可能性）。`);
  }
  const jaNums = numbersIn(set.body_ja);
  for (const { value, match } of unitNumbers(set.body_en)) {
    if (!allowedNums.has(value)) add('error', 'unregistered_number_en', `英語版の「${match}」は登録情報・投稿入力にない数値です。`);
    else if (!jaNums.has(value)) add('warn', 'en_extra_number', `英語版の「${match}」は日本語版に含まれていません。`);
  }
  const jaUrls = new Set((set.body_ja.match(URL_RE) || []).map(stripTrailing));
  for (const u of (all.match(URL_RE) || []).map(stripTrailing)) {
    if (!allowedText.includes(u)) add('error', 'unregistered_url', `${spec.policyChecks?.unregisteredUrl?.message || '未登録のURLです。'}（${u}）`);
  }
  for (const u of (set.body_en.match(URL_RE) || []).map(stripTrailing)) {
    if (!jaUrls.has(u)) add('warn', 'en_extra_url', `英語版のURL（${u}）は日本語版に含まれていません。`);
  }
  if (ctx.brand.avoidPhrases) {
    for (const ph of splitPhrases(ctx.brand.avoidPhrases)) {
      if (all.includes(ph)) add('warn', 'avoid_phrase', `避けたい表現「${ph}」が含まれています。`);
    }
  }

  // --- 他店舗情報の混入 ---
  for (const m of otherMarkers) {
    if (all.includes(m.value)) add('error', 'other_store_leak', `別店舗（${m.store}）の${m.kind}「${m.value}」が含まれています。`);
  }

  // --- 季節表現 ---
  const ignore = [ctx.store.name, ctx.store.area, ctx.store.facts['住所'], ctx.store.facts['施設名・階数'], ...ctx.menu.map((m) => m.name)];
  const hits = [...findSeasonWords(`${set.catchcopy}\n${set.body_ja}`, 'ja', ignore), ...findSeasonWords(set.body_en, 'en', ignore)];
  if (!ctx.season.use) {
    for (const h of hits) add('warn', 'season_not_allowed', `季節表現を使わない設定ですが「${h.word}」（${SEASONS[h.season].ja}）が含まれています。`);
  } else {
    for (const h of hits.filter((x) => x.season !== ctx.season.season)) {
      add('warn', 'season_mismatch', `投稿予定日（${ctx.season.label}）と合わない季節表現「${h.word}」（${SEASONS[h.season].ja}）が含まれています。`);
    }
  }

  const levelRank = { error: 0, warn: 1, info: 2 };
  checks.sort((a, b) => levelRank[a.level] - levelRank[b.level]);
  return {
    counts: { catchcopy: copyChars, ja: jaChars, en: enChars, maxChars },
    seasonHits: hits,
    googleSpec: {
      ok: jaChars <= maxChars && enChars <= maxChars,
      specVersion: spec.specVersion,
      verifiedAt: spec.verifiedAt,
      needsReverification: Boolean(spec.needsReverification),
    },
    checks,
  };
}
