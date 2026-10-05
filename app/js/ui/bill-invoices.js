/* 画面：請求書（一覧・作成・定期請求の一括作成・チェック・承認・発行・取消・再発行・印刷/PDF・入金登録） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const B = root.FS.bill;
  const X = root.FS.billui;
  const F = root.FS.format;
  const CSV = root.FS.csv;
  const esc = U.esc;

  function newInvoice(cl) {
    const b = X.bill();
    const bank = b.settings.bankAccounts.find((a) => a.id === b.settings.defaultBankId) || null;
    const issueDate = X.today();
    return {
      id: S.uid('inv'), number: null, status: 'draft', clientId: cl ? cl.id : '', storeId: '', projectId: '',
      billTo: cl ? { name: cl.billingName || '', honorific: cl.honorific || '', postal: cl.postal || '', address: cl.address || '', contact: cl.contactName || '', email: cl.email || '' } : { name: '', honorific: '', postal: '', address: '', contact: '', email: '' },
      issueDate, dueDate: cl ? B.dueDateFor(issueDate, cl.paymentTerms) || '' : '', priceMode: null, bank: bank ? Object.assign({}, bank) : null,
      lines: [], notes: '', acks: [], totalsSnapshot: null, history: [], createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(), updatedBy: S.user(),
    };
  }

  function label(inv) { return (inv.number || '番号未発行') + '：' + X.clientLabel(X.client(inv.clientId)); }
  function target(inv) { return { type: 'invoice', id: inv.id, label: label(inv) }; }
  function hist(inv, action, detail) { inv.history = inv.history || []; inv.history.push({ at: Date.now(), user: S.user(), action, detail: detail || '' }); S.log(action, target(inv), detail || ''); }

  function check(inv) { return B.checkInvoice(inv, X.ctx()); }
  function totalsOf(inv) { return inv.status === 'issued' || inv.status === 'cancelled' ? inv.totalsSnapshot : B.calcTotals(inv.lines, inv.priceMode, X.bill().settings); }

  // ───────── 一覧 ─────────
  function list(main) {
    const b = X.bill();
    const f = JSON.parse(sessionStorage.getItem('inv-f') || '{}');
    const t = X.today();
    let rows = b.invoices.map((inv) => ({ inv, ps: B.paymentState(inv, b.payments, t) }));
    rows = rows.filter(({ inv, ps }) => {
      const d = B.displayStatus(inv, ps);
      if (f.q && ![inv.number, X.clientLabel(X.client(inv.clientId)), inv.billTo.name, (S.storeById(inv.storeId) || {}).name].join(' ').includes(f.q)) return false;
      if (f.status && d.key !== f.status && !(f.status === 'unpaid' && (d.key === 'issued' || d.key === 'partial' || d.key === 'overdue'))) return false;
      if (f.month && B.ymOf(inv.issueDate) !== f.month) return false;
      return true;
    }).sort((a, z) => (z.inv.issueDate || '').localeCompare(a.inv.issueDate || '') || z.inv.updatedAt - a.inv.updatedAt);
    const statusOpts = [['', 'すべて'], ['draft', '下書き'], ['review', '確認待ち'], ['approved', '承認済み'], ['unpaid', '未入金（発行済み・一部入金・期限超過）'], ['partial', '一部入金'], ['overdue', '期限超過'], ['paid', '入金済み'], ['cancelled', '取消']];
    main.innerHTML = '<h1>請求書</h1><p class="lead">請求書の作成・確認・発行・入金状況を管理します。発行（番号の確定）は承認後にのみ行えます。</p>' +
      '<div class="btns" style="margin-bottom:10px"><a class="btn primary" href="#/bill/inv/new">＋ 請求書を作成</a><a class="btn primary" href="#/bill/bulk">定期請求をまとめて作成</a><button class="btn" id="bulkAct">選んだ請求書を一括処理</button><button class="btn" id="exp">CSV出力</button><label class="btn">既存請求書をCSVから取込<input type="file" id="imp" accept=".csv" hidden></label></div>' +
      '<div class="row"><div class="field" style="flex:2 1 220px"><label>検索（番号・請求先・店舗）</label><input type="search" id="q" value="' + esc(f.q || '') + '"></div><div class="field"><label>状態</label><select id="st">' + statusOpts.map(([k, l]) => '<option value="' + k + '"' + ((f.status || '') === k ? ' selected' : '') + '>' + l + '</option>').join('') + '</select></div><div class="field"><label>発行月</label><input type="month" id="mo" value="' + esc(f.month || '') + '"></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th></th><th>請求書番号</th><th>請求先・店舗</th><th>発行日</th><th>支払期限</th><th class="num">合計</th><th class="num">入金済み</th><th class="num">残額</th><th>状態</th></tr></thead><tbody>' +
        rows.map(({ inv, ps }) => {
          const tot = totalsOf(inv);
          return '<tr><td><input type="checkbox" data-sel="' + inv.id + '"></td><td><a href="#/bill/inv/' + inv.id + '"><b>' + esc(inv.number || '（番号未発行）') + '</b></a>' + (inv.imported ? '<div class="chip">取込データ</div>' : '') + '</td><td>' + esc(X.clientLabel(X.client(inv.clientId))) + '<div class="small muted">' + esc((S.storeById(inv.storeId) || {}).name || '') + '</div></td>' +
            '<td class="nowrap">' + X.val(inv.issueDate) + '</td><td class="nowrap' + (ps.overdue ? ' overdue' : '') + '">' + X.val(inv.dueDate) + (ps.overdue ? '<div class="small">' + ps.daysOverdue + '日超過</div>' : '') + '</td>' +
            '<td class="money">' + (tot && tot.total !== null ? B.yen(tot.total) : X.unsetBadge('計算不可')) + '</td><td class="money">' + (inv.status === 'issued' ? B.yen(ps.paid) : '—') + '</td><td class="money">' + (inv.status === 'issued' ? B.yen(ps.remaining) : '—') + '</td><td>' + X.statusBadge(inv) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">該当する請求書はありません。</div>');
    const save = () => { sessionStorage.setItem('inv-f', JSON.stringify({ q: U.$('#q', main).value, status: U.$('#st', main).value, month: U.$('#mo', main).value })); list(main); };
    U.$('#q', main).addEventListener('change', save);
    U.$('#st', main).addEventListener('change', save);
    U.$('#mo', main).addEventListener('change', save);
    U.$('#exp', main).addEventListener('click', () => exportDialog());
    U.$('#imp', main).addEventListener('change', async (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) await importInvoices(file, () => list(main)); });
    U.$('#bulkAct', main).addEventListener('click', () => bulkAction(U.$$('[data-sel]', main).filter((x) => x.checked).map((x) => x.dataset.sel), () => list(main)));
  }

  // 一括処理：確認待ちへ／承認／発行。エラー・未確認の警告がある請求書は処理しない。
  async function bulkAction(ids, done) {
    if (!ids.length) { U.toast('処理する請求書を選んでください', 'error'); return; }
    const res = await U.modal({ title: '一括処理（' + ids.length + '件）', body: '<div class="field"><label>処理</label><select id="ac"><option value="review">確認待ちにする（下書き → 確認待ち）</option><option value="approve">承認する（確認待ち → 承認済み）</option><option value="issue">発行する（承認済み → 発行済み・番号確定）</option></select></div>', confirmLabel: '対象を確認する', collect: (bg) => ({ ac: bg.querySelector('#ac').value }) });
    if (!res) return;
    const from = { review: 'draft', approve: 'review', issue: 'approved' }[res.ac];
    const items = ids.map((id) => X.invoice(id)).map((inv) => {
      const r = check(inv);
      const blocks = [];
      if (inv.status !== from) blocks.push('状態が「' + B.INVOICE_STATUS[from] + '」ではありません');
      r.errors.forEach((e) => blocks.push(e.msg));
      if (res.ac !== 'review') B.unacknowledged(inv, r.warnings).forEach((w) => blocks.push('警告の理由が未確認：' + w.msg));
      return { inv, r, blocks };
    });
    const okItems = items.filter((x) => !x.blocks.length);
    const actName = { review: '確認待ちにする', approve: '承認する', issue: '発行する' }[res.ac];
    const ok = await U.modal({
      title: '一括処理の確認：' + actName,
      body: '<p>' + okItems.length + '件を処理します。' + (items.length - okItems.length ? '<b style="color:var(--danger)">' + (items.length - okItems.length) + '件は処理できません。</b>' : '') + '</p>' +
        '<div class="table-wrap" style="max-height:360px;overflow:auto"><table class="tbl small"><thead><tr><th>請求書</th><th class="num">合計</th><th>結果</th></tr></thead><tbody>' + items.map(({ inv, r, blocks }) => '<tr class="' + (blocks.length ? 'flag' : '') + '"><td>' + esc(label(inv)) + '</td><td class="money">' + (r.totals.total !== null ? B.yen(r.totals.total) : '—') + '</td><td>' + (blocks.length ? blocks.map(esc).join('<br>') : '処理します') + '</td></tr>').join('') + '</tbody></table></div>',
      check: okItems.length ? (res.ac === 'issue' ? '宛名・請求内容・金額・税区分・発行日・支払期限を確認し、発行してよいことを確認しました' : '内容を確認しました') : null,
      confirmLabel: okItems.length ? actName : null,
      cancelLabel: '閉じる',
    });
    if (!ok || !okItems.length) return;
    okItems.forEach(({ inv }) => {
      if (res.ac === 'review') { inv.status = 'review'; hist(inv, '確認待ちにしました（一括）'); }
      if (res.ac === 'approve') { inv.status = 'approved'; inv.approvedBy = S.user(); inv.approvedAt = Date.now(); hist(inv, '承認しました（一括）'); }
      if (res.ac === 'issue') issue(inv, true);
    });
    S.save(true);
    U.toast(okItems.length + '件を処理しました', 'ok');
    done();
  }

  // 発行：番号を確定し、発行者情報・振込先・税設定・金額を請求書に固定する（以後の設定・契約変更の影響を受けない）
  function issue(inv, bulk) {
    const b = X.bill();
    const r = check(inv);
    if (r.errors.length) throw new Error('エラーがあるため発行できません');
    inv.number = B.nextNumber(b.settings.numberFormat, inv.issueDate, b.invoices.map((i) => i.number).filter(Boolean));
    inv.status = 'issued';
    inv.issuedBy = S.user();
    inv.issuedAt = Date.now();
    inv.issuerSnapshot = JSON.parse(JSON.stringify(b.settings.issuer));
    inv.modeSnapshot = b.settings.invoiceMode;
    inv.roundingSnapshot = b.settings.rounding;
    inv.taxCategorySnapshot = JSON.parse(JSON.stringify(b.settings.taxCategories));
    inv.totalsSnapshot = r.totals;
    // 複数月をまとめた請求（前払い）は、契約に前払い期間として記録する
    const byContract = {};
    inv.lines.forEach((l) => { if (l.contractId && (l.kind === 'regular' || l.kind === 'proration') && l.targetMonth) (byContract[l.contractId] = byContract[l.contractId] || []).push(l.targetMonth); });
    Object.keys(byContract).forEach((cid) => {
      const ms = byContract[cid].sort();
      if (ms.length < 2) return;
      const c = X.contract(cid);
      if (!c) return;
      c.prepaid = c.prepaid || [];
      c.prepaid.push({ from: ms[0], to: ms[ms.length - 1], note: '請求書 ' + inv.number + ' で一括請求', invoiceId: inv.id });
      c.history = c.history || [];
      c.history.push({ at: Date.now(), user: S.user(), action: '前払い期間を登録', detail: B.ymLabel(ms[0]) + '〜' + B.ymLabel(ms[ms.length - 1]) + '（' + inv.number + '）' });
    });
    hist(inv, '発行しました' + (bulk ? '（一括）' : ''), '番号 ' + inv.number + '・合計 ' + B.yen(r.totals.total));
  }

  // ───────── 作成（請求先の選択）─────────
  async function createNew() {
    const b = X.bill();
    if (!b.clients.length) { U.toast('先に請求先を登録してください', 'error'); location.hash = '#/bill/client/new'; return; }
    const res = await U.modal({ title: '請求書を作成', body: '<div class="field"><label>請求先</label><select id="cl">' + b.clients.map((c) => '<option value="' + c.id + '">' + esc(c.companyName) + (c.status !== 'active' ? '（' + (c.status === 'paused' ? '停止中' : '終了') + '）' : '') + '</option>').join('') + '</select></div>', confirmLabel: '下書きを作成', collect: (bg) => ({ id: bg.querySelector('#cl').value }) });
    if (!res) { location.hash = '#/bill/invoices'; return; }
    const inv = newInvoice(X.client(res.id));
    b.invoices.push(inv);
    hist(inv, '請求書の下書きを作成しました', X.clientLabel(X.client(res.id)));
    S.save(true);
    location.hash = '#/bill/inv/' + inv.id;
  }

  // ───────── 編集・確認・発行 ─────────
  function edit(main, id) {
    if (id === 'new') { main.innerHTML = ''; createNew(); return; }
    const b = X.bill();
    const inv = X.invoice(id);
    if (!inv) { main.innerHTML = '<div class="empty">請求書が見つかりません。</div>'; return; }
    const editable = inv.status === 'draft';
    const cl = X.client(inv.clientId);
    const ps = B.paymentState(inv, b.payments, X.today());
    const r = check(inv);
    const tot = totalsOf(inv);
    const unack = B.unacknowledged(inv, r.warnings);
    const cats = (inv.taxCategorySnapshot || b.settings.taxCategories);
    const dis = editable ? '' : ' disabled';
    const steps = ['draft', 'review', 'approved', 'issued'];
    const cur = inv.status === 'cancelled' ? -1 : steps.indexOf(inv.status);
    const replaced = inv.replacedById ? X.invoice(inv.replacedById) : null;
    const replaces = inv.replacesId ? X.invoice(inv.replacesId) : null;

    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/bill/invoices">← 請求書一覧</a><div class="grow"><b>' + esc(inv.number || '請求書（番号未発行）') + '</b>　' + X.statusBadge(inv) +
      '<div class="steps">' + steps.map((k, i) => '<span class="' + (i === cur ? 'on' : i < cur ? 'past' : '') + '">' + B.INVOICE_STATUS[k] + '</span>').join('') + '</div></div><div class="btns" id="acts"></div></div>' +
      (inv.status === 'cancelled' ? '<div class="alert danger">この請求書は取り消されています。理由：' + esc(inv.cancelReason || '') + (replaced ? '　再発行：<a href="#/bill/inv/' + replaced.id + '">' + esc(replaced.number || '番号未発行の再発行分') + '</a>' : '') + '</div>' : '') +
      (replaces ? '<div class="alert info">この請求書は <a href="#/bill/inv/' + replaces.id + '">' + esc(replaces.number) + '</a> の再発行分です。</div>' : '') +
      (inv.imported ? '<div class="alert info">既存の請求書から取り込んだデータです（明細は取り込んでいません）。</div>' : '') +
      '<div class="grid2"><div>' +
      '<div class="panel"><h2>請求先・宛名</h2><p class="small">請求先：<b>' + esc(X.clientLabel(cl)) + '</b>' + (cl && cl.notes ? '<br><span style="color:var(--warn)">注意事項：' + esc(cl.notes) + '</span>' : '') + '</p>' +
      '<div class="row"><div class="field" style="flex:3 1 200px"><label>宛名</label><input type="text" id="bn" value="' + esc(inv.billTo.name) + '"' + dis + '></div><div class="field" style="flex:1 1 80px"><label>敬称</label><select id="ho"' + dis + '>' + ['御中', '様', ''].map((h) => '<option value="' + h + '"' + (inv.billTo.honorific === h ? ' selected' : '') + '>' + (h || 'なし') + '</option>').join('') + '</select></div></div>' +
      '<div class="row"><div class="field" style="flex:0 1 120px"><label>郵便番号</label><input type="text" id="po" value="' + esc(inv.billTo.postal) + '"' + dis + '></div><div class="field"><label>住所</label><input type="text" id="ad" value="' + esc(inv.billTo.address) + '"' + dis + '></div></div>' +
      '<div class="row"><div class="field"><label>担当者</label><input type="text" id="co" value="' + esc(inv.billTo.contact) + '"' + dis + '></div><div class="field"><label>メール</label><input type="text" id="em" value="' + esc(inv.billTo.email) + '"' + dis + '></div></div>' +
      '<div class="row"><div class="field"><label>店舗</label><select id="sto"' + dis + '><option value="">（なし）</option>' + ((cl && cl.storeIds) || []).map((sid) => S.storeById(sid)).filter(Boolean).map((s) => '<option value="' + s.id + '"' + (s.id === inv.storeId ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('') + '</select></div><div class="field"><label>案件</label><select id="pj"' + dis + '></select></div></div></div>' +
      '<div class="panel"><h2>日付・条件</h2><div class="row"><div class="field"><label>発行日</label><input type="date" id="idt" value="' + esc(inv.issueDate) + '"' + dis + '></div><div class="field"><label>支払期限</label><input type="date" id="ddt" value="' + esc(inv.dueDate) + '"' + dis + '><div class="hint">支払条件：' + esc(cl ? B.termsLabel(cl.paymentTerms) : '—') + (editable ? ' <a href="#" id="calcDue">条件から計算</a>' : '') + '</div></div></div>' +
      '<div class="row"><div class="field"><label>金額の表示</label><select id="pm"' + dis + '><option value="">未設定</option><option value="excluded"' + (inv.priceMode === 'excluded' ? ' selected' : '') + '>税抜（消費税を加算）</option><option value="included"' + (inv.priceMode === 'included' ? ' selected' : '') + '>税込（内税）</option></select></div>' +
      '<div class="field"><label>振込先</label><select id="bk"' + dis + '><option value="">未設定</option>' + b.settings.bankAccounts.map((a) => '<option value="' + a.id + '"' + (inv.bank && inv.bank.id === a.id ? ' selected' : '') + '>' + esc(a.label || a.bankName) + '</option>').join('') + (inv.bank && !b.settings.bankAccounts.some((a) => a.id === inv.bank.id) ? '<option selected>' + esc(inv.bank.bankName) + '（作成時の振込先）</option>' : '') + '</select></div></div>' +
      '<div class="field"><label>備考（請求書に記載）</label><textarea id="nt" style="min-height:60px"' + dis + '>' + esc(inv.notes) + '</textarea></div></div>' +
      '</div><div>' +
      '<div class="panel"><h2>確認事項</h2>' +
      (r.errors.length ? '<div class="alert danger"><b>確定できない項目（' + r.errors.length + '件）</b><ul style="margin:6px 0 0 18px;padding:0">' + r.errors.map((e) => '<li>' + esc(e.msg) + '</li>').join('') + '</ul></div>' : '<div class="alert info">確定できない項目はありません。</div>') +
      (r.warnings.length ? '<div class="alert warn"><b>警告（理由を記録すると確定できます）</b>' + r.warnings.map((w, i) => { const a = (inv.acks || []).find((x) => x.code === w.code && x.msg === w.msg); return '<div style="margin-top:8px"><div>' + esc(w.msg) + '</div><div class="row" style="margin-top:4px"><div class="field" style="margin:0;flex:3 1 200px"><input type="text" data-ackr="' + i + '" value="' + esc(a ? a.reason : '') + '" placeholder="問題ない理由（例：前月分の差し替えのため）"' + (inv.status === 'issued' || inv.status === 'cancelled' ? ' disabled' : '') + '></div>' + (a && a.reason ? '<span class="small">確認済み（' + esc(a.by) + '）</span>' : '') + '</div></div>'; }).join('') + (inv.status === 'issued' || inv.status === 'cancelled' ? '' : '<button class="btn small" id="saveAck" style="margin-top:8px">理由を記録</button>') + '</div>' : '') +
      '</div>' +
      '<div class="panel"><h2>金額</h2>' + totalsHtml(tot, inv.priceMode) + '</div>' +
      (inv.status === 'issued' || inv.status === 'cancelled' ? paymentsHtml(inv, ps) : '') +
      '</div></div>' +
      '<div class="panel"><h2>請求項目</h2>' + linesHtml(inv, cats, editable) + '</div>' +
      '<div class="panel"><h2>処理履歴</h2>' + U.historyList(inv) + '</div>';

    const $ = (s) => U.$(s, main);
    const renderPj = () => { const sid = $('#sto').value; $('#pj').innerHTML = sid ? U.projectOptions(sid, inv.projectId) : '<option value="">（なし）</option>'; if (!editable) $('#pj').disabled = true; };
    renderPj();
    const refresh = () => edit(main, inv.id);

    if (editable) {
      const touch = () => { inv.updatedAt = Date.now(); inv.updatedBy = S.user(); S.save(); };
      const bind = (sel, fn, evt) => $(sel).addEventListener(evt || 'change', () => { fn($(sel).value); touch(); refresh(); });
      bind('#bn', (v) => { inv.billTo.name = v.trim(); }); bind('#ho', (v) => { inv.billTo.honorific = v; }); bind('#po', (v) => { inv.billTo.postal = v.trim(); });
      bind('#ad', (v) => { inv.billTo.address = v.trim(); }); bind('#co', (v) => { inv.billTo.contact = v.trim(); }); bind('#em', (v) => { inv.billTo.email = v.trim(); });
      bind('#sto', (v) => { inv.storeId = v; inv.projectId = ''; }); bind('#pj', (v) => { inv.projectId = v; });
      bind('#idt', (v) => { inv.issueDate = v; }); bind('#ddt', (v) => { inv.dueDate = v; });
      bind('#pm', (v) => { inv.priceMode = v || null; });
      bind('#bk', (v) => { const a = b.settings.bankAccounts.find((x) => x.id === v); inv.bank = a ? Object.assign({}, a) : null; });
      bind('#nt', (v) => { inv.notes = v; });
      $('#calcDue').addEventListener('click', (e) => {
        e.preventDefault();
        const d = cl ? B.dueDateFor(inv.issueDate, cl.paymentTerms) : null;
        if (!d) { U.toast('請求先の支払条件が未設定のため計算できません。支払期限を手入力してください。', 'error'); return; }
        inv.dueDate = d; touch(); hist(inv, '支払期限を支払条件から計算しました', d); refresh();
      });
      bindLines(main, inv, touch, refresh);
    }
    const sa = $('#saveAck');
    if (sa) sa.addEventListener('click', () => {
      inv.acks = (inv.acks || []).filter((a) => r.warnings.some((w) => w.code === a.code && w.msg === a.msg));
      U.$$('[data-ackr]', main).forEach((el) => {
        const w = r.warnings[Number(el.dataset.ackr)];
        const reason = el.value.trim();
        inv.acks = inv.acks.filter((a) => !(a.code === w.code && a.msg === w.msg));
        if (reason) { inv.acks.push({ code: w.code, msg: w.msg, reason, by: S.user(), at: Date.now() }); hist(inv, '警告の理由を記録しました', w.msg + ' → ' + reason); }
      });
      S.save(true);
      refresh();
    });
    renderActions($('#acts'), inv, r, unack, ps, refresh);
    bindPayments(main, inv, ps, refresh);
  }

  function totalsHtml(tot, mode) {
    if (!tot) return '<p class="muted">—</p>';
    if (tot.total === null) return '<div class="alert danger">金額を計算できません：' + esc(tot.errors.join('／')) + '</div>';
    return '<table class="tbl"><thead><tr><th>区分</th><th class="num">対象額（' + (mode === 'included' ? '税込' : '税抜') + '）</th><th class="num">消費税額</th></tr></thead><tbody>' +
      tot.groups.map((g) => '<tr><td>' + esc(g.label) + (g.taxable ? '（' + g.rate + '%）' : '') + '</td><td class="money">' + B.yen(mode === 'included' ? g.total : g.base) + '</td><td class="money">' + (g.taxable ? B.yen(g.tax) : '—') + '</td></tr>').join('') +
      '<tr><th>小計（税抜）</th><td class="money">' + B.yen(tot.subtotal) + '</td><td></td></tr><tr><th>消費税</th><td class="money">' + B.yen(tot.tax) + '</td><td></td></tr><tr><th style="font-size:15px">ご請求金額（税込）</th><td class="money" style="font-size:18px"><b>' + B.yen(tot.total) + '</b></td><td></td></tr></tbody></table>';
  }

  function linesHtml(inv, cats, editable) {
    const dis = editable ? '' : ' disabled';
    const rows = inv.lines.map((l, i) => {
      const c = l.contractId ? X.contract(l.contractId) : null;
      const amt = B.lineAmount(l);
      return '<tr><td><input type="text" data-l="' + i + '" data-f="description" value="' + esc(l.description) + '"' + dis + ' style="min-width:220px">' + (c ? '<div class="small muted">契約：<a href="#/bill/contract/' + c.id + '">' + esc(c.name) + '</a></div>' : '') + '</td>' +
        '<td><input type="month" data-l="' + i + '" data-f="targetMonth" value="' + esc(l.targetMonth || '') + '"' + dis + '></td>' +
        '<td><select data-l="' + i + '" data-f="kind"' + dis + '>' + Object.keys(B.LINE_KINDS).map((k) => '<option value="' + k + '"' + (l.kind === k ? ' selected' : '') + '>' + B.LINE_KINDS[k] + '</option>').join('') + '</select></td>' +
        '<td><input type="text" data-l="' + i + '" data-f="qty" value="' + esc(l.qty) + '" style="width:70px"' + dis + '></td>' +
        '<td><input type="text" data-l="' + i + '" data-f="unitPrice" value="' + esc(l.unitPrice === null || l.unitPrice === undefined ? '' : l.unitPrice) + '" placeholder="未設定" style="width:110px"' + dis + '></td>' +
        '<td><select data-l="' + i + '" data-f="taxCategory"' + dis + '><option value="">未設定</option>' + cats.map((x) => '<option value="' + x.key + '"' + (l.taxCategory === x.key ? ' selected' : '') + '>' + esc(x.label) + '</option>').join('') + '</select></td>' +
        '<td class="money">' + (amt === null ? X.unsetBadge() : B.yen(amt)) + '</td>' + (editable ? '<td><button class="btn small danger" data-ldel="' + i + '">削除</button></td>' : '') + '</tr>';
    }).join('');
    return '<div class="table-wrap"><table class="tbl"><thead><tr><th>品目・内容</th><th>対象月</th><th>種類</th><th>数量</th><th>単価（円）</th><th>税区分</th><th class="num">金額</th>' + (editable ? '<th></th>' : '') + '</tr></thead><tbody>' + (rows || '<tr><td colspan="8" class="muted">請求項目がありません。</td></tr>') + '</tbody></table></div>' +
      (editable ? '<div class="btns" style="margin-top:8px"><button class="btn" id="addFromContract">契約から追加（対象月・複数月の一括も可）</button><button class="btn" id="addLine">項目を手入力で追加（単発・追加作業・値引き）</button></div><p class="small muted">値引きは単価をマイナスで入力します。金額に1円未満の端数が出る入力はできません。</p>' : '');
  }

  function bindLines(main, inv, touch, refresh) {
    U.$$('[data-l]', main).forEach((el) => el.addEventListener('change', () => {
      const l = inv.lines[Number(el.dataset.l)];
      const f = el.dataset.f;
      let v = el.value;
      if (f === 'unitPrice') { if (v.trim() === '') v = null; else { const n = B.parseYen(v); if (n === null) { U.toast('単価は円単位の整数で入力してください（値引きはマイナス）', 'error'); refresh(); return; } v = n; } }
      if (f === 'qty') { const n = Number(v); if (!isFinite(n) || v.trim() === '') { U.toast('数量は数値で入力してください', 'error'); refresh(); return; } v = n; }
      if (f === 'taxCategory') v = v || null;
      const before = l[f];
      if (before === v) return;
      l[f] = v;
      const names = { targetMonth: '対象月', kind: '種類', qty: '数量', unitPrice: '単価', taxCategory: '税区分' };
      const cats = X.bill().settings.taxCategories;
      const show = (x) => (x === null || x === undefined || x === '' ? '未設定' : f === 'kind' ? B.LINE_KINDS[x] : f === 'taxCategory' ? ((cats.find((c) => c.key === x) || {}).label || x) : f === 'unitPrice' ? B.yen(x) : x);
      if (f !== 'description') hist(inv, '請求項目を変更しました', (l.description || '（品目未入力）') + '：' + names[f] + ' ' + show(before) + ' → ' + show(v));
      touch(); refresh();
    }));
    U.$$('[data-ldel]', main).forEach((el) => el.addEventListener('click', () => { const l = inv.lines.splice(Number(el.dataset.ldel), 1)[0]; hist(inv, '請求項目を削除しました', l.description); touch(); refresh(); }));
    U.$('#addLine', main).addEventListener('click', () => { inv.lines.push({ id: S.uid('l'), contractId: null, targetMonth: '', kind: 'one_time', description: '', qty: 1, unitPrice: null, taxCategory: null }); touch(); refresh(); });
    U.$('#addFromContract', main).addEventListener('click', async () => {
      const b = X.bill();
      const cts = b.contracts.filter((c) => c.clientId === inv.clientId);
      if (!cts.length) { U.toast('この請求先の契約がありません', 'error'); return; }
      const res = await U.modal({ title: '契約から請求項目を追加', body: '<div class="field"><label>契約</label><select id="ct">' + cts.map((c) => '<option value="' + c.id + '">' + esc(c.name) + (c.status === 'ended' ? '（終了）' : '') + '</option>').join('') + '</select></div><div class="row"><div class="field"><label>対象月（から）</label><input type="month" id="f" value="' + X.thisMonth() + '"></div><div class="field"><label>対象月（まで）※複数月の一括・前払いの場合</label><input type="month" id="t"></div></div>', confirmLabel: '追加', collect: (bg) => ({ ct: bg.querySelector('#ct').value, f: bg.querySelector('#f').value, t: bg.querySelector('#t').value || bg.querySelector('#f').value }) });
      if (!res) return;
      const c = X.contract(res.ct);
      const months = B.monthsBetween(res.f, res.t);
      if (!months.length) { U.toast('対象月を正しく入力してください', 'error'); return; }
      if (months.length > 24) { U.toast('一度に追加できるのは24か月までです', 'error'); return; }
      const issues = [];
      months.forEach((ym) => { const out = B.contractLinesForMonth(c, ym, b.settings); inv.lines.push(...out.lines); issues.push(...out.issues); });
      if (!inv.priceMode && c.priceTaxMode) inv.priceMode = c.priceTaxMode;
      if (!inv.storeId && c.storeId) { inv.storeId = c.storeId; inv.projectId = c.projectId || ''; }
      if (inv.priceMode && c.priceTaxMode && inv.priceMode !== c.priceTaxMode) issues.push('この契約は「' + B.PRICE_MODE[c.priceTaxMode] + '」ですが、請求書は「' + B.PRICE_MODE[inv.priceMode] + '」です。金額の扱いを確認してください');
      hist(inv, '契約から請求項目を追加しました', c.name + '：' + months.map(B.ymLabel).join('、'));
      touch();
      if (issues.length) await U.modal({ title: '未設定の項目があります', body: '<ul class="checks">' + Array.from(new Set(issues)).map((x) => '<li>' + esc(x) + '</li>').join('') + '</ul><p class="small">契約画面で設定するか、請求項目を直接入力してください。推測で入力しないでください。</p>', confirmLabel: 'OK', hideCancel: true });
      refresh();
    });
  }

  function renderActions(el, inv, r, unack, ps, refresh) {
    const b = X.bill();
    const btn = (k, l, cls) => '<button class="btn ' + (cls || '') + '" data-a="' + k + '">' + l + '</button>';
    const h = [];
    h.push('<a class="btn" href="#/bill/print/' + inv.id + '">' + (inv.status === 'issued' || inv.status === 'cancelled' ? '請求書を表示・PDF' : 'プレビュー') + '</a>');
    if (inv.status === 'draft') { h.push(btn('review', '確認待ちにする', 'primary')); h.push(btn('delete', '削除', 'danger')); }
    if (inv.status === 'review') { h.push(btn('approve', '承認する', 'ok')); h.push(btn('back', '差し戻す')); }
    if (inv.status === 'approved') { h.push(btn('issue', '発行する（番号確定）', 'primary')); h.push(btn('back', '下書きに戻す')); }
    if (inv.status === 'issued') { h.push(btn('mail', '送付メール文面をコピー')); h.push(btn('reissue', '再発行')); h.push(btn('cancel', '取消', 'danger')); }
    el.innerHTML = h.join('');
    const confirmBody = () => '<table class="tbl small"><tr><th>宛名</th><td>' + esc(inv.billTo.name) + ' ' + esc(inv.billTo.honorific) + '</td></tr><tr><th>請求内容</th><td>' + inv.lines.map((l) => esc(l.description) + '（' + B.yen(B.lineAmount(l)) + '）').join('<br>') + '</td></tr><tr><th>税区分</th><td>' + esc(Array.from(new Set(inv.lines.map((l) => ((b.settings.taxCategories.find((c) => c.key === l.taxCategory) || {}).label) || '未設定'))).join('、')) + '・' + esc(B.PRICE_MODE[inv.priceMode] || '未設定') + '・端数' + esc(B.ROUNDING[b.settings.rounding] || '未設定') + '</td></tr><tr><th>合計</th><td><b>' + B.yen(r.totals.total) + '</b>（うち消費税 ' + B.yen(r.totals.tax) + '）</td></tr><tr><th>発行日</th><td>' + esc(inv.issueDate) + '</td></tr><tr><th>支払期限</th><td>' + esc(inv.dueDate) + '</td></tr><tr><th>振込先</th><td>' + esc(inv.bank ? inv.bank.bankName + ' ' + (inv.bank.branch || '') + ' ' + (inv.bank.type || '') + ' ' + (inv.bank.number || '') : '未設定') + '</td></tr></table>';
    const blockMsg = () => '<div class="alert danger"><b>次の項目を解決するまで進めません：</b><ul style="margin:6px 0 0 18px;padding:0">' + r.errors.map((e) => '<li>' + esc(e.msg) + '</li>').join('') + unack.map((w) => '<li>警告の理由が未確認：' + esc(w.msg) + '</li>').join('') + '</ul></div>';
    U.$$('[data-a]', el).forEach((bt) => bt.addEventListener('click', async () => {
      const a = bt.dataset.a;
      if (a === 'review') {
        if (r.errors.length) { await U.modal({ title: '確認待ちにできません', body: blockMsg(), confirmLabel: 'OK', hideCancel: true }); return; }
        inv.status = 'review'; hist(inv, '確認待ちにしました');
      } else if (a === 'approve') {
        if (r.errors.length || unack.length) { await U.modal({ title: '承認できません', body: blockMsg(), confirmLabel: 'OK', hideCancel: true }); return; }
        const ok = await U.modal({ title: '請求書の承認', body: '<p>次の内容で承認します。承認後は内容を変更できません（変更する場合は下書きに戻します）。</p>' + confirmBody() + (r.warnings.length ? '<div class="alert warn small">警告' + r.warnings.length + '件は理由を記録済みです。</div>' : ''), check: '宛名・請求内容・金額・税区分・発行日・支払期限を確認しました', confirmLabel: '承認する' });
        if (!ok) return;
        inv.status = 'approved'; inv.approvedBy = S.user(); inv.approvedAt = Date.now(); hist(inv, '承認しました', '合計 ' + B.yen(r.totals.total));
      } else if (a === 'back') {
        inv.status = 'draft'; inv.approvedBy = null; hist(inv, '下書きに戻しました');
      } else if (a === 'delete') {
        const ok = await U.modal({ title: '下書きの削除', body: '<p>この下書き（番号未発行）を削除します。元に戻せません。</p>', check: '削除してよいことを確認しました', confirmLabel: '削除', danger: true });
        if (!ok) return;
        b.invoices = b.invoices.filter((x) => x.id !== inv.id);
        S.log('請求書の下書きを削除しました', target(inv), '');
        S.save(true);
        location.hash = '#/bill/invoices';
        return;
      } else if (a === 'issue') {
        if (r.errors.length || unack.length) { await U.modal({ title: '発行できません', body: blockMsg(), confirmLabel: 'OK', hideCancel: true }); return; }
        const preview = B.nextNumber(b.settings.numberFormat, inv.issueDate, b.invoices.map((i) => i.number).filter(Boolean));
        const ok = await U.modal({ title: '請求書の発行', body: '<p>請求書番号 <b>' + esc(preview) + '</b> で発行します。発行後は内容を変更できません（修正は「取消」または「再発行」）。このツールからは送信しません。</p>' + confirmBody(), check: '内容を確認し、この請求書を発行してよいことを確認しました', confirmLabel: '発行する' });
        if (!ok) return;
        issue(inv);
      } else if (a === 'cancel') {
        const res = await U.modal({ title: '請求書の取消', body: '<p><b>' + esc(inv.number) + '</b>（' + B.yen(inv.totalsSnapshot.total) + '）を取り消します。番号は再利用しません。' + (ps.paid > 0 ? '<br><b style="color:var(--danger)">入金が ' + B.yen(ps.paid) + ' 登録されています。返金・振替の扱いを確認してください。</b>' : '') + '</p><div class="field"><label>取消理由（必須）</label><input type="text" id="rs"></div>', check: '取消してよいことを確認しました（先方へ送付済みの場合は、取消の連絡が別途必要です）', confirmLabel: '取り消す', danger: true, collect: (bg) => ({ rs: bg.querySelector('#rs').value.trim() }) });
        if (!res) return;
        if (!res.rs) { U.toast('取消理由を入力してください', 'error'); return; }
        inv.status = 'cancelled'; inv.cancelReason = res.rs; inv.cancelledBy = S.user(); inv.cancelledAt = Date.now();
        releasePrepaid(inv);
        hist(inv, '取り消しました', res.rs);
      } else if (a === 'reissue') {
        const res = await U.modal({ title: '再発行', body: '<p><b>' + esc(inv.number) + '</b> を取り消し、同じ内容の新しい下書きを作ります。新しい下書きを修正・承認・発行してください（新しい番号になります）。' + (ps.paid > 0 ? '<br><b style="color:var(--danger)">入金が ' + B.yen(ps.paid) + ' 登録されています。新しい請求書への振替を確認してください。</b>' : '') + '</p><div class="field"><label>再発行の理由（必須）</label><input type="text" id="rs"></div>', check: '元の請求書を取り消して再発行することを確認しました', confirmLabel: '再発行の下書きを作る', danger: true, collect: (bg) => ({ rs: bg.querySelector('#rs').value.trim() }) });
        if (!res) return;
        if (!res.rs) { U.toast('理由を入力してください', 'error'); return; }
        const n = JSON.parse(JSON.stringify(inv));
        Object.assign(n, { id: S.uid('inv'), number: null, status: 'draft', acks: [], totalsSnapshot: null, issuerSnapshot: null, modeSnapshot: null, roundingSnapshot: null, taxCategorySnapshot: null, history: [], replacesId: inv.id, replacedById: null, cancelReason: null, approvedBy: null, issuedBy: null, imported: false, createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now() });
        n.lines.forEach((l) => { l.id = S.uid('l'); });
        inv.status = 'cancelled'; inv.cancelReason = '再発行のため：' + res.rs; inv.replacedById = n.id; inv.cancelledBy = S.user(); inv.cancelledAt = Date.now();
        releasePrepaid(inv);
        hist(inv, '再発行のため取り消しました', res.rs);
        b.invoices.push(n);
        hist(n, '再発行の下書きを作成しました', '元の請求書：' + inv.number);
        S.save(true);
        location.hash = '#/bill/inv/' + n.id;
        return;
      } else if (a === 'mail') {
        const text = mailText(inv);
        const ok = await U.modal({ title: '送付メール文面のコピー', body: '<p>このツールからはメールを送信しません。文面をコピーし、メールソフトで請求書PDFを添付して、宛先を確認してから送信してください。</p><table class="tbl small"><tr><th>宛先</th><td>' + esc(inv.billTo.email || '（メールアドレス未設定）') + '</td></tr><tr><th>請求書</th><td>' + esc(inv.number) + '（' + B.yen(inv.totalsSnapshot.total) + '）</td></tr></table><div class="pre" style="max-height:220px;overflow:auto">' + esc(text) + '</div>', check: '発行済み・承認済みの請求書であり、宛先と添付するPDFが正しいことを確認しました', confirmLabel: 'コピーする' });
        if (!ok) return;
        const c = await U.copyText(text);
        U.toast(c ? 'コピーしました' : 'コピーできませんでした', c ? 'ok' : 'error');
        hist(inv, '送付メール文面をコピーしました', inv.billTo.email || '');
      }
      inv.updatedAt = Date.now();
      S.save(true);
      refresh();
    }));
  }

  // 取消時、この請求書で登録した前払い期間を契約から外す
  function releasePrepaid(inv) {
    X.bill().contracts.forEach((c) => {
      const before = (c.prepaid || []).length;
      c.prepaid = (c.prepaid || []).filter((p) => p.invoiceId !== inv.id);
      if (c.prepaid.length !== before) { c.history = c.history || []; c.history.push({ at: Date.now(), user: S.user(), action: '前払い期間を解除', detail: '請求書 ' + inv.number + ' の取消のため' }); }
    });
  }

  function mailText(inv) {
    const s = inv.issuerSnapshot || X.bill().settings.issuer;
    return inv.billTo.name + ' ' + inv.billTo.honorific + '\n' + (inv.billTo.contact ? inv.billTo.contact + ' 様\n' : '') + '\nいつもお世話になっております。' + (s.name || '') + 'です。\n\n下記のとおりご請求申し上げます。請求書を添付いたしますので、ご確認をお願いいたします。\n\n・請求書番号：' + inv.number + '\n・ご請求金額：' + B.yen(inv.totalsSnapshot.total) + '（税込）\n・お支払期限：' + inv.dueDate.replace(/-/g, '/') + '\n\nどうぞよろしくお願いいたします。';
  }

  // ───────── 入金 ─────────
  function paymentsHtml(inv, ps) {
    const pays = X.bill().payments.filter((p) => p.invoiceId === inv.id);
    return '<div class="panel"><h2>入金</h2><table class="tbl"><tr><th>ご請求金額</th><td class="money">' + B.yen(ps.total) + '</td></tr><tr><th>入金済み</th><td class="money">' + B.yen(ps.paid) + '</td></tr><tr><th>請求残額</th><td class="money"><b>' + B.yen(ps.remaining) + '</b></td></tr><tr><th>入金予定日（支払期限）</th><td>' + esc(inv.dueDate) + (ps.overdue ? ' <span class="badge danger">' + ps.daysOverdue + '日超過</span>' : '') + '</td></tr><tr><th>状態</th><td>' + esc(B.PAY_STATE[ps.state]) + '</td></tr></table>' +
      (pays.length ? '<h3 style="margin-top:12px">入金の記録</h3><table class="tbl small"><thead><tr><th>入金日</th><th class="num">入金額</th><th>方法</th><th>メモ</th><th>登録</th><th></th></tr></thead>' + pays.map((p) => '<tr class="' + (p.voided ? 'muted' : '') + '"><td>' + esc(p.date) + '</td><td class="money">' + (p.voided ? '<s>' + B.yen(p.amount) + '</s>' : B.yen(p.amount)) + '</td><td>' + esc(p.method) + '</td><td>' + esc(p.memo) + (p.voided ? '<div>取消：' + esc(p.voidReason) + '</div>' : '') + '</td><td class="muted">' + esc(p.by) + (p.source === 'csv' ? '（CSV）' : '') + '</td><td>' + (p.voided ? '' : '<button class="btn small danger" data-pv="' + p.id + '">取消</button>') + '</td></tr>').join('') + '</table>' : '') +
      (inv.status === 'issued' ? '<button class="btn primary" id="addPay" style="margin-top:8px">入金を登録</button>' : '') + '</div>';
  }

  function bindPayments(main, inv, ps, refresh) {
    const b = X.bill();
    const add = U.$('#addPay', main);
    if (add) add.addEventListener('click', async () => {
      const res = await U.modal({ title: '入金の登録：' + inv.number, body: '<p>請求残額：<b>' + B.yen(ps.remaining) + '</b></p><div class="row"><div class="field"><label>入金日</label><input type="date" id="d" value="' + X.today() + '"></div><div class="field"><label>入金額（円）</label><input type="text" id="a" value="' + (ps.remaining > 0 ? ps.remaining : '') + '"></div></div><div class="row"><div class="field"><label>入金方法</label><select id="m"><option>銀行振込</option><option>現金</option><option>口座振替</option><option>クレジットカード</option><option>その他</option></select></div><div class="field"><label>入金確認メモ</label><input type="text" id="n" placeholder="例：振込名義・通帳で確認"></div></div>', confirmLabel: '内容を確認', collect: (bg) => ({ d: bg.querySelector('#d').value, a: B.parseYen(bg.querySelector('#a').value), m: bg.querySelector('#m').value, n: bg.querySelector('#n').value.trim() }) });
      if (!res) return;
      if (!res.d || res.a === null || res.a <= 0) { U.toast('入金日と入金額（1円以上の整数）を入力してください', 'error'); return; }
      const warn = [];
      if (res.a > ps.remaining) warn.push('入金額が請求残額（' + B.yen(ps.remaining) + '）を超えています（過入金）');
      if (res.d > X.today()) warn.push('入金日が今日より後です');
      if (b.payments.some((p) => p.invoiceId === inv.id && !p.voided && p.date === res.d && Number(p.amount) === res.a)) warn.push('同じ日付・金額の入金が既にあります（二重登録の可能性）');
      const after = ps.remaining - res.a;
      const ok = await U.modal({ title: '入金登録の確認', body: '<table class="tbl"><tr><th>請求書</th><td>' + esc(inv.number) + '</td></tr><tr><th>入金日</th><td>' + esc(res.d) + '</td></tr><tr><th>入金額</th><td>' + B.yen(res.a) + '</td></tr><tr><th>登録後の残額</th><td><b>' + B.yen(after) + '</b>（' + (after === 0 ? '入金済み' : after > 0 ? '一部入金' : '過入金') + '）</td></tr></table>' + (warn.length ? '<ul class="checks">' + warn.map((w) => '<li>' + esc(w) + '</li>').join('') + '</ul>' : ''), check: warn.length ? '上記の注意点を確認しました' : null, confirmLabel: '登録する' });
      if (!ok) return;
      const p = { id: S.uid('pay'), invoiceId: inv.id, date: res.d, amount: res.a, method: res.m, memo: res.n, by: S.user(), at: Date.now(), source: 'manual' };
      b.payments.push(p);
      hist(inv, '入金を登録しました', res.d + '・' + B.yen(res.a) + '・' + res.m + '（残額 ' + B.yen(after) + '）');
      S.save(true);
      refresh();
    });
    U.$$('[data-pv]', main).forEach((bt) => bt.addEventListener('click', async () => {
      const p = b.payments.find((x) => x.id === bt.dataset.pv);
      const res = await U.modal({ title: '入金記録の取消', body: '<p>' + esc(p.date) + '・' + B.yen(p.amount) + ' の入金記録を取り消します（記録は残ります）。</p><div class="field"><label>理由（必須）</label><input type="text" id="r"></div>', confirmLabel: '取り消す', danger: true, collect: (bg) => ({ r: bg.querySelector('#r').value.trim() }) });
      if (!res) return;
      if (!res.r) { U.toast('理由を入力してください', 'error'); return; }
      p.voided = true; p.voidReason = res.r; p.voidedBy = S.user(); p.voidedAt = Date.now();
      hist(inv, '入金記録を取り消しました', p.date + '・' + B.yen(p.amount) + '（' + res.r + '）');
      S.save(true);
      refresh();
    }));
  }

  // ───────── 定期請求のまとめ作成 ─────────
  function bulk(main) {
    const b = X.bill();
    const ym = sessionStorage.getItem('bulk-ym') || X.thisMonth();
    const issueDate = sessionStorage.getItem('bulk-issue') || X.today();
    const group = sessionStorage.getItem('bulk-group') || 'client';
    const ctx = X.ctx();
    // 対象：請求期間内・取引中の請求先の契約（停止中・前払い済み・作成済みも警告付きで表示）
    const targets = b.contracts.filter((c) => {
      const cl = X.client(c.clientId);
      if (!cl) return false;
      if (c.billingType === 'one_time') return c.billingStartMonth === ym;
      return B.inBillingPeriod(c, ym) !== false || !c.billingStartMonth;
    });
    const groups = {};
    targets.forEach((c) => { const k = group === 'client' ? c.clientId : c.clientId + '|' + (c.storeId || ''); (groups[k] = groups[k] || []).push(c); });
    const drafts = Object.keys(groups).map((k) => {
      const cs = groups[k];
      const cl = X.client(cs[0].clientId);
      const inv = newInvoice(cl);
      inv.issueDate = issueDate;
      inv.dueDate = B.dueDateFor(issueDate, cl.paymentTerms) || '';
      if (group !== 'client') inv.storeId = cs[0].storeId || '';
      const issues = [];
      cs.forEach((c) => { const out = B.contractLinesForMonth(c, ym, b.settings); inv.lines.push(...out.lines); issues.push(...out.issues); });
      const modes = Array.from(new Set(cs.map((c) => c.priceTaxMode).filter(Boolean)));
      inv.priceMode = modes.length === 1 ? modes[0] : null;
      if (modes.length > 1) issues.push('税抜と税込の契約が混在しています。請求書を分けてください');
      const r = B.checkInvoice(inv, ctx);
      return { key: k, cl, cs, inv, issues, r };
    });
    const sel = new Set(JSON.parse(sessionStorage.getItem('bulk-sel-' + ym) || 'null') || drafts.filter((d) => !d.r.warnings.some((w) => ['DUPLICATE', 'PREPAID', 'SUSPENDED', 'CLIENT_INACTIVE'].includes(w.code))).map((d) => d.key));
    const om = B.omissions(ym, ctx);
    main.innerHTML = '<h1>定期請求をまとめて作成</h1><p class="lead">対象月の契約から請求書の下書きを作ります。二重請求・前払い期間・請求停止などの警告がある請求書は、初期状態では選択していません。作成後、各請求書で確認・承認・発行します。</p>' +
      '<div class="panel"><div class="row"><div class="field"><label>対象月（サービス提供月）</label><input type="month" id="ym" value="' + ym + '"></div><div class="field"><label>発行日</label><input type="date" id="idt" value="' + issueDate + '"></div><div class="field"><label>まとめ方</label><select id="gr"><option value="client"' + (group === 'client' ? ' selected' : '') + '>請求先ごとに1枚</option><option value="store"' + (group === 'store' ? ' selected' : '') + '>請求先・店舗ごとに1枚</option></select></div></div>' +
      '<p class="small">' + B.ymLabel(ym) + 'に請求書が無い契約（請求漏れの可能性）：<b>' + om.length + '件</b></p></div>' +
      (drafts.length ? drafts.map((d) => {
        const unack = d.r.warnings;
        return '<div class="panel"><label style="display:flex;gap:8px;align-items:flex-start"><input type="checkbox" data-k="' + esc(d.key) + '"' + (sel.has(d.key) ? ' checked' : '') + ' style="margin-top:6px"><div style="flex:1"><b>' + esc(d.cl.companyName) + '</b>' + (group !== 'client' && d.cs[0].storeId ? '／' + esc((S.storeById(d.cs[0].storeId) || {}).name || '') : '') + '　<span class="money">' + (d.r.totals.total !== null ? B.yen(d.r.totals.total) : X.unsetBadge('金額未確定')) + '</span>' +
          '<div class="small muted">' + d.inv.lines.map((l) => esc(l.description) + '（' + (l.unitPrice === null ? '未設定' : B.yen(B.lineAmount(l))) + '）').join('／') + '</div>' +
          (d.issues.length || d.r.errors.length ? '<div class="small" style="color:var(--danger)">未設定：' + esc(Array.from(new Set(d.issues.concat(d.r.errors.map((e) => e.msg)))).join('／')) + '</div>' : '') +
          (unack.length ? '<div class="small" style="color:var(--warn)">警告：' + esc(unack.map((w) => w.msg).join('／')) + '</div>' : '') + '</div></label></div>';
      }).join('') : '<div class="empty">' + B.ymLabel(ym) + 'に請求対象の契約はありません。</div>') +
      '<div class="btns"><button class="btn primary" id="make">選んだ請求書の下書きを作成</button><a class="btn" href="#/bill/invoices">請求書一覧へ</a></div>';
    const keep = () => { sessionStorage.setItem('bulk-sel-' + ym, JSON.stringify(U.$$('[data-k]', main).filter((x) => x.checked).map((x) => x.dataset.k))); };
    U.$('#ym', main).addEventListener('change', (e) => { sessionStorage.setItem('bulk-ym', e.target.value); bulk(main); });
    U.$('#idt', main).addEventListener('change', (e) => { sessionStorage.setItem('bulk-issue', e.target.value); bulk(main); });
    U.$('#gr', main).addEventListener('change', (e) => { sessionStorage.setItem('bulk-group', e.target.value); sessionStorage.removeItem('bulk-sel-' + ym); bulk(main); });
    U.$$('[data-k]', main).forEach((c) => c.addEventListener('change', keep));
    U.$('#make', main).addEventListener('click', async () => {
      const chosen = drafts.filter((d) => U.$('[data-k="' + d.key + '"]', main).checked);
      if (!chosen.length) { U.toast('作成する請求書を選んでください', 'error'); return; }
      const warned = chosen.filter((d) => d.r.warnings.length);
      const ok = await U.modal({ title: '下書きの作成', body: '<p>' + B.ymLabel(ym) + '分の請求書の下書きを' + chosen.length + '件作成します。発行はまだ行いません。</p>' + (warned.length ? '<div class="alert warn small">' + warned.length + '件に警告があります。各請求書で理由を記録するまで承認・発行できません。</div>' : '') + '<ul class="small">' + chosen.map((d) => '<li>' + esc(d.cl.companyName) + '：' + (d.r.totals.total !== null ? B.yen(d.r.totals.total) : '金額未確定') + '</li>').join('') + '</ul>', confirmLabel: '作成する' });
      if (!ok) return;
      chosen.forEach((d) => { b.invoices.push(d.inv); hist(d.inv, '定期請求から下書きを作成しました', B.ymLabel(ym) + '分'); });
      sessionStorage.removeItem('bulk-sel-' + ym);
      S.save(true);
      U.toast(chosen.length + '件の下書きを作成しました', 'ok');
      sessionStorage.setItem('inv-f', JSON.stringify({ status: 'draft' }));
      location.hash = '#/bill/invoices';
    });
  }

  // ───────── 請求書の表示・PDF（印刷）─────────
  function print(main, id) {
    const b = X.bill();
    const inv = X.invoice(id);
    if (!inv) { main.innerHTML = '<div class="empty">請求書が見つかりません。</div>'; return; }
    const final = inv.status === 'issued' || inv.status === 'cancelled';
    const issuer = final && inv.issuerSnapshot ? inv.issuerSnapshot : b.settings.issuer;
    const mode = final ? inv.modeSnapshot : b.settings.invoiceMode;
    const cats = final && inv.taxCategorySnapshot ? inv.taxCategorySnapshot : b.settings.taxCategories;
    const tot = totalsOf(inv);
    const reduced = (k) => (cats.find((c) => c.key === k) || {}).reduced;
    const catLabel = (k) => { const c = cats.find((x) => x.key === k); return c ? (c.taxable ? c.rate + '%' : c.label) : '未設定'; };
    const fmtD = (d) => (d ? F.fmtDateJa(d) : '【未設定】');
    const store = S.storeById(inv.storeId);
    const banner = !final ? '<div class="inv-draft">下書き・未発行（' + B.INVOICE_STATUS[inv.status] + '）— この書面は請求書として使用できません</div>' : inv.status === 'cancelled' ? '<div class="inv-draft">取消済み</div>' : '';
    const title = (mode === 'qualified' ? '請求書' : '請求書');
    main.innerHTML = '<div class="sticky-actions no-print"><a class="btn small" href="#/bill/inv/' + inv.id + '">← 請求書の詳細</a><div class="grow"></div><button class="btn primary" id="pr">印刷・PDFで保存</button></div>' +
      (mode === 'undecided' ? '<div class="alert danger no-print">適格請求書として発行するかが未確認です（請求管理の設定）。</div>' : '') +
      '<div class="inv-doc">' + banner +
      '<div class="inv-head"><h1>' + title + '</h1><table class="inv-meta"><tr><th>請求書番号</th><td>' + esc(inv.number || '（発行時に確定）') + '</td></tr><tr><th>発行日</th><td>' + fmtD(inv.issueDate) + '</td></tr></table></div>' +
      '<div class="inv-parties"><div class="inv-to">' + (inv.billTo.postal ? '〒' + esc(inv.billTo.postal) + '<br>' : '') + esc(inv.billTo.address) + '<div class="inv-toname">' + esc(inv.billTo.name || '【宛名未設定】') + ' ' + esc(inv.billTo.honorific) + '</div>' + (inv.billTo.contact ? esc(inv.billTo.contact) + ' 様' : '') + (store ? '<div class="small">（' + esc(store.name) + '）</div>' : '') + '</div>' +
      '<div class="inv-from"><b>' + esc(issuer.name || '【発行者名未設定】') + '</b><br>' + esc(issuer.address) + (issuer.tel ? '<br>TEL ' + esc(issuer.tel) : '') + (issuer.email ? '<br>' + esc(issuer.email) : '') + (mode === 'qualified' ? '<br>登録番号：' + esc(issuer.registrationNumber || '【未設定】') : '') + '</div></div>' +
      '<p>下記のとおりご請求申し上げます。</p>' +
      '<table class="inv-total"><tr><th>ご請求金額（税込）</th><td>' + (tot && tot.total !== null ? B.yen(tot.total) : '【計算できません】') + '</td></tr><tr><th>お支払期限</th><td>' + fmtD(inv.dueDate) + '</td></tr></table>' +
      '<table class="inv-lines"><thead><tr><th>品目・内容</th><th>対象月</th><th>数量</th><th>単価</th><th>税率</th><th>金額（' + (inv.priceMode === 'included' ? '税込' : '税抜') + '）</th></tr></thead><tbody>' +
      inv.lines.map((l) => '<tr><td>' + esc(l.description) + (reduced(l.taxCategory) ? ' ※' : '') + '</td><td>' + esc(l.targetMonth ? B.ymLabel(l.targetMonth) : '') + '</td><td class="r">' + esc(l.qty) + '</td><td class="r">' + B.yen(l.unitPrice) + '</td><td class="r">' + esc(catLabel(l.taxCategory)) + '</td><td class="r">' + B.yen(B.lineAmount(l)) + '</td></tr>').join('') + '</tbody></table>' +
      (tot && tot.total !== null ? '<table class="inv-sum"><tbody>' + tot.groups.map((g) => '<tr><th>' + esc(g.taxable ? g.rate + '%対象' : g.label) + (g.reduced ? '（軽減税率）' : '') + '</th><td>' + B.yen(inv.priceMode === 'included' ? g.total : g.base) + '</td><th>消費税</th><td>' + (g.taxable ? B.yen(g.tax) : '—') + '</td></tr>').join('') + '<tr><th>小計（税抜）</th><td>' + B.yen(tot.subtotal) + '</td><th>消費税合計</th><td>' + B.yen(tot.tax) + '</td></tr><tr class="grand"><th colspan="3">合計（税込）</th><td>' + B.yen(tot.total) + '</td></tr></tbody></table>' : '') +
      (inv.lines.some((l) => reduced(l.taxCategory)) ? '<p class="small">※は軽減税率対象品目です。</p>' : '') +
      '<div class="inv-bank"><b>お振込先</b><br>' + (inv.bank ? esc(inv.bank.bankName) + ' ' + esc(inv.bank.branch || '') + ' ' + esc(inv.bank.type || '') + ' ' + esc(inv.bank.number || '') + '<br>口座名義：' + esc(inv.bank.holder || '') : '【振込先未設定】') + '<br><span class="small">恐れ入りますが、振込手数料は貴社にてご負担ください。</span></div>' +
      (inv.notes ? '<div class="inv-notes"><b>備考</b><br>' + esc(inv.notes).replace(/\n/g, '<br>') + '</div>' : '') +
      '</div>';
    U.$('#pr', main).addEventListener('click', () => {
      const old = document.title;
      document.title = '請求書_' + (inv.number || '下書き') + '_' + X.fileSafe(inv.billTo.name);
      S.log('請求書を印刷・PDF出力しました', target(inv), B.INVOICE_STATUS[inv.status]);
      window.print();
      setTimeout(() => { document.title = old; }, 500);
    });
  }

  // ───────── CSV 出力・既存請求書の取込 ─────────
  async function exportDialog() {
    const b = X.bill();
    const res = await U.modal({ title: 'CSV出力', body: '<div class="field"><label>出力する内容</label><select id="k"><option value="list">請求一覧（1請求書1行）</option><option value="lines">請求明細（1項目1行）</option><option value="acct">会計ソフト取込用（汎用・税率ごと1行）</option><option value="pay">入金一覧</option></select></div><div class="row"><div class="field"><label>発行日・入金日（から）</label><input type="date" id="f"></div><div class="field"><label>（まで）</label><input type="date" id="t"></div></div><p class="small muted">文字コードはUTF-8（BOM付き）です。会計ソフト取込用は汎用形式のため、取込時に列の対応付けが必要です。</p>', confirmLabel: '出力', collect: (bg) => ({ k: bg.querySelector('#k').value, f: bg.querySelector('#f').value, t: bg.querySelector('#t').value }) });
    if (!res) return;
    const inR = (d) => d && (!res.f || d >= res.f) && (!res.t || d <= res.t);
    const t = X.today();
    const invs = b.invoices.filter((i) => (i.status === 'issued' || i.status === 'cancelled') && inR(i.issueDate));
    const cn = (i) => X.clientLabel(X.client(i.clientId));
    const sn = (i) => (S.storeById(i.storeId) || {}).name || '';
    const pn = (i) => (S.projectById(i.projectId) || {}).name || '';
    let head, rows, name;
    if (res.k === 'list') {
      head = ['請求書番号', '状態', '請求先', '宛名', '店舗', '案件', '発行日', '支払期限', '小計（税抜）', '消費税', '合計（税込）', '入金済み', '請求残額', '入金状態', '取消理由'];
      rows = invs.map((i) => { const ps = B.paymentState(i, b.payments, t); return [i.number, B.displayStatus(i, ps).label, cn(i), i.billTo.name, sn(i), pn(i), i.issueDate, i.dueDate, i.totalsSnapshot.subtotal, i.totalsSnapshot.tax, i.totalsSnapshot.total, i.status === 'issued' ? ps.paid : '', i.status === 'issued' ? ps.remaining : '', i.status === 'issued' ? B.PAY_STATE[ps.state] : '', i.cancelReason || '']; });
      name = '請求一覧';
    } else if (res.k === 'lines') {
      head = ['請求書番号', '状態', '請求先', '発行日', '品目・内容', '対象月', '種類', '数量', '単価', '金額', '税区分', '税率'];
      rows = [];
      invs.forEach((i) => i.lines.forEach((l) => { const c = (i.taxCategorySnapshot || []).find((x) => x.key === l.taxCategory) || {}; rows.push([i.number, B.INVOICE_STATUS[i.status], cn(i), i.issueDate, l.description, l.targetMonth || '', B.LINE_KINDS[l.kind] || '', l.qty, l.unitPrice, B.lineAmount(l), c.label || '', c.taxable ? c.rate : 0]); }));
      name = '請求明細';
    } else if (res.k === 'acct') {
      head = ['取引日（発行日）', '請求書番号', '取引先', '勘定科目（借方）', '勘定科目（貸方）', '税区分', '税率', '金額（税抜）', '消費税額', '金額（税込）', '摘要'];
      rows = [];
      invs.filter((i) => i.status === 'issued').forEach((i) => i.totalsSnapshot.groups.forEach((g) => rows.push([i.issueDate, i.number, cn(i), '売掛金', '売上高', g.label, g.taxable ? g.rate : 0, g.base, g.tax, g.total, i.number + ' ' + cn(i)])));
      name = '会計取込用_汎用';
    } else {
      head = ['請求書番号', '請求先', '入金日', '入金額', '入金方法', 'メモ', '登録者', '登録方法', '取消', '取消理由'];
      rows = b.payments.filter((p) => inR(p.date)).map((p) => { const i = X.invoice(p.invoiceId) || {}; return [i.number || '', i.clientId ? cn(i) : '', p.date, p.amount, p.method, p.memo, p.by, p.source === 'csv' ? 'CSV' : '手入力', p.voided ? '取消' : '', p.voidReason || '']; });
      name = '入金一覧';
    }
    await X.saveFile(name + '_' + X.today() + '.csv', B.toCsv(head, rows), 'text/csv;charset=utf-8', name + 'のCSV（' + rows.length + '行）');
  }

  async function importInvoices(file, done) {
    const b = X.bill();
    const rows = CSV.parse(await root.FS.files.readText(file));
    if (rows.length < 2) { U.toast('データ行がありません', 'error'); return; }
    const h = rows[0];
    const ix = (n) => h.indexOf(n);
    const need = ['請求書番号', '請求先', '発行日', '支払期限', '合計（税込）'];
    const miss = need.filter((n) => ix(n) < 0);
    if (miss.length) { U.toast('必要な列がありません：' + miss.join('、') + '（「請求一覧」CSVの形式で取り込めます）', 'error'); return; }
    const numbers = new Set(b.invoices.map((i) => i.number).filter(Boolean));
    const items = rows.slice(1).map((r, i) => {
      const g = (n) => (ix(n) >= 0 ? (r[ix(n)] || '').trim() : '');
      const errs = [];
      const num = g('請求書番号');
      const cl = b.clients.find((c) => c.companyName === g('請求先'));
      const issueDate = B.parseDate(g('発行日')), dueDate = B.parseDate(g('支払期限'));
      const total = B.parseYen(g('合計（税込）')), tax = g('消費税') ? B.parseYen(g('消費税')) : null, sub = g('小計（税抜）') ? B.parseYen(g('小計（税抜）')) : null;
      if (!num) errs.push('番号なし'); else if (numbers.has(num)) errs.push('同じ番号が登録済み');
      if (!cl) errs.push('請求先「' + g('請求先') + '」が未登録（先に請求先を登録）');
      if (!issueDate) errs.push('発行日不正'); if (!dueDate) errs.push('支払期限不正'); if (total === null) errs.push('合計不正');
      if (sub !== null && tax !== null && total !== null && sub + tax !== total) errs.push('小計＋消費税が合計と一致しません');
      if (g('状態') === '取消') errs.push('取消済みの請求書は取り込みません');
      numbers.add(num);
      return { line: i + 2, num, cl, issueDate, dueDate, total, tax, sub, name: g('宛名'), errs };
    });
    const ok = items.filter((x) => !x.errs.length);
    const res = await U.modal({ title: '既存請求書の取込：' + file.name, body: '<p>' + items.length + '行中 <b>' + ok.length + '件</b>を「発行済み（取込データ）」として登録します。明細は取り込まず、合計額のみ登録します。入金は取込後に登録してください。</p><div class="table-wrap" style="max-height:340px;overflow:auto"><table class="tbl small"><thead><tr><th>行</th><th>番号</th><th>請求先</th><th>発行日</th><th class="num">合計</th><th>結果</th></tr></thead><tbody>' + items.map((x) => '<tr class="' + (x.errs.length ? 'flag' : '') + '"><td>' + x.line + '</td><td>' + esc(x.num) + '</td><td>' + esc(x.cl ? x.cl.companyName : '') + '</td><td>' + esc(x.issueDate || '') + '</td><td class="money">' + B.yen(x.total) + '</td><td>' + (x.errs.length ? esc(x.errs.join('／')) : '取り込みます') + '</td></tr>').join('') + '</tbody></table></div>', check: ok.length ? '取込対象のファイルと内容を確認しました' : null, confirmLabel: ok.length ? ok.length + '件を取り込む' : null, cancelLabel: '閉じる' });
    if (!res || !ok.length) return;
    ok.forEach((x) => {
      const inv = newInvoice(x.cl);
      Object.assign(inv, { number: x.num, status: 'issued', imported: true, issueDate: x.issueDate, dueDate: x.dueDate, billTo: Object.assign(inv.billTo, { name: x.name || inv.billTo.name }), lines: [{ id: S.uid('l'), contractId: null, targetMonth: '', kind: 'one_time', description: '取込データ（明細なし）', qty: 1, unitPrice: x.total, taxCategory: null }], totalsSnapshot: { groups: [], subtotal: x.sub, tax: x.tax, total: x.total, errors: [] }, issuerSnapshot: JSON.parse(JSON.stringify(b.settings.issuer)), modeSnapshot: b.settings.invoiceMode, taxCategorySnapshot: JSON.parse(JSON.stringify(b.settings.taxCategories)), issuedBy: S.user(), issuedAt: Date.now() });
      b.invoices.push(inv);
      hist(inv, '既存請求書をCSVから取り込みました', file.name + ' ' + x.line + '行目');
    });
    S.log('既存請求書をCSVから取り込みました', { type: 'billing', id: '', label: file.name }, ok.length + '件');
    S.save(true);
    U.toast(ok.length + '件を取り込みました', 'ok');
    done();
  }

  root.FS.views.billInvoices = list;
  root.FS.views.billInvoice = edit;
  root.FS.views.billBulk = bulk;
  root.FS.views.billPrint = print;
  root.FS.billui.issueInvoice = issue;
  root.FS.billui.newInvoice = newInvoice;
  root.FS.billui.exportDialog = exportDialog;
})(self);
