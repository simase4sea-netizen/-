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

  // ───── 全国共通の地域辞書（キャンペーンに関係なく、プロフィール・投稿文からおおまかな活動エリアを判定）─────
  // 都道府県：名字と紛らわしいものは「県」付きのときだけ数える
  const PREFS = ['北海道', '青森県', '岩手県', '宮城県', '秋田県', '山形県', '福島県', '茨城県', '栃木県', '群馬県', '埼玉県', '千葉県', '東京都', '神奈川県', '新潟県', '富山県', '石川県', '福井県', '山梨県', '長野県', '岐阜県', '静岡県', '愛知県', '三重県', '滋賀県', '京都府', '大阪府', '兵庫県', '奈良県', '和歌山県', '鳥取県', '島根県', '岡山県', '広島県', '山口県', '徳島県', '香川県', '愛媛県', '高知県', '福岡県', '佐賀県', '長崎県', '熊本県', '大分県', '宮崎県', '鹿児島県', '沖縄県'];
  const PREF_SHORT_OK = ['北海道', '青森', '宮城', '茨城', '栃木', '群馬', '埼玉', '千葉', '東京', '神奈川', '新潟', '山梨', '岐阜', '静岡', '愛知', '三重', '滋賀', '京都', '大阪', '兵庫', '奈良', '和歌山', '鳥取', '島根', '広島', '徳島', '香川', '愛媛', '高知', '福岡', '佐賀', '長崎', '熊本', '大分', '鹿児島', '沖縄'];
  // 主な市・エリア → 都道府県
  const AREA_PREF = {
    '東京都': ['都内', '23区', '渋谷', '新宿', '恵比寿', '中目黒', '代官山', '銀座', '有楽町', '丸の内', '池袋', '上野', '浅草', '秋葉原', '神田', '日本橋', '六本木', '麻布', '赤坂', '表参道', '原宿', '青山', '吉祥寺', '三軒茶屋', '下北沢', '自由が丘', '二子玉川', '品川', '目黒', '五反田', '新橋', '浜松町', '錦糸町', '北千住', '赤羽', '高円寺', '中野', '立川', '町田', '築地', '豊洲', '月島', '神楽坂', '四ツ谷', '御茶ノ水', '蒲田', '大井町', '人形町', '門前仲町', '清澄白河', '蔵前', '押上', '八王子', '荻窪', '西荻窪', '高田馬場', '大塚', '巣鴨', '虎ノ門', '大手町', '田町', '新大久保', '学芸大学', '祐天寺', '駒沢', '経堂', '国分寺', '武蔵小山', '戸越', '亀戸', '両国', '新小岩', '葛西', '練馬', '成増'],
    '神奈川県': ['横浜', 'みなとみらい', '関内', '中華街', '川崎', '武蔵小杉', '鎌倉', '藤沢', '湘南', '横須賀', '相模原', '小田原', '箱根', '溝の口', 'たまプラーザ', '新百合ヶ丘', '本厚木', '海老名', '大和'],
    '埼玉県': ['大宮', '浦和', '川越', '所沢', '越谷', '川口'],
    '千葉県': ['船橋', '柏', '幕張', '浦安', '松戸', '津田沼', '市川'],
    '大阪府': ['梅田', '難波', 'なんば', '心斎橋', '天王寺', '北新地', '天満', '堺', '本町', '中崎町', '鶴橋', '新世界', '十三', '江坂', '茨木', '豊中', '枚方'],
    '京都府': ['祇園', '河原町', '烏丸', '嵐山'],
    '兵庫県': ['神戸', '三宮', '元町', '姫路', '西宮', '芦屋', '尼崎', '明石'],
    '愛知県': ['名古屋', '名駅', '金山', '大須', '岡崎', '豊橋', '一宮'],
    '福岡県': ['博多', '天神', '中洲', '北九州', '小倉', '久留米'],
    '北海道': ['札幌', 'すすきの', '函館', '旭川', '小樽'],
    '宮城県': ['仙台'], '広島県': ['広島市', '福山'], '沖縄県': ['那覇', '国際通り'],
    '香川県': ['高松', '丸亀', '瓦町', '坂出', '讃岐', 'さぬき'], '岡山県': ['岡山市', '倉敷'], '愛媛県': ['松山'], '徳島県': ['徳島市'], '高知県': ['高知市'],
    '静岡県': ['浜松', '沼津', '熱海'], '石川県': ['金沢'], '新潟県': ['新潟市'], '長野県': ['長野市', '松本', '軽井沢'], '熊本県': ['熊本市'], '鹿児島県': ['鹿児島市'], '奈良県': ['奈良市'], '滋賀県': ['大津'],
  };

  // 文章から地域を数え、多い順に返す（エリア名と都道府県）
  function detectAreas(texts) {
    const hits = {};
    const add = (term, pref, where, text) => {
      const h = hits[term] || (hits[term] = { term, pref, count: 0, evidence: [] });
      h.count++;
      if (h.evidence.length < 2) h.evidence.push(where + '「' + snippet(text, term) + '」');
    };
    texts.forEach(({ text, where }) => {
      const t = String(text || '');
      PREFS.forEach((p) => { if (t.includes(p)) add(p.replace(/[都府県]$/, '') === '北海道' ? '北海道' : p.replace(/[都府県]$/, ''), p, where, t); });
      PREF_SHORT_OK.forEach((s) => { const full = PREFS.find((p) => p.startsWith(s)); if (t.includes(s) && !t.includes(full)) add(s, full, where, t); });
      Object.keys(AREA_PREF).forEach((pref) => AREA_PREF[pref].forEach((a) => { if (t.includes(a)) add(a.replace(/市$/, ''), pref, where, t); }));
    });
    const list = Object.values(hits).sort((a, b) => b.count - a.count);
    // 都道府県ごとの合計で主な地域を決める
    const prefCount = {};
    list.forEach((h) => { prefCount[h.pref] = (prefCount[h.pref] || 0) + h.count; });
    const prefs = Object.keys(prefCount).sort((a, b) => prefCount[b] - prefCount[a]);
    return { list, prefs, prefCount };
  }

  function detectGenres(texts) {
    const count = {};
    const ev = {};
    texts.forEach(({ text, where }) => {
      const t = norm(text);
      Object.keys(GENRE_SYNONYMS).forEach((g) => {
        const w = GENRE_SYNONYMS[g].find((s) => t.includes(norm(s)));
        if (w) { count[g] = (count[g] || 0) + 1; (ev[g] = ev[g] || []).length < 1 && ev[g].push(where + '「' + snippet(text, w) + '」'); }
      });
    });
    return Object.keys(count).sort((a, b) => count[b] - count[a]).map((g) => ({ genre: g, count: count[g], evidence: ev[g] }));
  }

  // キャンペーンの条件で見つけた地域・ジャンルと、全国共通の判定を合わせる
  function mergeDetected(a, texts) {
    const ga = detectAreas(texts);
    const gg = detectGenres(texts);
    const areas = a.regions.map((r) => r.term);
    ga.list.slice(0, 4).forEach((h) => { if (!areas.some((x) => x.includes(h.term) || h.term.includes(x))) areas.push(h.term); });
    ga.prefs.slice(0, 2).forEach((p) => { const s = p === '北海道' ? p : p.replace(/[都府県]$/, ''); if (!areas.some((x) => x === s)) areas.push(s); });
    const genres = a.genres.map((g) => g.genre);
    gg.slice(0, 4).forEach((g) => { if (!genres.includes(g.genre)) genres.push(g.genre); });
    const uniq = (arr) => Array.from(new Set(arr));
    const regionEvidence = uniq(a.regions.flatMap((r) => r.evidence).concat(ga.list.slice(0, 3).flatMap((h) => h.evidence))).slice(0, 4);
    const genreEvidence = uniq(a.genres.flatMap((g) => g.evidence).concat(gg.slice(0, 3).flatMap((g) => g.evidence))).slice(0, 4);
    const mainArea = ga.prefs.length ? ga.prefs[0] + (ga.list.filter((h) => h.pref === ga.prefs[0] && h.term !== ga.prefs[0].replace(/[都府県]$/, '')).slice(0, 3).map((h) => h.term).join('・') ? '（' + ga.list.filter((h) => h.pref === ga.prefs[0] && h.term !== ga.prefs[0].replace(/[都府県]$/, '')).slice(0, 3).map((h) => h.term).join('・') + '）' : '') : '';
    return { areas, genres, regionEvidence, genreEvidence, mainArea };
  }

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
      areas: mergeDetected(a, texts).areas, genres: mergeDetected(a, texts).genres, hashtags: hashtagsOf(texts), formats: videos.length ? ['YouTube動画'] : [],
      followers: subs === null ? I.fact(null, 'unknown') : I.fact(subs, 'confirmed', src + '（登録者数は1,000人超で上3桁に丸めた値）', today, '自動取得'),
      recentViews: views.length ? I.fact(views, 'confirmed', src + '（直近' + views.length + '本の再生数）', today, '自動取得') : I.fact(null, 'unknown'),
      recentReactions: reacts.length ? I.fact(reacts, 'confirmed', src + '（直近の高評価＋コメント数）', today, '自動取得') : I.fact(null, 'unknown'),
      postFrequency: videos.length >= 2 ? I.fact(frequency(videos.map((v) => v.snippet.publishedAt)), 'confirmed', src + '（直近動画の投稿日から計算）', today, '自動取得') : I.fact(null, 'unknown'),
      auto: Object.assign({ platformSource: src, analyzedAt: today, foodRatio: Math.round(a.foodRatio * 100), country: sn.country || '', linked: linkedAccounts(sn.description) }, pickAuto(mergeDetected(a, texts))),
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
      areas: mergeDetected(a, texts).areas, genres: mergeDetected(a, texts).genres, hashtags: hashtagsOf(texts), formats,
      followers: bd.followers_count === undefined ? I.fact(null, 'unknown') : I.fact(Number(bd.followers_count), 'confirmed', src, today, '自動取得'),
      recentReactions: reacts.length ? I.fact(reacts, 'confirmed', src + '（直近' + reacts.length + '投稿のいいね＋コメント）', today, '自動取得') : I.fact(null, 'unknown'),
      postFrequency: media.length >= 2 ? I.fact(frequency(media.map((m) => m.timestamp)), 'confirmed', src + '（直近投稿の日付から計算）', today, '自動取得') : I.fact(null, 'unknown'),
      auto: Object.assign({ platformSource: src, analyzedAt: today, foodRatio: Math.round(a.foodRatio * 100), linked: linkedAccounts(bd.biography) }, pickAuto(mergeDetected(a, texts))),
    };
  }

  function pickAuto(m) { return { regionEvidence: m.regionEvidence, genreEvidence: m.genreEvidence, mainArea: m.mainArea }; }

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

  const api = { detectAreas, detectGenres, mergeDetected, GENRE_SYNONYMS, regionTerms, genreTerms, buildQueries, analyzeTexts, hashtagsOf, linkedAccounts, fromYouTube, fromInstagram, frequency, followerOk, judge, autoSelect };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.infauto = api; }
})(typeof self !== 'undefined' ? self : this);
