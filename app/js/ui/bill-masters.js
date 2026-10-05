/* 画面：請求先・契約（一覧・登録・編集・料金変更・請求停止・契約終了・前払い・一括変更） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const B = root.FS.bill;
  const X = root.FS.billui;
  const F = root.FS.format;
  const esc = U.esc;

  const CLIENT_STATUS = { active: '取引中', paused: '取引停止中', ended: '取引終了' };
  const CONTRACT_STATUS = { active: '契約中', ended: '契約終了' };
  const TIMING = { unset: '未設定', same_month: '当月分を当月に請求', next_month: '当月分を翌月に請求', advance: '翌月分を当月に請求（前請求）', custom: 'その他（備考に記載）' };

  function newClient() {
    return { id: S.uid('cl'), companyName: '', billingName: '', honorific: '御中', postal: '', address: '', contactName: '', email: '', paymentTerms: { type: 'unset' }, notes: '', status: 'active', storeIds: [], history: [], createdAt: Date.now(), createdBy: S.user() };
  }
  function newContract(clientId) {
    return {
      id: S.uid('ct'), clientId: clientId || '', storeId: '', projectId: '', name: '', service: '', billingType: 'monthly', amount: null, priceTaxMode: null, taxCategory: null,
      startDate: '', endDate: '', billingStartMonth: '', billingEndMonth: '', billingTiming: { type: 'unset', text: '' }, dueRuleNote: '', docRefs: '',
      adjustments: [], initialFee: null, prepaid: [], proration: { enabled: null, method: '' }, suspensions: [], priceHistory: [], status: 'active', history: [], createdAt: Date.now(), createdBy: S.user(),
    };
  }

  function clientUnset(c) {
    const u = [];
    if (!c.billingName) u.push('請求書の宛名');
    if (!c.address) u.push('住所');
    if (!c.paymentTerms || c.paymentTerms.type === 'unset') u.push('支払条件');
    return u;
  }
  function contractUnset(c) {
    const u = [];
    if (c.amount === null || c.amount === '' || c.amount === undefined) u.push(c.billingType === 'one_time' ? '料金' : '月額料金');
    if (!c.priceTaxMode) u.push('税抜／税込');
    if (!c.taxCategory) u.push('税区分');
    if (!c.billingStartMonth) u.push('請求開始月');
    if (c.billingType === 'monthly' && (!c.billingTiming || c.billingTiming.type === 'unset')) u.push('請求タイミング');
    if (c.billingType === 'monthly' && (c.proration.enabled === null || c.proration.enabled === undefined)) u.push('日割りの有無');
    if (c.proration.enabled === true && c.proration.method !== 'daily') u.push('日割りの計算方法');
    if (!c.startDate) u.push('契約開始日');
    return u;
  }

  function hist(doc, action, changes) {
    doc.history = doc.history || [];
    const e = { at: Date.now(), user: S.user(), action, detail: changes.join('／') };
    doc.history.push(e);
  }

  // ───────── 請求先一覧 ─────────
  function clients(main) {
    const b = X.bill();
    const q = sessionStorage.getItem('cl-q') || '';
    const rows = b.clients.filter((c) => !q || [c.companyName, c.billingName, c.contactName, c.email, c.notes].concat((c.storeIds || []).map((id) => (S.storeById(id) || {}).name || '')).join(' ').includes(q))
      .sort((a, z) => (a.companyName || '').localeCompare(z.companyName || '', 'ja'));
    main.innerHTML = '<h1>請求先</h1><p class="lead">請求書の宛先（会社・個人）を登録します。1社が複数店舗を持つ場合は、請求先に店舗を紐づけ、契約ごとに店舗・案件を選びます。</p>' +
      '<div class="row" style="margin-bottom:10px"><div class="field" style="flex:2 1 240px"><label>検索（会社名・宛名・店舗・担当者）</label><input type="search" id="q" value="' + esc(q) + '"></div><div class="field" style="flex:0 0 auto"><a class="btn primary" href="#/bill/client/new">＋ 請求先を登録</a></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>請求先</th><th>店舗</th><th>支払条件</th><th>契約</th><th>状態</th><th>未設定</th></tr></thead><tbody>' +
        rows.map((c) => {
          const u = clientUnset(c);
          const nCt = b.contracts.filter((x) => x.clientId === c.id).length;
          return '<tr class="clickable" data-href="#/bill/client/' + c.id + '"><td><b>' + esc(c.companyName || '名称未入力') + '</b><div class="small muted">宛名：' + esc(c.billingName || '未設定') + ' ' + esc(c.honorific || '') + '</div></td><td class="small">' + esc((c.storeIds || []).map((id) => (S.storeById(id) || {}).name).filter(Boolean).join('、') || '—') + '</td><td class="small">' + esc(B.termsLabel(c.paymentTerms)) + '</td><td>' + nCt + '件</td><td>' + esc(CLIENT_STATUS[c.status]) + '</td><td>' + (u.length ? X.unsetBadge(u.length + '件') : '<span class="badge st-approved">なし</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">請求先はまだありません。</div>');
    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('cl-q', e.target.value); clients(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$$('[data-href]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
  }

  // ───────── 請求先の登録・編集 ─────────
  function clientEdit(main, id) {
    const b = X.bill();
    const isNew = id === 'new';
    const c = isNew ? newClient() : X.client(id);
    if (!c) { main.innerHTML = '<div class="empty">請求先が見つかりません。</div>'; return; }
    const cts = b.contracts.filter((x) => x.clientId === c.id);
    const invs = b.invoices.filter((x) => x.clientId === c.id);
    const t = c.paymentTerms || { type: 'unset' };
    const stores = S.get().stores;
    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/bill/clients">← 請求先一覧</a><div class="grow"><b>' + esc(isNew ? '請求先を登録' : c.companyName) + '</b></div><button class="btn primary" id="save">保存</button>' + (isNew ? '' : '<button class="btn danger" id="del">削除</button>') + '</div>' +
      (isNew ? '' : (clientUnset(c).length ? '<div class="alert danger">未設定の項目：' + esc(clientUnset(c).join('、')) + '</div>' : '')) +
      '<div class="grid2"><div class="panel"><h2>請求先情報</h2>' +
      '<div class="field"><label>顧客名・会社名（必須）</label><input type="text" id="cn" value="' + esc(c.companyName) + '"></div>' +
      '<div class="row"><div class="field" style="flex:3 1 200px"><label>請求書の宛名</label><input type="text" id="bn" value="' + esc(c.billingName) + '" placeholder="請求書に記載する正式名称"></div><div class="field" style="flex:1 1 90px"><label>敬称</label><select id="ho">' + ['御中', '様', ''].map((h) => '<option value="' + h + '"' + (c.honorific === h ? ' selected' : '') + '>' + (h || 'なし') + '</option>').join('') + '</select></div></div>' +
      '<div class="row"><div class="field" style="flex:0 1 130px"><label>郵便番号</label><input type="text" id="po" value="' + esc(c.postal) + '"></div><div class="field" style="flex:3 1 220px"><label>住所</label><input type="text" id="ad" value="' + esc(c.address) + '"></div></div>' +
      '<div class="row"><div class="field"><label>担当者名</label><input type="text" id="ctn" value="' + esc(c.contactName) + '"></div><div class="field"><label>メールアドレス</label><input type="text" id="em" value="' + esc(c.email) + '"></div></div>' +
      '<div class="row"><div class="field"><label>支払条件</label><select id="pt">' + [['unset', '未設定'], ['next_month_end', '発行日の翌月末'], ['month_end_after', '発行日の○か月後の月末'], ['days_after', '発行日から○日後'], ['manual', '請求書ごとに手入力']].map(([k, l]) => '<option value="' + k + '"' + (t.type === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:0 1 120px"><label>○の値</label><input type="text" id="pn" value="' + esc(t.type === 'days_after' ? t.days : t.type === 'month_end_after' ? t.months : '') + '"></div></div>' +
      '<div class="field"><label>支払条件の補足（契約書の記載など）</label><input type="text" id="ptx" value="' + esc(t.text || '') + '"></div>' +
      '<div class="field"><label>状態</label><select id="st">' + Object.keys(CLIENT_STATUS).map((k) => '<option value="' + k + '"' + (c.status === k ? ' selected' : '') + '>' + CLIENT_STATUS[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>請求先ごとの注意事項</label><textarea id="nt">' + esc(c.notes) + '</textarea></div></div>' +
      '<div><div class="panel"><h2>店舗・屋号</h2><p class="small muted">この請求先に属する店舗を選びます（店舗の追加は「店舗・案件」画面）。</p><div class="btns">' + stores.map((s) => '<label class="small nowrap"><input type="checkbox" data-store="' + s.id + '"' + ((c.storeIds || []).includes(s.id) ? ' checked' : '') + '> ' + esc(s.name) + '</label>').join('') + '</div></div>' +
      (isNew ? '' : '<div class="panel"><h2>契約（' + cts.length + '件）</h2>' + (cts.length ? '<table class="tbl">' + cts.map((x) => '<tr class="clickable" data-href="#/bill/contract/' + x.id + '"><td>' + esc(x.name) + '</td><td class="small">' + esc((S.storeById(x.storeId) || {}).name || '') + '</td><td class="money">' + (x.amount === null ? X.unsetBadge() : B.yen(B.amountForMonth(x, X.thisMonth()))) + '</td><td>' + esc(CONTRACT_STATUS[x.status]) + '</td></tr>').join('') + '</table>' : '<p class="muted small">契約はまだありません。</p>') + '<a class="btn small" href="#/bill/contract/new?client=' + c.id + '">＋ 契約を追加</a></div>' +
        '<div class="panel"><h2>請求書（' + invs.length + '件）</h2>' + (invs.length ? '<table class="tbl">' + invs.slice(-10).reverse().map((x) => '<tr class="clickable" data-href="#/bill/inv/' + x.id + '"><td>' + esc(x.number || '番号未発行') + '</td><td>' + esc(x.issueDate || '') + '</td><td>' + X.statusBadge(x) + '</td></tr>').join('') + '</table>' : '<p class="muted small">請求書はまだありません。</p>') + '</div>' +
        '<div class="panel"><h2>変更履歴</h2>' + U.historyList(c) + '</div>') +
      '</div></div>';
    U.$$('[data-href]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const $ = (s) => U.$(s, main);
    if (!isNew) $('#del').addEventListener('click', async () => {
      if (cts.length || invs.length) { U.toast('契約・請求書がある請求先は削除できません（状態を「取引終了」にしてください）', 'error'); return; }
      const ok = await U.modal({ title: '請求先の削除', body: '<p>「' + esc(c.companyName) + '」を削除します。元に戻せません。</p>', check: '削除してよいことを確認しました', confirmLabel: '削除', danger: true });
      if (!ok) return;
      b.clients = b.clients.filter((x) => x.id !== c.id);
      S.log('請求先を削除しました', { type: 'billing', id: c.id, label: c.companyName }, '');
      S.save(true);
      location.hash = '#/bill/clients';
    });
    $('#save').addEventListener('click', async () => {
      const type = $('#pt').value;
      const n = $('#pn').value.trim();
      const terms = { type, text: $('#ptx').value.trim() };
      if (type === 'days_after') terms.days = Number(n);
      if (type === 'month_end_after') terms.months = Number(n);
      const errs = [];
      if (!$('#cn').value.trim()) errs.push('顧客名・会社名を入力してください');
      if ((type === 'days_after' || type === 'month_end_after') && !(n !== '' && Number(n) >= 0 && Number.isInteger(Number(n)))) errs.push('支払条件の「○の値」を0以上の整数で入力してください');
      const em = $('#em').value.trim();
      if (em && !/^[^@\s]+@[^@\s]+\.[^@\s]+$/.test(em)) errs.push('メールアドレスの形式が正しくありません');
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      const next = { companyName: $('#cn').value.trim(), billingName: $('#bn').value.trim(), honorific: $('#ho').value, postal: $('#po').value.trim(), address: $('#ad').value.trim(), contactName: $('#ctn').value.trim(), email: em, paymentTerms: terms, status: $('#st').value, notes: $('#nt').value, storeIds: U.$$('[data-store]', main).filter((x) => x.checked).map((x) => x.dataset.store) };
      const labels = { companyName: '会社名', billingName: '宛名', honorific: '敬称', postal: '郵便番号', address: '住所', contactName: '担当者', email: 'メール', paymentTerms: '支払条件', status: '状態', notes: '注意事項', storeIds: '店舗' };
      const ch = Object.keys(next).filter((k) => JSON.stringify(c[k]) !== JSON.stringify(next[k])).map((k) => labels[k] + (k === 'status' ? '：' + CLIENT_STATUS[c.status] + ' → ' + CLIENT_STATUS[next.status] : k === 'paymentTerms' ? '：' + B.termsLabel(c.paymentTerms) + ' → ' + B.termsLabel(next.paymentTerms) : ''));
      if (!isNew && next.status !== c.status) {
        const ok = await U.modal({ title: '状態の変更', body: '<p>「' + esc(c.companyName) + '」を<b>' + CLIENT_STATUS[next.status] + '</b>にします。' + (next.status !== 'active' ? 'この請求先への請求書作成時に警告が出るようになります。' : '') + '</p>', confirmLabel: '変更する' });
        if (!ok) return;
      }
      Object.assign(c, next);
      if (isNew) { b.clients.push(c); hist(c, '登録', []); S.log('請求先を登録しました', { type: 'billing', id: c.id, label: c.companyName }, '', null); }
      else if (ch.length) { hist(c, '変更', ch); S.log('請求先を変更しました', { type: 'billing', id: c.id, label: c.companyName }, ch.join('／')); }
      S.save(true);
      U.toast('保存しました', 'ok');
      if (isNew) location.hash = '#/bill/client/' + c.id; else clientEdit(main, c.id);
    });
  }

  // ───────── 契約一覧 ─────────
  function contracts(main) {
    const b = X.bill();
    const q = sessionStorage.getItem('ct-q') || '';
    const rows = b.contracts.filter((c) => { const cl = X.client(c.clientId); return !q || [c.name, c.service, cl ? cl.companyName : '', (S.storeById(c.storeId) || {}).name || ''].join(' ').includes(q); });
    const ym = X.thisMonth();
    main.innerHTML = '<h1>契約</h1><p class="lead">請求の元になる契約です。料金・税区分・請求開始月・日割りなどが未設定の契約は、請求書を確定できません。</p>' +
      '<div class="row" style="margin-bottom:10px"><div class="field" style="flex:2 1 240px"><label>検索（契約名・サービス・請求先・店舗）</label><input type="search" id="q" value="' + esc(q) + '"></div><div class="field" style="flex:0 0 auto"><a class="btn primary" href="#/bill/contract/new">＋ 契約を登録</a></div><div class="field" style="flex:0 0 auto"><button class="btn" id="bulk">選んだ契約を一括変更</button></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th></th><th>契約</th><th>請求先・店舗</th><th class="num">料金（' + B.ymLabel(ym) + '時点）</th><th>税</th><th>請求期間</th><th>状態</th><th>未設定</th></tr></thead><tbody>' +
        rows.map((c) => {
          const u = contractUnset(c);
          const amt = B.amountForMonth(c, ym);
          const cat = (b.settings.taxCategories.find((x) => x.key === c.taxCategory) || {}).label;
          return '<tr><td><input type="checkbox" data-sel="' + c.id + '"></td><td><a href="#/bill/contract/' + c.id + '"><b>' + esc(c.name || '名称未入力') + '</b></a><div class="small muted">' + (c.billingType === 'one_time' ? '単発' : '月額') + '・' + esc(c.service) + '</div></td><td class="small">' + esc(X.clientLabel(X.client(c.clientId))) + '<div class="muted">' + esc((S.storeById(c.storeId) || {}).name || '') + '</div></td>' +
            '<td class="money">' + (amt === null ? X.unsetBadge() : B.yen(amt)) + '</td><td class="small">' + (c.priceTaxMode ? B.PRICE_MODE[c.priceTaxMode] : X.unsetBadge()) + '<br>' + (cat ? esc(cat) : X.unsetBadge()) + '</td><td class="small nowrap">' + (c.billingStartMonth ? B.ymLabel(c.billingStartMonth) : X.unsetBadge()) + '〜' + (c.billingEndMonth ? B.ymLabel(c.billingEndMonth) : '') + '</td><td>' + esc(CONTRACT_STATUS[c.status]) + ((c.suspensions || []).some((s) => !s.to || s.to >= ym) ? '<div class="badge warn">請求停止あり</div>' : '') + '</td><td>' + (u.length ? '<span class="badge danger" title="' + esc(u.join('、')) + '">' + u.length + '件</span>' : '<span class="badge st-approved">なし</span>') + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">契約はまだありません。</div>');
    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('ct-q', e.target.value); contracts(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$('#bulk', main).addEventListener('click', () => bulkEdit(U.$$('[data-sel]', main).filter((x) => x.checked).map((x) => x.dataset.sel), () => contracts(main)));
  }

  // 一括変更（税区分・税抜/税込・請求タイミング・日割り）。変更前に対象と内容を確認する。
  async function bulkEdit(ids, done) {
    const b = X.bill();
    if (!ids.length) { U.toast('一括変更する契約を選んでください', 'error'); return; }
    const res = await U.modal({
      title: '契約の一括変更（' + ids.length + '件）',
      body: '<p class="small">空欄の項目は変更しません。契約書・見積書で確認できた内容だけを設定してください。</p>' +
        '<div class="field"><label>税区分</label><select id="bt"><option value="">変更しない</option>' + b.settings.taxCategories.map((c) => '<option value="' + c.key + '">' + esc(c.label) + '（' + c.rate + '%）</option>').join('') + '</select></div>' +
        '<div class="field"><label>料金の表示</label><select id="bm"><option value="">変更しない</option><option value="excluded">税抜</option><option value="included">税込</option></select></div>' +
        '<div class="field"><label>請求タイミング</label><select id="bti"><option value="">変更しない</option>' + Object.keys(TIMING).filter((k) => k !== 'unset').map((k) => '<option value="' + k + '">' + TIMING[k] + '</option>').join('') + '</select></div>' +
        '<div class="field"><label>日割り</label><select id="bp"><option value="">変更しない</option><option value="no">日割りしない</option><option value="daily">日割りする（暦日数で按分）</option></select></div>',
      confirmLabel: '内容を確認する',
      collect: (bg) => ({ tax: bg.querySelector('#bt').value, mode: bg.querySelector('#bm').value, timing: bg.querySelector('#bti').value, pr: bg.querySelector('#bp').value }),
    });
    if (!res) return;
    const changes = [];
    if (res.tax) changes.push('税区分 → ' + b.settings.taxCategories.find((c) => c.key === res.tax).label);
    if (res.mode) changes.push('料金の表示 → ' + B.PRICE_MODE[res.mode]);
    if (res.timing) changes.push('請求タイミング → ' + TIMING[res.timing]);
    if (res.pr) changes.push('日割り → ' + (res.pr === 'no' ? 'しない' : '暦日数で按分'));
    if (!changes.length) return;
    const list = ids.map((id) => X.contract(id));
    const ok = await U.modal({ title: '一括変更の確認', body: '<p>次の' + list.length + '件の契約を変更します。発行済みの請求書の内容は変わりません。</p><ul>' + list.map((c) => '<li>' + esc(c.name) + '（' + esc(X.clientLabel(X.client(c.clientId))) + '）</li>').join('') + '</ul><p><b>変更内容：</b>' + esc(changes.join('、')) + '</p>', check: '契約書・見積書で内容を確認しました', confirmLabel: '一括変更する', danger: true });
    if (!ok) return;
    list.forEach((c) => {
      if (res.tax) c.taxCategory = res.tax;
      if (res.mode) c.priceTaxMode = res.mode;
      if (res.timing) c.billingTiming = { type: res.timing, text: '' };
      if (res.pr) c.proration = res.pr === 'no' ? { enabled: false, method: '' } : { enabled: true, method: 'daily' };
      hist(c, '一括変更', changes);
    });
    S.log('契約を一括変更しました', { type: 'billing', id: '', label: list.length + '件' }, changes.join('、') + '：' + list.map((c) => c.name).join('、'));
    S.save(true);
    U.toast('一括変更しました', 'ok');
    done();
  }

  // ───────── 契約の登録・編集 ─────────
  function contractEdit(main, id, params) {
    const b = X.bill();
    const isNew = id === 'new';
    const c = isNew ? newContract(params && params.get('client')) : X.contract(id);
    if (!c) { main.innerHTML = '<div class="empty">契約が見つかりません。</div>'; return; }
    const used = b.invoices.filter((i) => (i.lines || []).some((l) => l.contractId === c.id));
    const issuedUsed = used.filter((i) => i.status === 'issued');
    const priceLocked = issuedUsed.length > 0;
    const cats = b.settings.taxCategories;
    const u = isNew ? [] : contractUnset(c);
    const cl = X.client(c.clientId);
    const storeOpts = (cid) => { const cc = X.client(cid); const ids = cc && cc.storeIds && cc.storeIds.length ? cc.storeIds : S.get().stores.map((s) => s.id); return '<option value="">（店舗を選択）</option>' + ids.map((sid) => S.storeById(sid)).filter(Boolean).map((s) => '<option value="' + s.id + '"' + (s.id === c.storeId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join(''); };
    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/bill/contracts">← 契約一覧</a><div class="grow"><b>' + esc(isNew ? '契約を登録' : c.name) + '</b>' + (cl ? '<span class="small muted">　' + esc(cl.companyName) + '</span>' : '') + '</div><button class="btn primary" id="save">保存</button>' + (isNew ? '' : '<button class="btn danger" id="del">削除</button>') + '</div>' +
      (u.length ? '<div class="alert danger"><b>未設定の項目（請求書を確定できません）：</b>' + esc(u.join('、')) + '<br><span class="small">契約書・見積書に記載がない場合は、推測せず先方・税理士に確認してください。</span></div>' : '') +
      '<div class="grid2"><div>' +
      '<div class="panel"><h2>基本</h2><div class="field"><label>請求先（必須）</label><select id="cl"><option value="">（選択）</option>' + b.clients.map((x) => '<option value="' + x.id + '"' + (x.id === c.clientId ? ' selected' : '') + '>' + esc(x.companyName) + '</option>').join('') + '</select></div>' +
      '<div class="row"><div class="field"><label>店舗</label><select id="sto">' + storeOpts(c.clientId) + '</select></div><div class="field"><label>案件</label><select id="pj"></select></div></div>' +
      '<div class="field"><label>契約名（必須）</label><input type="text" id="nm" value="' + esc(c.name) + '"></div>' +
      '<div class="field"><label>提供するサービス（請求書の品目名）</label><input type="text" id="sv" value="' + esc(c.service) + '"></div>' +
      '<div class="field"><label>契約書・見積書への参照</label><input type="text" id="doc" value="' + esc(c.docRefs) + '" placeholder="例：2026-04-01 契約書 第3条／見積書No.123"></div></div>' +
      '<div class="panel"><h2>料金</h2><div class="row"><div class="field"><label>種類</label><select id="bt"' + (priceLocked ? ' disabled' : '') + '><option value="monthly"' + (c.billingType === 'monthly' ? ' selected' : '') + '>月額（定期）</option><option value="one_time"' + (c.billingType === 'one_time' ? ' selected' : '') + '>単発</option></select></div>' +
      '<div class="field"><label>料金（円）</label><input type="text" id="am" value="' + esc(c.amount === null ? '' : c.amount) + '" placeholder="未設定"' + (priceLocked ? ' disabled' : '') + '>' + (priceLocked ? '<div class="hint">発行済みの請求書があるため、料金は「料金を変更」から変更します（履歴に残ります）。</div>' : '') + '</div>' +
      '<div class="field"><label>税抜／税込</label><select id="pm"><option value="">未設定</option><option value="excluded"' + (c.priceTaxMode === 'excluded' ? ' selected' : '') + '>税抜</option><option value="included"' + (c.priceTaxMode === 'included' ? ' selected' : '') + '>税込</option></select></div></div>' +
      '<div class="field"><label>税区分</label><select id="tc"><option value="">未設定</option>' + cats.map((x) => '<option value="' + x.key + '"' + (x.key === c.taxCategory ? ' selected' : '') + '>' + esc(x.label) + '（' + x.rate + '%）' + (x.verified ? '' : '・設定未確認') + '</option>').join('') + '</select></div>' +
      (c.priceHistory && c.priceHistory.length ? '<h3>料金変更の履歴</h3><table class="tbl small">' + c.priceHistory.map((h) => '<tr><td>' + B.ymLabel(h.effectiveMonth) + '分から</td><td class="money">' + B.yen(h.amount) + '</td><td>' + esc(h.reason || '') + '</td><td class="muted">' + esc(h.user) + '・' + F.fmtDateTime(h.at) + '</td></tr>').join('') + '</table>' : '') +
      (isNew || c.billingType !== 'monthly' ? '' : '<button class="btn small" id="price">料金を変更（適用開始月を指定）</button>') + '</div>' +
      '<div class="panel"><h2>期間・タイミング</h2><div class="row"><div class="field"><label>契約開始日</label><input type="date" id="sd" value="' + esc(c.startDate) + '"></div><div class="field"><label>契約終了日</label><input type="date" id="ed" value="' + esc(c.endDate) + '"></div></div>' +
      '<div class="row"><div class="field"><label>請求開始月</label><input type="month" id="bs" value="' + esc(c.billingStartMonth) + '"></div><div class="field"><label>請求終了月</label><input type="month" id="be" value="' + esc(c.billingEndMonth) + '"></div></div>' +
      '<div class="field"><label>請求タイミング</label><select id="ti">' + Object.keys(TIMING).map((k) => '<option value="' + k + '"' + (c.billingTiming.type === k ? ' selected' : '') + '>' + TIMING[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>支払期限のルール（契約書の記載）</label><input type="text" id="dr" value="' + esc(c.dueRuleNote) + '" placeholder="請求先の支払条件と違う場合に記載"></div>' +
      '<div class="row"><div class="field"><label>日割り計算</label><select id="pr"><option value=""' + (c.proration.enabled === null || c.proration.enabled === undefined ? ' selected' : '') + '>未設定</option><option value="no"' + (c.proration.enabled === false ? ' selected' : '') + '>日割りしない</option><option value="daily"' + (c.proration.enabled === true ? ' selected' : '') + '>日割りする（月額×利用日数÷その月の暦日数）</option></select><div class="hint">端数処理は請求管理の設定で指定します。</div></div></div></div>' +
      '</div><div>' +
      '<div class="panel"><h2>値引き・追加料金</h2><div id="adj"></div><button class="btn small" id="addAdj">＋ 追加</button></div>' +
      '<div class="panel"><h2>初期費用</h2><div class="row"><div class="field"><label>名称</label><input type="text" id="ifl" value="' + esc(c.initialFee ? c.initialFee.label : '') + '" placeholder="例：初期設定費"></div><div class="field"><label>金額（円）</label><input type="text" id="ifa" value="' + esc(c.initialFee && c.initialFee.amount !== null ? c.initialFee.amount : '') + '"></div><div class="field"><label>請求する月</label><input type="month" id="ifm" value="' + esc(c.initialFee ? c.initialFee.month : '') + '"></div></div></div>' +
      '<div class="panel"><h2>前払い・複数月一括払い</h2><p class="small muted">前払い済みの期間は、その期間の月額請求を作ると警告が出ます。複数月をまとめて請求書にすると、発行時に自動で登録されます。</p><div id="pp"></div><button class="btn small" id="addPp">＋ 前払い期間を追加</button></div>' +
      (isNew ? '' : '<div class="panel"><h2>請求停止・契約終了</h2>' + ((c.suspensions || []).length ? '<table class="tbl small">' + c.suspensions.map((s) => '<tr><td>' + B.ymLabel(s.from) + '〜' + (s.to ? B.ymLabel(s.to) : '（再開未定）') + '</td><td>' + esc(s.reason || '') + '</td><td class="muted">' + esc(s.user || '') + '</td></tr>').join('') + '</table>' : '<p class="small muted">請求停止の記録はありません。</p>') +
        '<div class="btns"><button class="btn small" id="suspend">請求停止を記録</button>' + (c.status === 'ended' ? '' : '<button class="btn small danger" id="end">契約を終了する</button>') + '</div></div>' +
        '<div class="panel"><h2>この契約の請求書（' + used.length + '件）</h2>' + (used.length ? '<table class="tbl small">' + used.map((i) => '<tr class="clickable" data-href="#/bill/inv/' + i.id + '"><td>' + esc(i.number || '番号未発行') + '</td><td>' + esc(Array.from(new Set(i.lines.filter((l) => l.contractId === c.id).map((l) => B.ymLabel(l.targetMonth)))).join('、')) + '</td><td>' + X.statusBadge(i) + '</td></tr>').join('') + '</table>' : '<p class="small muted">まだありません。</p>') + '</div>' +
        '<div class="panel"><h2>変更履歴</h2>' + U.historyList(c) + '</div>') +
      '<div class="panel"><h2>備考</h2><textarea id="memo">' + esc(c.memo || '') + '</textarea></div>' +
      '</div></div>';

    const $ = (s) => U.$(s, main);
    U.$$('[data-href]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const renderPj = () => { const sid = $('#sto').value; $('#pj').innerHTML = sid ? U.projectOptions(sid, c.projectId) : '<option value="">（店舗を選ぶと選択できます）</option>'; };
    renderPj();
    $('#cl').addEventListener('change', () => { $('#sto').innerHTML = storeOpts($('#cl').value); renderPj(); });
    $('#sto').addEventListener('change', renderPj);

    let adj = JSON.parse(JSON.stringify(c.adjustments || []));
    let pp = JSON.parse(JSON.stringify(c.prepaid || []));
    const renderAdj = () => {
      $('#adj').innerHTML = adj.length ? '<table class="tbl small"><thead><tr><th>名称</th><th>金額（値引きはマイナス）</th><th>開始月</th><th>終了月</th><th></th></tr></thead>' + adj.map((a, i) => '<tr><td><input type="text" data-adj="' + i + '" data-f="label" value="' + esc(a.label) + '"></td><td><input type="text" data-adj="' + i + '" data-f="amount" value="' + esc(a.amount === null ? '' : a.amount) + '"></td><td><input type="month" data-adj="' + i + '" data-f="fromMonth" value="' + esc(a.fromMonth) + '"></td><td><input type="month" data-adj="' + i + '" data-f="toMonth" value="' + esc(a.toMonth) + '"></td><td><button class="btn small danger" data-adjdel="' + i + '">削除</button></td></tr>').join('') + '</table>' : '<p class="small muted">ありません。</p>';
      U.$$('[data-adj]', main).forEach((el) => el.addEventListener('input', () => { adj[Number(el.dataset.adj)][el.dataset.f] = el.value; }));
      U.$$('[data-adjdel]', main).forEach((el) => el.addEventListener('click', () => { adj.splice(Number(el.dataset.adjdel), 1); renderAdj(); }));
    };
    const renderPp = () => {
      $('#pp').innerHTML = pp.length ? '<table class="tbl small"><thead><tr><th>開始月</th><th>終了月</th><th>メモ</th><th></th></tr></thead>' + pp.map((p, i) => '<tr><td><input type="month" data-pp="' + i + '" data-f="from" value="' + esc(p.from) + '"></td><td><input type="month" data-pp="' + i + '" data-f="to" value="' + esc(p.to) + '"></td><td><input type="text" data-pp="' + i + '" data-f="note" value="' + esc(p.note || '') + '">' + (p.invoiceId ? '<div class="muted">請求書：' + esc((X.invoice(p.invoiceId) || {}).number || '') + '</div>' : '') + '</td><td><button class="btn small danger" data-ppdel="' + i + '">削除</button></td></tr>').join('') + '</table>' : '<p class="small muted">ありません。</p>';
      U.$$('[data-pp]', main).forEach((el) => el.addEventListener('input', () => { pp[Number(el.dataset.pp)][el.dataset.f] = el.value; }));
      U.$$('[data-ppdel]', main).forEach((el) => el.addEventListener('click', () => { pp.splice(Number(el.dataset.ppdel), 1); renderPp(); }));
    };
    renderAdj(); renderPp();
    $('#addAdj').addEventListener('click', () => { adj.push({ label: '', amount: null, fromMonth: '', toMonth: '' }); renderAdj(); });
    $('#addPp').addEventListener('click', () => { pp.push({ from: '', to: '', note: '' }); renderPp(); });

    if (!isNew) {
      const pb = $('#price');
      if (pb) pb.addEventListener('click', async () => {
        const res = await U.modal({ title: '料金の変更', body: '<p>指定した月の分から新しい料金を適用します。それより前の月・発行済みの請求書は変わりません。</p><div class="row"><div class="field"><label>適用開始月</label><input type="month" id="em"></div><div class="field"><label>新しい料金（円）</label><input type="text" id="na"></div></div><div class="field"><label>変更理由・根拠（契約書など）</label><input type="text" id="rs"></div>', confirmLabel: '変更する', collect: (bg) => ({ m: bg.querySelector('#em').value, a: B.parseYen(bg.querySelector('#na').value), r: bg.querySelector('#rs').value.trim() }) });
        if (!res) return;
        if (!res.m || res.a === null || !res.r) { U.toast('適用開始月・料金（整数）・理由をすべて入力してください', 'error'); return; }
        const before = B.amountForMonth(c, res.m);
        c.priceHistory = c.priceHistory || [];
        c.priceHistory.push({ effectiveMonth: res.m, amount: res.a, reason: res.r, user: S.user(), at: Date.now() });
        hist(c, '料金変更', [B.ymLabel(res.m) + '分から ' + B.yen(before) + ' → ' + B.yen(res.a) + '（' + res.r + '）']);
        S.log('契約の料金を変更しました', { type: 'billing', id: c.id, label: c.name }, B.ymLabel(res.m) + '分から ' + B.yen(before) + ' → ' + B.yen(res.a));
        S.save(true);
        contractEdit(main, c.id);
      });
      $('#suspend').addEventListener('click', async () => {
        const res = await U.modal({ title: '請求停止の記録', body: '<div class="row"><div class="field"><label>停止開始月</label><input type="month" id="f"></div><div class="field"><label>再開前の最終月（未定なら空欄）</label><input type="month" id="t"></div></div><div class="field"><label>理由</label><input type="text" id="r"></div>', confirmLabel: '記録する', collect: (bg) => ({ f: bg.querySelector('#f').value, t: bg.querySelector('#t').value, r: bg.querySelector('#r').value.trim() }) });
        if (!res) return;
        if (!res.f || !res.r) { U.toast('停止開始月と理由を入力してください', 'error'); return; }
        c.suspensions = c.suspensions || [];
        c.suspensions.push({ from: res.f, to: res.t, reason: res.r, user: S.user(), at: Date.now() });
        hist(c, '請求停止', [B.ymLabel(res.f) + '〜' + (res.t ? B.ymLabel(res.t) : '未定') + '（' + res.r + '）']);
        S.log('契約の請求停止を記録しました', { type: 'billing', id: c.id, label: c.name }, B.ymLabel(res.f) + '〜' + (res.t ? B.ymLabel(res.t) : '未定'));
        S.save(true);
        contractEdit(main, c.id);
      });
      const eb = $('#end');
      if (eb) eb.addEventListener('click', async () => {
        const res = await U.modal({ title: '契約の終了', body: '<p>契約を終了します。終了後の月は請求漏れの一覧に出なくなり、請求すると警告が出ます。</p><div class="row"><div class="field"><label>契約終了日</label><input type="date" id="d"></div><div class="field"><label>請求終了月</label><input type="month" id="m"></div></div><div class="field"><label>理由</label><input type="text" id="r"></div>', check: '契約終了の内容を確認しました', confirmLabel: '終了する', danger: true, collect: (bg) => ({ d: bg.querySelector('#d').value, m: bg.querySelector('#m').value, r: bg.querySelector('#r').value.trim() }) });
        if (!res) return;
        if (!res.d || !res.m) { U.toast('契約終了日と請求終了月を入力してください', 'error'); return; }
        c.endDate = res.d; c.billingEndMonth = res.m; c.status = 'ended';
        hist(c, '契約終了', ['終了日 ' + res.d + '・請求終了月 ' + B.ymLabel(res.m) + (res.r ? '（' + res.r + '）' : '')]);
        S.log('契約を終了しました', { type: 'billing', id: c.id, label: c.name }, res.d);
        S.save(true);
        contractEdit(main, c.id);
      });
      $('#del').addEventListener('click', async () => {
        if (used.length) { U.toast('請求書がある契約は削除できません（「契約を終了する」を使ってください）', 'error'); return; }
        const ok = await U.modal({ title: '契約の削除', body: '<p>「' + esc(c.name) + '」を削除します。元に戻せません。</p>', check: '削除してよいことを確認しました', confirmLabel: '削除', danger: true });
        if (!ok) return;
        b.contracts = b.contracts.filter((x) => x.id !== c.id);
        S.log('契約を削除しました', { type: 'billing', id: c.id, label: c.name }, '');
        S.save(true);
        location.hash = '#/bill/contracts';
      });
    }

    $('#save').addEventListener('click', () => {
      const errs = [];
      const amRaw = $('#am').value.trim();
      const amount = priceLocked ? c.amount : amRaw === '' ? null : B.parseYen(amRaw);
      if (!priceLocked && amRaw !== '' && amount === null) errs.push('料金は円単位の整数で入力してください');
      if (!$('#cl').value) errs.push('請求先を選んでください');
      if (!$('#nm').value.trim()) errs.push('契約名を入力してください');
      const sd = $('#sd').value, ed = $('#ed').value, bs = $('#bs').value, be = $('#be').value;
      if (sd && ed && ed < sd) errs.push('契約終了日が開始日より前です');
      if (bs && be && be < bs) errs.push('請求終了月が開始月より前です');
      const adjOut = adj.filter((a) => a.label || a.amount !== null).map((a) => ({ label: String(a.label || '').trim(), amount: a.amount === '' || a.amount === null ? null : B.parseYen(a.amount), fromMonth: a.fromMonth, toMonth: a.toMonth }));
      adjOut.forEach((a, i) => { if (!a.label || a.amount === null || !a.fromMonth) errs.push('値引き・追加料金' + (i + 1) + '行目：名称・金額（整数）・開始月が必要です'); });
      const ppOut = pp.filter((p) => p.from || p.to).map((p) => ({ from: p.from, to: p.to, note: p.note || '', invoiceId: p.invoiceId || null }));
      ppOut.forEach((p, i) => { if (!p.from || !p.to || p.to < p.from) errs.push('前払い' + (i + 1) + '行目：開始月・終了月を正しく入力してください'); });
      const ifl = $('#ifl').value.trim(), ifa = $('#ifa').value.trim(), ifm = $('#ifm').value;
      let initialFee = null;
      if (ifl || ifa || ifm) {
        const a = ifa === '' ? null : B.parseYen(ifa);
        if (ifa !== '' && a === null) errs.push('初期費用の金額は整数で入力してください');
        if (!ifm) errs.push('初期費用を請求する月を入力してください');
        initialFee = { label: ifl || '初期費用', amount: a, month: ifm };
      }
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      const prv = $('#pr').value;
      const next = {
        clientId: $('#cl').value, storeId: $('#sto').value, projectId: $('#pj').value, name: $('#nm').value.trim(), service: $('#sv').value.trim(), docRefs: $('#doc').value.trim(),
        billingType: priceLocked ? c.billingType : $('#bt').value, amount, priceTaxMode: $('#pm').value || null, taxCategory: $('#tc').value || null,
        startDate: sd, endDate: ed, billingStartMonth: bs, billingEndMonth: be, billingTiming: { type: $('#ti').value, text: '' }, dueRuleNote: $('#dr').value.trim(),
        proration: prv === '' ? { enabled: null, method: '' } : prv === 'no' ? { enabled: false, method: '' } : { enabled: true, method: 'daily' },
        adjustments: adjOut, prepaid: ppOut, initialFee, memo: $('#memo').value,
      };
      const labels = { clientId: '請求先', storeId: '店舗', projectId: '案件', name: '契約名', service: 'サービス', docRefs: '契約書参照', billingType: '種類', amount: '料金', priceTaxMode: '税抜／税込', taxCategory: '税区分', startDate: '契約開始日', endDate: '契約終了日', billingStartMonth: '請求開始月', billingEndMonth: '請求終了月', billingTiming: '請求タイミング', dueRuleNote: '支払期限ルール', proration: '日割り', adjustments: '値引き・追加料金', prepaid: '前払い', initialFee: '初期費用', memo: '備考' };
      const ch = Object.keys(next).filter((k) => JSON.stringify(c[k] === undefined ? null : c[k]) !== JSON.stringify(next[k])).map((k) => labels[k] + (k === 'amount' ? '：' + B.yen(c.amount) + ' → ' + B.yen(next.amount) : ''));
      Object.assign(c, next);
      if (isNew) { b.contracts.push(c); hist(c, '登録', []); S.log('契約を登録しました', { type: 'billing', id: c.id, label: c.name }, X.clientLabel(X.client(c.clientId))); }
      else if (ch.length) { hist(c, '変更', ch); S.log('契約を変更しました', { type: 'billing', id: c.id, label: c.name }, ch.join('／')); }
      S.save(true);
      U.toast('保存しました（発行済みの請求書は変わりません）', 'ok');
      if (isNew) location.hash = '#/bill/contract/' + c.id; else contractEdit(main, c.id);
    });
  }

  root.FS.views.billClients = clients;
  root.FS.views.billClient = clientEdit;
  root.FS.views.billContracts = contracts;
  root.FS.views.billContract = contractEdit;
  root.FS.billui.contractUnset = contractUnset;
  root.FS.billui.clientUnset = clientUnset;
  root.FS.billui.newClient = newClient;
  root.FS.billui.newContract = newContract;
})(self);
