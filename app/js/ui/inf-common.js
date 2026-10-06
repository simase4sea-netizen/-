/* インフルエンサー候補選定：画面共通部品（事実の入力欄・評価表示・起用状況の変更） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const I = root.FS.inf;
  const F = root.FS.format;
  const esc = U.esc;

  function inf() { return S.get().inf; }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }

  function newCandidate() {
    return {
      id: S.uid('cand'), personId: null, displayName: '', handle: '', platform: 'instagram', profileUrl: '',
      areas: [], genres: [], hashtags: [], formats: [],
      followers: I.fact(), recentReactions: I.fact(), recentViews: I.fact(), postFrequency: I.fact(),
      quality: { rating: null, mood: '', note: '', checkedBy: '', checkedAt: '' },
      pastWork: I.fact(), prFrequency: I.fact(),
      contact: { method: '', value: '', sourceUrl: '' },
      fee: I.fact(),
      source: { type: '手動登録', detail: '', obtainedAt: today(), by: S.user() },
      notes: '', createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(), history: [],
    };
  }

  // 表示名が無い（まだ取得していない）場合はアカウント名を表示する
  function candLabel(c) {
    if (!c.displayName) return c.handle ? '@' + c.handle : '名称未入力';
    return c.displayName + (c.handle ? '（@' + c.handle + '）' : '');
  }
  function candNameHtml(c) {
    return c.displayName ? '<b>' + U.esc(c.displayName) + '</b><div class="small muted">@' + U.esc(c.handle) + '</div>' : '<b>@' + U.esc(c.handle || '名称未入力') + '</b>';
  }

  // 事実（値・状態・取得元・確認日・確認者）の入力欄
  function factEditor(key, label, f, opts) {
    opts = opts || {};
    f = f || I.fact();
    const val = Array.isArray(f.value) ? f.value.join(', ') : f.value === null || f.value === undefined ? '' : f.value;
    return '<div class="panel" style="padding:12px;margin-bottom:10px"><div class="lbl">' + esc(label) + (opts.hint ? ' <span class="hint" style="font-weight:400">' + esc(opts.hint) + '</span>' : '') + '</div>' +
      '<div class="row">' +
      '<div class="field" style="flex:2 1 200px"><input type="text" data-fact="' + key + '" data-ff="value" value="' + esc(val) + '" placeholder="' + esc(opts.placeholder || '未確認なら空欄') + '"></div>' +
      '<div class="field" style="flex:0 1 120px"><select data-fact="' + key + '" data-ff="status">' + Object.keys(I.FACT_STATUS).map((k) => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + I.FACT_STATUS[k] + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:2 1 160px"><input type="text" data-fact="' + key + '" data-ff="source" value="' + esc(f.source) + '" placeholder="取得元（例：プロフィール画面）"></div>' +
      '<div class="field" style="flex:1 1 140px"><input type="date" data-fact="' + key + '" data-ff="checkedAt" value="' + esc(f.checkedAt) + '"></div>' +
      '<div class="field" style="flex:1 1 110px"><input type="text" data-fact="' + key + '" data-ff="checkedBy" value="' + esc(f.checkedBy) + '" placeholder="確認者"></div>' +
      '</div></div>';
  }

  // 入力欄から事実を読み取る。conv で数値などに変換。値が空なら未確認。
  function readFact(el, key, conv, prev) {
    const g = (ff) => { const x = el.querySelector('[data-fact="' + key + '"][data-ff="' + ff + '"]'); return x ? x.value.trim() : ''; };
    const raw = g('value');
    let status = g('status');
    const errors = [];
    let value = null;
    if (raw) {
      value = conv ? conv(raw) : raw;
      if (value === null || (Array.isArray(value) && !value.length)) { errors.push('「' + raw + '」を読み取れません'); value = null; }
    }
    if (value === null) status = 'unknown';
    else if (status === 'unknown') status = 'confirmed';
    const f = I.fact(value, status, g('source'), g('checkedAt'), g('checkedBy'));
    if (status === 'confirmed' && (!f.source || !f.checkedAt)) errors.push('確認済みにするには取得元と確認日が必要です');
    if (status !== 'unknown' && !f.checkedBy) f.checkedBy = S.user();
    const changed = JSON.stringify(prev || I.fact()) !== JSON.stringify(f);
    return { f, errors, changed };
  }

  function factView(f, fmt) {
    if (!I.isKnown(f)) return '<span class="badge gray">未確認</span>';
    const v = fmt ? fmt(f.value) : Array.isArray(f.value) ? f.value.join(', ') : String(f.value);
    return esc(v) + (f.status === 'estimated' ? ' <span class="badge warn">推定</span>' : '') +
      '<div class="small muted">' + esc(f.source || '取得元未記入') + (f.checkedAt ? '・' + esc(f.checkedAt) : '') + '</div>';
  }

  function fmtNum(n) { return Number(n).toLocaleString('ja-JP'); }
  function feeView(f) {
    if (!I.isKnown(f)) return '<span class="badge gray">費用未確認</span>';
    return (Number(f.value) === 0 ? '無料で可' : fmtNum(f.value) + '円') + (f.status === 'estimated' ? ' <span class="badge warn">推定</span>' : '');
  }

  function scoreView(ev) {
    if (ev.score === null) return '<span class="badge warn">判定材料不足</span><div class="small muted">評価できる項目なし</div>';
    // 判定材料不足のときは点数を目立たせず「参考値」として示す
    if (ev.insufficient) return '<span class="badge warn">判定材料不足</span><div class="small muted">参考値 ' + ev.score + '（' + ev.knownCount + '/6項目・重み' + ev.coverage + '%で計算）</div>' + (ev.usesEstimated ? '<div><span class="badge warn">推定値を含む</span></div>' : '');
    return '<b style="font-size:18px">' + ev.score + '</b><span class="small muted">/100</span>' +
      (ev.usesEstimated ? '<div><span class="badge warn">推定値を含む</span></div>' : '');
  }

  function linkFor(campId, candId) {
    return inf().links.find((l) => l.campaignId === campId && l.candidateId === candId) || null;
  }
  function ensureLink(campId, candId) {
    let l = linkFor(campId, candId);
    if (!l) {
      l = { id: S.uid('lnk'), campaignId: campId, candidateId: candId, status: '未確認', statusHistory: [], manual: {}, contact: null, createdAt: Date.now() };
      inf().links.push(l);
    }
    return l;
  }

  function statusSelect(current, attrs) {
    return '<select ' + (attrs || '') + '>' + I.STATUSES.map((s) => '<option' + (s === current ? ' selected' : '') + '>' + s + '</option>').join('') + '</select>';
  }

  // 起用状況の変更（履歴を残す）。連絡文が承認されていない状態で「連絡済み」にする場合は確認する。
  // opts.auto：自動選定による変更（確認画面を出さず、担当者の手動変更扱いにしない）
  async function changeStatus(camp, cand, to, note, opts) {
    const auto = !!(opts && opts.auto);
    const l = ensureLink(camp.id, cand.id);
    const from = l.status;
    if (!auto) l.autoManaged = false; // 担当者が手動で変えた候補は、以後の自動選定で変更しない
    if (from === to) return true;
    if (to === '連絡済み' && !(l.contact && (l.contact.status === 'approved' || l.contact.status === 'done'))) {
      const ok = await U.modal({ title: '連絡済みにする', body: '<p>この候補者への連絡文は、まだ承認されていません。このツールからは連絡を送信しません。承認された文面で、担当者が手動で連絡しましたか？</p>', check: '担当者が内容と宛先を確認して手動で連絡したことを確認しました', confirmLabel: '連絡済みにする' });
      if (!ok) return false;
    }
    if (to === '起用決定') {
      const ok = await U.modal({ title: '起用決定', body: '<p>「' + esc(candLabel(cand)) + '」を起用決定にします。条件（料金・来店日・投稿条件・広告表記）を本人と合意済みですか？</p>', check: '条件の合意を確認しました', confirmLabel: '起用決定にする' });
      if (!ok) return false;
    }
    l.status = to;
    l.statusHistory.push({ at: Date.now(), user: auto ? '自動選定' : S.user(), from, to, note: note || '' });
    S.log(auto ? '起用状況を自動選定で変更しました' : '起用状況を変更しました', { type: 'influencer', id: cand.id, label: candLabel(cand) }, 'キャンペーン「' + camp.title + '」：' + from + ' → ' + to + (note ? '（' + note + '）' : ''));
    S.save(true);
    return true;
  }

  // 候補者の更新履歴（項目ごとの変更前→変更後、取得元・確認日付き）
  function pushHistory(cand, changes, action) {
    cand.history = cand.history || [];
    const e = { at: Date.now(), user: S.user(), action, changes };
    cand.history.push(e);
    S.log(action, { type: 'influencer', id: cand.id, label: candLabel(cand) }, changes.join('／'));
  }

  function describeFact(f, fmt) {
    if (!I.isKnown(f)) return '未確認';
    const v = fmt ? fmt(f.value) : Array.isArray(f.value) ? f.value.join(',') : String(f.value);
    return v + '［' + I.FACT_STATUS[f.status] + (f.source ? '・' + f.source : '') + (f.checkedAt ? '・' + f.checkedAt : '') + '］';
  }

  function prNotice() {
    return '<div class="alert warn small"><b>広告表記（PR表記）の確認事項</b><br>' +
      '・2023年10月1日から、広告であることが分かりにくい表示（いわゆるステルスマーケティング）は景品表示法の不当表示の対象です。責任を問われるのは広告主（店舗・依頼側の事業者）です。無料招待でも、依頼して投稿してもらう場合は対象になり得ます。<br>' +
      '・依頼時に「PR」「広告」などの表記や、各SNSのタイアップ投稿・プロモーション表示機能の利用をお願いし、投稿後に表記を確認してください。<br>' +
      '・規制の運用基準や各SNSの表示ルールは変わることがあるため、<b>起用前に消費者庁と各SNSの最新の公式情報を担当者が確認</b>してください（このツールは最新情報を自動取得していません）。</div>';
  }

  root.FS = root.FS || {};
  root.FS.infui = { inf, today, newCandidate, candLabel, candNameHtml, factEditor, readFact, factView, feeView, fmtNum, scoreView, linkFor, ensureLink, statusSelect, changeStatus, pushHistory, describeFact, prNotice };
})(self);
