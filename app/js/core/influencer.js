/* グルメインフルエンサー候補選定：データ定義・URL正規化・重複検出・評価・絞り込み・CSV（ブラウザ／Node 共用）
 * 方針：確認できない値は推測せず「未確認」。未確認の評価項目は0点にせず、総合点の計算から外して情報不足として表示する。 */
(function (root) {
  'use strict';

  const PLATFORMS = { instagram: 'Instagram', tiktok: 'TikTok', youtube: 'YouTube', x: 'X', other: 'その他' };
  const FORMATS = ['リール', 'フィード', 'ストーリーズ', 'TikTok動画', 'YouTube動画', 'YouTubeショート', 'ライブ配信'];
  const VIDEO_FORMATS = ['リール', 'TikTok動画', 'YouTube動画', 'YouTubeショート', 'ライブ配信'];
  const PURPOSES = ['認知拡大', '来店促進', '新商品告知', 'リール等の動画素材獲得', 'フォロワー増加'];
  const STATUSES = ['未確認', '候補', '優先候補', '条件確認中', '連絡文作成', '連絡済み', '返信あり', '起用決定', '来店済み', '投稿確認済み', '見送り'];
  const FACT_STATUS = { confirmed: '確認済み', estimated: '推定', unknown: '未確認' };
  const COMPENSATION = { free: '無料招待', paid: '有償依頼', undecided: '未定' };

  const CRITERIA = [
    { key: 'region', label: '地域との適合性' },
    { key: 'genre', label: '店舗・料理ジャンルとの適合性' },
    { key: 'engagement', label: '投稿の反応' },
    { key: 'quality', label: 'コンテンツ品質' },
    { key: 'campaign', label: 'キャンペーンとの適合性' },
    { key: 'cost', label: '起用条件・費用' },
  ];

  // 初期設定。設定画面で変更できる（固定しない）。反応率の目安は仮の初期値で、実績に合わせて調整する前提。
  function defaultSettings() {
    return {
      weights: { region: 25, genre: 20, engagement: 15, quality: 15, campaign: 15, cost: 10 },
      engagementBands: [{ min: 3, score: 100 }, { min: 1.5, score: 75 }, { min: 0.5, score: 45 }, { min: 0, score: 20 }],
      viewBands: [{ min: 30, score: 100 }, { min: 10, score: 75 }, { min: 3, score: 45 }, { min: 0, score: 20 }],
      minPostsForEngagement: 3,
      minCoverage: 60,
      minKnownCriteria: 4,
      fitThreshold: 60,
    };
  }

  // ───── 事実の記録（値・状態・取得元・確認日・確認者）─────
  function fact(value, status, source, checkedAt, checkedBy) {
    return { value: value === undefined ? null : value, status: status || 'unknown', source: source || '', checkedAt: checkedAt || '', checkedBy: checkedBy || '' };
  }
  function isKnown(f) {
    if (!f || f.status === 'unknown') return false;
    const v = f.value;
    if (v === null || v === undefined || v === '') return false;
    if (Array.isArray(v) && !v.length) return false;
    return true;
  }
  function factLabel(f, fmt) {
    if (!isKnown(f)) return '未確認';
    const v = fmt ? fmt(f.value) : String(f.value);
    return v + (f.status === 'estimated' ? '（推定）' : '');
  }

  function toList(v) {
    if (Array.isArray(v)) return v.map((x) => String(x).trim()).filter(Boolean);
    return String(v || '').split(/[,、，\/／\s]+/).map((x) => x.trim().replace(/^#/, '')).filter(Boolean);
  }
  function toNumList(v) {
    if (Array.isArray(v)) return v.filter((n) => typeof n === 'number' && isFinite(n));
    return String(v || '').split(/[,、，\s\/]+/).map((x) => Number(x.replace(/[,，]/g, ''))).filter((n) => isFinite(n) && String(n) !== '');
  }
  function parseNum(v) {
    if (v === null || v === undefined) return null;
    if (typeof v === 'number') return isFinite(v) ? v : null;
    let s = String(v).trim().replace(/[０-９．]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，円¥￥\s人]/g, '');
    let mult = 1;
    if (/万$/.test(s)) { mult = 10000; s = s.slice(0, -1); }
    else if (/[kK]$/.test(s)) { mult = 1000; s = s.slice(0, -1); }
    if (!/^\d+(\.\d+)?$/.test(s)) return null;
    return Math.round(Number(s) * mult);
  }

  // ───── プロフィールURLの正規化（重複検出用）─────
  function parseProfileUrl(url) {
    const raw = String(url || '').trim();
    if (!raw) return { key: '', platform: null, handle: '' };
    let s = raw.replace(/^https?:\/\//i, '').replace(/[?#].*$/, '').replace(/\/+$/, '');
    s = s.replace(/^(www\.|m\.|mobile\.|vm\.)/i, '');
    const parts = s.split('/');
    const host = parts[0].toLowerCase();
    const path = parts.slice(1);
    let platform = 'other';
    let handle = '';
    if (/(^|\.)instagram\.com$/.test(host)) { platform = 'instagram'; handle = (path[0] || '').replace(/^@/, ''); }
    else if (/(^|\.)tiktok\.com$/.test(host)) { platform = 'tiktok'; handle = (path[0] || '').replace(/^@/, ''); }
    else if (/(^|\.)youtube\.com$/.test(host) || host === 'youtu.be') {
      platform = 'youtube';
      if (/^@/.test(path[0] || '')) handle = path[0].slice(1);
      else if (['channel', 'c', 'user'].includes(path[0])) handle = (path[0] === 'channel' ? 'channel:' : '') + (path[1] || '');
    } else if (host === 'x.com' || host === 'twitter.com') { platform = 'x'; handle = path[0] || ''; }
    const h = handle.toLowerCase();
    const key = platform !== 'other' && h ? platform + ':' + h : host + '/' + path.join('/').toLowerCase();
    return { key, platform, handle };
  }

  function normName(s) {
    return String(s || '').replace(/[\s　・._\-@]/g, '').toLowerCase();
  }

  // 重複検出：同じプロフィールURL（同一アカウント）と、同一人物の別アカウントの可能性
  function findDuplicates(cand, all) {
    const me = parseProfileUrl(cand.profileUrl);
    const same = [];
    const related = [];
    all.forEach((o) => {
      if (o.id === cand.id) return;
      const other = parseProfileUrl(o.profileUrl);
      const sameAccount = (me.key && me.key === other.key) || (cand.platform && cand.platform === o.platform && cand.handle && normName(cand.handle) === normName(o.handle));
      if (sameAccount) { same.push(o); return; }
      if (cand.personId && cand.personId === o.personId) return;
      const nameMatch = cand.displayName && normName(cand.displayName) === normName(o.displayName);
      const handleMatch = cand.handle && normName(cand.handle) === normName(o.handle);
      if ((nameMatch || handleMatch) && cand.platform !== o.platform) related.push(o);
    });
    return { same, related };
  }

  // ───── 評価 ─────
  function splitAddress(addr) {
    const s = String(addr || '');
    const m = /^(.*?[都道府県])?(.*?[市区町村郡])?/.exec(s.replace(/^〒?\d{3}-?\d{4}\s*/, ''));
    return { pref: m && m[1] ? m[1].trim() : '', city: m && m[2] ? m[2].trim() : '' };
  }

  function overlap(a, b) {
    const hits = [];
    a.forEach((x) => b.forEach((y) => {
      if (!x || !y) return;
      if ((x.includes(y) || y.includes(x)) && !hits.some((h) => h[0] === x && h[1] === y)) hits.push([x, y]);
    }));
    return hits;
  }

  function band(value, bands) {
    const sorted = bands.slice().sort((a, b) => b.min - a.min);
    const b = sorted.find((x) => value >= x.min);
    return b ? b.score : 0;
  }

  function result(key, extra) {
    const c = CRITERIA.find((x) => x.key === key);
    return Object.assign({ key, label: c.label, score: null, reasons: [], concerns: [], checks: [], usesEstimated: false, manual: false }, extra || {});
  }

  function manualOverride(key, link) {
    const m = link && link.manual && link.manual[key];
    if (!m || m.score === null || m.score === undefined || m.score === '') return null;
    return result(key, { score: Number(m.score), manual: true, reasons: ['担当者評価：' + (m.reason || '理由未記入') + (m.by ? '（' + m.by + (m.at ? '・' + m.at : '') + '）' : '')] });
  }

  function evalRegion(camp, cand) {
    const r = result('region');
    const areas = toList(cand.areas);
    const campAreas = toList(camp.areas);
    const ad = splitAddress(camp.address);
    if (!areas.length) {
      r.checks.push('活動地域が未確認です（プロフィール・投稿の位置情報から確認）。');
      return r;
    }
    if (!campAreas.length && !ad.city && !ad.pref) {
      r.checks.push('キャンペーンの所在地・来店可能エリアが未入力のため判定できません。');
      return r;
    }
    const hit = overlap(areas, campAreas);
    if (hit.length) { r.score = 100; r.reasons.push('活動地域「' + hit[0][0] + '」が来店可能エリア「' + hit[0][1] + '」と一致'); }
    else if (ad.city && overlap(areas, [ad.city]).length) { r.score = 80; r.reasons.push('活動地域が店舗と同じ市区町村（' + ad.city + '）'); }
    else if (ad.pref && overlap(areas, [ad.pref, ad.pref.replace(/[都府県]$/, '')]).length) { r.score = 50; r.reasons.push('活動地域が店舗と同じ都道府県（' + ad.pref + '）'); r.concerns.push('来店可能エリアとの一致は確認できていません。'); }
    else { r.score = 15; r.concerns.push('活動地域（' + areas.join('、') + '）が来店可能エリア外です。'); }
    r.checks.push('フォロワーの地域分布は本人のインサイト（提供時のみ）でしか確認できません。');
    return r;
  }

  const GENERAL_FOOD = ['グルメ', '食べ歩き', '飲食', 'ランチ', 'ディナー', '外食', 'ごはん', 'ご飯', 'カフェ', 'スイーツ', 'foodie', 'gourmet'];

  function evalGenre(camp, cand) {
    const r = result('genre');
    const candWords = toList(cand.genres).concat(toList(cand.hashtags));
    const campWords = toList(camp.genres).concat(toList(camp.dishes), toList(camp.products));
    if (!candWords.length) { r.checks.push('発信ジャンル・よく使うハッシュタグが未確認です。'); return r; }
    if (!campWords.length) { r.checks.push('キャンペーンの店舗ジャンル・料理・商品が未入力のため判定できません。'); return r; }
    // 店舗側の語ごとに一致を数える（同じ語の重複は数えない）
    const hit = Array.from(new Set(overlap(candWords, campWords).map((h) => h[1])));
    if (hit.length >= 2) { r.score = 100; r.reasons.push('発信内容が「' + hit.slice(0, 3).join('」「') + '」と一致'); }
    else if (hit.length === 1) { r.score = 70; r.reasons.push('発信内容が「' + hit[0] + '」と一致'); }
    else if (overlap(candWords, GENERAL_FOOD).length) { r.score = 40; r.reasons.push('一般的なグルメ発信（店舗のジャンルとの直接の一致はなし）'); r.concerns.push('店舗の料理ジャンルの紹介実績は確認できていません。'); }
    else { r.score = 15; r.concerns.push('発信ジャンル（' + candWords.slice(0, 4).join('、') + '）が店舗と合っていない可能性があります。'); }
    if (camp.pricePerPerson || camp.target) r.checks.push('価格帯・雰囲気・ターゲット層との相性は、実際の投稿を見て担当者が確認してください。');
    return r;
  }

  function evalEngagement(cand, settings) {
    const r = result('engagement');
    const f = cand.followers;
    const reactions = cand.recentReactions && isKnown(cand.recentReactions) ? toNumList(cand.recentReactions.value) : [];
    const views = cand.recentViews && isKnown(cand.recentViews) ? toNumList(cand.recentViews.value) : [];
    const minN = settings.minPostsForEngagement || 3;
    if (!isKnown(f)) { r.checks.push('フォロワー数が未確認のため、反応率を計算できません。'); return r; }
    if (reactions.length < minN && views.length < minN) {
      r.checks.push('直近投稿の反応数・再生数が' + minN + '件以上そろっていません（現在：反応' + reactions.length + '件／再生' + views.length + '件）。');
      r.reasons.push('フォロワー数だけでは評価していません。');
      return r;
    }
    const parts = [];
    const followers = Number(f.value);
    if (f.status === 'estimated' || (cand.recentReactions && cand.recentReactions.status === 'estimated') || (cand.recentViews && cand.recentViews.status === 'estimated')) r.usesEstimated = true;
    const stat = (list) => {
      const avg = list.reduce((a, b) => a + b, 0) / list.length;
      const sd = Math.sqrt(list.reduce((a, b) => a + (b - avg) * (b - avg), 0) / list.length);
      return { avg, cv: avg ? sd / avg : 0 };
    };
    if (reactions.length >= minN && followers > 0) {
      const s = stat(reactions);
      const er = (s.avg / followers) * 100;
      parts.push(band(er, settings.engagementBands));
      r.reasons.push('直近' + reactions.length + '投稿の平均反応数 ' + Math.round(s.avg).toLocaleString('ja-JP') + ' ÷ フォロワー数 ' + followers.toLocaleString('ja-JP') + ' = 反応率 ' + er.toFixed(2) + '%');
      if (s.cv > 1) r.concerns.push('投稿ごとの反応数のばらつきが大きく、安定していません。');
    }
    if (views.length >= minN && followers > 0) {
      const s = stat(views);
      const vr = (s.avg / followers) * 100;
      parts.push(band(vr, settings.viewBands));
      r.reasons.push('直近' + views.length + '投稿の平均再生数 ' + Math.round(s.avg).toLocaleString('ja-JP') + ' ÷ フォロワー数 = ' + vr.toFixed(1) + '%');
      if (s.cv > 1) r.concerns.push('投稿ごとの再生数のばらつきが大きく、安定していません。');
    }
    if (!parts.length) { r.checks.push('フォロワー数が0のため反応率を計算できません。'); return r; }
    r.score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    if (r.concerns.length) r.score = Math.max(0, r.score - 10);
    if (r.usesEstimated) r.concerns.push('推定値を含む数値で計算しています。');
    return r;
  }

  function evalQuality(cand) {
    const r = result('quality');
    const q = cand.quality || {};
    if (!q.rating) { r.checks.push('写真・動画の品質、構成、説明の分かりやすさを担当者が確認・評価してください。'); return r; }
    r.score = Math.round(Number(q.rating) * 20);
    r.reasons.push('担当者評価 ' + q.rating + '/5' + (q.mood ? '（雰囲気：' + q.mood + '）' : '') + (q.note ? '：' + q.note : '') + (q.checkedBy ? '［' + q.checkedBy + (q.checkedAt ? '・' + q.checkedAt : '') + '］' : ''));
    if (Number(q.rating) <= 2) r.concerns.push('コンテンツ品質の評価が低めです。');
    return r;
  }

  function evalCampaign(camp, cand, regionRes) {
    const r = result('campaign');
    const parts = [];
    const platforms = toList(camp.platforms);
    const wantFormats = toList(camp.formats);
    const candFormats = toList(cand.formats);
    if (platforms.length) {
      const ok = platforms.includes(cand.platform);
      parts.push(ok ? 100 : 20);
      if (ok) r.reasons.push('希望SNS（' + PLATFORMS[cand.platform] + '）で発信');
      else r.concerns.push('希望SNS（' + platforms.map((p) => PLATFORMS[p] || p).join('・') + '）以外のアカウントです。');
    }
    if (wantFormats.length) {
      if (!candFormats.length) r.checks.push('普段の投稿形式（リール・フィード等）が未確認です。');
      else {
        const hit = wantFormats.filter((x) => candFormats.includes(x));
        parts.push(hit.length ? 100 : 30);
        if (hit.length) r.reasons.push('希望する投稿形式（' + hit.join('・') + '）の投稿実績あり');
        else r.concerns.push('希望する投稿形式（' + wantFormats.join('・') + '）の投稿が見当たりません。');
      }
    }
    toList(camp.purposes).forEach((p) => {
      if (p === 'リール等の動画素材獲得') {
        if (!candFormats.length) return;
        const v = candFormats.some((x) => VIDEO_FORMATS.includes(x));
        parts.push(v ? 100 : 20);
        if (v) r.reasons.push('動画の投稿があり、動画素材獲得の目的に合う');
        else r.concerns.push('動画投稿が確認できず、動画素材獲得の目的に合わない可能性があります。');
      } else if (p === '来店促進') {
        if (regionRes.score === null) return;
        parts.push(regionRes.score >= 70 ? 100 : 30);
        if (regionRes.score >= 70) r.reasons.push('店舗の近くで活動しており、来店促進に向く');
        else r.concerns.push('来店促進が目的ですが、来店可能エリアでの活動が確認できていません。');
      }
    });
    if (toList(camp.purposes).includes('新商品告知') && !isKnown(cand.pastWork)) r.checks.push('新商品・限定メニューの紹介実績を確認してください。');
    if (!parts.length) { r.checks.push('希望SNS・投稿形式・目的と照合できる情報がありません。'); return r; }
    r.score = Math.round(parts.reduce((a, b) => a + b, 0) / parts.length);
    return r;
  }

  function evalCost(camp, cand) {
    const r = result('cost');
    const fee = cand.fee;
    if (!isKnown(fee)) {
      r.checks.push(camp.compensation === 'free' ? '無料招待で受けてもらえるか未確認です。' : '起用料金が未確認です。');
      return r;
    }
    const amount = Number(fee.value);
    if (fee.status === 'estimated') { r.usesEstimated = true; r.concerns.push('料金は推定値です。本人への確認が必要です。'); }
    const budget = camp.budgetMax === '' || camp.budgetMax === null || camp.budgetMax === undefined ? null : Number(camp.budgetMax);
    if (camp.compensation === 'free') {
      if (amount === 0) { r.score = 100; r.reasons.push('無料招待で受けられることを確認済み' + (fee.source ? '（' + fee.source + '）' : '')); }
      else { r.score = 20; r.concerns.push('料金 ' + amount.toLocaleString('ja-JP') + '円の記録があり、無料招待では受けていない可能性があります。'); }
    } else if (budget === null) {
      r.score = 60;
      r.reasons.push('料金 ' + amount.toLocaleString('ja-JP') + '円');
      r.checks.push('予算上限が未入力のため、予算との比較はしていません。');
    } else if (amount <= budget) { r.score = 100; r.reasons.push('料金 ' + amount.toLocaleString('ja-JP') + '円が予算上限 ' + budget.toLocaleString('ja-JP') + '円以内'); }
    else { r.score = 10; r.concerns.push('料金 ' + amount.toLocaleString('ja-JP') + '円が予算上限 ' + budget.toLocaleString('ja-JP') + '円を超えています。'); }
    if (camp.visitDates || camp.postPeriod) r.checks.push('希望来店日・投稿時期に対応できるか確認してください。');
    return r;
  }

  // 情報の充足度：主要な項目のうち確認できたものの割合
  const COMPLETENESS_FIELDS = [
    ['areas', '活動地域'], ['genres', '発信ジャンル'], ['followers', 'フォロワー数'], ['recentReactions', '直近の反応数'],
    ['postFrequency', '投稿頻度'], ['quality', '品質評価'], ['pastWork', '飲食店紹介実績'], ['prFrequency', 'PR投稿の頻度'],
    ['contact', '連絡方法'], ['fee', '起用料金'],
  ];
  function completeness(cand) {
    const missing = [];
    COMPLETENESS_FIELDS.forEach(([k, label]) => {
      const v = cand[k];
      let ok;
      if (k === 'areas' || k === 'genres') ok = toList(v).length > 0;
      else if (k === 'quality') ok = !!(v && v.rating);
      else if (k === 'contact') ok = !!(v && v.method);
      else if (k === 'recentReactions') ok = isKnown(v) || isKnown(cand.recentViews);
      else ok = isKnown(v);
      if (!ok) missing.push(label);
    });
    const pct = Math.round(((COMPLETENESS_FIELDS.length - missing.length) / COMPLETENESS_FIELDS.length) * 100);
    return { pct, missing };
  }

  function evaluate(camp, cand, link, settings) {
    settings = settings || defaultSettings();
    const w = settings.weights;
    const region = manualOverride('region', link) || evalRegion(camp, cand);
    const items = [
      region,
      manualOverride('genre', link) || evalGenre(camp, cand),
      manualOverride('engagement', link) || evalEngagement(cand, settings),
      manualOverride('quality', link) || evalQuality(cand),
      manualOverride('campaign', link) || evalCampaign(camp, cand, region),
      manualOverride('cost', link) || evalCost(camp, cand),
    ];
    const totalW = CRITERIA.reduce((a, c) => a + (Number(w[c.key]) || 0), 0);
    let knownW = 0;
    let sum = 0;
    items.forEach((it) => {
      it.weight = Number(w[it.key]) || 0;
      if (it.score !== null && it.weight > 0) { knownW += it.weight; sum += it.weight * it.score; }
    });
    const known = items.filter((it) => it.score !== null && it.weight > 0);
    const coverage = totalW ? Math.round((knownW / totalW) * 100) : 0;
    const score = knownW ? Math.round(sum / knownW) : null;
    const insufficient = coverage < settings.minCoverage || known.length < settings.minKnownCriteria;
    const comp = completeness(cand);
    const usesEstimated = items.some((it) => it.usesEstimated) || isEstimated(cand.followers);

    const reasons = [];
    items.filter((it) => it.score !== null && it.score >= 70).forEach((it) => it.reasons.forEach((x) => reasons.push(it.label + '：' + x)));
    const concerns = [];
    items.forEach((it) => it.concerns.forEach((x) => concerns.push(it.label + '：' + x)));
    if (isKnown(cand.prFrequency) && /多|頻繁|ほぼ/.test(String(cand.prFrequency.value))) concerns.push('PR投稿の割合が高い可能性があります（' + cand.prFrequency.value + '）。');
    const checks = [];
    items.forEach((it) => it.checks.forEach((x) => checks.push(it.label + '：' + x)));
    if (!(cand.contact && cand.contact.method)) checks.push('公開されている連絡方法を確認してください。');
    checks.push('投稿時の広告表記（PR表記・各SNSのタイアップ／プロモーション表示）の方法を、最新の公式情報で確認し、依頼時に伝えてください。');

    return { items, score, coverage, insufficient, completeness: comp, usesEstimated, reasons, concerns, checks, knownCount: known.length };
  }
  function isEstimated(f) { return !!(f && f.status === 'estimated' && isKnown(f)); }

  // ───── 絞り込み ─────
  function matchesText(cand, q) {
    if (!q) return true;
    const hay = [cand.displayName, cand.handle, cand.profileUrl, toList(cand.areas).join(' '), toList(cand.genres).join(' '), toList(cand.hashtags).join(' '), cand.notes, isKnown(cand.pastWork) ? cand.pastWork.value : ''].join(' ').toLowerCase();
    return toList(q.replace(/\s+/g, ',')).every((t) => hay.includes(t.toLowerCase().replace(/^#/, '')));
  }

  // 店舗所在地・ジャンル・目的での絞り込み（評価結果を使う）
  function filterForCampaign(rows, opts) {
    return rows.filter((row) => {
      const { cand, ev, link } = row;
      if (opts.text && !matchesText(cand, opts.text)) return false;
      if (opts.platform && cand.platform !== opts.platform) return false;
      if (opts.status && (link ? link.status : '未確認') !== opts.status) return false;
      const by = Object.fromEntries(ev.items.map((i) => [i.key, i]));
      const th = opts.threshold || 60;
      if (opts.regionFit && !(by.region.score !== null && by.region.score >= th)) return false;
      if (opts.genreFit && !(by.genre.score !== null && by.genre.score >= th)) return false;
      if (opts.purposeFit && !(by.campaign.score !== null && by.campaign.score >= th)) return false;
      if (opts.minScore && !(ev.score !== null && ev.score >= Number(opts.minScore))) return false;
      if (opts.hideInsufficient && ev.insufficient) return false;
      return true;
    });
  }

  // ───── CSV ─────
  const CSV_COLUMNS = [
    ['displayName', '表示名'], ['handle', 'アカウント名'], ['platform', 'SNS'], ['profileUrl', 'プロフィールURL'],
    ['areas', '活動地域'], ['genres', '発信ジャンル'], ['hashtags', 'よく使うハッシュタグ'], ['formats', '投稿形式'],
    ['followers.value', 'フォロワー数'], ['followers.status', 'フォロワー数の状態'], ['followers.source', 'フォロワー数の取得元'], ['followers.checkedAt', 'フォロワー数の確認日'],
    ['recentReactions.value', '直近投稿の反応数'], ['recentViews.value', '直近投稿の再生数'], ['recentReactions.source', '反応数の取得元'], ['recentReactions.checkedAt', '反応数の確認日'],
    ['postFrequency.value', '投稿頻度'], ['quality.rating', '品質評価(1-5)'], ['quality.mood', '投稿の雰囲気'],
    ['pastWork.value', '飲食店紹介実績'], ['prFrequency.value', 'PR投稿の頻度'],
    ['contact.method', '連絡方法'], ['contact.value', '公開連絡先'],
    ['fee.value', '起用料金(円)'], ['fee.status', '料金の状態'], ['fee.source', '料金の取得元'],
    ['source.detail', '取得元'], ['source.obtainedAt', '取得日'], ['source.by', '確認者'], ['notes', 'メモ'],
  ];
  const STATUS_FROM_JA = { '確認済み': 'confirmed', '確認済': 'confirmed', '推定': 'estimated', '未確認': 'unknown' };
  const PLATFORM_FROM_JA = { instagram: 'instagram', 'インスタ': 'instagram', 'インスタグラム': 'instagram', tiktok: 'tiktok', 'ティックトック': 'tiktok', youtube: 'youtube', 'ユーチューブ': 'youtube', x: 'x', twitter: 'x' };

  function csvCell(v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }

  function getPath(o, p) { return p.split('.').reduce((a, k) => (a ? a[k] : undefined), o); }

  function toCsv(cands) {
    const lines = [CSV_COLUMNS.map((c) => csvCell(c[1])).join(',')];
    cands.forEach((c) => {
      lines.push(CSV_COLUMNS.map(([path]) => {
        let v = getPath(c, path);
        if (path === 'platform') v = PLATFORMS[v] || v;
        if (/\.status$/.test(path)) v = FACT_STATUS[v] || '未確認';
        if (Array.isArray(v)) v = v.join('、');
        if (/\.value$/.test(path) && getPath(c, path.replace(/\.value$/, '.status')) === 'unknown') v = '';
        return csvCell(v);
      }).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }

  // CSVの行（見出し→値）から候補者データを作る。値の無い項目は「未確認」。
  // 取得元・確認日の無い数値は「推定」扱いにし、確認事項として示す。
  function fromCsvRow(obj, defaults) {
    defaults = defaults || {};
    const get = (ja) => (obj[ja] === undefined ? '' : String(obj[ja]).trim());
    const warnings = [];
    const url = get('プロフィールURL');
    const parsed = parseProfileUrl(url);
    const platRaw = get('SNS').toLowerCase();
    const platform = PLATFORM_FROM_JA[platRaw] || parsed.platform || 'other';
    const mkFact = (valJa, statusJa, srcJa, dateJa, conv) => {
      const raw = get(valJa);
      if (!raw) return fact(null, 'unknown');
      const v = conv ? conv(raw) : raw;
      if (v === null || (Array.isArray(v) && !v.length)) { warnings.push(valJa + '「' + raw + '」を読み取れないため未確認にしました'); return fact(null, 'unknown'); }
      const src = (srcJa && get(srcJa)) || get('取得元');
      const date = (dateJa && get(dateJa)) || get('取得日');
      let st = statusJa ? STATUS_FROM_JA[get(statusJa)] : '';
      if (!st) {
        st = src && date ? 'confirmed' : 'estimated';
        if (st === 'estimated') warnings.push(valJa + 'は取得元・確認日が無いため「推定」扱いにしました');
      }
      if (st === 'unknown') return fact(null, 'unknown');
      return fact(v, st, src, date, get('確認者') || defaults.by || '');
    };
    const rating = parseNum(get('品質評価(1-5)'));
    const cand = {
      displayName: get('表示名') || parsed.handle || '',
      handle: (get('アカウント名') || parsed.handle || '').replace(/^@/, ''),
      platform,
      profileUrl: url,
      areas: toList(get('活動地域')),
      genres: toList(get('発信ジャンル')),
      hashtags: toList(get('よく使うハッシュタグ')),
      formats: toList(get('投稿形式')).filter((f) => FORMATS.includes(f)),
      followers: mkFact('フォロワー数', 'フォロワー数の状態', 'フォロワー数の取得元', 'フォロワー数の確認日', parseNum),
      recentReactions: mkFact('直近投稿の反応数', null, '反応数の取得元', '反応数の確認日', (s) => toNumList(s)),
      recentViews: mkFact('直近投稿の再生数', null, '反応数の取得元', '反応数の確認日', (s) => toNumList(s)),
      postFrequency: mkFact('投稿頻度', null, null, null),
      quality: { rating: rating && rating >= 1 && rating <= 5 ? rating : null, mood: get('投稿の雰囲気'), note: '', checkedBy: rating ? get('確認者') : '', checkedAt: rating ? get('取得日') : '' },
      pastWork: mkFact('飲食店紹介実績', null, null, null),
      prFrequency: mkFact('PR投稿の頻度', null, null, null),
      contact: { method: get('連絡方法'), value: get('公開連絡先'), sourceUrl: url },
      fee: mkFact('起用料金(円)', '料金の状態', '料金の取得元', null, parseNum),
      source: { type: defaults.sourceType || 'CSV取込', detail: get('取得元') || defaults.detail || '', obtainedAt: get('取得日') || defaults.date || '', by: get('確認者') || defaults.by || '' },
      notes: get('メモ'),
    };
    if (!cand.profileUrl) warnings.push('プロフィールURLがありません');
    if (!cand.displayName && !cand.handle) warnings.push('表示名・アカウント名がありません');
    return { cand, warnings };
  }

  // ───── 連絡文の下書き（入力に無い条件は【要確認】として残す）─────
  function contactDraft(camp, cand, store, sender) {
    const ph = (v, label) => (v ? v : '【要確認：' + label + '】');
    const lines = [];
    lines.push((cand.displayName || cand.handle || '【要確認：お名前】') + ' 様');
    lines.push('');
    lines.push('突然のご連絡失礼いたします。');
    lines.push('合同会社Four Seasonsの' + ph(sender, '差出人名') + 'と申します。飲食店の集客支援を行っております。');
    lines.push('');
    lines.push((store ? store.name : ph('', '店舗名')) + '（' + ph(camp.address, '所在地') + '）のご紹介をお願いできないかと思い、ご連絡いたしました。');
    if (cand.platform && cand.platform !== 'other') lines.push('日頃の' + PLATFORMS[cand.platform] + 'でのご発信を拝見し、ぜひお願いしたいと考えております。');
    lines.push('');
    lines.push('【ご依頼内容（予定）】');
    lines.push('・ご来店：' + ph(camp.visitDates, '来店日'));
    lines.push('・ご提供内容：' + ph(camp.offer, '提供する商品・サービス'));
    lines.push('・投稿形式：' + ph(toList(camp.formats).join('・'), '投稿形式'));
    lines.push('・投稿時期：' + ph(camp.postPeriod, '投稿時期'));
    lines.push('・条件：' + (camp.compensation === 'free' ? '無料でのご招待' : camp.compensation === 'paid' ? '有償でのご依頼（金額はご相談）' : '【要確認：無料招待か有償依頼か】'));
    if (camp.requiredTags || camp.mentions) lines.push('・投稿時のお願い：' + [camp.requiredTags, camp.mentions].filter(Boolean).join('／'));
    lines.push('・広告であることが分かる表記（「PR」等の表記や、各SNSのタイアップ・プロモーション表示機能）をお願いいたします。');
    lines.push('');
    lines.push('ご興味をお持ちいただけましたら、ご都合やご条件をお聞かせいただけますと幸いです。');
    lines.push('どうぞよろしくお願いいたします。');
    return lines.join('\n');
  }

  // 貼り付けた文章からプロフィールURL（と @アカウント名）を取り出す。投稿・動画のURLや読めない行は理由付きで返す。
  // @だけのアカウント名は Instagram として扱う。
  function parseUrlList(text) {
    const items = [];
    const seen = {};
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      const raw = line.trim();
      if (!raw) return;
      const tokens = (raw.match(/(?:https?:\/\/)?(?:www\.|m\.)?(?:instagram\.com|tiktok\.com|youtube\.com|youtu\.be|x\.com|twitter\.com)\/[^\s、,，"'<>）)]+|(?:^|[\s、,，(（:：「])@[A-Za-z0-9_.]{2,30}/g) || []).map((t) => t.replace(/^[\s、,，(（:：「]+/, ''));
      if (!tokens.length) { items.push({ line: i + 1, raw, error: 'URL・@アカウント名が見つかりません' }); return; }
      tokens.forEach((t) => {
        const it = { line: i + 1, raw: t };
        let url = t;
        if (/^@/.test(t)) url = 'https://www.instagram.com/' + t.slice(1) + '/';
        else if (!/^https?:\/\//i.test(t)) url = 'https://' + t;
        if (/instagram\.com\/(p|reel|reels|tv|stories|explore)\//i.test(url)) it.error = '投稿のURLです（プロフィールのURLを送ってください）';
        else if (/youtube\.com\/(watch|shorts)|youtu\.be\//i.test(url)) it.error = '動画のURLです（チャンネルのURLを送ってください）';
        else if (/tiktok\.com\/@[^/]+\/video\//i.test(url)) it.error = '動画のURLです（プロフィールのURLを送ってください）';
        if (!it.error) {
          const p = parseProfileUrl(url);
          if (!p.platform || p.platform === 'other' || !p.handle) it.error = '対応していないURLです（Instagram・TikTok・YouTube・Xのプロフィールのみ）';
          else {
            it.platform = p.platform; it.handle = p.handle.replace(/^channel:/, ''); it.key = p.key;
            it.url = p.platform === 'instagram' ? 'https://www.instagram.com/' + p.handle + '/' : p.platform === 'tiktok' ? 'https://www.tiktok.com/@' + p.handle : url.replace(/[?#].*$/, '');
            if (seen[p.key]) it.dupInList = seen[p.key];
            else seen[p.key] = i + 1;
          }
        }
        items.push(it);
      });
    });
    return items;
  }

  const api = {
    parseUrlList,
    PLATFORMS, FORMATS, VIDEO_FORMATS, PURPOSES, STATUSES, FACT_STATUS, COMPENSATION, CRITERIA, CSV_COLUMNS,
    defaultSettings, fact, isKnown, factLabel, toList, toNumList, parseNum, parseProfileUrl, findDuplicates,
    evaluate, completeness, matchesText, filterForCampaign, toCsv, fromCsvRow, contactDraft, csvCell, splitAddress,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.inf = api; }
})(typeof self !== 'undefined' ? self : this);
