/* インフルエンサー自動選定：公式APIの結果から 地域・フォロワー数・ジャンル を判定し、候補を自動で選ぶ（ブラウザ／Node 共用）
 * 取得は公式API（YouTube Data API v3・Instagram Graph API Business Discovery）のみ。スクレイピングはしない。
 * 地域・ジャンルは公開テキスト（チャンネル説明・動画タイトル等）からの判定のため「自動判定」として根拠を残す。 */
(function (root) {
  'use strict';
  const I = typeof module !== 'undefined' && module.exports ? require('./influencer.js') : root.FS.inf;

  // ジャンルの言い換え（店舗ジャンルに含まれる語 → 投稿で使われやすい語）
  const GENRE_SYNONYMS = {
    'ラーメン': ['ラーメン', 'らーめん', '拉麺', 'つけ麺', '中華そば', 'ramen'],
    'うどん': ['うどん', '饂飩', 'udon', '讃岐'],
    'そば': ['そば', '蕎麦', 'soba'],
    '寿司': ['寿司', '鮨', 'すし', 'sushi'],
    '焼肉': ['焼肉', '焼き肉', 'ホルモン', 'yakiniku'],
    'カフェ': ['カフェ', 'cafe', '喫茶', 'コーヒー', '珈琲'],
    'スイーツ': ['スイーツ', 'ケーキ', 'パフェ', 'デザート', '和菓子', '洋菓子', 'sweets', 'タルト', 'プリン'],
    'パン': ['パン', 'ベーカリー', 'bakery', 'サンド'],
    '居酒屋': ['居酒屋', '酒場', '飲み屋', 'せんべろ', 'はしご酒'],
    'イタリアン': ['イタリアン', 'パスタ', 'ピザ', 'ピッツァ'],
    'フレンチ': ['フレンチ', 'ビストロ'],
    '中華': ['中華', '餃子', '麻婆', '小籠包'],
    '和食': ['和食', '割烹', '懐石', '定食'],
    '海鮮': ['海鮮', '刺身', '海鮮丼', '魚'],
    '焼き鳥': ['焼き鳥', '焼鳥', 'やきとり'],
    'カレー': ['カレー', 'curry'],
    'ハンバーガー': ['ハンバーガー', 'バーガー', 'burger'],
    '食べ歩き': ['食べ歩き', 'グルメ', '飯テロ', 'ランチ', 'ディナー', '外食', 'グルメ旅'],
    'りんご': ['りんご', '林檎', 'アップル'],
  };
  const FOOD_WORDS = ['グルメ', '食べ歩き', '飯', 'ランチ', 'ディナー', 'カフェ', 'スイーツ', 'ラーメン', 'うどん', '居酒屋', '寿司', '焼肉', 'パン', 'food', 'gourmet', '食レポ', '大食い', 'モッパン'];

  function norm(s) { return String(s || '').toLowerCase(); }

  // キャンペーンの地域語：来店可能エリア・所在地の市区町村/都道府県（「市」「県」を除いた形も）
  function regionTerms(camp) {
    const terms = [];
    I.toList(camp.areas).forEach((a) => terms.push({ term: a, level: 'area' }));
    const ad = I.splitAddress(camp.address);
    if (ad.city) terms.push({ term: ad.city, level: 'city' });
    if (ad.pref) terms.push({ term: ad.pref, level: 'pref' });
    const out = [];
    terms.forEach((t) => {
      [t.term, t.term.replace(/(都|府|県|市|区|町|村|駅)$/, '')].forEach((v) => {
        if (v && v.length >= 2 && !out.some((o) => o.term === v)) out.push({ term: v, level: t.level });
      });
    });
    return out;
  }

  // キャンペーンのジャンル語（店舗ジャンル・料理・商品＋言い換え）
  function genreTerms(camp) {
    const base = I.toList(camp.genres).concat(I.toList(camp.dishes), I.toList(camp.products));
    const out = [];
    base.forEach((g) => {
      out.push({ term: g, genre: g });
      Object.keys(GENRE_SYNONYMS).forEach((k) => {
        if (g.includes(k) || k.includes(g) || GENRE_SYNONYMS[k].some((s) => g.includes(s))) GENRE_SYNONYMS[k].forEach((s) => out.push({ term: s, genre: k }));
      });
    });
    const seen = new Set();
    return out.filter((t) => t.term && t.term.length >= 2 && !seen.has(norm(t.term)) && seen.add(norm(t.term)));
  }

  // 検索語：地域 × ジャンル（API利用量を抑えるため上限あり）
  function buildQueries(camp, max) {
    const regions = I.toList(camp.areas).concat([I.splitAddress(camp.address).city].filter(Boolean));
    const genres = I.toList(camp.genres).concat(I.toList(camp.dishes));
    const qs = [];
    const extra = I.toList(camp.searchKeywords);
    extra.forEach((k) => qs.push(k));
    (regions.length ? regions : ['']).forEach((r) => (genres.length ? genres : ['グルメ']).forEach((g) => { const q = (r + ' ' + g).trim(); if (q && !qs.includes(q)) qs.push(q); }));
    regions.forEach((r) => { const q = r + ' グルメ'; if (!qs.includes(q)) qs.push(q); });
    return qs.slice(0, max || 4);
  }

  // テキスト群から地域・ジャンルを判定（根拠の文を残す）
  function analyzeTexts(texts, camp) {
    const rts = regionTerms(camp);
    const gts = genreTerms(camp);
    const regionHits = {};
    const genreHits = {};
    let food = 0;
    texts.forEach(({ text, where }) => {
      const t = norm(text);
      rts.forEach((r) => { if (t.includes(norm(r.term))) { const h = regionHits[r.term] || (regionHits[r.term] = { term: r.term, level: r.level, count: 0, evidence: [] }); h.count++; if (h.evidence.length < 2) h.evidence.push(where + '「' + snippet(text, r.term) + '」'); } });
      gts.forEach((g) => { if (t.includes(norm(g.term))) { const h = genreHits[g.genre] || (genreHits[g.genre] = { genre: g.genre, count: 0, evidence: [] }); h.count++; if (h.evidence.length < 2) h.evidence.push(where + '「' + snippet(text, g.term) + '」'); } });
      if (FOOD_WORDS.some((w) => t.includes(norm(w)))) food++;
    });
    return {
      regions: Object.values(regionHits).sort((a, b) => b.count - a.count),
      genres: Object.values(genreHits).sort((a, b) => b.count - a.count),
      foodRatio: texts.length ? food / texts.length : 0,
    };
  }

  function snippet(text, term) {
    const s = String(text || '').replace(/\s+/g, ' ');
    const i = norm(s).indexOf(norm(term));
    if (i < 0) return s.slice(0, 40);
    return (i > 15 ? '…' : '') + s.slice(Math.max(0, i - 15), i + term.length + 20) + (i + term.length + 20 < s.length ? '…' : '');
  }

  function hashtagsOf(texts) {
    const tags = {};
    texts.forEach(({ text }) => (String(text || '').match(/#[^\s#、。,]+/g) || []).forEach((h) => { const k = h.slice(1); tags[k] = (tags[k] || 0) + 1; }));
    return Object.keys(tags).sort((a, b) => tags[b] - tags[a]).slice(0, 10);
  }

  // 説明文に書かれた他SNSのアカウント（同一人物の別アカウントとして登録する）
  function linkedAccounts(text) {
    const out = [];
    const s = String(text || '');
    const add = (platform, handle) => { handle = handle.replace(/[).,、。]+$/, ''); if (handle && !out.some((o) => o.platform === platform && o.handle.toLowerCase() === handle.toLowerCase())) out.push({ platform, handle, url: platform === 'instagram' ? 'https://www.instagram.com/' + handle + '/' : platform === 'tiktok' ? 'https://www.tiktok.com/@' + handle : '' }); };
    (s.match(/instagram\.com\/([A-Za-z0-9_.]{2,30})/g) || []).forEach((m) => { const h = m.split('/')[1]; if (!['p', 'reel', 'explore', 'stories'].includes(h)) add('instagram', h); });
    (s.match(/tiktok\.com\/@([A-Za-z0-9_.]{2,30})/g) || []).forEach((m) => add('tiktok', m.split('@')[1]));
    (s.match(/(?:Instagram|インスタ(?:グラム)?|IG)\s*[:：]?\s*@([A-Za-z0-9_.]{2,30})/gi) || []).forEach((m) => add('instagram', m.split('@')[1]));
    (s.match(/(?:TikTok|ティックトック)\s*[:：]?\s*@([A-Za-z0-9_.]{2,30})/gi) || []).forEach((m) => add('tiktok', m.split('@')[1]));
    return out;
  }

  // ───── YouTube Data API の結果 → 候補者データ ─────
  // channel: channels.list の item（snippet・statistics）、videos: videos.list の items（snippet・statistics）
  function fromYouTube(channel, videos, camp, ctx) {
    const sn = channel.snippet || {};
    const stats = channel.statistics || {};
    const today = ctx.today;
    const texts = [{ text: (sn.title || '') + ' ' + (sn.description || ''), where: 'チャンネル説明' }]
      .concat(videos.map((v) => ({ text: (v.snippet.title || '') + ' ' + (v.snippet.description || '').slice(0, 300), where: '動画「' + String(v.snippet.title || '').slice(0, 20) + '」' })));
    const a = analyzeTexts(texts, camp);
    const handle = (sn.customUrl || '').replace(/^@/, '') || channel.id;
    const url = sn.customUrl ? 'https://www.youtube.com/' + (sn.customUrl.startsWith('@') ? sn.customUrl : '@' + sn.customUrl) : 'https://www.youtube.com/channel/' + channel.id;
    const src = 'YouTube Data API';
    const subs = stats.hiddenSubscriberCount || stats.subscriberCount === undefined ? null : Number(stats.subscriberCount);
    const views = videos.map((v) => Number((v.statistics || {}).viewCount)).filter((n) => isFinite(n));
    const reacts = videos.map((v) => { const s = v.statistics || {}; if (s.likeCount === undefined) return null; return Number(s.likeCount) + Number(s.commentCount || 0); }).filter((n) => n !== null && isFinite(n));
    const cand = {
      displayName: sn.title || handle, handle, platform: 'youtube', profileUrl: url, youtubeChannelId: channel.id,
      areas: a.regions.map((r) => r.term), genres: a.genres.map((g) => g.genre), hashtags: hashtagsOf(texts), formats: videos.length ? ['YouTube動画'] : [],
      followers: subs === null ? I.fact(null, 'unknown') : I.fact(subs, 'confirmed', src + '（登録者数は1,000人超で上3桁に丸めた値）', today, '自動取得'),
      recentViews: views.length ? I.fact(views, 'confirmed', src + '（直近' + views.length + '本の再生数）', today, '自動取得') : I.fact(null, 'unknown'),
      recentReactions: reacts.length ? I.fact(reacts, 'confirmed', src + '（直近の高評価＋コメント数）', today, '自動取得') : I.fact(null, 'unknown'),
      postFrequency: videos.length >= 2 ? I.fact(frequency(videos.map((v) => v.snippet.publishedAt)), 'confirmed', src + '（直近動画の投稿日から計算）', today, '自動取得') : I.fact(null, 'unknown'),
      auto: { platformSource: src, analyzedAt: today, regionEvidence: a.regions.flatMap((r) => r.evidence), genreEvidence: a.genres.flatMap((g) => g.evidence), foodRatio: Math.round(a.foodRatio * 100), country: sn.country || '', linked: linkedAccounts(sn.description) },
    };
    return cand;
  }

  // ───── Instagram Business Discovery の結果 → 候補者データ ─────
  function fromInstagram(bd, camp, ctx) {
    const today = ctx.today;
    const media = ((bd.media && bd.media.data) || []);
    const texts = [{ text: (bd.name || '') + ' ' + (bd.biography || ''), where: 'プロフィール' }].concat(media.map((m) => ({ text: m.caption || '', where: '投稿（' + String(m.timestamp || '').slice(0, 10) + '）' })));
    const a = analyzeTexts(texts, camp);
    const src = 'Instagram Graph API（Business Discovery）';
    const reacts = media.map((m) => (m.like_count === undefined ? null : Number(m.like_count) + Number(m.comments_count || 0))).filter((n) => n !== null && isFinite(n));
    const types = new Set(media.map((m) => m.media_type));
    const formats = [];
    if (types.has('VIDEO') || media.some((m) => m.media_product_type === 'REELS')) formats.push('リール');
    if (types.has('IMAGE') || types.has('CAROUSEL_ALBUM')) formats.push('フィード');
    return {
      displayName: bd.name || bd.username, handle: bd.username, platform: 'instagram', profileUrl: 'https://www.instagram.com/' + bd.username + '/',
      areas: a.regions.map((r) => r.term), genres: a.genres.map((g) => g.genre), hashtags: hashtagsOf(texts), formats,
      followers: bd.followers_count === undefined ? I.fact(null, 'unknown') : I.fact(Number(bd.followers_count), 'confirmed', src, today, '自動取得'),
      recentReactions: reacts.length ? I.fact(reacts, 'confirmed', src + '（直近' + reacts.length + '投稿のいいね＋コメント）', today, '自動取得') : I.fact(null, 'unknown'),
      postFrequency: media.length >= 2 ? I.fact(frequency(media.map((m) => m.timestamp)), 'confirmed', src + '（直近投稿の日付から計算）', today, '自動取得') : I.fact(null, 'unknown'),
      auto: { platformSource: src, analyzedAt: today, regionEvidence: a.regions.flatMap((r) => r.evidence), genreEvidence: a.genres.flatMap((g) => g.evidence), foodRatio: Math.round(a.foodRatio * 100), linked: linkedAccounts(bd.biography) },
    };
  }

  function frequency(dates) {
    const ts = dates.map((d) => new Date(d).getTime()).filter((n) => isFinite(n)).sort((a, b) => b - a);
    if (ts.length < 2) return null;
    const days = (ts[0] - ts[ts.length - 1]) / 86400000;
    if (days <= 0) return '直近' + ts.length + '件が同日';
    const perWeek = ((ts.length - 1) / days) * 7;
    return perWeek >= 1 ? '週' + perWeek.toFixed(1) + '回程度' : '月' + (perWeek * 30 / 7).toFixed(1) + '回程度';
  }

  // ───── 3条件（地域・フォロワー数・ジャンル）での自動判定 ─────
  function followerOk(camp, cand) {
    const min = camp.followerMin === '' || camp.followerMin === null || camp.followerMin === undefined ? null : Number(camp.followerMin);
    const max = camp.followerMax === '' || camp.followerMax === null || camp.followerMax === undefined ? null : Number(camp.followerMax);
    if (min === null && max === null) return { ok: true, reason: 'フォロワー数の条件なし' };
    if (!I.isKnown(cand.followers)) return { ok: false, unknown: true, reason: 'フォロワー数が未確認' };
    const n = Number(cand.followers.value);
    if (min !== null && n < min) return { ok: false, reason: 'フォロワー数 ' + n.toLocaleString('ja-JP') + ' が下限 ' + min.toLocaleString('ja-JP') + ' 未満' };
    if (max !== null && n > max) return { ok: false, reason: 'フォロワー数 ' + n.toLocaleString('ja-JP') + ' が上限 ' + max.toLocaleString('ja-JP') + ' 超' };
    return { ok: true, reason: 'フォロワー数 ' + n.toLocaleString('ja-JP') + ' が条件内' };
  }

  function judge(camp, cand, ev, settings) {
    const th = settings.fitThreshold || 60;
    const by = Object.fromEntries(ev.items.map((i) => [i.key, i]));
    const region = by.region.score !== null && by.region.score >= th;
    const genre = by.genre.score !== null && by.genre.score >= th;
    const fol = followerOk(camp, cand);
    const reasons = [];
    reasons.push((region ? '○' : '×') + ' 地域：' + (by.region.score === null ? '判定材料なし' : by.region.reasons.concat(by.region.concerns).join('／')));
    reasons.push((fol.ok ? '○' : '×') + ' フォロワー数：' + fol.reason);
    reasons.push((genre ? '○' : '×') + ' ジャンル：' + (by.genre.score === null ? '判定材料なし' : by.genre.reasons.concat(by.genre.concerns).join('／')));
    return { pass: region && genre && fol.ok && !ev.insufficient, region, genre, follower: fol.ok, reasons };
  }

  // 自動選定：条件を満たす候補を点数順に並べ、上位を「優先候補」、残りを「候補」にする。
  // 担当者が手動で状況を変えた候補（autoManaged=false）は変更しない。
  function autoSelect(rows, camp, settings, opts) {
    const top = (opts && opts.priorityCount) || 3;
    const passed = rows.filter((r) => r.j.pass).sort((a, b) => (b.ev.score || 0) - (a.ev.score || 0));
    const plan = [];
    passed.forEach((r, i) => plan.push({ row: r, to: i < top ? '優先候補' : '候補' }));
    rows.filter((r) => !r.j.pass).forEach((r) => plan.push({ row: r, to: '未確認' }));
    return plan;
  }

  const api = { GENRE_SYNONYMS, regionTerms, genreTerms, buildQueries, analyzeTexts, hashtagsOf, linkedAccounts, fromYouTube, fromInstagram, frequency, followerOk, judge, autoSelect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.infauto = api; }
})(typeof self !== 'undefined' ? self : this);
