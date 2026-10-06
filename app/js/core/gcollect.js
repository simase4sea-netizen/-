/* 店舗情報の収集・整理：URLの媒体判定・店舗ごとの振り分け、過去投稿の分割、貼り付けた本文からの情報の抜き出し、候補の採用（ブラウザ／Node 共用）
 * グルメ媒体・Googleマップのページは自動で読み取らない（各サービスの利用規約で自動収集が禁止・制限されているため）。
 * 抜き出した情報はすべて「候補」とし、担当者が採用するまで店舗情報・投稿文には使わない。 */
(function (root) {
  'use strict';
  const GP = typeof module !== 'undefined' && module.exports ? require('./gpost.js') : root.FS.gpost;

  // 媒体の判定。auto：公式APIで自動取得できるもの。それ以外は貼り付け・スクリーンショットで整理する。
  const MEDIA = [
    { key: 'tabelog', label: '食べログ', kind: 'gourmet', re: /(^|\.)tabelog\.com$/ },
    { key: 'gnavi', label: 'ぐるなび', kind: 'gourmet', re: /(^|\.)gnavi\.co\.jp$/ },
    { key: 'hotpepper', label: 'ホットペッパーグルメ', kind: 'gourmet', re: /(^|\.)hotpepper\.jp$/ },
    { key: 'retty', label: 'Retty', kind: 'gourmet', re: /(^|\.)retty\.me$/ },
    { key: 'ikyu', label: '一休.comレストラン', kind: 'gourmet', re: /(^|\.)ikyu\.com$/ },
    { key: 'ozmall', label: 'OZmall', kind: 'gourmet', re: /(^|\.)ozmall\.co\.jp$/ },
    { key: 'hitosara', label: 'ヒトサラ', kind: 'gourmet', re: /(^|\.)hitosara\.com$/ },
    { key: 'tablecheck', label: 'TableCheck（予約）', kind: 'reserve', re: /(^|\.)tablecheck\.com$/ },
    { key: 'ebica', label: 'ebica（予約）', kind: 'reserve', re: /(^|\.)ebica\.jp$/ },
    { key: 'toreta', label: 'トレタ（予約）', kind: 'reserve', re: /(^|\.)toreta\.in$/ },
    { key: 'omakase', label: 'OMAKASE（予約）', kind: 'reserve', re: /(^|\.)omakase\.in$/ },
    { key: 'instagram', label: 'Instagram', kind: 'sns', re: /(^|\.)instagram\.com$/ },
    { key: 'x', label: 'X（旧Twitter）', kind: 'sns', re: /(^|\.)(x|twitter)\.com$/ },
    { key: 'tiktok', label: 'TikTok', kind: 'sns', re: /(^|\.)tiktok\.com$/ },
    { key: 'facebook', label: 'Facebook', kind: 'sns', re: /(^|\.)facebook\.com$/ },
    { key: 'line', label: 'LINE', kind: 'sns', re: /(^|\.)(line\.me|lin\.ee)$/ },
    { key: 'youtube', label: 'YouTube', kind: 'sns', re: /(^|\.)(youtube\.com|youtu\.be)$/ },
    { key: 'gmap', label: 'Googleマップ', kind: 'map', re: /^(maps\.app\.goo\.gl|goo\.gl|g\.page|maps\.google\.[a-z.]+)$/ },
  ];
  const KIND_LABEL = { gourmet: 'グルメ媒体', reserve: '予約サイト', sns: 'SNS', map: '地図', official: '公式サイト・その他' };

  // 媒体ごとの扱い（画面に表示する説明）
  function howTo(media) {
    if (media === 'instagram') return { auto: true, note: '公式API（Business Discovery）でプロフィール文と最近の投稿文を取得できます（ビジネス・クリエイターアカウントのみ）。' };
    if (media === 'gmap') return { auto: false, note: 'GoogleマップURLとして登録できます。ページの自動読み取りは規約上行いません。住所・営業時間などは、ページを開いて本文を貼り付けるか、スクリーンショットで整理してください。' };
    return { auto: false, note: '自動では読み取りません（利用規約で自動収集が禁止・制限されている媒体があるため）。ページを開き、本文をコピーして貼り付けるか、スクリーンショットで整理してください。' };
  }

  function classifyUrl(raw) {
    let u;
    try { u = new URL(String(raw).trim()); } catch (e) { return null; }
    if (!/^https?:$/.test(u.protocol)) return null;
    const host = u.hostname.toLowerCase().replace(/^www\./, '');
    let m = MEDIA.find((x) => x.re.test(host));
    if (!m && /(^|\.)google\.[a-z.]+$/.test(host) && /^\/maps/.test(u.pathname)) m = MEDIA.find((x) => x.key === 'gmap');
    const out = { url: u.href, host, media: m ? m.key : 'official', label: m ? m.label : '公式サイト・その他（' + host + '）', kind: m ? m.kind : 'official' };
    if (out.media === 'instagram') {
      const seg = u.pathname.split('/').filter(Boolean);
      if (seg[0] && !['p', 'reel', 'reels', 'stories', 'explore', 'tv'].includes(seg[0])) out.handle = seg[0].toLowerCase();
      else out.post = true;
    }
    if (out.media === 'gmap' && host === 'goo.gl' && !/^\/maps/.test(u.pathname)) return Object.assign(out, { media: 'official', label: '公式サイト・その他（goo.gl）', kind: 'official' });
    return out;
  }

  // URLの一括貼り付けを店舗ごとに振り分ける。「【店舗名】」の行の下にURLを並べる形式。
  // 店舗名の見出しが無いURLは defaultStoreId（画面で選んだ店舗）に入れる。見つからない店舗名はエラー。
  function parseUrlBlock(text, stores, defaultStoreId) {
    const groups = [];
    const errors = [];
    const byId = {};
    let cur = defaultStoreId || null;
    const find = (name) => {
      const n = name.replace(/\s+/g, '');
      return stores.find((s) => s.name.replace(/\s+/g, '') === n) || stores.find((s) => (s.aliases || []).some((a) => a.replace(/\s+/g, '') === n)) || null;
    };
    String(text || '').split(/\r?\n/).forEach((line, i) => {
      const t = line.trim();
      if (!t) return;
      const h = /^[【\[［](.+?)[】\]］]\s*$/.exec(t);
      if (h) {
        const s = find(h[1].trim());
        if (!s) { errors.push((i + 1) + '行目：店舗「' + h[1].trim() + '」が登録されていません（「店舗・案件」で登録してください）'); cur = false; return; }
        cur = s.id;
        return;
      }
      const urls = t.match(/https?:\/\/[^\s<>"'、。）)]+/g) || [];
      if (!urls.length) return;
      if (cur === false) return; // 見つからない店舗の下のURLは振り分けない
      if (!cur) { errors.push((i + 1) + '行目：どの店舗のURLか分かりません（上の行に【店舗名】を書くか、画面で店舗を選んでください）'); return; }
      urls.forEach((u) => {
        const c = classifyUrl(u);
        if (!c) { errors.push((i + 1) + '行目：URLを読み取れません（' + u + '）'); return; }
        if (!byId[cur]) { byId[cur] = { storeId: cur, items: [] }; groups.push(byId[cur]); }
        if (!byId[cur].items.some((x) => x.url === c.url)) byId[cur].items.push(c);
      });
    });
    return { groups, errors };
  }

  // 過去投稿の分割。「---」（半角ハイフン3つ以上）や「===」だけの行で区切る。
  // 業務アシストの出力形式（日本語と英語の間の「ーーーーーー」）は同じ投稿として扱う。
  function splitPastPosts(text) {
    return String(text || '').split(/\r?\n[ \t]*(?:-{3,}|={3,})[ \t]*(?=\r?\n|$)/).map((s) => s.trim()).filter((s) => s.length >= 5);
  }

  const norm = (s) => String(s || '').replace(/\s+/g, '').toLowerCase();
  const has = (v) => v !== undefined && v !== null && String(v).trim() !== '';

  // ルールでの抜き出し（AIを使わない場合）。根拠の行（evidence）を必ず付ける。
  function ruleExtract(text) {
    const out = [];
    const add = (field, value, evidence) => {
      value = String(value || '').trim().replace(/^[:：\s]+/, '');
      if (!value || out.some((c) => c.field === field && norm(c.value) === norm(value))) return;
      out.push({ field, value, evidence: String(evidence).trim().slice(0, 200) });
    };
    const lines = String(text || '').split(/\r?\n/).map((l) => l.trim()).filter(Boolean);
    lines.forEach((l) => {
      const body = l.replace(/^[・■●◆◇★☆▶▷>※\-–—*#]+\s*/, '');
      if (/(\d{1,2}[:：]\d{2})\s*[〜~～\-－−ー]\s*(\d{1,2}[:：]\d{2})/.test(body) && !/予約受付|受付時間|電話/.test(body)) {
        add('hours', body.replace(/^(営業時間|営業|OPEN|open|Open)\s*[:：]?\s*/, ''), l);
      }
      const hol = /定休日\s*[:：]?\s*(.+)/.exec(body);
      if (hol) add('holidays', hol[1].replace(/[。]$/, ''), l);
      const adr = /((?:東京都|北海道|(?:京都|大阪)府|[^\s　、。:：]{2,3}県)[^\s　、。]{2,}(?:[\s　][^\s　、。]{1,30})?)/.exec(body);
      if (adr && (/住所|所在地/.test(body) || /\d/.test(adr[1]))) add('address', adr[1].replace(/^(住所|所在地)[:：]?/, ''), l);
      const acc = /([^\s　、。:：]{1,15}駅[^。\n]{0,20}徒歩\s?約?\s?\d+\s?分)/.exec(body);
      if (acc) add('access', acc[1].replace(/^(アクセス|交通手段)[:：]?/, ''), l);
      const pk = /駐車場\s*[:：]?\s*(.+)/.exec(body);
      if (pk) add('parking', pk[1].replace(/[。]$/, ''), l);
      const fl = /([^\s　、。]{2,20}\s?(?:\d{1,2}|[一二三四五六七八九十])\s?(?:階|F))(?![^\s　]*円)/.exec(body);
      if (fl && !adr) add('floorInfo', fl[1], l);
      // メニューと価格（予算・平均・合計などは除く）
      if (!/予算|平均|合計|ポイント|クーポン|送料|駐車|チャージ料|サービス料/.test(body)) {
        const re = /([^\s　:：|｜、。,，【】「」]{2,25}?)[\s　]*[:：…・\-ー─]*[\s　]*[¥￥]?\s?(\d{1,3}(?:[,，]\d{3})+|\d{3,5})\s?円?(?:[（(]税込[）)]|[（(]税抜[）)])?/g;
        let m;
        while ((m = re.exec(body))) {
          const name = m[1].replace(/^[・■●◆◇★☆#]+/, '').trim();
          if (!/円|[¥￥]/.test(m[0]) || /^\d+$/.test(name) || /^(税込|税抜|価格|料金|各|約)$/.test(name)) continue;
          const price = m[2].replace(/，/g, ',') + '円' + (/税抜/.test(m[0]) ? '（税抜）' : /税込/.test(m[0]) ? '（税込）' : '');
          if (!out.some((c) => c.field === 'menu' && norm(c.value.name) === norm(name))) out.push({ field: 'menu', value: { name, price, description: '', period: '' }, evidence: l.slice(0, 200) });
        }
      }
    });
    // URL（予約サイト → 予約URL、Googleマップ → GoogleマップURL）
    (String(text || '').match(/https?:\/\/[^\s<>"'、。）)]+/g) || []).forEach((u) => {
      const c = classifyUrl(u);
      if (!c) return;
      if (c.kind === 'reserve') add('reserveUrl', c.url, u);
      if (c.media === 'gmap') add('mapsUrl', c.url, u);
    });
    return out;
  }

  // ハッシュタグ（過去投稿でよく使う表現の参考）
  function hashtags(texts) {
    const count = {};
    texts.forEach((t) => (String(t).match(/[#＃][^\s#＃、。!！?？]+/g) || []).forEach((h) => { const k = '#' + h.slice(1); count[k] = (count[k] || 0) + 1; }));
    return Object.keys(count).sort((a, b) => count[b] - count[a]).map((k) => ({ tag: k, count: count[k] }));
  }

  // AIの抜き出し結果の確認。根拠の文が元の文章に無いもの・値の数字が根拠に無いものは「要確認」にする。
  function verifyCandidate(c, sourceText) {
    const src = norm(sourceText);
    const ev = norm(c.evidence);
    const notes = [];
    if (!ev) notes.push('根拠の文がありません');
    else if (src && !src.includes(ev)) notes.push('根拠の文が元の文章に見つかりません');
    const val = typeof c.value === 'object' ? [c.value.name, c.value.price, c.value.period].join(' ') : c.value;
    const nums = (String(val).replace(/[,，]/g, '').match(/\d+/g) || []);
    const evNums = String(c.evidence || '').replace(/[,，]/g, '');
    nums.forEach((n) => { if (!evNums.includes(n)) notes.push('数値「' + n + '」が根拠の文にありません'); });
    return notes;
  }

  const FIELD_LABEL = {};
  GP.STORE_FIELDS.forEach((f) => { FIELD_LABEL[f[0]] = f[1]; });
  FIELD_LABEL.menu = 'メニュー・価格';

  // AI抜き出し用の出力形式
  function extractSchema() {
    const item = { type: 'object', additionalProperties: false, required: ['field', 'value', 'evidence'], properties: {
      field: { type: 'string', enum: GP.STORE_FIELDS.map((f) => f[0]) },
      value: { type: 'string', description: '登録する値（原文の表記を尊重し、要約しすぎない）' },
      evidence: { type: 'string', description: '根拠となる原文をそのまま抜き出す（画像の場合は写っている文字のとおり）' },
    } };
    const menu = { type: 'object', additionalProperties: false, required: ['name', 'description', 'price', 'period', 'evidence'], properties: {
      name: { type: 'string' }, description: { type: 'string', description: '原文にある説明だけ。無ければ空文字' },
      price: { type: 'string', description: '原文の表記（例：1,980円（税込））。無ければ空文字' }, period: { type: 'string', description: '販売期間。無ければ空文字' },
      evidence: { type: 'string' },
    } };
    return { type: 'object', additionalProperties: false, required: ['facts', 'menu', 'notes'], properties: {
      facts: { type: 'array', items: item }, menu: { type: 'array', items: menu },
      notes: { type: 'array', items: { type: 'string' }, description: '担当者への確認事項（古い可能性がある情報、別店舗の情報らしきもの など）' },
    } };
  }

  function extractSystemPrompt() {
    return 'あなたは飲食店の店舗情報を整理する担当です。与えられた資料（グルメ媒体・SNS・公式サイトの本文、スクリーンショット、過去の投稿文）から、指定された項目に当てはまる情報だけを抜き出します。\n' +
      '- 資料に書かれていないことは推測で補わない。分からない項目は出力しない。\n' +
      '- evidence には根拠となる原文をそのまま書く（言い換えない）。\n' +
      '- 口コミ・レビューの文章は店舗の公式情報ではないため、facts に入れない（雰囲気の参考になる場合は notes に「口コミより」として書く）。\n' +
      '- 過去の投稿文の価格・販売期間・キャンペーンは、現在も同じとは限らないため notes で注意を促す。\n' +
      '- 資料に別の店舗の情報が含まれていそうな場合は、その情報を出力せず notes に書く。\n' +
      '- 電話番号・個人名・メールアドレスは出力しない。';
  }
  function extractUserPrompt(storeName, source) {
    return '対象店舗：' + storeName + '\n資料の種類：' + source.label + (source.date ? '（' + source.date + '）' : '') + (source.url ? '\nURL：' + source.url : '') +
      '\n項目：' + GP.STORE_FIELDS.map((f) => f[0] + '＝' + f[1]).join('、') + '、メニュー（名前・説明・価格・販売期間）' +
      (source.text ? '\n\n<source>\n' + source.text + '\n</source>' : '\n\n（添付画像から読み取ってください）');
  }

  // AIの結果を候補の形にそろえる
  function fromAiResult(r, sourceText, isImage) {
    const out = [];
    (r.facts || []).forEach((f) => { if (FIELD_LABEL[f.field] && has(f.value)) out.push({ field: f.field, value: String(f.value).trim(), evidence: f.evidence || '' }); });
    (r.menu || []).forEach((m) => { if (has(m.name)) out.push({ field: 'menu', value: { name: m.name.trim(), description: m.description || '', price: m.price || '', period: m.period || '' }, evidence: m.evidence || '' }); });
    out.forEach((c) => { c.checkNotes = isImage ? ['画像からの読み取りです。文字を確認してください'] : verifyCandidate(c, sourceText); });
    return { candidates: out, notes: r.notes || [] };
  }

  // 候補を店舗に追加（同じ項目・同じ値で未処理のものがあれば追加しない）
  function addCandidates(info, cands, source, uid, now, user) {
    info.candidates = info.candidates || [];
    let n = 0;
    cands.forEach((c) => {
      const key = c.field + ':' + norm(typeof c.value === 'object' ? c.value.name + '|' + c.value.price : c.value);
      if (info.candidates.some((x) => x.status === 'pending' && x.key === key)) return;
      info.candidates.push({ id: uid('cand'), key, field: c.field, value: c.value, evidence: c.evidence || '', checkNotes: c.checkNotes || [], sourceId: source.id, sourceLabel: source.label, sourceUrl: source.url || '', fromPastPost: source.type === 'pastpost', sourceDate: source.date || '', status: 'pending', at: now, by: user });
      n++;
    });
    return n;
  }

  // 項目ごとに「現在の登録値」と「未処理の候補」を並べる。値が食い違うものに印を付ける。
  function reviewRows(info) {
    const rows = [];
    const pend = (info.candidates || []).filter((c) => c.status === 'pending');
    GP.STORE_FIELDS.forEach((f) => {
      const cs = pend.filter((c) => c.field === f[0]);
      if (!cs.length) return;
      const values = new Set(cs.map((c) => norm(c.value)));
      const current = info[f[0]] || '';
      rows.push({ field: f[0], label: f[1], current, candidates: cs, conflict: values.size > 1 || (has(current) && cs.some((c) => norm(c.value) !== norm(current))) });
    });
    const menus = pend.filter((c) => c.field === 'menu');
    const byName = {};
    menus.forEach((c) => { const k = norm(c.value.name); (byName[k] = byName[k] || []).push(c); });
    Object.keys(byName).forEach((k) => {
      const cs = byName[k];
      const cur = (info.menu || []).find((m) => norm(m.name) === k) || null;
      const prices = new Set(cs.map((c) => norm(c.value.price)).filter(Boolean));
      rows.push({ field: 'menu', label: 'メニュー：' + cs[0].value.name, current: cur ? cur.price || '（価格未登録）' : '', currentMenu: cur, candidates: cs, conflict: prices.size > 1 || !!(cur && cur.price && cs.some((c) => c.value.price && norm(c.value.price) !== norm(cur.price))) });
    });
    return rows;
  }

  // 候補を採用して店舗情報に反映する。出典（媒体・URL・採用日・採用者）を項目ごとに残す。
  function applyCandidate(info, cand, uid, now, user) {
    const src = { sourceLabel: cand.sourceLabel, sourceUrl: cand.sourceUrl, evidence: cand.evidence, appliedAt: now, by: user, fromPastPost: !!cand.fromPastPost };
    info.fieldSources = info.fieldSources || {};
    let desc;
    if (cand.field === 'menu') {
      const v = cand.value;
      const cur = (info.menu || []).find((m) => norm(m.name) === norm(v.name));
      if (cur) {
        const before = cur.price;
        ['description', 'price', 'period'].forEach((k) => { if (has(v[k])) cur[k] = v[k]; });
        cur.updatedAt = now;
        cur.source = src;
        desc = 'メニュー「' + cur.name + '」を更新' + (before !== cur.price ? '（価格 ' + (before || '未登録') + ' → ' + cur.price + '）' : '');
      } else {
        info.menu = info.menu || [];
        info.menu.push({ id: uid('menu'), name: v.name, description: v.description || '', price: v.price || '', period: v.period || '', createdAt: now, source: src });
        desc = 'メニュー「' + v.name + '」を追加';
      }
    } else {
      const before = info[cand.field] || '';
      info[cand.field] = cand.value;
      info.fieldSources[cand.field] = src;
      desc = FIELD_LABEL[cand.field] + '：' + (before || '（未登録）') + ' → ' + cand.value;
    }
    cand.status = 'applied';
    cand.decidedAt = now;
    cand.decidedBy = user;
    // 同じ項目の他の候補は「不採用」にする（メニューは同じ名前のもの）
    (info.candidates || []).forEach((c) => {
      if (c === cand || c.status !== 'pending' || c.field !== cand.field) return;
      if (cand.field !== 'menu' || norm(c.value.name) === norm(cand.value.name)) { c.status = 'rejected'; c.decidedAt = now; c.decidedBy = user; c.rejectReason = '同じ項目の別の候補を採用'; }
    });
    return desc;
  }

  const api = { MEDIA, KIND_LABEL, FIELD_LABEL, howTo, classifyUrl, parseUrlBlock, splitPastPosts, ruleExtract, hashtags, verifyCandidate, extractSchema, extractSystemPrompt, extractUserPrompt, fromAiResult, addCandidates, reviewRows, applyCandidate };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.gcollect = api; }
})(typeof self !== 'undefined' ? self : this);
