/* 画面：Google投稿作成（投稿作成／投稿案一覧・詳細／店舗情報・ブランド・メニュー／CSV／Google仕様設定）
 * Googleビジネスプロフィールへの投稿は行わない。承認後に担当者がコピーして手動で投稿する。 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const F = root.FS.format;
  const G = root.FS.guard;
  const GP = root.FS.gpost;
  const CSV = root.FS.csv;
  const V = root.FS.views = root.FS.views || {};
  const esc = U.esc;

  function gp() { return S.get().gpost; }
  function spec() { return gp().spec; }
  function today() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function aiReady() { const a = S.get().settings.ai || {}; return !!(a.enabled && a.apiKey); }
  function brandById(id) { return gp().brands.find((b) => b.id === id) || null; }
  function postById(id) { return gp().posts.find((p) => p.id === id) || null; }
  function storeName(id) { const s = S.storeById(id); return s ? s.name : '（削除された店舗）'; }
  function postLabel(p) { return storeName(p.storeId) + '／' + (p.theme || 'テーマなし') + '／案' + p.setNo; }
  function lv(level) { return level === 'error' ? '<span class="badge danger">エラー</span>' : level === 'warn' ? '<span class="badge warn">注意</span>' : '<span class="badge gray">参考</span>'; }
  function providerBadge(p) { return p.provider === 'ai' ? '<span class="badge client">AI生成</span>' : '<span class="badge warn">デモ生成（テンプレート）</span>'; }
  function filledCount(info) { return GP.STORE_FIELDS.filter((f) => String(info[f[0]] || '').trim()).length; }

  // 作業中の店舗（取り違え防止のため常に表示）
  function storesBanner(ids, extra) {
    const list = ids.map((id) => S.storeById(id)).filter(Boolean);
    if (!list.length) return '<div class="target none"><div class="grow"><div class="tname">店舗が未選択です</div><div class="tsub">下の「店舗を選ぶ」で、投稿を作る店舗を選んでください。</div></div></div>';
    const kind = list[0].kind;
    return '<div class="target ' + (kind === 'own' ? 'own' : 'client') + '" id="gpTarget"><div class="grow"><div class="tsub">作業中の店舗' + (list.length > 1 ? '（' + list.length + '店舗に一括生成。生成は1店舗ずつ、その店舗の情報だけで行います）' : '') + '</div>' +
      '<div class="tname">' + list.map((s) => esc(s.name) + ' ' + U.kindBadge(s.kind)).join('<span class="muted">　／　</span>') + '</div>' + (extra ? '<div class="tsub">' + extra + '</div>' : '') + '</div></div>';
  }

  // ───── 自動チェック（表示のたびに、現在の仕様値・他店舗の登録情報で再計算） ─────
  function validatePost(p, siblings) {
    const st = S.get();
    return GP.validateSet(p, p.ctx, spec(), { otherMarkers: GP.otherStoreMarkers(st, p.ctx), siblings: siblings || [] });
  }
  function recheck(p) { p.checks = validatePost(p, gp().posts.filter((x) => x.batchId === p.batchId && x.storeId === p.storeId)); return p.checks; }

  // 担当者向け確認欄（投稿本文とは別。コピーには含めない）
  function reviewHtml(p) {
    const v = p.checks;
    const c = p.ctx;
    const sp = spec();
    const store = S.storeById(p.storeId);
    const po = c.post;
    const ref = [];
    if (po.mainItem) ref.push('主役メニュー：' + po.mainItem + (po.mainItemRegistered ? '（登録メニュー）' : '（未登録）'));
    if (po.price) ref.push('価格：' + po.price);
    if (po.salesPeriod) ref.push('販売期間：' + po.salesPeriod);
    if (po.eventDate) ref.push('開催日：' + po.eventDate);
    ['アクセス', '施設名・階数', '住所', '営業時間', '定休日', '駐車場'].forEach((k) => { if (c.store.facts[k]) ref.push(k + '：' + c.store.facts[k]); });
    if (po.cta) ref.push('CTA：' + po.cta.label + (po.cta.url ? '（' + po.cta.url + '）' : ''));
    const notes = (c.confirmations || []).concat(p.reviewerNotes || []);
    const seasonDetected = Array.from(new Set((v.seasonHits || []).map((h) => h.word)));
    return '<details class="gp-review" open><summary><b>担当者向け確認</b>（投稿本文ではありません。コピーには含まれません）' + (v.errorCount ? ' <span class="badge danger">エラー ' + v.errorCount + '件</span>' : ' <span class="badge ok">エラーなし</span>') + '</summary>' +
      '<table class="tbl small"><tbody>' +
      '<tr><th>使用した店舗</th><td>' + esc(store ? store.name : c.store.name) + '（' + G.kindLabel(c.store.kind) + '）<span class="muted">　店舗ID：' + esc(p.storeId) + '</span>' + (c.brand.name ? '<br>ブランド：' + esc(c.brand.name) : '') + '<br>文章トーン：' + esc(c.tone || '指定なし') + (c.toneSource ? '（' + c.toneSource + '）' : '') + '</td></tr>' +
      '<tr><th>参照した商品・価格・アクセス</th><td>' + (ref.length ? ref.map(esc).join('<br>') : '<span class="muted">なし</span>') + '</td></tr>' +
      (p.usedFacts && p.usedFacts.length ? '<tr><th>本文に使った登録情報</th><td>' + p.usedFacts.map(esc).join('<br>') + '</td></tr>' : '') +
      '<tr><th>参考にした過去投稿</th><td>' + ((c.pastPosts || []).length ? (c.pastPosts || []).length + '件（この店舗の過去投稿。文章の雰囲気の参考のみ）' : 'なし') + '</td></tr>' +
      '<tr><th>季節表現</th><td>' + (c.season.use ? '使う：' + esc(c.season.label) : '使わない') + '<br>本文で見つかった季節語：' + (seasonDetected.length ? esc(seasonDetected.join('、')) : 'なし') + '</td></tr>' +
      '<tr><th>文字数</th><td>キャッチコピー ' + v.counts.catchcopy + ' 字（目安 ' + sp.writingGuide.catchcopyMaxChars + ' 字）／日本語 ' + v.counts.ja + ' 字（目安 ' + sp.writingGuide.jaRecommendedMin + '〜' + sp.writingGuide.jaRecommendedMax + ' 字）／英語 ' + v.counts.en + ' 字</td></tr>' +
      '<tr><th>Google仕様との照合</th><td>' + (v.googleSpec.ok ? '<span class="badge ok">上限内</span>' : '<span class="badge danger">上限超過</span>') + ' 本文上限 ' + v.counts.maxChars + ' 字（日本語・英語それぞれ）<br><span class="muted">仕様値の確認日 ' + esc(sp.verifiedAt) + '</span>' + (sp.needsReverification ? ' <span class="badge warn">仕様値は要再確認</span>' : '') + '</td></tr>' +
      ((c.conflicts || []).length ? '<tr><th>食い違いの選択</th><td>' + c.conflicts.map((x) => esc(x.label) + '：' + (x.chosen === 'store' ? '登録情報「' + esc(x.store) + '」' : '投稿入力「' + esc(x.input) + '」') + 'を使用').join('<br>') + '</td></tr>' : '') +
      '</tbody></table>' +
      '<h3>自動チェック</h3>' + (v.checks.length ? '<ul class="gp-checks">' + v.checks.map((x) => '<li>' + lv(x.level) + ' ' + esc(x.message) + '</li>').join('') + '</ul>' : '<p class="small">確認が必要な箇所は見つかりませんでした（最終確認は必ず目視で行ってください）。</p>') +
      '<h3>確認事項・不足情報</h3>' + (notes.length ? '<ul class="small">' + notes.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<p class="small muted">ありません。</p>') +
      '</details>';
  }

  // 1セット（画像用キャッチコピー・日本語投稿文・英語投稿文）の表示と編集
  function cardHtml(p, opts) {
    opts = opts || {};
    const locked = U.isLocked(p);
    const canCopy = p.status === 'approved' || p.status === 'done';
    const ta = (cls, val, rows) => '<textarea class="' + cls + '" rows="' + rows + '"' + (locked ? ' readonly' : '') + '>' + esc(val) + '</textarea>';
    return '<div class="gp-card" data-post="' + p.id + '">' +
      '<div class="gp-head"><b>【' + esc(storeName(p.storeId)) + '】</b> <b>案' + p.setNo + '</b> ' + U.statusBadge(p.status) + ' ' + providerBadge(p) + (p.angle ? ' <span class="chip">切り口：' + esc(p.angle) + '</span>' : '') + (p.duplicatedFrom ? ' <span class="chip">複製</span>' : '') + '</div>' +
      '<div class="lbl">画像用キャッチコピー：</div>' + ta('gp-copy', p.catchcopy, 2) +
      '<div class="lbl">日本語投稿文：</div>' + ta('gp-ja', p.bodyJa, 14) +
      '<div class="gp-sep">ーーーーーー</div>' +
      '<div class="lbl">English:</div>' + ta('gp-en', p.bodyEn, 8) +
      '<div class="small muted gp-count"></div>' +
      '<div class="btns" style="margin-top:8px">' +
      (locked ? '' : '<button class="btn primary small" data-act="save">保存（再チェック）</button>') +
      '<button class="btn small" data-act="dup">複製</button>' +
      (opts.open ? '<a class="btn small" href="#/gpost/p/' + p.id + '">開いて確認・承認</a>' : '') +
      '<span class="muted small" style="margin-left:6px">コピー' + (canCopy ? '' : '（承認後に使えます）') + '：</span>' +
      [['copy', 'キャッチコピーのみ'], ['ja', '日本語のみ'], ['en', '英語のみ'], ['all', '1セットまとめて']].map((k) => '<button class="btn small" data-copy="' + k[0] + '"' + (canCopy ? '' : ' disabled title="承認済みにするとコピーできます"') + '>' + k[1] + '</button>').join('') +
      '</div>' + reviewHtml(p) + '</div>';
  }

  function bindCard(el, p, rerender) {
    const counts = () => {
      const sp = spec();
      const n = (cls) => GP.countChars(U.$(cls, el).value);
      U.$('.gp-count', el).textContent = 'キャッチコピー ' + n('.gp-copy') + ' 字／日本語 ' + n('.gp-ja') + ' 字／英語 ' + n('.gp-en') + ' 字（Google上限 ' + sp.postBody.maxChars + ' 字）';
    };
    counts();
    U.$$('textarea', el).forEach((t) => t.addEventListener('input', counts));
    const save = U.$('[data-act=save]', el);
    if (save) save.addEventListener('click', () => {
      const next = { catchcopy: U.$('.gp-copy', el).value.trim(), bodyJa: U.$('.gp-ja', el).value.trim(), bodyEn: U.$('.gp-en', el).value.trim() };
      if (!next.catchcopy || !next.bodyJa || !next.bodyEn) { U.toast('キャッチコピー・日本語・英語は3つで1セットです。空欄にはできません', 'error'); return; }
      const changed = [['catchcopy', '画像用キャッチコピー'], ['bodyJa', '日本語投稿文'], ['bodyEn', '英語投稿文']].filter((k) => p[k[0]] !== next[k[0]]).map((k) => k[1]);
      Object.assign(p, next);
      p.updatedAt = Date.now();
      p.updatedBy = S.user();
      const v = recheck(p);
      S.log('Google投稿案を編集・保存しました', { type: 'gpost', id: p.id, label: postLabel(p) }, (changed.length ? '変更：' + changed.join('・') : '変更なし') + '／再チェック：エラー' + v.errorCount + '件', p);
      S.save(true);
      U.toast('保存しました（エラー ' + v.errorCount + '件）', v.errorCount ? 'error' : 'ok');
      rerender();
    });
    U.$('[data-act=dup]', el).addEventListener('click', () => {
      const c = duplicate(p);
      U.toast('複製しました（下書き）', 'ok');
      location.hash = '#/gpost/p/' + c.id;
    });
    U.$$('[data-copy]', el).forEach((b) => b.addEventListener('click', () => copyPost(p, b.dataset.copy)));
  }

  function duplicate(p) {
    const c = JSON.parse(JSON.stringify(p));
    Object.assign(c, { id: S.uid('gp'), status: 'draft', duplicatedFrom: p.id, createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(), approvedBy: null, approvedAt: null, doneAt: null, history: [] });
    recheck(c);
    gp().posts.push(c);
    S.log('Google投稿案を複製しました', { type: 'gpost', id: c.id, label: postLabel(c) }, '複製元：' + p.id, c);
    S.save(true);
    return c;
  }

  const COPY_LABEL = { copy: '画像用キャッチコピー', ja: '日本語投稿文', en: '英語投稿文', all: '1セットまとめて' };
  async function copyPost(p, kind) {
    if (!(p.status === 'approved' || p.status === 'done')) { U.toast('承認済みの投稿案だけコピーできます', 'error'); return; }
    const text = GP.copyText(kind, storeName(p.storeId), p);
    const store = S.storeById(p.storeId);
    const ok = await U.modal({
      title: 'コピー：' + COPY_LABEL[kind],
      body: '<p>次の店舗の投稿文をコピーします。このアプリからGoogleへは投稿しません。Googleビジネスプロフィールの管理画面で、<b>店舗が合っているか確認してから</b>貼り付けてください。</p>' +
        '<div class="confirm-target badge ' + (store && store.kind === 'own' ? 'own' : 'client') + '" style="display:block">' + esc(storeName(p.storeId)) + (store ? '（' + G.kindLabel(store.kind) + '）' : '') + '</div>' +
        '<div class="pre" style="max-height:220px;overflow:auto">' + esc(text) + '</div>',
      check: '投稿先の店舗と、文面の店舗名が一致していることを確認しました',
      confirmLabel: 'コピーする',
    });
    if (!ok) return;
    const copied = await U.copyText(text);
    U.toast(copied ? 'コピーしました' : 'コピーできませんでした。文面を選択してコピーしてください。', copied ? 'ok' : 'error');
    if (copied) { S.log('Google投稿案をコピーしました', { type: 'gpost', id: p.id, label: postLabel(p) }, COPY_LABEL[kind], p); S.save(true); }
  }

  // ───────── 投稿作成 ─────────
  const draft = { storeIds: [], common: { setCount: 1, useSeason: true, postDate: '' }, perStore: {}, images: [], mode: null, q: '' };
  let lastBatch = null;

  function readForm(main) {
    U.$$('[data-c]', main).forEach((el) => {
      const k = el.dataset.c;
      if (el.type === 'checkbox') draft.common[k] = el.checked;
      else if (el.type === 'radio') { if (el.checked) draft.common[k] = Number(el.value); }
      else draft.common[k] = el.value.trim();
    });
    U.$$('[data-ps]', main).forEach((el) => {
      const [id, k] = el.dataset.ps.split('|');
      draft.perStore[id] = draft.perStore[id] || {};
      draft.perStore[id][k] = el.value.trim();
    });
    const m = U.$('#gMode', main);
    if (m) draft.mode = m.value;
  }

  function create(main, params) {
    const st = S.get();
    // 「この店舗の投稿を作成」から開いた場合は、その店舗を選んだ状態にする
    const pre = params && params.get && params.get('store');
    if (pre && S.storeById(pre)) draft.storeIds = [pre];
    const sp = spec();
    // 生成方法：担当者が選んでいなければ、AIが使えるときはAI生成、使えないときはデモ生成
    if (!draft.modeChosen || (draft.mode === 'ai' && !aiReady())) draft.mode = aiReady() ? 'ai' : 'demo';
    draft.storeIds = draft.storeIds.filter((id) => S.storeById(id));
    const q = draft.q;
    const stores = st.stores.filter((s) => !q || s.name.includes(q) || (s.aliases || []).some((a) => a.includes(q)))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'own' ? -1 : 1));
    const c = draft.common;
    const inp = (k, label, ph, type) => '<div class="field" style="flex:1 1 220px"><label>' + esc(label) + '</label><input type="' + (type || 'text') + '" data-c="' + k + '" value="' + esc(c[k] || '') + '" placeholder="' + esc(ph || '') + '"></div>';
    const firstStore = draft.storeIds.length === 1 ? GP.storeInfo(S.storeById(draft.storeIds[0])) : null;
    const menuNames = firstStore ? firstStore.menu.map((m) => m.name) : [];

    main.innerHTML = '<h1>Google投稿作成</h1><p class="lead">登録済みの店舗情報から、Googleビジネスプロフィール投稿用の「画像用キャッチコピー・日本語投稿文・英語投稿文」をセットで作ります。Googleへの投稿は行いません（承認後にコピーして手動で投稿します）。</p>' +
      storesBanner(draft.storeIds) +
      (draft.mode === 'demo' ? '<div class="alert warn" id="demoNotice"><b>デモ生成（テンプレート）</b>で動作しています。外部と通信せず、登録情報を定型文に差し込むだけの動作確認用です（文章の質はAI生成に及びません）。' + (aiReady() ? '' : 'AI生成を使うには「設定」でAPIキーを登録し、AIを有効にしてください。') + '</div>' : '') +
      '<div class="panel"><h2>1. 店舗を選ぶ</h2><p class="small muted">複数選ぶと一括生成します。自社店舗と顧客案件は同時に選べません。顧客案件は同じブランドの店舗だけ同時に選べます。</p>' +
      '<div class="field"><input type="search" id="gq" placeholder="店舗名で検索" value="' + esc(q) + '"></div>' +
      '<div class="gp-stores">' + (stores.length ? stores.map((s) => {
        const info = GP.storeInfo(s);
        const b = brandById(info.brandId);
        return '<label class="gp-store"><input type="checkbox" data-store="' + s.id + '"' + (draft.storeIds.includes(s.id) ? ' checked' : '') + '> ' + U.kindBadge(s.kind) + ' <b>' + esc(s.name) + '</b> <span class="small muted">' + (b ? 'ブランド：' + esc(b.name) + '・' : '') + '登録 ' + filledCount(info) + '/' + GP.STORE_FIELDS.length + '項目・メニュー' + info.menu.length + '件</span> <a class="small" href="#/gpost/store/' + s.id + '">店舗情報</a></label>';
      }).join('') : '<div class="empty">該当する店舗がありません。「店舗・案件」で登録してください。</div>') + '</div></div>' +

      '<div class="panel"><h2>2. 投稿内容' + (draft.storeIds.length > 1 ? '（全店舗共通のキャンペーン情報）' : '') + '</h2><div class="row">' +
      inp('purpose', '投稿目的', '例：新メニューの告知、来店促進') + inp('theme', 'テーマ', '例：秋の限定メニュー') +
      '</div><div class="row">' + inp('mainItem', '主役メニュー', menuNames.length ? '登録メニュー：' + menuNames.slice(0, 3).join('、') : '登録メニュー名と同じにすると価格を照合します') + inp('features', '伝えたい特徴', '例：魚介をたっぷり使用') +
      '</div><div class="row">' + inp('price', '価格', '例：1,980円（税込）') + inp('salesPeriod', '販売期間', '例：2026年10月1日〜11月30日') + inp('eventDate', '開催日', '例：2026年10月31日') +
      '</div><div class="row"><div class="field" style="flex:1 1 200px"><label>CTA（ボタン）</label><select data-c="cta"><option value="">（なし）</option>' + sp.ctaTypes.map((t) => '<option value="' + esc(t.code) + '"' + (c.cta === t.code ? ' selected' : '') + '>' + esc(t.ja) + '</option>').join('') + '</select></div>' +
      inp('ctaUrl', 'CTAのURL', '空欄なら店舗に登録したURLを使います') + inp('tone', '文章トーン', '空欄なら 店舗 → ブランド の設定を使います') +
      '</div><div class="row">' + inp('postDate', '投稿予定日', '', 'date') +
      '<div class="field" style="flex:1 1 220px"><label>季節表現</label><label style="font-weight:400"><input type="checkbox" data-c="useSeason"' + (c.useSeason !== false ? ' checked' : '') + '> 投稿予定日に合わせて季節表現を使う</label></div>' +
      '<div class="field" style="flex:1 1 220px"><label>案の数</label><label style="font-weight:400;margin-right:12px"><input type="radio" name="setCount" data-c="setCount" value="1"' + (Number(c.setCount) !== 3 ? ' checked' : '') + '> 1案</label><label style="font-weight:400"><input type="radio" name="setCount" data-c="setCount" value="3"' + (Number(c.setCount) === 3 ? ' checked' : '') + '> 3案（切り口を変える）</label></div>' +
      '</div>' +
      '<div class="field"><label>画像（任意。AI生成のときだけ送信し、保存しません。ファイル名のみ記録）</label><input type="file" id="gImg" accept="image/png,image/jpeg,image/webp" multiple>' +
      (draft.images.length ? '<div class="small">' + draft.images.map((i) => esc(i.name) + '（' + Math.round(i.size / 1024) + 'KB）' + imageWarn(i)).join('<br>') + ' <button class="btn small" id="gImgClear">画像を外す</button></div>' : '') + '</div></div>' +

      (draft.storeIds.length > 1 ? '<div class="panel"><h2>3. 店舗ごとの情報</h2><p class="small muted">店舗ごとに違う内容だけ入力します。空欄の項目は上の共通の情報を使います。住所・営業時間・予約URLは各店舗の登録情報から取ります。</p><div class="table-wrap"><table class="tbl"><thead><tr><th>店舗</th>' + GP.PER_STORE_FIELDS.map((f) => '<th>' + esc(f[1]) + '</th>').join('') + '</tr></thead><tbody>' +
        draft.storeIds.map((id) => '<tr><td class="nowrap"><b>' + esc(storeName(id)) + '</b></td>' + GP.PER_STORE_FIELDS.map((f) => '<td><input type="text" data-ps="' + id + '|' + f[0] + '" value="' + esc(((draft.perStore[id] || {})[f[0]]) || '') + '" style="min-width:120px"></td>').join('') + '</tr>').join('') +
        '</tbody></table></div></div>' : '') +

      '<div class="panel"><h2>' + (draft.storeIds.length > 1 ? '4' : '3') + '. 生成</h2><div class="row"><div class="field" style="flex:0 1 320px"><label>生成方法</label><select id="gMode">' +
      (aiReady() ? '<option value="ai"' + (draft.mode === 'ai' ? ' selected' : '') + '>AI生成（Claude・外部送信あり）</option>' : '') +
      '<option value="demo"' + (draft.mode === 'demo' ? ' selected' : '') + '>デモ生成（テンプレート・外部送信なし）</option></select></div>' +
      '<div class="field" style="flex:0 0 auto"><button class="btn primary" id="gGen">確認して生成</button></div></div>' +
      '<p class="small muted">生成前に、投稿入力と登録情報の食い違い・不足情報を確認する画面が出ます。</p></div>' +
      '<div id="gResults"></div>';

    const rerender = () => { readForm(main); create(main); };
    U.$('#gq', main).addEventListener('input', (e) => { readForm(main); draft.q = e.target.value; create(main); const v = U.$('#gq', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$$('[data-store]', main).forEach((cb) => cb.addEventListener('change', () => {
      readForm(main);
      const id = cb.dataset.store;
      draft.storeIds = cb.checked ? draft.storeIds.concat([id]) : draft.storeIds.filter((x) => x !== id);
      const errs = GP.checkBatch(st, draft.storeIds).filter((e) => !/選択してください/.test(e));
      if (cb.checked && errs.length) { draft.storeIds = draft.storeIds.filter((x) => x !== id); U.toast(errs[0], 'error'); }
      create(main);
    }));
    U.$('#gMode', main).addEventListener('change', () => { draft.modeChosen = true; rerender(); });
    U.$('#gImg', main).addEventListener('change', async (e) => {
      readForm(main);
      for (const f of Array.from(e.target.files)) {
        const dataUrl = await new Promise((res) => { const r = new FileReader(); r.onload = () => res(r.result); r.readAsDataURL(f); });
        const dim = await new Promise((res) => { const im = new Image(); im.onload = () => res({ w: im.naturalWidth, h: im.naturalHeight }); im.onerror = () => res({ w: 0, h: 0 }); im.src = dataUrl; });
        draft.images.push({ name: f.name, size: f.size, type: f.type, dataUrl, width: dim.w, height: dim.h });
      }
      create(main);
    });
    const clr = U.$('#gImgClear', main);
    if (clr) clr.addEventListener('click', () => { readForm(main); draft.images = []; create(main); });
    U.$('#gGen', main).addEventListener('click', () => { readForm(main); runGenerate(main); });
    if (lastBatch) renderResults(U.$('#gResults', main), lastBatch, () => create(main));
  }

  // 画像のGoogle仕様（設定値）との照合。参考表示のみ。
  function imageWarn(i) {
    const im = spec().image || {};
    const w = [];
    const fmt = (i.type || '').replace('image/', '').toUpperCase().replace('JPEG', 'JPG');
    if (im.formats && im.formats.length && !im.formats.includes(fmt)) w.push('形式が ' + im.formats.join('/') + ' 以外');
    if (im.minBytes && i.size < im.minBytes) w.push('ファイルが小さすぎます');
    if (im.maxBytes && i.size > im.maxBytes) w.push('ファイルが大きすぎます');
    if (im.minWidth && i.width && (i.width < im.minWidth || i.height < im.minHeight)) w.push(im.minWidth + '×' + im.minHeight + 'px未満');
    return w.length ? ' <span class="badge warn">Google仕様（設定値）：' + esc(w.join('・')) + '</span>' : '';
  }

  async function runGenerate(main) {
    const st = S.get();
    const sp = spec();
    const c = draft.common;
    const errs = GP.checkBatch(st, draft.storeIds);
    if (errs.length) { U.toast(errs[0], 'error'); return; }
    if (!String(c.theme || '').trim() && !String(c.mainItem || '').trim() && !draft.storeIds.some((id) => ((draft.perStore[id] || {}).mainItem || '').trim())) { U.toast('テーマか主役メニューを入力してください', 'error'); return; }
    const mode = draft.mode === 'ai' && aiReady() ? 'ai' : 'demo';
    const input = { storeIds: draft.storeIds.slice(), common: Object.assign({}, c, { images: draft.images.map((i) => ({ name: i.name })) }), perStore: JSON.parse(JSON.stringify(draft.perStore)), resolutions: {} };
    const pre = GP.preflight(st, sp, input, today());

    const body = pre.map((x) => '<div class="panel" style="padding:12px" data-pre="' + x.storeId + '"><h3 style="margin:0 0 6px">【' + esc(x.storeName) + '】 ' + U.kindBadge(x.kind) + '</h3>' +
      (x.conflicts.length ? '<div class="alert danger small"><b>投稿入力と登録情報が違います。どちらを使うか選んでください（選ぶまで生成できません）。</b></div><table class="tbl small"><thead><tr><th>項目</th><th>投稿入力</th><th>登録情報</th></tr></thead><tbody>' +
        x.conflicts.map((cf) => '<tr><td>' + esc(cf.label) + '</td><td><label><input type="radio" name="r|' + x.storeId + '|' + cf.field + '" value="input"> ' + esc(cf.input) + '</label></td><td><label><input type="radio" name="r|' + x.storeId + '|' + cf.field + '" value="store"> ' + esc(cf.store) + '</label></td></tr>').join('') + '</tbody></table>' : '') +
      '<div class="small"><b>確認事項・不足情報（推測で補わず、確認欄に表示します）</b>' + (x.confirmations.length ? '<ul>' + x.confirmations.map((n) => '<li>' + esc(n) + '</li>').join('') + '</ul>' : '<p class="muted">ありません。</p>') + '</div>' +
      '<div class="small muted">文章トーン：' + esc(x.ctx.tone || '指定なし（丁寧で親しみやすい）') + (x.toneSource ? '（' + x.toneSource + '）' : '') + '／季節表現：' + (x.ctx.season.use ? esc(x.ctx.season.label) : '使わない') + '／案の数：' + x.ctx.setCount + '／参考にする過去投稿：' + (x.ctx.pastPosts || []).length + '件</div></div>').join('');

    const res = await U.modal({
      title: '生成前の確認（' + pre.length + '店舗）',
      body: (mode === 'ai'
        ? '<div class="alert warn small"><b>外部送信あり：</b>「この内容で生成する」を押すと、店舗ごとに、その店舗の登録情報・投稿入力' + (draft.images.length ? '・添付画像' + draft.images.length + '枚' : '') + 'を Anthropic API（Claude）へ送信します。他店舗の情報は送りません。個人情報・ログイン情報が含まれていないか確認してください。Googleへは投稿しません。</div>'
        : '<div class="alert warn small"><b>デモ生成（テンプレート）</b>：外部と通信せず、登録情報を定型文に差し込みます。</div>') + body,
      check: mode === 'ai' ? '確認事項を確認し、送信して問題ない内容であることを確認しました' : '確認事項を確認しました',
      confirmLabel: 'この内容で生成する',
      onOpen: (bg) => {
        const ok = bg.querySelector('[data-act=ok]');
        const chk = bg.querySelector('#mdl-check');
        const radios = Array.from(bg.querySelectorAll('input[type=radio]'));
        const names = Array.from(new Set(radios.map((r) => r.name)));
        const update = () => { ok.disabled = !(chk.checked && names.every((n) => bg.querySelector('input[name="' + n + '"]:checked'))); };
        radios.forEach((r) => r.addEventListener('change', update));
        chk.addEventListener('change', update);
        update();
      },
      collect: (bg) => {
        const r = {};
        Array.from(bg.querySelectorAll('input[type=radio]:checked')).forEach((el) => { const [, id, f] = el.name.split('|'); r[id] = r[id] || {}; r[id][f] = el.value; });
        return { resolutions: r };
      },
    });
    if (!res) return;
    input.resolutions = res.resolutions;
    const btn = U.$('#gGen', main);
    btn.disabled = true;
    btn.textContent = mode === 'ai' ? 'AIで生成しています…' : '生成しています…';
    try {
      lastBatch = await generate(input, mode, mode === 'ai' ? draft.images : []);
      U.toast(lastBatch.posts.length + '件の投稿案を作成しました（下書き）', 'ok');
    } catch (e) {
      U.toast('生成できませんでした：' + e.message, 'error');
    }
    create(main);
    const r = U.$('#gResults', main);
    if (r && lastBatch) r.scrollIntoView();
  }

  // 生成本体。店舗ごとに、その店舗の情報だけで事実シートを作って生成し、自動チェックして下書き保存する。
  async function generate(input, mode, images) {
    const st = S.get();
    const sp = spec();
    const errs = GP.checkBatch(st, input.storeIds);
    if (errs.length) throw new Error(errs[0]);
    const pre = GP.preflight(st, sp, input, today());
    const pending = pre.filter((x) => x.unresolved.length);
    if (pending.length) throw new Error(pending[0].storeName + '：投稿入力と登録情報が違う項目（' + pending[0].unresolved.map((x) => x.label).join('、') + '）のどちらを使うか選んでください');
    const batchId = S.uid('batch');
    const out = { batchId, mode, stores: [], posts: [], errors: [] };
    for (const x of pre) {
      const ctx = x.ctx; // この店舗の登録情報と投稿入力だけで作った事実シート
      let sets;
      try {
        sets = mode === 'ai' ? await root.FS.ai.generateGooglePosts(ctx, images) : GP.demoGenerate(ctx);
      } catch (e) { out.errors.push(x.storeName + '：' + e.message); continue; }
      if (!sets.length) { out.errors.push(x.storeName + '：生成結果が空でした'); continue; }
      const markers = GP.otherStoreMarkers(st, ctx);
      const req = Object.assign({}, x.req, { images: (x.req.images || []).map((i) => ({ name: i.name })) });
      const posts = sets.map((s, i) => ({
        id: S.uid('gp'), storeId: x.storeId, batchId, setNo: i + 1, theme: ctx.post.theme || ctx.post.mainItem || '', purpose: ctx.post.purpose || '',
        provider: mode, model: mode === 'ai' ? root.FS.ai.MODEL : 'demo-template', request: req, ctx,
        catchcopy: s.catchcopy, bodyJa: s.bodyJa, bodyEn: s.bodyEn, angle: s.angle, seasonExpressions: s.seasonExpressions, usedFacts: s.usedFacts, reviewerNotes: s.reviewerNotes,
        status: 'draft', createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(), history: [],
      }));
      posts.forEach((p) => {
        p.checks = GP.validateSet(p, ctx, sp, { otherMarkers: markers, siblings: posts });
        gp().posts.push(p);
        S.log('Google投稿案を生成しました', { type: 'gpost', id: p.id, label: postLabel(p) }, (mode === 'ai' ? 'AI生成' : 'デモ生成') + '／自動チェック：エラー' + p.checks.errorCount + '件', p);
      });
      out.stores.push({ storeId: x.storeId, postIds: posts.map((p) => p.id) });
      out.posts.push.apply(out.posts, posts.map((p) => p.id));
    }
    S.save(true);
    if (!out.posts.length && out.errors.length) throw new Error(out.errors.join(' ／ '));
    return out;
  }

  function renderResults(el, batch, rerender) {
    if (!el) return;
    const blocks = batch.stores.map((s) => {
      const posts = s.postIds.map(postById).filter(Boolean);
      return '<div class="panel gp-result" data-result-store="' + s.storeId + '"><h2>【' + esc(storeName(s.storeId)) + '】 ' + (S.storeById(s.storeId) ? U.kindBadge(S.storeById(s.storeId).kind) : '') + '</h2>' + posts.map((p) => cardHtml(p, { open: true })).join('') + '</div>';
    }).join('');
    el.innerHTML = '<h2>生成結果' + (batch.mode === 'demo' ? ' <span class="badge warn">デモ生成（テンプレート）</span>' : '') + '</h2>' +
      (batch.errors.length ? '<div class="alert danger small">' + batch.errors.map(esc).join('<br>') + '</div>' : '') +
      '<p class="small muted">各案は下書きとして保存されました。内容を確認・編集して保存し、「開いて確認・承認」から承認するとコピーできます。</p>' + blocks;
    U.$$('.gp-card', el).forEach((card) => bindCard(card, postById(card.dataset.post), rerender));
  }

  // ───────── 投稿案一覧 ─────────
  function list(main) {
    const st = S.get();
    let f = {};
    try { f = JSON.parse(sessionStorage.getItem('gp-filter') || '{}'); } catch (e) { f = {}; }
    const rows = GP.filterPosts(gp().posts, st.stores, f);
    const storeIds = Array.from(new Set(gp().posts.map((p) => p.storeId)));
    main.innerHTML = '<h1>Google投稿案一覧</h1><p class="lead">生成した投稿案（キャッチコピー・日本語・英語のセット）を、店舗・テーマ・作成日・状態で検索できます。</p>' +
      '<div class="panel"><div class="row">' +
      '<div class="field"><label>店舗</label><select data-f="storeId"><option value="">すべて</option>' + storeIds.map((id) => '<option value="' + id + '"' + (f.storeId === id ? ' selected' : '') + '>' + esc(storeName(id)) + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>テーマ</label><input type="text" data-f="theme" value="' + esc(f.theme || '') + '"></div>' +
      '<div class="field"><label>作成日（から）</label><input type="date" data-f="from" value="' + esc(f.from || '') + '"></div>' +
      '<div class="field"><label>作成日（まで）</label><input type="date" data-f="to" value="' + esc(f.to || '') + '"></div>' +
      '<div class="field"><label>状態</label><select data-f="status"><option value="">すべて</option>' + Object.keys(GP.STATUS_LABEL).map((k) => '<option value="' + k + '"' + (f.status === k ? ' selected' : '') + '>' + GP.STATUS_LABEL[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>キーワード</label><input type="search" data-f="q" value="' + esc(f.q || '') + '"></div>' +
      '</div><div class="btns"><a class="btn primary" href="#/gpost">＋ 投稿を作成</a><button class="btn" id="gpCsv">CSVで書き出す</button><button class="btn" id="gpClear">条件をクリア</button></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl" id="gpList"><thead><tr><th>作成日</th><th>店舗</th><th>案</th><th>テーマ</th><th>画像用キャッチコピー</th><th>状態</th><th>確認</th><th>生成</th></tr></thead><tbody>' +
        rows.map((p) => {
          const s = S.storeById(p.storeId);
          const v = recheck(p);
          return '<tr class="clickable" data-id="' + p.id + '"><td class="nowrap small">' + F.fmtDateTime(p.createdAt) + '</td><td>' + (s ? U.kindBadge(s.kind) + ' ' : '') + esc(storeName(p.storeId)) + '</td><td>案' + p.setNo + '</td><td>' + esc(p.theme) + '</td><td>' + esc(p.catchcopy) + '</td><td>' + U.statusBadge(p.status) + '</td><td>' + (v.errorCount ? '<span class="badge danger">エラー' + v.errorCount + '</span>' : '<span class="badge ok">OK</span>') + '</td><td>' + providerBadge(p) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">該当する投稿案はありません。</div>');
    S.save();
    U.$$('[data-f]', main).forEach((el) => el.addEventListener('change', () => {
      U.$$('[data-f]', main).forEach((x) => { f[x.dataset.f] = x.value.trim(); });
      sessionStorage.setItem('gp-filter', JSON.stringify(f));
      list(main);
    }));
    U.$('#gpClear', main).addEventListener('click', () => { sessionStorage.removeItem('gp-filter'); list(main); });
    U.$('#gpCsv', main).addEventListener('click', () => {
      const c = GP.postsCsv(S.get());
      U.download('Google投稿案_' + today() + '.csv', CSV.stringify(c.head, c.rows), 'text/csv;charset=utf-8');
      S.log('Google投稿案をCSVで書き出しました', { type: 'gpost', id: '', label: 'Google投稿案' }, c.rows.length + '件');
    });
    U.$$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/gpost/p/' + tr.dataset.id; }));
  }

  // ───────── 投稿案の詳細（編集・承認） ─────────
  function detail(main, id) {
    const p = postById(id);
    if (!p) { main.innerHTML = '<div class="empty">投稿案が見つかりません。<a href="#/gpost/list">一覧へ</a></div>'; return; }
    recheck(p);
    S.save();
    const rerender = () => detail(main, id);
    main.innerHTML = '<div class="btns" style="margin-bottom:8px"><a class="btn small" href="#/gpost/list">← 投稿案一覧</a><a class="btn small" href="#/gpost">投稿作成へ</a></div>' +
      storesBanner([p.storeId], 'テーマ：' + esc(p.theme || '（なし）') + '　作成：' + F.fmtDateTime(p.createdAt) + '（' + esc(p.createdBy || '') + '）') +
      '<div class="sticky-actions" id="wf"></div>' + U.statusSteps(p.status) +
      (p.provider !== 'ai' ? '<div class="alert warn small" style="margin-top:10px">この投稿案は<b>デモ生成（テンプレート）</b>の文章です。公開前に、AI生成または手動で文章を整えてください。</div>' : '') +
      (U.isLocked(p) ? '<div class="alert small" style="margin-top:10px">承認済みのため編集できません。修正する場合は「修正する（下書きへ戻す）」を押してください。</div>' : '') +
      '<div style="margin-top:12px">' + cardHtml(p) + '</div>' +
      '<div class="panel"><h2>生成時の入力</h2><table class="tbl small"><tbody>' +
      GP.REQUEST_FIELDS.filter((f) => p.request && String(p.request[f[0]] || '').trim()).map((f) => '<tr><th>' + esc(f[1]) + '</th><td>' + esc(p.request[f[0]]) + '</td></tr>').join('') +
      '<tr><th>季節表現</th><td>' + (p.request && p.request.useSeason === false ? '使わない' : '使う') + '</td></tr><tr><th>生成方法</th><td>' + providerBadge(p) + ' ' + esc(p.model || '') + '</td></tr>' +
      (p.request && p.request.images && p.request.images.length ? '<tr><th>画像</th><td>' + p.request.images.map((i) => esc(i.name)).join('、') + '（保存していません）</td></tr>' : '') +
      '</tbody></table></div>' +
      '<div class="panel"><h2>履歴</h2>' + U.historyList(p) + '</div>';
    bindCard(U.$('.gp-card', main), p, rerender);
    U.workflow(U.$('#wf', main), p, {
      type: 'gpost',
      requireStore: true,
      hideCopy: true,
      getStore: () => S.storeById(p.storeId),
      getLabel: () => postLabel(p),
      getText: () => GP.fullSetText(storeName(p.storeId), p.setNo, p),
      getChecks: () => p.checks.checks.filter((c) => c.level !== 'info').map((c) => (c.level === 'error' ? '【エラー】' : '【注意】') + c.message).concat((p.ctx.confirmations || []).map((n) => '【確認事項】' + n)),
      beforeApprove: async () => {
        const v = recheck(p);
        if (!v.errorCount) return true;
        return U.modal({
          title: 'エラーが残っています',
          body: '<p>自動チェックのエラーが <b>' + v.errorCount + '件</b> 残っています。修正してから承認することをおすすめします。</p><ul class="gp-checks">' + v.checks.filter((c) => c.level === 'error').map((c) => '<li>' + lv('error') + ' ' + esc(c.message) + '</li>').join('') + '</ul>',
          check: 'エラーの内容を確認し、このまま承認に進む理由があることを確認しました',
          confirmLabel: 'このまま承認に進む',
          danger: true,
        });
      },
      doneLabel: '投稿済み・完了にする',
      doneText: 'Googleビジネスプロフィールへ担当者が手動で投稿したことを記録します（このアプリからは投稿しません）。',
      doneCheck: '承認済みの内容を、正しい店舗のGoogleビジネスプロフィールへ手動で投稿したことを確認しました',
      onChanged: rerender,
    });
  }

  // ───────── 店舗情報・ブランド・メニュー・CSV ─────────
  function storesView(main) {
    const st = S.get();
    const brands = gp().brands;
    const stores = st.stores.slice().sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'own' ? -1 : 1));
    const usage = (bid) => st.stores.filter((s) => GP.storeInfo(s).brandId === bid);
    main.innerHTML = '<h1>Google投稿用の店舗情報</h1><p class="lead">「店舗・案件」に登録した店舗ごとに、Google投稿で使う情報とメニューを登録します。ここに登録した情報だけが投稿文に使われます。</p>' +
      '<div class="panel"><h2>ブランド共通の情報</h2><p class="small muted">同じブランドの複数店舗で共有する情報です（業種・特徴・文章トーン・よく使う表現・避けたい表現・参考投稿・注意事項）。店舗の情報と違う場合は、店舗の情報を優先します。自社店舗と顧客案件で同じブランドは使えません。</p>' +
      (brands.length ? '<table class="tbl" id="brandList"><thead><tr><th>ブランド名</th><th>業種</th><th>文章トーン</th><th>使用店舗</th><th></th></tr></thead><tbody>' + brands.map((b) => '<tr><td><b>' + esc(b.name) + '</b></td><td>' + esc(b.industry) + '</td><td>' + esc(b.tone) + '</td><td class="small">' + (usage(b.id).map((s) => esc(s.name)).join('、') || '<span class="muted">なし</span>') + '</td><td class="right"><a class="btn small" href="#/gpost/brand/' + b.id + '">編集</a></td></tr>').join('') + '</tbody></table>' : '<div class="empty">ブランドは未登録です。</div>') +
      '<div class="btns" style="margin-top:10px"><a class="btn primary" href="#/gpost/brand/new" id="addBrand">＋ ブランドを追加</a></div></div>' +
      '<div class="panel"><h2>店舗ごとの情報</h2><table class="tbl" id="gStoreList"><thead><tr><th>店舗</th><th>ブランド</th><th>登録状況</th><th>確認日</th><th>未確認の候補</th><th></th></tr></thead><tbody>' +
      stores.map((s) => {
        const info = GP.storeInfo(s);
        const b = brandById(info.brandId);
        const old = info.verifiedAt && (new Date(today()) - new Date(info.verifiedAt)) / 86400000 > 90;
        return '<tr><td>' + U.kindBadge(s.kind) + ' <b>' + esc(s.name) + '</b></td><td>' + (b ? esc(b.name) : '<span class="muted">未設定</span>') + '</td><td class="small">' + filledCount(info) + '/' + GP.STORE_FIELDS.length + '項目・メニュー' + info.menu.length + '件・CTA' + info.ctaOptions.length + '件</td><td class="small">' + (info.verifiedAt ? esc(info.verifiedAt) + (old ? ' <span class="badge warn">90日以上前</span>' : '') : '<span class="badge warn">未登録</span>') + '</td><td>' + (info.candidates.filter((c) => c.status === 'pending').length ? '<a class="badge warn" href="#/gpost/info/' + s.id + '">' + info.candidates.filter((c) => c.status === 'pending').length + '件</a>' : '<span class="muted small">なし</span>') + '</td><td class="right nowrap"><a class="btn small" href="#/gpost/info/' + s.id + '">情報の整理</a> <a class="btn small" href="#/gpost/store/' + s.id + '">編集</a></td></tr>';
      }).join('') + '</tbody></table><p class="small muted">店舗の追加・店舗名・区分の変更は「店舗・案件」画面で行います。</p></div>' +
      '<div class="panel"><h2>CSVで一括登録・出力</h2><p class="small">一度書き出したCSVの見出しのまま編集して取り込みます。ID が空欄の行は新規、ID がある行は更新です。<b>1行でもエラーがあれば、全件取り込みません。</b>登録は「ブランド → 店舗 → メニュー」の順に行ってください。CTAは「BOOK=https://…; LEARN_MORE=https://…」の形式です。</p>' +
      '<div class="btns"><button class="btn" data-exp="brands">ブランドCSV</button><button class="btn" data-exp="stores">店舗情報CSV</button><button class="btn" data-exp="menu">メニューCSV</button></div>' +
      '<div class="btns" style="margin-top:8px"><label class="btn">ブランドCSVを取り込む<input type="file" data-imp="brands" accept=".csv,.tsv,.txt" hidden></label><label class="btn">店舗情報CSVを取り込む<input type="file" data-imp="stores" accept=".csv,.tsv,.txt" hidden></label><label class="btn">メニューCSVを取り込む<input type="file" data-imp="menu" accept=".csv,.tsv,.txt" hidden></label></div></div>';

    const EXP = { brands: ['ブランド', GP.brandsCsv], stores: ['店舗情報', GP.storesCsv], menu: ['メニュー', GP.menuCsv] };
    U.$$('[data-exp]', main).forEach((b) => b.addEventListener('click', () => {
      const [label, fn] = EXP[b.dataset.exp];
      const c = fn(S.get());
      U.download('Google投稿_' + label + '_' + today() + '.csv', CSV.stringify(c.head, c.rows), 'text/csv;charset=utf-8');
      S.log('Google投稿の' + label + 'をCSVで書き出しました', { type: 'gstore', id: '', label: label }, c.rows.length + '件');
    }));
    U.$$('[data-imp]', main).forEach((inp) => inp.addEventListener('change', async (e) => {
      const file = e.target.files[0];
      e.target.value = '';
      if (!file) return;
      await importCsv(inp.dataset.imp, file.name, await file.text());
      storesView(main);
    }));
  }

  async function importCsv(kind, fileName, text) {
    const st = S.get();
    const rows = CSV.parse(text);
    const label = { brands: 'ブランド', stores: '店舗情報', menu: 'メニュー' }[kind];
    const plan = kind === 'brands' ? GP.planBrandImport(st, rows) : kind === 'stores' ? GP.planStoreImport(st, rows, spec(), G.OWN_STORE_NAMES) : GP.planMenuImport(st, rows);
    if (plan.errors.length) {
      await U.modal({ title: label + 'CSVを取り込めません', body: '<p>「' + esc(fileName) + '」にエラーがあるため、<b>1件も取り込んでいません</b>。修正してからもう一度取り込んでください。</p><ul class="small">' + plan.errors.slice(0, 30).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul>', confirmLabel: 'OK', hideCancel: true });
      return false;
    }
    if (!plan.ops.length) { U.toast('取り込む行がありません', 'error'); return false; }
    const nNew = plan.ops.filter((o) => o.type === 'new').length;
    const ok = await U.modal({
      title: label + 'CSVの取り込み',
      body: '<p>「' + esc(fileName) + '」から <b>新規 ' + nNew + '件・更新 ' + (plan.ops.length - nNew) + '件</b> を取り込みます。</p>' +
        (kind === 'stores' ? '<ul class="small">' + plan.ops.map((o) => '<li>' + (o.type === 'new' ? '<span class="badge warn">新規店舗</span> ' : '') + esc(o.name) + '（' + G.kindLabel(o.kind) + '）</li>').join('') + '</ul>' : ''),
      check: '取り込む内容（店舗名・区分）を確認しました',
      confirmLabel: '取り込む',
    });
    if (!ok) return false;
    const fn = kind === 'brands' ? GP.applyBrandImport : kind === 'stores' ? GP.applyStoreImport : GP.applyMenuImport;
    fn(st, plan, S.uid, Date.now());
    S.log(label + 'をCSVから取り込みました', { type: 'gstore', id: '', label }, fileName + '：新規' + nNew + '件・更新' + (plan.ops.length - nNew) + '件');
    S.save(true);
    U.toast('取り込みました', 'ok');
    return true;
  }

  function fieldInput(prefix, f, val) {
    const id = prefix + f[0];
    if (f[2] === 'area') return '<div class="field"><label for="' + id + '">' + esc(f[1]) + '</label><textarea id="' + id + '" data-k="' + f[0] + '" style="min-height:60px">' + esc(val) + '</textarea></div>';
    return '<div class="field"><label for="' + id + '">' + esc(f[1]) + '</label><input type="' + (f[2] === 'date' ? 'date' : 'text') + '" id="' + id + '" data-k="' + f[0] + '" value="' + esc(val) + '"></div>';
  }

  function storeEdit(main, id) {
    const st = S.get();
    const s = S.storeById(id);
    if (!s) { main.innerHTML = '<div class="empty">店舗が見つかりません。</div>'; return; }
    const info = GP.storeInfo(s);
    const sp = spec();
    const ctaRow = (o) => '<div class="row gp-cta"><div class="field" style="flex:0 1 180px"><select data-cta="type"><option value="">（種類）</option>' + sp.ctaTypes.map((t) => '<option value="' + esc(t.code) + '"' + (o.type === t.code ? ' selected' : '') + '>' + esc(t.ja) + '</option>').join('') + '</select></div><div class="field" style="flex:1 1 300px"><input type="text" data-cta="url" value="' + esc(o.url || '') + '" placeholder="https://（今すぐ電話は空欄）"></div></div>';
    main.innerHTML = '<div class="btns" style="margin-bottom:8px"><a class="btn small" href="#/gpost/stores">← 店舗情報一覧</a></div>' +
      storesBanner([s.id], '「Google投稿用の店舗情報」を編集しています') +
      '<div class="btns" style="margin-bottom:12px"><a class="btn" href="#/gpost/info/' + s.id + '">URL・過去投稿から情報を整理' + (info.candidates.filter((c) => c.status === 'pending').length ? '（未確認の候補 ' + info.candidates.filter((c) => c.status === 'pending').length + '件）' : '') + '</a><a class="btn primary" href="#/gpost?store=' + s.id + '">この店舗の投稿を作成</a></div>' +
      '<div class="panel"><h2>ブランド</h2><div class="field"><select id="gBrand"><option value="">（ブランド未設定）</option>' + gp().brands.map((b) => '<option value="' + b.id + '"' + (info.brandId === b.id ? ' selected' : '') + '>' + esc(b.name) + '</option>').join('') + '</select></div><a class="small" href="#/gpost/brand/new">＋ ブランドを追加</a></div>' +
      '<div class="panel"><h2>Google投稿用の店舗情報</h2><p class="small muted">分からない項目は空欄にしてください（推測で埋めない）。空欄の項目は投稿文に書かれず、確認事項に表示されます。</p><div class="grid2"><div>' +
      GP.STORE_FIELDS.slice(0, 11).map((f) => fieldInput('gs-', f, info[f[0]])).join('') + '</div><div>' + GP.STORE_FIELDS.slice(11).map((f) => fieldInput('gs-', f, info[f[0]])).join('') + '</div></div>' +
      '<h3>使用できるCTA（ボタン）とURL</h3><div id="ctaRows">' + (info.ctaOptions.length ? info.ctaOptions : [{}]).map(ctaRow).join('') + '</div><button class="btn small" id="ctaAdd">＋ CTAを追加</button>' +
      '<h3>店舗固有のトーン・注意事項・情報の確認</h3><div class="grid2"><div>' + GP.STORE_META_FIELDS.slice(0, 2).map((f) => fieldInput('gs-', f, info[f[0]])).join('') + '</div><div>' + GP.STORE_META_FIELDS.slice(2).map((f) => fieldInput('gs-', f, info[f[0]])).join('') + '</div></div>' +
      '<div class="btns"><button class="btn primary" id="gsSave">保存</button></div></div>' +
      '<div class="panel"><h2>メニュー・商品</h2>' + (info.menu.length ? '<table class="tbl" id="menuList"><thead><tr><th>名前</th><th>説明</th><th>価格</th><th>販売期間</th><th></th></tr></thead><tbody>' + info.menu.map((m) => '<tr><td><b>' + esc(m.name) + '</b></td><td class="small">' + esc(m.description) + '</td><td class="nowrap">' + esc(m.price) + '</td><td class="small">' + esc(m.period) + '</td><td class="right nowrap"><button class="btn small" data-medit="' + m.id + '">編集</button> <button class="btn small danger" data-mdel="' + m.id + '">削除</button></td></tr>').join('') + '</tbody></table>' : '<div class="empty">メニューは未登録です。</div>') +
      '<div class="btns" style="margin-top:10px"><button class="btn" id="menuAdd">＋ メニューを追加</button></div></div>';

    // 資料から採用した項目には出典を表示する
    Object.keys(info.fieldSources || {}).forEach((k) => {
      const el = U.$('[data-k="' + k + '"]', main);
      const fs = info.fieldSources[k];
      if (el && fs) el.insertAdjacentHTML('afterend', '<div class="hint">出典：' + esc(fs.sourceLabel) + (fs.fromPastPost ? '（過去投稿）' : '') + '・' + F.fmtDateTime(fs.appliedAt) + ' ' + esc(fs.by || '') + '採用</div>');
    });
    U.$('#ctaAdd', main).addEventListener('click', () => U.$('#ctaRows', main).insertAdjacentHTML('beforeend', ctaRow({})));
    U.$('#gsSave', main).addEventListener('click', () => {
      const next = {};
      U.$$('[data-k]', main).forEach((el) => { next[el.dataset.k] = el.value.trim(); });
      next.brandId = U.$('#gBrand', main).value;
      next.ctaOptions = U.$$('.gp-cta', main).map((r) => ({ type: U.$('[data-cta=type]', r).value, url: U.$('[data-cta=url]', r).value.trim() })).filter((o) => o.type);
      const errs = [];
      ['mapsUrl', 'reserveUrl'].forEach((k) => { if (next[k] && !/^https?:\/\//.test(next[k])) errs.push((k === 'mapsUrl' ? 'GoogleマップURL' : '予約URL') + 'は http(s):// で始めてください'); });
      next.ctaOptions.forEach((o) => { if (o.url && !/^https?:\/\//.test(o.url)) errs.push('CTAのURLは http(s):// で始めてください'); });
      if (new Set(next.ctaOptions.map((o) => o.type)).size !== next.ctaOptions.length) errs.push('同じ種類のCTAが2つあります');
      if (next.brandId) {
        const other = st.stores.find((x) => x.id !== s.id && GP.storeInfo(x).brandId === next.brandId && x.kind !== s.kind);
        if (other) errs.push('このブランドは' + G.kindLabel(other.kind) + '「' + other.name + '」で使われています。自社店舗と顧客案件で同じブランドは使えません');
      }
      if (errs.length) { U.toast(errs[0], 'error'); return; }
      const changed = GP.STORE_FIELDS.concat(GP.STORE_META_FIELDS).filter((f) => (info[f[0]] || '') !== next[f[0]]).map((f) => f[1].replace(/（.*）/, ''));
      if (info.brandId !== next.brandId) changed.push('ブランド');
      if (GP.ctaToText(info.ctaOptions) !== GP.ctaToText(next.ctaOptions)) changed.push('CTA');
      // 手で書き換えた項目は、資料からの出典を外す
      Object.keys(info.fieldSources || {}).forEach((k) => { if ((info[k] || '') !== next[k]) delete info.fieldSources[k]; });
      s.gpost = Object.assign(info, next, { updatedAt: Date.now() });
      S.log('Google投稿用の店舗情報を保存しました', { type: 'gstore', id: s.id, label: s.name }, changed.length ? '変更：' + changed.join('・') : '変更なし');
      S.save(true);
      U.toast('保存しました', 'ok');
      storeEdit(main, id);
    });
    const editMenu = async (m) => {
      const isNew = !m;
      const cur = m || { name: '', description: '', price: '', period: '' };
      const res = await U.modal({
        title: (isNew ? 'メニューを追加' : 'メニューを編集') + '：' + s.name,
        body: '<div class="field"><label>名前</label><input type="text" id="mn" value="' + esc(cur.name) + '"></div><div class="field"><label>説明（味・素材など、根拠のある内容だけ）</label><textarea id="md" style="min-height:60px">' + esc(cur.description) + '</textarea></div><div class="row"><div class="field"><label>価格</label><input type="text" id="mp" value="' + esc(cur.price) + '" placeholder="例：1,980円（税込）"></div><div class="field"><label>販売期間</label><input type="text" id="mt" value="' + esc(cur.period) + '" placeholder="例：通年"></div></div>',
        confirmLabel: '保存',
        collect: (bg) => ({ name: bg.querySelector('#mn').value.trim(), description: bg.querySelector('#md').value.trim(), price: bg.querySelector('#mp').value.trim(), period: bg.querySelector('#mt').value.trim() }),
      });
      if (!res) return;
      if (!res.name) { U.toast('メニューの名前を入力してください', 'error'); return; }
      s.gpost = info;
      if (isNew) info.menu.push(Object.assign({ id: S.uid('menu'), createdAt: Date.now() }, res));
      else Object.assign(m, res, { updatedAt: Date.now() });
      S.log(isNew ? 'メニューを追加しました' : 'メニューを編集しました', { type: 'gstore', id: s.id, label: s.name }, res.name + (res.price ? '（' + res.price + '）' : ''));
      S.save(true);
      storeEdit(main, id);
    };
    U.$('#menuAdd', main).addEventListener('click', () => editMenu(null));
    U.$$('[data-medit]', main).forEach((b) => b.addEventListener('click', () => editMenu(info.menu.find((m) => m.id === b.dataset.medit))));
    U.$$('[data-mdel]', main).forEach((b) => b.addEventListener('click', async () => {
      const m = info.menu.find((x) => x.id === b.dataset.mdel);
      const ok = await U.modal({ title: 'メニューの削除', body: '<p>「' + esc(m.name) + '」を削除します。作成済みの投稿案はそのまま残ります。</p>', confirmLabel: '削除する', danger: true });
      if (!ok) return;
      info.menu = info.menu.filter((x) => x.id !== m.id);
      s.gpost = info;
      S.log('メニューを削除しました', { type: 'gstore', id: s.id, label: s.name }, m.name);
      S.save(true);
      storeEdit(main, id);
    }));
  }

  function brandEdit(main, id) {
    const st = S.get();
    const isNew = id === 'new';
    const b = isNew ? GP.emptyBrand() : brandById(id);
    if (!b) { main.innerHTML = '<div class="empty">ブランドが見つかりません。</div>'; return; }
    const used = isNew ? [] : st.stores.filter((s) => GP.storeInfo(s).brandId === b.id);
    main.innerHTML = '<div class="btns" style="margin-bottom:8px"><a class="btn small" href="#/gpost/stores">← 店舗情報一覧</a></div>' +
      '<h1>' + (isNew ? 'ブランドを追加' : 'ブランド共通の情報：' + esc(b.name)) + '</h1>' +
      '<div class="panel"><p class="small muted">このブランドの店舗：' + (used.length ? used.map((s) => esc(s.name) + ' ' + U.kindBadge(s.kind)).join('、') : 'なし（店舗の「Google投稿用の店舗情報」でブランドを選びます）') + '</p>' +
      '<div class="alert small">ここには<b>すべての店舗に共通する情報だけ</b>を入力してください。特定の店舗の住所・価格・メニュー名などは、店舗ごとの情報に登録します（他店舗の情報が混ざるのを防ぐため）。</div>' +
      GP.BRAND_FIELDS.map((f) => fieldInput('gb-', f, b[f[0]])).join('') +
      '<div class="btns"><button class="btn primary" id="gbSave">保存</button>' + (!isNew && !used.length ? '<button class="btn danger" id="gbDel">削除</button>' : '') + '</div></div>';
    U.$('#gbSave', main).addEventListener('click', () => {
      const next = {};
      U.$$('[data-k]', main).forEach((el) => { next[el.dataset.k] = el.value.trim(); });
      if (!next.name) { U.toast('ブランド名を入力してください', 'error'); return; }
      if (gp().brands.some((x) => x.name === next.name && x.id !== b.id)) { U.toast('同じ名前のブランドが既に登録されています', 'error'); return; }
      const changed = GP.BRAND_FIELDS.filter((f) => (b[f[0]] || '') !== next[f[0]]).map((f) => f[1].replace(/（.*）/, ''));
      Object.assign(b, next, { updatedAt: Date.now() });
      if (isNew) { b.id = S.uid('brand'); b.createdAt = Date.now(); b.history = []; gp().brands.push(b); }
      S.log(isNew ? 'ブランド共通の情報を追加しました' : 'ブランド共通の情報を編集しました', { type: 'gbrand', id: b.id, label: b.name }, changed.length ? '変更：' + changed.join('・') : '', b);
      S.save(true);
      U.toast('保存しました', 'ok');
      location.hash = '#/gpost/stores';
    });
    const del = U.$('#gbDel', main);
    if (del) del.addEventListener('click', async () => {
      const ok = await U.modal({ title: 'ブランドの削除', body: '<p>「' + esc(b.name) + '」を削除します。</p>', confirmLabel: '削除する', danger: true });
      if (!ok) return;
      gp().brands = gp().brands.filter((x) => x.id !== b.id);
      S.log('ブランド共通の情報を削除しました', { type: 'gbrand', id: b.id, label: b.name }, '');
      S.save(true);
      location.hash = '#/gpost/stores';
    });
  }

  // ───────── Google仕様設定 ─────────
  function specView(main) {
    const sp = spec();
    const num = (id, label, val, hint) => '<div class="field" style="flex:1 1 180px"><label for="' + id + '">' + esc(label) + '</label><input type="number" min="1" id="' + id + '" value="' + esc(val) + '">' + (hint ? '<div class="hint">' + esc(hint) + '</div>' : '') + '</div>';
    const txt = (id, label, val) => '<div class="field" style="flex:1 1 260px"><label for="' + id + '">' + esc(label) + '</label><input type="text" id="' + id + '" value="' + esc(val) + '"></div>';
    const pc = sp.policyChecks || {};
    main.innerHTML = '<h1>Google仕様設定</h1><p class="lead">文字数上限などの仕様値は、コードに書き込まずここで管理します。値を変えると、投稿案の自動チェックにすぐ反映されます。</p>' +
      (sp.needsReverification ? '<div class="alert warn"><b>要再確認：</b>' + esc(sp.verificationNote || '') + '</div>' : '') +
      '<div class="alert small">このアプリは Googleビジネスプロフィールへ投稿しません（外部へ投稿する機能を持っていません）。</div>' +
      '<div class="panel"><h2>投稿本文</h2><div class="row">' + num('spMax', '投稿本文の上限文字数（日本語・英語それぞれ）', sp.postBody.maxChars, 'Unicode のコードポイント単位で数えます') + txt('spMaxSt', '確認状況', sp.postBody.status) + '</div>' +
      '<div class="row">' + num('spEvt', 'イベントのタイトル上限文字数', (sp.eventTitle || {}).maxChars) + txt('spEvtSt', '確認状況', (sp.eventTitle || {}).status) + '</div></div>' +
      '<div class="panel"><h2>社内の目安（Google仕様ではありません）</h2><div class="row">' + num('spJaMin', '日本語本文の目安（下限）', sp.writingGuide.jaRecommendedMin) + num('spJaMax', '日本語本文の目安（上限）', sp.writingGuide.jaRecommendedMax) + num('spCopy', 'キャッチコピーの目安', sp.writingGuide.catchcopyMaxChars) + '</div></div>' +
      '<div class="panel"><h2>ボタン（CTA）の種類</h2><div class="field"><label for="spCta">1行に1つ：コード,日本語名,英語名,URL必要（1/0）</label><textarea id="spCta" class="mono" style="min-height:120px">' + esc(sp.ctaTypes.map((t) => [t.code, t.ja, t.en, t.needsUrl ? 1 : 0].join(',')).join('\n')) + '</textarea></div></div>' +
      '<div class="panel"><h2>画像</h2><div class="row">' + txt('spImgF', '形式（カンマ区切り）', ((sp.image || {}).formats || []).join(',')) + num('spImgMin', '最小サイズ（バイト）', (sp.image || {}).minBytes) + num('spImgMax', '最大サイズ（バイト）', (sp.image || {}).maxBytes) + num('spImgW', '最小幅（px）', (sp.image || {}).minWidth) + num('spImgH', '最小高さ（px）', (sp.image || {}).minHeight) + txt('spImgSt', '確認状況', (sp.image || {}).status) + '</div></div>' +
      '<div class="panel"><h2>ポリシーのチェック</h2>' +
      '<label style="display:flex;gap:8px;font-weight:600"><input type="checkbox" id="spPhone"' + (pc.phoneNumberInBody && pc.phoneNumberInBody.enabled ? ' checked' : '') + '> 本文中の電話番号を警告する</label><div class="field"><input type="text" id="spPhoneMsg" value="' + esc((pc.phoneNumberInBody || {}).message) + '"></div>' +
      '<label style="display:flex;gap:8px;font-weight:600"><input type="checkbox" id="spUrl"' + (pc.unregisteredUrl && pc.unregisteredUrl.enabled !== false ? ' checked' : '') + '> 未登録URLの文言</label><div class="field"><input type="text" id="spUrlMsg" value="' + esc((pc.unregisteredUrl || {}).message) + '"></div></div>' +
      '<div class="panel"><h2>確認日・出典</h2><div class="row">' + '<div class="field"><label for="spAt">確認日</label><input type="date" id="spAt" value="' + esc(sp.verifiedAt) + '"></div>' + txt('spBy', '確認者', sp.verifiedBy) + '</div>' +
      '<label style="display:flex;gap:8px;font-weight:600"><input type="checkbox" id="spRe"' + (sp.needsReverification ? ' checked' : '') + '> 要再確認（公式ページで未確認）</label>' +
      '<div class="field"><label for="spNote">確認メモ</label><textarea id="spNote" style="min-height:60px">' + esc(sp.verificationNote || '') + '</textarea></div>' +
      '<div class="field"><label for="spSrc">出典（1行に1つ：名前 | URL）</label><textarea id="spSrc" style="min-height:80px">' + esc((sp.sources || []).map((x) => x.label + ' | ' + x.url).join('\n')) + '</textarea></div>' +
      '<p class="small">' + (sp.sources || []).map((x) => '<a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.label) + '</a>').join('<br>') + '</p>' +
      '<div class="btns"><button class="btn primary" id="spSave">保存</button><button class="btn" id="spReset">初期値に戻す</button></div></div>' +
      '<div class="panel"><h2>変更履歴</h2>' + (gp().specHistory.length ? '<ul class="history">' + gp().specHistory.slice().reverse().map((h) => '<li><span class="muted">' + F.fmtDateTime(h.at) + '</span>　<span class="who">' + esc(h.user) + '</span>　' + esc(h.detail) + '</li>').join('') + '</ul>' : '<p class="small muted">まだ変更はありません。</p>') + '</div>';

    const saveSpec = (next, how) => {
      const errs = GP.validateSpec(next);
      if (errs.length) { U.toast(errs[0], 'error'); return false; }
      const before = spec();
      const diff = [];
      if (before.postBody.maxChars !== next.postBody.maxChars) diff.push('本文上限 ' + before.postBody.maxChars + '→' + next.postBody.maxChars);
      ['jaRecommendedMin', 'jaRecommendedMax', 'catchcopyMaxChars'].forEach((k) => { if (before.writingGuide[k] !== next.writingGuide[k]) diff.push(k + ' ' + before.writingGuide[k] + '→' + next.writingGuide[k]); });
      if (before.verifiedAt !== next.verifiedAt) diff.push('確認日 ' + before.verifiedAt + '→' + next.verifiedAt);
      if (JSON.stringify(before.ctaTypes) !== JSON.stringify(next.ctaTypes)) diff.push('CTAの種類');
      if (!!before.needsReverification !== !!next.needsReverification) diff.push(next.needsReverification ? '要再確認にしました' : '要再確認を外しました');
      const detail = how + (diff.length ? '：' + diff.join('、') : '');
      gp().spec = next;
      gp().specHistory.push({ at: Date.now(), user: S.user(), detail, before });
      S.log('Google仕様設定を変更しました', { type: 'settings', id: '', label: 'Google仕様設定' }, detail);
      S.save(true);
      U.toast('保存しました。自動チェックに反映されます', 'ok');
      return true;
    };
    U.$('#spSave', main).addEventListener('click', () => {
      const v = (id) => U.$('#' + id, main).value.trim();
      const n = (id) => (v(id) === '' ? '' : Number(v(id)));
      const next = JSON.parse(JSON.stringify(spec()));
      next.postBody = Object.assign({}, next.postBody, { maxChars: n('spMax'), status: v('spMaxSt') });
      next.eventTitle = Object.assign({}, next.eventTitle, { maxChars: n('spEvt'), status: v('spEvtSt') });
      next.writingGuide = Object.assign({}, next.writingGuide, { jaRecommendedMin: n('spJaMin'), jaRecommendedMax: n('spJaMax'), catchcopyMaxChars: n('spCopy') });
      next.ctaTypes = v('spCta').split(/\n/).map((l) => l.split(',').map((x) => x.trim())).filter((a) => a[0]).map((a) => ({ code: a[0].toUpperCase(), ja: a[1] || '', en: a[2] || '', needsUrl: a[3] !== '0' }));
      next.image = Object.assign({}, next.image, { formats: v('spImgF').split(/[,、]/).map((x) => x.trim().toUpperCase()).filter(Boolean), minBytes: n('spImgMin'), maxBytes: n('spImgMax'), minWidth: n('spImgW'), minHeight: n('spImgH'), status: v('spImgSt') });
      next.policyChecks = { phoneNumberInBody: { enabled: U.$('#spPhone', main).checked, message: v('spPhoneMsg') }, unregisteredUrl: { enabled: U.$('#spUrl', main).checked, message: v('spUrlMsg') } };
      next.verifiedAt = v('spAt');
      next.specVersion = v('spAt');
      next.verifiedBy = v('spBy');
      next.needsReverification = U.$('#spRe', main).checked;
      next.verificationNote = v('spNote');
      next.sources = v('spSrc').split(/\n/).map((l) => l.split('|').map((x) => x.trim())).filter((a) => a[0]).map((a) => ({ label: a[0], url: a[1] || '' }));
      if (saveSpec(next, '保存')) specView(main);
    });
    U.$('#spReset', main).addEventListener('click', async () => {
      const ok = await U.modal({ title: '初期値に戻す', body: '<p>Google仕様設定を、アプリに同梱の初期値（app/config/google-spec.default.js）に戻します。</p>', confirmLabel: '戻す' });
      if (ok && saveSpec(S.defaultSpec(), '初期値に戻しました')) specView(main);
    });
  }

  V.gpostCreate = create;
  V.gpostList = list;
  V.gpostPost = detail;
  V.gpostStores = storesView;
  V.gpostStore = storeEdit;
  V.gpostBrand = brandEdit;
  V.gpostSpec = specView;
  V.gpostLabel = postLabel;
  root.FS.gpostui = { generate, importCsv, draft, postLabel };
})(self);
