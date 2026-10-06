/* Google投稿作成：事実シート・食い違い検出・不足情報・季節判定・自動チェック・生成プロンプト・デモ生成・CSV（ブラウザ／Node 共用）
 * 生成は1店舗ずつ、その店舗の登録情報と投稿入力だけで行う。他店舗の情報は事実シートに入れない。
 * 文章ルールは docs/google-post-rules.md に従う。Google仕様値は引数の spec から読み、ここには書き込まない。 */
(function (root) {
  'use strict';

  // ───── 店舗の「Google投稿用の店舗情報」の項目 ─────
  // [キー, ラベル, 入力欄の種類]。事実シート・入力画面・CSV で共通に使う。
  const STORE_FIELDS = [
    ['area', '地域名（コピーで使う地名）', 'text'],
    ['address', '住所', 'text'],
    ['mapsUrl', 'GoogleマップURL', 'text'],
    ['access', 'アクセス', 'text'],
    ['floorInfo', '施設名・階数', 'text'],
    ['parking', '駐車場', 'text'],
    ['hours', '営業時間', 'text'],
    ['holidays', '定休日', 'text'],
    ['closures', '臨時休業日', 'text'],
    ['reserveMethod', '予約方法', 'text'],
    ['reserveUrl', '予約URL', 'text'],
    ['atmosphere', '店舗の雰囲気', 'area'],
    ['scenes', '主な利用シーン', 'area'],
    ['target', 'ターゲット', 'text'],
    ['features', '店舗独自の特徴', 'area'],
    ['services', 'サービス', 'area'],
    ['facilities', '設備', 'area'],
  ];
  // 事実シートに入れない管理用の項目
  const STORE_META_FIELDS = [
    ['tone', '店舗固有の文章トーン', 'text'],
    ['notes', '店舗固有の注意事項', 'area'],
    ['verifiedAt', '情報の確認日', 'date'],
    ['verifiedSource', '確認元', 'text'],
    ['verifiedBy', '確認者', 'text'],
  ];
  const BRAND_FIELDS = [
    ['name', 'ブランド名', 'text'],
    ['industry', '業種', 'text'],
    ['features', 'ブランドの特徴', 'area'],
    ['tone', '文章トーン', 'text'],
    ['preferredPhrases', 'よく使う表現', 'area'],
    ['avoidPhrases', '避けたい表現（1行に1つ）', 'area'],
    ['referencePosts', '参考投稿', 'area'],
    ['notes', '注意事項', 'area'],
  ];
  const MENU_FIELDS = [['name', '名前'], ['description', '説明'], ['price', '価格'], ['period', '販売期間']];

  const REQUEST_FIELDS = [
    ['purpose', '投稿目的'], ['theme', 'テーマ'], ['mainItem', '主役メニュー'], ['features', '伝えたい特徴'],
    ['price', '価格'], ['salesPeriod', '販売期間'], ['eventDate', '開催日'], ['cta', 'CTA'], ['ctaUrl', 'CTAのURL'],
    ['tone', '文章トーン'], ['postDate', '投稿予定日'],
  ];
  // 一括生成で店舗ごとに変えられる項目
  const PER_STORE_FIELDS = [['mainItem', '主役メニュー'], ['price', '価格'], ['salesPeriod', '販売期間'], ['features', '伝えたい特徴'], ['eventDate', '開催日'], ['ctaUrl', 'CTAのURL']];

  const STATUS_LABEL = { draft: '下書き', review: '確認待ち', approved: '承認済み', done: '完了' };

  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';
  const norm = (s) => String(s === null || s === undefined ? '' : s).replace(/\s+/g, '').toLowerCase();
  const digits = (s) => (String(s === null || s === undefined ? '' : s).replace(/[,，]/g, '').match(/\d+/g) || []).join('/');

  // Google の文字数はコードポイント単位で数える（絵文字も1文字以上）
  function countChars(text) { return Array.from(String(text === null || text === undefined ? '' : text)).length; }

  function emptyStoreInfo() {
    // sources：参照URL・資料、pastPosts：過去投稿、candidates：資料から抜き出した情報の候補（採用するまで使わない）、fieldSources：採用した項目の出典
    const o = { brandId: '', ctaOptions: [], menu: [], sources: [], pastPosts: [], candidates: [], fieldSources: {} };
    STORE_FIELDS.concat(STORE_META_FIELDS).forEach((f) => { o[f[0]] = ''; });
    return o;
  }
  function emptyBrand() {
    const o = {};
    BRAND_FIELDS.forEach((f) => { o[f[0]] = ''; });
    return o;
  }

  // ───── 季節 ─────
  const SEASONS = {
    spring: { ja: '春', months: [3, 4, 5] },
    summer: { ja: '夏', months: [6, 7, 8] },
    autumn: { ja: '秋', months: [9, 10, 11] },
    winter: { ja: '冬', months: [12, 1, 2] },
  };
  // 季節を強く示す語。ほかの季節でも使われやすい語は入れない。
  const SEASON_WORDS = {
    spring: ['春の', 'この春', '春らしい', '春に', '桜', 'お花見', '花見', '新緑', '新生活', '春爛漫', 'ひなまつり', '入学', '卒業'],
    summer: ['夏の', 'この夏', '夏らしい', '夏に', '猛暑', '暑い日', '暑さ', '夏休み', '花火', '夏祭り', 'お盆', '梅雨', '涼しげ', '涼やか'],
    autumn: ['秋の', 'この秋', '秋らしい', '秋に', '紅葉', '実りの季節', '食欲の秋', '行楽', 'ハロウィン', '月見', '秋風', '新米'],
    winter: ['冬の', 'この冬', '冬らしい', '冬に', '寒い日', '寒さ', '雪景色', '雪の', 'クリスマス', '年末', '忘年会', '新年会', 'お正月', '年始', '凍える'],
  };
  const EN_SEASON_WORDS = {
    spring: ['spring', 'cherry blossom', 'sakura'],
    summer: ['summer', 'heat', 'hot days'],
    autumn: ['autumn', 'fall season', 'fall foliage', 'halloween'],
    winter: ['winter', 'christmas', 'snow', 'cold days', 'new year', 'year-end'],
  };

  function seasonOf(dateStr) {
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(dateStr || '');
    if (!m) return null;
    const month = Number(m[2]);
    return Object.keys(SEASONS).find((k) => SEASONS[k].months.includes(month)) || null;
  }

  // 季節表現の方針。投稿予定日が無ければ季節に依存しない文章にする。地域差が大きい地域は確認を促す。
  function seasonPlan(postDate, useSeason, address) {
    const notes = [];
    if (!useSeason) return { use: false, season: null, label: '', notes };
    const season = seasonOf(postDate);
    if (!season) {
      notes.push('投稿予定日が未入力のため、季節に依存しない文章で作成します。');
      return { use: false, season: null, label: '', notes };
    }
    if (/沖縄|北海道/.test(address || '')) notes.push('店舗所在地は本州と季節感が異なる地域です。季節表現が地域の実感に合うか確認してください。');
    return { use: true, season, label: Number(postDate.slice(5, 7)) + '月（' + SEASONS[season].ja + '）', notes };
  }

  // ignore：店舗名・地域名・メニュー名など、季節の字を含む固有名詞（例：秋葉原）は判定から除く
  function findSeasonWords(text, lang, ignore) {
    let t = String(text || '');
    (ignore || []).forEach((n) => { if (n) t = t.split(n).join(''); });
    const low = t.toLowerCase();
    const dict = lang === 'en' ? EN_SEASON_WORDS : SEASON_WORDS;
    const hits = [];
    Object.keys(dict).forEach((season) => dict[season].forEach((w) => { if (low.includes(w.toLowerCase())) hits.push({ season, word: w }); }));
    return hits;
  }

  // ───── 店舗・ブランド・メニューの取り出し ─────
  function storeInfo(store) { return Object.assign(emptyStoreInfo(), (store && store.gpost) || {}); }

  // 1店舗分の登録情報だけを取り出す（生成・チェックはこの単位で行う）
  function bundleOf(state, storeId) {
    const store = (state.stores || []).find((s) => s.id === storeId);
    if (!store) return null;
    const gp = storeInfo(store);
    const brand = gp.brandId ? (((state.gpost || {}).brands) || []).find((b) => b.id === gp.brandId) || null : null;
    return { store: { id: store.id, name: store.name, kind: store.kind, aliases: store.aliases || [] }, gp, brand, menu: (gp.menu || []).slice() };
  }

  function findMenuItem(menu, name) {
    if (!has(name)) return null;
    const n = norm(name);
    return menu.find((m) => norm(m.name) === n) || menu.find((m) => norm(m.name) && (norm(m.name).includes(n) || n.includes(norm(m.name)))) || null;
  }

  function ctaSpecOf(spec, code) { return (spec.ctaTypes || []).find((t) => t.code === code) || null; }

  // 投稿入力と店舗登録情報の食い違い。担当者がどちらを使うか選ぶまで生成しない。
  function detectConflicts(bundle, req) {
    const out = [];
    const item = findMenuItem(bundle.menu, req.mainItem);
    if (item) {
      if (has(req.price) && has(item.price) && digits(req.price) !== digits(item.price)) out.push({ field: 'price', label: '価格（' + item.name + '）', input: req.price, store: item.price });
      if (has(req.salesPeriod) && has(item.period) && norm(req.salesPeriod) !== norm(item.period)) out.push({ field: 'salesPeriod', label: '販売期間（' + item.name + '）', input: req.salesPeriod, store: item.period });
    }
    if (has(req.cta) && has(req.ctaUrl)) {
      const opt = (bundle.gp.ctaOptions || []).find((o) => o.type === req.cta);
      if (opt && has(opt.url) && opt.url !== req.ctaUrl) out.push({ field: 'ctaUrl', label: 'CTAのURL（' + req.cta + '）', input: req.ctaUrl, store: opt.url });
    }
    return out;
  }

  function unresolvedConflicts(conflicts, resolutions) {
    return conflicts.filter((c) => !['input', 'store'].includes((resolutions || {})[c.field]));
  }

  function pick(conflicts, resolutions, field, inputValue, storeValue) {
    const c = conflicts.find((x) => x.field === field);
    if (!c) return has(inputValue) ? inputValue : storeValue;
    return (resolutions || {})[field] === 'store' ? storeValue : inputValue;
  }

  // 店舗ごとの入力 = 共通キャンペーン情報 + 店舗ごとの情報（空欄は共通を使う）
  function mergeRequest(common, perStore) {
    const merged = Object.assign({}, common || {});
    Object.keys(perStore || {}).forEach((k) => { if (has(perStore[k])) merged[k] = perStore[k]; });
    return merged;
  }

  function daysBetween(a, b) { return Math.floor((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }

  // ───── 事実シート ─────
  function buildContext(bundle, req, spec, today) {
    today = today || new Date().toISOString().slice(0, 10);
    const gp = bundle.gp;
    const brand = bundle.brand || {};
    const conflicts = detectConflicts(bundle, req);
    const resolutions = req.resolutions || {};
    const item = findMenuItem(bundle.menu, req.mainItem);
    const confirmations = [];

    const facts = {};
    STORE_FIELDS.forEach((f) => { if (has(gp[f[0]])) facts[f[1]] = String(gp[f[0]]).trim(); });

    let cta = null;
    const cs = ctaSpecOf(spec, req.cta);
    if (cs) {
      const opt = (gp.ctaOptions || []).find((o) => o.type === req.cta);
      const url = pick(conflicts, resolutions, 'ctaUrl', req.ctaUrl, opt && opt.url);
      cta = { type: cs.code, label: cs.ja, labelEn: cs.en, url: url || null };
      if (!opt) confirmations.push('CTA「' + cs.ja + '」は店舗の「使用できるCTA」に登録されていません。使用してよいか確認してください。');
      if (cs.needsUrl && !cta.url) confirmations.push('CTA「' + cs.ja + '」のリンク先URLが未登録です。');
    }

    const post = {
      purpose: req.purpose || null,
      theme: req.theme || null,
      mainItem: req.mainItem || null,
      mainItemRegistered: item ? { name: item.name, description: item.description || null, price: item.price || null, period: item.period || null } : null,
      features: req.features || null,
      price: pick(conflicts, resolutions, 'price', req.price, item && item.price) || null,
      salesPeriod: pick(conflicts, resolutions, 'salesPeriod', req.salesPeriod, item && item.period) || null,
      eventDate: req.eventDate || null,
      cta,
      imageNotes: (req.images || []).map((i) => i.name).filter(Boolean),
    };

    if (has(req.mainItem) && !item) confirmations.push('主役メニュー「' + req.mainItem + '」は店舗のメニューに未登録です。投稿入力の内容だけを根拠に作成します。');
    if (has(req.price) && !item) confirmations.push('価格「' + req.price + '」は登録メニューと照合できていません。');
    if (has(req.mainItem) && !(item && has(item.description)) && !has(req.features) && !(req.images || []).length) confirmations.push('主役メニューの説明・特徴・画像がないため、味や素材の具体的な描写は控えます。');
    if (!has(gp.area)) confirmations.push('地域名が未登録です。キャッチコピーと本文で地名を使えません。');
    if (!has(gp.address)) confirmations.push('住所が未登録です。');
    if (!has(gp.access) && !has(gp.floorInfo)) confirmations.push('アクセス・施設内の位置が未登録のため、場所の紹介は住所・地域名の範囲にとどめます。');
    if (!has(gp.hours)) confirmations.push('営業時間が未登録です。本文に営業時間は書きません。');
    if (!has(gp.scenes)) confirmations.push('主な利用シーンが未登録です。利用シーンは投稿入力の範囲で控えめに表現します。');
    if (!bundle.brand) confirmations.push('ブランド共通の情報が未設定です（業種・避けたい表現などを使えません）。');
    if (!has(gp.verifiedAt)) confirmations.push('店舗情報の確認日が未登録です。最新の情報か確認してください。');
    else if (daysBetween(gp.verifiedAt, today) > 90) confirmations.push('店舗情報の最終確認日（' + gp.verifiedAt + '）から90日以上経過しています。');
    if (has(gp.closures)) confirmations.push('臨時休業日（' + gp.closures + '）が登録されています。投稿日・来店案内と重ならないか確認してください。');
    if (has(req.cta) && !cs) confirmations.push('CTA「' + req.cta + '」はGoogle仕様設定のボタンの種類にありません。');

    const season = seasonPlan(req.postDate, req.useSeason !== false, gp.address);
    season.notes.forEach((n) => confirmations.push(n));

    // 文章トーンの優先順位：投稿入力 → 店舗 → ブランド
    const tone = req.tone || gp.tone || brand.tone || null;
    const toneSource = req.tone ? '投稿入力' : gp.tone ? '店舗固有' : brand.tone ? 'ブランド共通' : null;

    return {
      brand: {
        id: brand.id || null, name: brand.name || null, industry: brand.industry || null, features: brand.features || null,
        preferredPhrases: brand.preferredPhrases || null, avoidPhrases: brand.avoidPhrases || null, referencePosts: brand.referencePosts || null, notes: brand.notes || null,
      },
      store: {
        id: bundle.store.id, name: bundle.store.name, kind: bundle.store.kind, aliases: bundle.store.aliases || [], area: gp.area || null, facts,
        notes: gp.notes || null, verifiedAt: gp.verifiedAt || null, verifiedSource: gp.verifiedSource || null, verifiedBy: gp.verifiedBy || null,
      },
      menu: bundle.menu.map((m) => ({ name: m.name, description: m.description || null, price: m.price || null, period: m.period || null })),
      pastPosts: pastPostsOf(gp, 5),
      post,
      tone,
      toneSource,
      season,
      postDate: req.postDate || null,
      setCount: Number(req.setCount) === 3 ? 3 : 1,
      conflicts: conflicts.map((c) => Object.assign({}, c, { chosen: resolutions[c.field] || null })),
      confirmations,
      limits: {
        bodyMaxChars: spec.postBody.maxChars,
        jaRecommendedMin: spec.writingGuide.jaRecommendedMin,
        jaRecommendedMax: spec.writingGuide.jaRecommendedMax,
        catchcopyMaxChars: spec.writingGuide.catchcopyMaxChars,
      },
    };
  }

  // 生成の参考にする過去投稿（この店舗のものだけ。新しい順に最大 n 件、長すぎるものは切る）。事実の根拠には使わない。
  function pastPostsOf(gp, n) {
    return (gp.pastPosts || []).slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')) || (b.addedAt || 0) - (a.addedAt || 0))
      .slice(0, n || 5).map((p) => ({ date: p.date || '', platform: p.platform || '', text: Array.from(String(p.text || '')).slice(0, 700).join('') }));
  }

  // この店舗で使ってよい値（登録情報・投稿入力）。過去投稿の価格などは現在と違う可能性があるため含めない。
  function allowedValues(ctx) {
    const p = ctx.post;
    return Object.values(ctx.store.facts)
      .concat(...ctx.menu.map((m) => [m.name, m.description, m.price, m.period]))
      .concat([p.price, p.salesPeriod, p.eventDate, p.features, p.theme, p.mainItem, p.cta && p.cta.url, p.purpose, ctx.brand.features, ctx.postDate, ctx.store.name])
      .filter(has).map(String);
  }

  // 生成前の確認（店舗ごと）。異なる区分・ブランドの店舗は同時に生成しない。
  function checkBatch(state, storeIds) {
    const errors = [];
    if (!storeIds.length) errors.push('店舗を選択してください。');
    const bs = storeIds.map((id) => bundleOf(state, id));
    if (bs.some((b) => !b)) errors.push('見つからない店舗があります。');
    const ok = bs.filter(Boolean);
    if (new Set(ok.map((b) => b.store.kind)).size > 1) errors.push('自社店舗と顧客案件の店舗は同時に生成できません。分けて生成してください。');
    const clients = ok.filter((b) => b.store.kind !== 'own');
    if (clients.length > 1 && new Set(clients.map((b) => b.gp.brandId || '(なし)')).size > 1) errors.push('顧客案件の店舗を一括生成できるのは、同じブランドに属する店舗だけです（別の顧客の情報が混ざるのを防ぐため）。');
    if (clients.length > 1 && clients.some((b) => !b.gp.brandId)) errors.push('ブランドが未設定の顧客案件の店舗は、1店舗ずつ生成してください。');
    return errors;
  }

  function preflight(state, spec, input, today) {
    return (input.storeIds || []).map((id) => {
      const b = bundleOf(state, id);
      const req = mergeRequest(input.common, (input.perStore || {})[id]);
      req.resolutions = Object.assign({}, (input.resolutions || {})[id] || {});
      const ctx = buildContext(b, req, spec, today);
      return { storeId: id, storeName: b.store.name, kind: b.store.kind, conflicts: ctx.conflicts, unresolved: unresolvedConflicts(ctx.conflicts, req.resolutions), confirmations: ctx.confirmations, toneSource: ctx.toneSource, req, ctx };
    });
  }

  // ───── 自動チェック ─────
  const ABSTRACT_PRAISE = ['絶品', '最高', '極上', '至高', '究極', '神レベル'];
  const URL_RE = /https?:\/\/[^\s)）」』、。]+/g;
  const PHONE_RE = /(?:\+81[-\s]?|0)\d{1,4}[-\s(（)）]\d{1,4}[-\s)）]\d{3,4}|\b0\d{9,10}\b/g;
  // 単位付きの数値（価格・所要時間・階数・席数など）
  const UNIT_NUMBER_RE = /(?:[¥￥$]\s?([\d,，]+))|([\d,，]+)\s?(?:円|分|階|F|名|席|時|%|％|km|m\b|yen|min|minutes?)/gi;

  function numbersIn(text) {
    const out = new Set();
    (String(text || '').match(/\d[\d,，]*/g) || []).forEach((m) => out.add(m.replace(/[,，]/g, '')));
    return out;
  }
  function unitNumbers(text) {
    const out = [];
    const re = new RegExp(UNIT_NUMBER_RE.source, 'gi');
    let m;
    while ((m = re.exec(String(text || '')))) {
      const raw = (m[1] || m[2] || '').replace(/[,，]/g, '');
      if (raw) out.push({ value: raw, match: m[0].trim() });
    }
    return out;
  }
  const stripTrailing = (u) => u.replace(/[.,!?]+$/, '');
  function urlsIn(text) { return (String(text || '').match(URL_RE) || []).map(stripTrailing); }
  function splitPhrases(text) { return String(text || '').split(/[\n、，,／/]/).map((s) => s.trim()).filter((s) => s.length >= 2); }
  // 漢字・カタカナ・英字の2文字以上の連なりを内容語とみなす（形態素解析なしの簡易判定）
  function contentWords(text) {
    return Array.from(new Set(String(text || '').match(/[一-鿿々゠-ヿー]{2,}|[A-Za-z]{3,}/g) || []));
  }

  // 他店舗の固有情報（店名・別名・住所・URL・その店舗にしかないメニュー名）
  function otherStoreMarkers(state, ctx) {
    const markers = [];
    const ownMenu = new Set(ctx.menu.map((m) => m.name));
    const ownTexts = allowedValues(ctx).concat(ctx.store.aliases || []).join('\n');
    (state.stores || []).forEach((s) => {
      if (s.id === ctx.store.id) return;
      const gp = storeInfo(s);
      const add = (value, kind) => { if (has(value) && String(value).trim().length >= 3 && !ownTexts.includes(String(value).trim())) markers.push({ value: String(value).trim(), kind, store: s.name }); };
      add(s.name, '店舗名');
      (s.aliases || []).forEach((a) => add(a, '別名'));
      add(gp.address, '住所');
      add(gp.reserveUrl, '予約URL');
      add(gp.mapsUrl, 'GoogleマップURL');
      (gp.ctaOptions || []).forEach((o) => add(o.url, 'CTAのURL'));
      (gp.menu || []).forEach((m) => { if (!ownMenu.has(m.name)) add(m.name, 'メニュー名'); });
    });
    return markers;
  }

  function validateSet(set, ctx, spec, opts) {
    opts = opts || {};
    const checks = [];
    const add = (level, code, message) => checks.push({ level, code, message });
    const maxChars = spec.postBody.maxChars;
    const g = spec.writingGuide;
    const copy = set.catchcopy || '';
    const ja = set.bodyJa || '';
    const en = set.bodyEn || '';
    const jaChars = countChars(ja);
    const enChars = countChars(en);
    const copyChars = countChars(copy);
    const all = copy + '\n' + ja + '\n' + en;

    // 必須要素（3つで1セット）
    if (!copy.trim()) add('error', 'missing_catchcopy', '画像用キャッチコピーがありません。');
    if (!ja.trim()) add('error', 'missing_ja', '日本語投稿文がありません。');
    if (!en.trim()) add('error', 'missing_en', '英語投稿文がありません。');

    // Google仕様
    if (jaChars > maxChars) add('error', 'ja_over_limit', '日本語投稿文が ' + jaChars + ' 文字で、Google仕様の上限 ' + maxChars + ' 文字を超えています。');
    if (enChars > maxChars) add('error', 'en_over_limit', '英語投稿文が ' + enChars + ' 文字で、Google仕様の上限 ' + maxChars + ' 文字を超えています。');
    const pc = spec.policyChecks || {};
    if (pc.phoneNumberInBody && pc.phoneNumberInBody.enabled && new RegExp(PHONE_RE.source).test(all)) add('warn', 'phone_number', pc.phoneNumberInBody.message);

    // 社内ルール（文字量・キャッチコピー・見出し）
    if (jaChars && jaChars < g.jaRecommendedMin) add('info', 'ja_short', '日本語投稿文が ' + jaChars + ' 文字です（目安 ' + g.jaRecommendedMin + '〜' + g.jaRecommendedMax + ' 文字）。');
    if (jaChars > g.jaRecommendedMax && jaChars <= maxChars) add('info', 'ja_long', '日本語投稿文が ' + jaChars + ' 文字で、目安の ' + g.jaRecommendedMax + ' 文字を超えています（Google上限内）。');
    if (copyChars > g.catchcopyMaxChars) add('warn', 'copy_long', 'キャッチコピーが ' + copyChars + ' 文字です。画像に載せるには長い可能性があります（目安 ' + g.catchcopyMaxChars + ' 文字）。');
    ABSTRACT_PRAISE.forEach((w) => { if (copy.includes(w) || ja.includes(w)) add('warn', 'abstract_praise', '抽象的な褒め言葉「' + w + '」が含まれています。具体的な魅力に置き換えを検討してください。'); });
    const firstLine = ja.trim().split('\n')[0] || '';
    if (!/^＼.+／$/.test(firstLine.trim())) add('warn', 'no_heading', '日本語投稿文の1行目に「＼…／」形式の見出しがありません。');
    const bodyRest = ja.split('\n').slice(1).join('\n');
    const words = contentWords(copy).filter((w) => !(ctx.store.area && w === ctx.store.area));
    if (words.length && !words.some((w) => bodyRest.includes(w))) add('warn', 'copy_body_mismatch', 'キャッチコピーの語句が本文で触れられていません。内容が一致しているか確認してください。');
    const copyN = norm(copy);
    if (copyN.length >= 6) (ctx.pastPosts || []).forEach((pp) => { if (norm(pp.text).includes(copyN)) add('info', 'copy_reused', 'キャッチコピーが過去投稿（' + (pp.date || '日付不明') + '）と同じです。使い回しでよいか確認してください。'); });
    const siblings = opts.siblings || [];
    if (siblings.length > 1 && copy.includes('で味わう') && siblings.filter((s) => (s.catchcopy || '').includes('で味わう')).length > 1) add('info', 'copy_pattern', '複数案で「〜で味わう」の型が重なっています。切り口を変えることを検討してください。');

    // 登録情報との照合
    const allowed = allowedValues(ctx);
    const allowedNums = new Set();
    allowed.forEach((t) => numbersIn(t).forEach((n) => allowedNums.add(n)));
    const allowedText = allowed.join('\n');
    unitNumbers(copy + '\n' + ja).forEach((x) => { if (!allowedNums.has(x.value)) add('error', 'unregistered_number', '本文の「' + x.match + '」は登録情報・投稿入力にない数値です（価格・距離・階数などの創作の可能性）。'); });
    const jaNums = numbersIn(ja);
    unitNumbers(en).forEach((x) => {
      if (!allowedNums.has(x.value)) add('error', 'unregistered_number_en', '英語版の「' + x.match + '」は登録情報・投稿入力にない数値です。');
      else if (!jaNums.has(x.value)) add('warn', 'en_extra_number', '英語版の「' + x.match + '」は日本語版に含まれていません。');
    });
    const jaUrls = new Set(urlsIn(ja));
    urlsIn(all).forEach((u) => { if (!allowedText.includes(u)) add('error', 'unregistered_url', ((pc.unregisteredUrl && pc.unregisteredUrl.message) || '未登録のURLです。') + '（' + u + '）'); });
    urlsIn(en).forEach((u) => { if (!jaUrls.has(u)) add('warn', 'en_extra_url', '英語版のURL（' + u + '）は日本語版に含まれていません。'); });
    splitPhrases(ctx.brand.avoidPhrases).forEach((ph) => { if (all.includes(ph)) add('warn', 'avoid_phrase', '避けたい表現「' + ph + '」が含まれています。'); });

    // 他店舗情報の混入
    const seen = new Set();
    (opts.otherMarkers || []).forEach((m) => {
      if (all.includes(m.value) && !seen.has(m.value)) { seen.add(m.value); add('error', 'other_store_leak', '別店舗（' + m.store + '）の' + m.kind + '「' + m.value + '」が含まれています。'); }
    });

    // 季節表現
    const ignore = [ctx.store.name, ctx.store.area, ctx.store.facts['住所'], ctx.store.facts['施設名・階数']].concat(ctx.menu.map((m) => m.name));
    const hits = findSeasonWords(copy + '\n' + ja, 'ja', ignore).concat(findSeasonWords(en, 'en', ignore));
    if (!ctx.season.use) hits.forEach((h) => add('warn', 'season_not_allowed', '季節表現を使わない設定ですが「' + h.word + '」（' + SEASONS[h.season].ja + '）が含まれています。'));
    else hits.filter((h) => h.season !== ctx.season.season).forEach((h) => add('warn', 'season_mismatch', '投稿予定日（' + ctx.season.label + '）と合わない季節表現「' + h.word + '」（' + SEASONS[h.season].ja + '）が含まれています。'));

    const rank = { error: 0, warn: 1, info: 2 };
    checks.sort((a, b) => rank[a.level] - rank[b.level]);
    return {
      counts: { catchcopy: copyChars, ja: jaChars, en: enChars, maxChars },
      seasonHits: hits,
      googleSpec: { ok: jaChars <= maxChars && enChars <= maxChars, specVersion: spec.specVersion, verifiedAt: spec.verifiedAt, needsReverification: !!spec.needsReverification },
      checks,
      errorCount: checks.filter((c) => c.level === 'error').length,
      checkedAt: Date.now(),
    };
  }

  // ───── 生成プロンプト（docs/google-post-rules.md に基づく） ─────
  const SYSTEM_PROMPT = 'あなたは飲食店の集客を支援する日本のコピーライターです。Googleビジネスプロフィールに投稿する「画像用キャッチコピー」「日本語投稿文」「英語投稿文」を、必ず1セットとして作成します。\n\n' +
    '# 最重要：事実の扱い\n' +
    '- 使ってよい事実は、ユーザーメッセージ内の <facts> に書かれた情報と、添付画像から確認できることだけです。\n' +
    '- 営業時間、駅からの距離、施設名・階数、価格、予約条件、販売期間、サービス、設備、キャンペーンは、<facts> に書かれたものだけを書きます。「駅すぐ」「徒歩○分」なども記載がある場合に限ります。\n' +
    '- 料理の味・素材・香り・食感・温度・盛り付けは、<facts> のメニュー説明・伝えたい特徴、または添付画像から確認できる範囲だけで表現します。根拠がなければ、具体的な味の断定は避け、利用シーンや過ごし方で魅力を伝えます。\n' +
    '- ブランド共通の情報と店舗固有の情報が異なる場合は、店舗固有の情報を優先します。\n' +
    '- 書けなかった情報や確認が必要な点は、本文に入れず reviewer_notes に書きます。\n' +
    '- 電話番号、メールアドレスは本文に入れません。URLは <facts> にあるものだけ使えますが、基本はCTAボタンに任せ本文には入れません。\n\n' +
    '# 画像用キャッチコピー\n' +
    '- 画像に載せやすい短さ（目安 {catchcopyMax} 文字以内）。説明文のように長くしない。\n' +
    '- 表現の参考（店名や文言は流用しない）：\n  田端で楽しむ、レモン香るカフェ時間／飯田橋で味わう、彩りパスタ／ティラミスとバナナが重なる、宝石かき氷／船橋で味わう、丁寧に仕上げたビストロ料理／合羽橋で味わう、温かな手打ち蕎麦／下北沢で囲む、熱々のお好み焼き／おばんざいだけじゃない、なかふくの揚げたて／海浜幕張で楽しむ、熱々のスペイン料理／新浦安で味わう、旨みが広がる一皿\n' +
    '- 切り口を店舗に合わせて使い分ける：地域と利用体験／商品名や料理ジャンル／素材・香り・彩り・食感・温度／店内で過ごす時間や利用シーン／店舗ならではの特徴や意外性。\n' +
    '- 毎回「地域名＋で味わう」の型にしない。複数案では切り口を変える。\n' +
    '- 「絶品」「最高」など抽象的な褒め言葉に頼らず、何が魅力かを具体的に伝える。\n\n' +
    '# 日本語投稿文\n' +
    '- 1行目は、キャッチコピーと連動した見出しを「＼…／」の形で置く（例：＼新浦安で出会う、彩り豊かなスペインの一皿／）。\n' +
    '- 短い告知文ではなく、店の雰囲気や利用シーンが想像できる、複数の短い段落の読み応えある文章にする。目安 {jaMin}〜{jaMax} 文字。上限 {maxChars} 文字（Google仕様）を絶対に超えない。\n' +
    '- 流れ（テーマに合わせて自然に組み立てる）：季節・時期・食事への導入 → 店舗の場所・アクセス・施設内の位置 → 料理や商品の魅力 → 素材・香り・味・食感・彩りの具体的な描写（根拠がある範囲） → 誰と、どんな場面で楽しめるか → 食事や店内で過ごす時間の提案 → 地域や料理ジャンルを探している人への自然な案内 → 来店・予約につながる締めくくり。\n' +
    '- キャッチコピーの内容を本文で具体的に広げる。キャッチコピーと同じ説明を繰り返さない。同じ魅力や案内を繰り返して長くしない。\n' +
    '- 丁寧で親しみやすい文体。スマートフォンで読みやすいよう段落を分ける（1段落2〜3文程度）。\n' +
    '- 絵文字は文章に合う箇所に適度に使う。各段落に機械的に付けない。\n' +
    '- 地域名や料理ジャンルは自然に含め、不自然に詰め込まない。\n' +
    '- 段落の区切りは空行（\\n\\n）で表す。\n\n' +
    '# 英語投稿文\n' +
    '- 日本語投稿文に対応する内容を、自然な英語で書く。一文ずつ直訳しない。\n' +
    '- 店舗名、地域、料理ジャンル、利用シーンは日本語版と一致させる。日本語版にない価格・商品・サービス・営業時間・特典を足さない。\n' +
    '- 日本語版より簡潔でよいが、店舗の魅力と来店案内は残す。上限 {maxChars} 文字。\n\n' +
    '# 季節表現\n' +
    '- <season> の指示に従う。季節を使わない指示のときは、季節や時期を連想させる語（春夏秋冬、桜、紅葉、クリスマス、年末など）を使わない。\n' +
    '- 使う場合は、指定された月・季節と店舗の地域に合う表現だけにし、日本語版と英語版の時期を一致させる。\n\n' +
    '# 出力\n指定された JSON スキーマで出力する。sets の数は指示された案数ちょうどにする。';

  function buildSystemPrompt(ctx) {
    return SYSTEM_PROMPT.split('{catchcopyMax}').join(ctx.limits.catchcopyMaxChars)
      .split('{jaMin}').join(ctx.limits.jaRecommendedMin)
      .split('{jaMax}').join(ctx.limits.jaRecommendedMax)
      .split('{maxChars}').join(ctx.limits.bodyMaxChars);
  }

  function lines(obj) {
    return Object.keys(obj).filter((k) => has(obj[k])).map((k) => '- ' + k + ': ' + obj[k]).join('\n');
  }

  function buildUserPrompt(ctx) {
    const p = ctx.post;
    const menu = ctx.menu.map((m) => '- ' + m.name + (m.price ? '（' + m.price + '）' : '') + (m.period ? '［販売期間: ' + m.period + '］' : '') + (m.description ? '：' + m.description : '')).join('\n');
    const season = ctx.season.use
      ? '季節表現を使う。投稿予定日 ' + ctx.postDate + '、時期は ' + ctx.season.label + '。この時期に合う表現だけを使う。'
      : '季節表現を使わない。通年使える文章にする。';
    return '<facts>\n## ブランド共通\n' +
      lines({ ブランド名: ctx.brand.name, 業種: ctx.brand.industry, ブランドの特徴: ctx.brand.features, よく使う表現: ctx.brand.preferredPhrases, ブランドの注意事項: ctx.brand.notes }) +
      '\n\n## 店舗（' + ctx.store.name + '）\n' + lines(Object.assign({ 店舗名: ctx.store.name }, ctx.store.facts)) +
      (ctx.store.notes ? '\n- 店舗固有の注意事項: ' + ctx.store.notes : '') +
      '\n\n## 登録メニュー・商品\n' + (menu || '（登録なし）') +
      '\n\n## 今回の投稿入力\n' + lines({
        投稿目的: p.purpose, 投稿テーマ: p.theme, '主役の商品・メニュー': p.mainItem, 伝えたい特徴: p.features, 価格: p.price, 販売期間: p.salesPeriod, 開催日: p.eventDate,
        CTA: p.cta ? p.cta.label + '（ボタンで表示。本文では「ご予約はボタンから」等の案内にとどめる）' : null,
        添付画像: p.imageNotes.length ? p.imageNotes.join('、') : null,
      }) +
      '\n</facts>\n\n<past_posts>\n' + ((ctx.pastPosts || []).length ? ctx.pastPosts.map((pp, i) => '### 過去投稿' + (i + 1) + (pp.date ? '（' + pp.date + '）' : '') + '\n' + pp.text).join('\n\n') : '（なし）') + '\n</past_posts>\n\n<avoid>\n' + (ctx.brand.avoidPhrases || '（指定なし）') + '\n</avoid>\n\n<reference_posts>\n' + (ctx.brand.referencePosts || '（なし）') + '\n</reference_posts>\n\n' +
      '<tone>' + (ctx.tone || '丁寧で親しみやすい') + '</tone>\n\n<season>' + season + '</season>\n\n' +
      '案数: ' + ctx.setCount + '。' + (ctx.setCount > 1 ? '各案でキャッチコピーの切り口を変えてください。' : 'おすすめの1案を作成してください。') +
      '\n<avoid> の表現は使わないでください。<reference_posts> と <past_posts> は文章の雰囲気・よく使う言い回しの参考にとどめ、文言やキャッチコピーを流用しないでください。<past_posts> の価格・販売期間・キャンペーンは古い可能性があるため、<facts> に無いものは書かないでください。';
  }

  const OUTPUT_SCHEMA = {
    type: 'object', additionalProperties: false, required: ['sets'],
    properties: {
      sets: {
        type: 'array',
        items: {
          type: 'object', additionalProperties: false,
          required: ['catchcopy', 'body_ja', 'body_en', 'angle', 'season_expressions', 'used_facts', 'reviewer_notes'],
          properties: {
            catchcopy: { type: 'string', description: '画像用キャッチコピー' },
            body_ja: { type: 'string', description: '日本語投稿文（1行目は＼…／の見出し）' },
            body_en: { type: 'string', description: '英語投稿文' },
            angle: { type: 'string', description: 'キャッチコピーの切り口（例: 地域と利用体験）' },
            season_expressions: { type: 'array', items: { type: 'string' }, description: '使用した季節表現。なければ空配列' },
            used_facts: { type: 'array', items: { type: 'string' }, description: '本文に使った登録情報（商品・価格・アクセスなど）' },
            reviewer_notes: { type: 'array', items: { type: 'string' }, description: '担当者向けの確認事項' },
          },
        },
      },
    },
  };

  // AIの出力（JSON）を、3つ揃ったセットに整える。1つでも欠けたセットは採用しない。
  function normalizeSets(raw, setCount) {
    const sets = ((raw && raw.sets) || []).filter((s) => s && has(s.catchcopy) && has(s.body_ja) && has(s.body_en)).slice(0, setCount);
    return sets.map((s) => ({
      catchcopy: String(s.catchcopy).trim(), bodyJa: String(s.body_ja).trim(), bodyEn: String(s.body_en).trim(), angle: s.angle || '',
      seasonExpressions: s.season_expressions || [], usedFacts: s.used_facts || [], reviewerNotes: s.reviewer_notes || [],
    }));
  }

  // ───── デモ生成（テンプレート）。外部と通信せず、登録情報だけを定型文に差し込む ─────
  const SEASON_INTRO = {
    spring: 'やわらかな日差しが心地よい春の日。',
    summer: '日差しがまぶしい夏の日。',
    autumn: '過ごしやすい日が増えてきた秋の日。',
    winter: '空気が澄んでくる冬の日。',
  };
  const DEMO_ANGLES = [
    { key: '地域と利用体験', copy: (c) => (c.area && c.item ? c.area + 'で楽しむ、' + c.item + 'のひととき' : null) },
    { key: '商品名や料理ジャンル', copy: (c) => (c.item ? c.item + 'を、' + c.store + 'で' : null) },
    { key: '店内で過ごす時間や利用シーン', copy: (c) => (c.area ? c.area + 'で囲む、' + c.store + 'の食卓' : null) },
  ];
  function firstSentence(text) { return String(text || '').split(/\n|。/)[0]; }

  function demoGenerate(ctx) {
    const f = ctx.store.facts;
    const p = ctx.post;
    const c = { area: ctx.store.area, item: p.mainItem, store: ctx.store.name };
    const sets = [];
    for (let i = 0; i < ctx.setCount; i++) {
      const angle = DEMO_ANGLES[i % DEMO_ANGLES.length];
      const catchcopy = angle.copy(c) || ctx.store.name + 'で過ごす時間';
      const used = [];
      const paras = ['＼' + catchcopy + '／'];
      const intro = ctx.season.use ? SEASON_INTRO[ctx.season.season] : '';
      paras.push(intro + (ctx.store.area ? ctx.store.area + 'の' : '') + ctx.store.name + 'から、' + (p.theme || 'お店') + 'のご案内です✨');
      const place = [f['施設名・階数'], f['アクセス']].filter(Boolean);
      if (place.length) { paras.push('お店は' + place.join('。') + '。'); used.push.apply(used, place); }
      if (p.mainItem) {
        const reg = p.mainItemRegistered;
        let s = '今回ご紹介するのは「' + p.mainItem + '」。';
        if (reg && reg.description) { s += reg.description + '。'; used.push(reg.description); }
        if (p.features) { s += p.features + '。'; used.push(p.features); }
        if (p.price) { s += '価格は' + p.price + 'です。'; used.push(p.price); }
        if (p.salesPeriod) { s += '販売期間は' + p.salesPeriod + '。'; used.push(p.salesPeriod); }
        paras.push(s);
      }
      if (f['店舗の雰囲気']) { paras.push('店内は' + firstSentence(f['店舗の雰囲気']) + '。'); used.push(f['店舗の雰囲気']); }
      if (f['主な利用シーン']) { paras.push(firstSentence(f['主な利用シーン']) + 'など、さまざまな場面でご利用いただけます🍽️'); used.push(f['主な利用シーン']); }
      if (f['店舗独自の特徴']) { paras.push(firstSentence(f['店舗独自の特徴']) + 'も、' + ctx.store.name + 'ならではの魅力です。'); used.push(f['店舗独自の特徴']); }
      if (f['営業時間']) { paras.push('営業時間：' + f['営業時間'] + (f['定休日'] ? '（定休日：' + f['定休日'] + '）' : '')); used.push(f['営業時間']); }
      const closing = p.cta && p.cta.type === 'BOOK' ? 'ご予約はボタンから承っております。' : '';
      paras.push((ctx.store.area ? ctx.store.area + 'で' : '') + (ctx.brand.industry || 'お食事') + 'のお店をお探しの方は、ぜひお立ち寄りください。' + closing + '皆さまのご来店をお待ちしております😊');

      const en = [ctx.store.name + (ctx.store.area ? ' in ' + ctx.store.area : '') + ' — ' + (p.theme ? 'featuring ' + (p.mainItem || p.theme) : 'welcome') + '.'];
      if (p.price) en.push('Price: ' + p.price + '.');
      if (p.salesPeriod) en.push('Available: ' + p.salesPeriod + '.');
      if (f['営業時間']) en.push('Hours: ' + f['営業時間'] + '.');
      en.push(p.cta && p.cta.type === 'BOOK' ? 'Reserve using the button below. We look forward to seeing you!' : 'We look forward to seeing you!');
      sets.push({
        catchcopy, bodyJa: paras.join('\n\n'), bodyEn: en.join('\n\n'), angle: angle.key,
        seasonExpressions: intro ? [intro] : [], usedFacts: used,
        reviewerNotes: ['デモ生成（テンプレート）の文章です。公開前に AI 生成または手動で文章を整えてください。'],
      });
    }
    return sets;
  }

  // ───── 表示・コピー用の文面 ─────
  function fullSetText(storeName, setNo, set) {
    return '【' + storeName + '】\n\n案' + setNo + '\n\n画像用キャッチコピー：\n' + set.catchcopy + '\n\n日本語投稿文：\n' + set.bodyJa + '\n\nーーーーーー\n\nEnglish:\n' + set.bodyEn;
  }
  function copyText(kind, storeName, post) {
    if (kind === 'copy') return post.catchcopy;
    if (kind === 'ja') return post.bodyJa;
    if (kind === 'en') return post.bodyEn;
    return fullSetText(storeName, post.setNo || 1, post);
  }

  // 投稿案の検索（店舗・テーマ・作成日・状態・キーワード）
  function filterPosts(posts, stores, f) {
    f = f || {};
    const nameOf = (id) => ((stores || []).find((s) => s.id === id) || {}).name || '';
    const day = (t) => new Date(t).toISOString().slice(0, 10);
    return posts.filter((p) =>
      (!f.storeId || p.storeId === f.storeId) &&
      (!f.status || p.status === f.status) &&
      (!f.theme || String(p.theme || '').includes(f.theme)) &&
      (!f.from || day(p.createdAt) >= f.from) &&
      (!f.to || day(p.createdAt) <= f.to) &&
      (!f.q || [nameOf(p.storeId), p.theme, p.catchcopy, p.bodyJa, p.bodyEn].join('\n').includes(f.q)),
    ).sort((a, b) => b.createdAt - a.createdAt || (a.setNo || 0) - (b.setNo || 0));
  }

  // ───── Google仕様値の確認 ─────
  function validateSpec(spec) {
    const errors = [];
    const posInt = (v) => Number.isInteger(Number(v)) && Number(v) > 0 && String(v).trim() !== '';
    if (!spec || !spec.postBody || !posInt(spec.postBody.maxChars)) errors.push('投稿本文の上限文字数は正の整数で入力してください。');
    const g = (spec && spec.writingGuide) || {};
    ['jaRecommendedMin', 'jaRecommendedMax', 'catchcopyMaxChars'].forEach((k) => { if (!posInt(g[k])) errors.push('社内の目安（' + k + '）は正の整数で入力してください。'); });
    if (posInt(g.jaRecommendedMin) && posInt(g.jaRecommendedMax) && Number(g.jaRecommendedMin) > Number(g.jaRecommendedMax)) errors.push('日本語本文の目安の下限が上限より大きくなっています。');
    if (!spec || !Array.isArray(spec.ctaTypes) || !spec.ctaTypes.length || spec.ctaTypes.some((t) => !t.code || !t.ja)) errors.push('ボタン（CTA）の種類を1つ以上、コードと日本語名つきで入力してください。');
    if (spec && !/^\d{4}-\d{2}-\d{2}$/.test(spec.verifiedAt || '')) errors.push('確認日を YYYY-MM-DD で入力してください。');
    return errors;
  }

  // ───── CSV（一括登録・出力）─────
  const KIND_LABEL = { own: '自社店舗', client: '顧客案件' };
  const STORE_CSV = [['storeId', '店舗ID'], ['name', '店舗名'], ['kind', '区分'], ['brand', 'ブランド名']]
    .concat(STORE_FIELDS.map((f) => [f[0], f[1]]))
    .concat([['cta', '使用できるCTA（種類=URL を ; 区切り）']])
    .concat(STORE_META_FIELDS.map((f) => [f[0], f[1]]));
  const MENU_CSV = [['storeId', '店舗ID'], ['storeName', '店舗名'], ['id', 'メニューID'], ['name', '名前'], ['description', '説明'], ['price', '価格'], ['period', '販売期間']];
  const BRAND_CSV = [['id', 'ブランドID']].concat(BRAND_FIELDS.map((f) => [f[0], f[1].replace('（1行に1つ）', '')]));

  function ctaToText(opts) { return (opts || []).map((o) => o.type + '=' + (o.url || '')).join('; '); }
  function parseCtaText(text, spec) {
    const out = [];
    const errors = [];
    String(text || '').split(/[;；\n]/).map((s) => s.trim()).filter(Boolean).forEach((part) => {
      const i = part.indexOf('=');
      const key = (i >= 0 ? part.slice(0, i) : part).trim();
      const url = i >= 0 ? part.slice(i + 1).trim() : '';
      const t = (spec.ctaTypes || []).find((c) => c.code === key.toUpperCase() || c.ja === key);
      if (!t) errors.push('CTAの種類「' + key + '」はGoogle仕様設定にありません');
      else if (url && !/^https?:\/\//.test(url)) errors.push('CTA「' + key + '」のURLが http(s):// で始まっていません');
      else out.push({ type: t.code, url });
    });
    return { list: out, errors };
  }

  // CSVの2次元配列（1行目が見出し）を、列定義のキーを持つオブジェクトにする
  function rowsToObjects(rows, columns) {
    if (!rows.length) return { items: [], missing: columns.map((c) => c[1]) };
    const head = rows[0].map((h) => String(h).trim());
    const idx = {};
    columns.forEach((c) => { const i = head.indexOf(c[1]); if (i >= 0) idx[c[0]] = i; });
    const missing = [];
    const items = rows.slice(1).map((r) => {
      const o = {};
      Object.keys(idx).forEach((k) => { o[k] = r[idx[k]] === undefined ? undefined : String(r[idx[k]]).trim(); });
      return o;
    });
    return { items, missing, present: Object.keys(idx) };
  }

  function storesCsv(state) {
    const brands = (state.gpost && state.gpost.brands) || [];
    const rows = (state.stores || []).map((s) => {
      const gp = storeInfo(s);
      return STORE_CSV.map((c) => {
        if (c[0] === 'storeId') return s.id;
        if (c[0] === 'name') return s.name;
        if (c[0] === 'kind') return KIND_LABEL[s.kind] || s.kind;
        if (c[0] === 'brand') return (brands.find((b) => b.id === gp.brandId) || {}).name || '';
        if (c[0] === 'cta') return ctaToText(gp.ctaOptions);
        return gp[c[0]] || '';
      });
    });
    return { head: STORE_CSV.map((c) => c[1]), rows };
  }
  function menuCsv(state) {
    const rows = [];
    (state.stores || []).forEach((s) => storeInfo(s).menu.forEach((m) => rows.push([s.id, s.name, m.id, m.name, m.description || '', m.price || '', m.period || ''])));
    return { head: MENU_CSV.map((c) => c[1]), rows };
  }
  function brandsCsv(state) {
    return { head: BRAND_CSV.map((c) => c[1]), rows: ((state.gpost && state.gpost.brands) || []).map((b) => BRAND_CSV.map((c) => b[c[0]] || '')) };
  }
  function postsCsv(state) {
    const head = ['投稿案ID', '店舗名', '区分', '案', 'テーマ', '状態', '作成日', '作成者', '生成方法', '画像用キャッチコピー', '日本語投稿文', '英語投稿文', 'エラー件数'];
    const rows = ((state.gpost && state.gpost.posts) || []).map((p) => {
      const s = (state.stores || []).find((x) => x.id === p.storeId) || {};
      return [p.id, s.name || '', KIND_LABEL[s.kind] || '', p.setNo, p.theme || '', STATUS_LABEL[p.status] || p.status, new Date(p.createdAt).toISOString().slice(0, 10), p.createdBy || '', p.provider === 'ai' ? 'AI生成' : 'デモ生成', p.catchcopy, p.bodyJa, p.bodyEn, (p.checks && p.checks.errorCount) || 0];
    });
    return { head, rows };
  }

  // 取り込み計画。1行でもエラーがあれば反映しない（全件取り消し）。
  function planStoreImport(state, rows, spec, ownNames) {
    const { items, present } = rowsToObjects(rows, STORE_CSV);
    const errors = [];
    const ops = [];
    if (!present || !present.includes('name')) return { ops, errors: ['「店舗名」の列がありません。書き出したCSVの見出しをそのまま使ってください。'] };
    const brands = (state.gpost && state.gpost.brands) || [];
    const seen = new Set();
    items.forEach((o, i) => {
      const line = i + 2;
      const err = (m) => errors.push(line + '行目：' + m);
      if (!o.name) { err('店舗名が空欄です'); return; }
      let store = o.storeId ? state.stores.find((s) => s.id === o.storeId) : null;
      if (o.storeId && !store) { err('店舗ID「' + o.storeId + '」が見つかりません'); return; }
      if (!store) store = state.stores.find((s) => s.name === o.name) || null;
      if (store && store.name !== o.name) { err('店舗IDと店舗名が一致しません（登録名：' + store.name + '）。店舗名の変更は「店舗・案件」画面で行ってください'); return; }
      const key = store ? store.id : 'new:' + o.name;
      if (seen.has(key)) { err('同じ店舗が2回以上出てきます'); return; }
      seen.add(key);
      let kind = store ? store.kind : 'client';
      if (has(o.kind)) {
        const k = o.kind === '自社店舗' ? 'own' : o.kind === '顧客案件' ? 'client' : null;
        if (!k) { err('区分は「自社店舗」か「顧客案件」で入力してください'); return; }
        if (store && k !== store.kind) { err('区分の変更はCSVではできません（「店舗・案件」画面で確認のうえ変更してください）'); return; }
        kind = k;
      }
      if (!store && kind === 'own' && !(ownNames || []).includes(o.name)) { err('自社店舗として新規登録できるのは ' + (ownNames || []).join('、') + ' だけです'); return; }
      let brandId;
      if (o.brand !== undefined) {
        if (!has(o.brand)) brandId = '';
        else {
          const b = brands.find((x) => x.name === o.brand);
          if (!b) { err('ブランド「' + o.brand + '」が未登録です。先にブランドを登録してください'); return; }
          brandId = b.id;
        }
      }
      const gp = {};
      STORE_FIELDS.concat(STORE_META_FIELDS).forEach((f) => { if (o[f[0]] !== undefined) gp[f[0]] = o[f[0]]; });
      if (has(gp.verifiedAt) && !/^\d{4}-\d{2}-\d{2}$/.test(gp.verifiedAt.replace(/\//g, '-'))) { err('確認日は YYYY-MM-DD で入力してください'); return; }
      if (has(gp.verifiedAt)) gp.verifiedAt = gp.verifiedAt.replace(/\//g, '-');
      ['mapsUrl', 'reserveUrl'].forEach((k) => { if (has(gp[k]) && !/^https?:\/\//.test(gp[k])) err(k === 'mapsUrl' ? 'GoogleマップURLが http(s):// で始まっていません' : '予約URLが http(s):// で始まっていません'); });
      if (o.cta !== undefined) {
        const c = parseCtaText(o.cta, spec);
        c.errors.forEach(err);
        gp.ctaOptions = c.list;
      }
      if (brandId !== undefined) gp.brandId = brandId;
      ops.push({ type: store ? 'update' : 'new', storeId: store ? store.id : null, name: o.name, kind, gp });
    });
    return { ops, errors };
  }

  function applyStoreImport(state, plan, uid, now) {
    plan.ops.forEach((op) => {
      let s = op.storeId ? state.stores.find((x) => x.id === op.storeId) : null;
      if (!s) { s = { id: uid('store'), name: op.name, kind: op.kind, aliases: [], memo: '', reportTemplate: '', createdAt: now }; state.stores.push(s); }
      s.gpost = Object.assign(storeInfo(s), op.gp, { updatedAt: now });
    });
  }

  function planMenuImport(state, rows) {
    const { items, present } = rowsToObjects(rows, MENU_CSV);
    const errors = [];
    const ops = [];
    if (!present || !present.includes('name') || !(present.includes('storeId') || present.includes('storeName'))) return { ops, errors: ['「店舗ID」または「店舗名」と「名前」の列が必要です。'] };
    items.forEach((o, i) => {
      const err = (m) => errors.push((i + 2) + '行目：' + m);
      const store = o.storeId ? state.stores.find((s) => s.id === o.storeId) : state.stores.find((s) => s.name === o.storeName);
      if (!store) { err('店舗が見つかりません（' + (o.storeId || o.storeName || '空欄') + '）'); return; }
      if (o.storeId && has(o.storeName) && store.name !== o.storeName) { err('店舗IDと店舗名が一致しません（登録名：' + store.name + '）'); return; }
      if (!has(o.name)) { err('メニューの名前が空欄です'); return; }
      const menu = storeInfo(store).menu;
      if (has(o.id) && !menu.some((m) => m.id === o.id)) { err('メニューID「' + o.id + '」はこの店舗にありません'); return; }
      ops.push({ type: has(o.id) ? 'update' : 'new', storeId: store.id, id: o.id || null, item: { name: o.name, description: o.description || '', price: o.price || '', period: o.period || '' } });
    });
    return { ops, errors };
  }
  function applyMenuImport(state, plan, uid, now) {
    plan.ops.forEach((op) => {
      const s = state.stores.find((x) => x.id === op.storeId);
      s.gpost = storeInfo(s);
      if (op.id) Object.assign(s.gpost.menu.find((m) => m.id === op.id), op.item, { updatedAt: now });
      else s.gpost.menu.push(Object.assign({ id: uid('menu'), createdAt: now }, op.item));
    });
  }

  function planBrandImport(state, rows) {
    const { items, present } = rowsToObjects(rows, BRAND_CSV);
    const errors = [];
    const ops = [];
    if (!present || !present.includes('name')) return { ops, errors: ['「ブランド名」の列がありません。'] };
    const brands = (state.gpost && state.gpost.brands) || [];
    const names = new Set();
    items.forEach((o, i) => {
      const err = (m) => errors.push((i + 2) + '行目：' + m);
      if (!has(o.name)) { err('ブランド名が空欄です'); return; }
      if (names.has(o.name)) { err('同じブランド名が2回以上出てきます'); return; }
      names.add(o.name);
      const b = has(o.id) ? brands.find((x) => x.id === o.id) : null;
      if (has(o.id) && !b) { err('ブランドID「' + o.id + '」が見つかりません'); return; }
      const dup = brands.find((x) => x.name === o.name && (!b || x.id !== b.id));
      if (dup) { err('ブランド名「' + o.name + '」は既に登録されています（ID：' + dup.id + '）'); return; }
      const data = {};
      BRAND_FIELDS.forEach((f) => { if (o[f[0]] !== undefined) data[f[0]] = o[f[0]]; });
      ops.push({ type: b ? 'update' : 'new', id: b ? b.id : null, data });
    });
    return { ops, errors };
  }
  function applyBrandImport(state, plan, uid, now) {
    plan.ops.forEach((op) => {
      if (op.id) Object.assign(state.gpost.brands.find((b) => b.id === op.id), op.data, { updatedAt: now });
      else state.gpost.brands.push(Object.assign(emptyBrand(), op.data, { id: uid('brand'), createdAt: now, updatedAt: now, history: [] }));
    });
  }

  const api = {
    STORE_FIELDS, STORE_META_FIELDS, BRAND_FIELDS, MENU_FIELDS, REQUEST_FIELDS, PER_STORE_FIELDS, STATUS_LABEL, SEASONS, SEASON_WORDS, KIND_LABEL,
    countChars, emptyStoreInfo, emptyBrand, storeInfo, bundleOf, findMenuItem, detectConflicts, unresolvedConflicts, mergeRequest, buildContext, allowedValues,
    checkBatch, preflight, seasonOf, seasonPlan, findSeasonWords, otherStoreMarkers, validateSet,
    SYSTEM_PROMPT, buildSystemPrompt, buildUserPrompt, OUTPUT_SCHEMA, normalizeSets, demoGenerate, fullSetText, copyText, filterPosts, validateSpec,
    ctaToText, parseCtaText, storesCsv, menuCsv, brandsCsv, postsCsv, planStoreImport, applyStoreImport, planMenuImport, applyMenuImport, planBrandImport, applyBrandImport,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.gpost = api; }
})(typeof self !== 'undefined' ? self : this);
