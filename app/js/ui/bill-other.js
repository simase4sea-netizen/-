/* 画面：請求管理ホーム（集計・請求漏れ・未設定）／入金・未入金管理（入金CSV取込・催促文）／請求管理の設定 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const B = root.FS.bill;
  const X = root.FS.billui;
  const F = root.FS.format;
  const CSV = root.FS.csv;
  const esc = U.esc;

  // ───────── 請求管理ホーム ─────────
  function home(main) {
    const b = X.bill();
    const f = JSON.parse(sessionStorage.getItem('bill-period') || 'null') || { from: X.thisMonth(), to: X.thisMonth() };
    const t = X.today();
    const ctx = X.ctx();
    const sum = B.summarize(f.from, f.to, ctx, t);
    const months = B.monthsBetween(f.from, f.to);
    const om = [];
    months.forEach((ym) => B.omissions(ym, ctx).forEach((o) => om.push(o)));
    const unsetCt = b.contracts.filter((c) => c.status !== 'ended' && X.contractUnset(c).length);
    const unsetCl = b.clients.filter((c) => c.status === 'active' && X.clientUnset(c).length);
    const setIssues = settingsIssues(b.settings);
    const name = (id, kind) => kind === 'client' ? X.clientLabel(X.client(id)) : kind === 'store' ? ((S.storeById(id) || {}).name || '（店舗なし）') : ((S.projectById(id) || {}).name || '（案件なし）');
    const per = B.ymLabel(f.from) + (f.to !== f.from ? '〜' + B.ymLabel(f.to) : '');
    const card = (title, value, basis, href) => '<div class="card"><div class="muted small">' + title + '</div><div class="big money" style="text-align:left">' + value + '</div><div class="small muted">' + basis + '</div>' + (href ? '<a class="btn small" href="' + href + '">一覧を見る</a>' : '') + '</div>';
    main.innerHTML = '<h1>請求管理</h1><p class="lead">請求予定・発行・入金の状況です。金額はすべて税込です。各数値の下に、対象期間と計算対象を表示しています。</p>' +
      (setIssues.length ? '<div class="alert danger"><b>請求書を発行する前に設定が必要です：</b>' + setIssues.map(esc).join('／') + '　<a href="#/bill/settings">設定へ</a></div>' : '') +
      '<div class="panel"><div class="row"><div class="field"><label>対象期間（から）</label><input type="month" id="pf" value="' + f.from + '"></div><div class="field"><label>（まで）</label><input type="month" id="pt" value="' + f.to + '"></div><div class="field" style="flex:0 0 auto"><button class="btn small" id="thism">今月</button></div></div></div>' +
      '<div class="cards">' +
      card('請求予定額（' + per + '）', B.yen(sum.plannedThisPeriod), '取引中の請求先の契約から計算した見込み（停止中・前払い済み・終了は除く）' + (sum.plannedUnknown ? '。<b style="color:var(--danger)">金額未設定の契約' + sum.plannedUnknown + '件は含まない</b>' : '')) +
      card('発行済み請求額（' + per + '）', B.yen(sum.issuedAmount), '発行日が期間内の発行済み請求書 ' + sum.issuedCount + '件の合計（取消は除く）', '#/bill/invoices') +
      card('入金済み額（' + per + '）', B.yen(sum.paidAmount), '入金日が期間内の入金記録の合計（取消した入金は除く）', '#/bill/payments') +
      card('未入金額', B.yen(sum.unpaidAmount), '期間内に発行した請求書の、' + t + '時点の請求残額の合計', '#/bill/payments') +
      card('支払期限超過', sum.overdue.length + '件', t + '時点で期限を過ぎて未入金・一部入金の請求書（全期間）', '#/bill/payments') +
      '</div>' +
      '<div class="grid2"><div class="panel"><h2>請求漏れの可能性（' + per + '）</h2><p class="small muted">請求対象の契約なのに、取消以外の請求書が無いもの</p>' + (om.length ? '<table class="tbl small">' + om.map((o) => '<tr><td>' + B.ymLabel(o.ym) + '</td><td>' + esc(o.client.companyName) + '</td><td><a href="#/bill/contract/' + o.contract.id + '">' + esc(o.contract.name) + '</a></td></tr>').join('') + '</table><a class="btn small" href="#/bill/bulk">定期請求をまとめて作成</a>' : '<p class="muted">ありません。</p>') + '</div>' +
      '<div class="panel"><h2>未設定の項目</h2>' + (unsetCt.length || unsetCl.length ? '<ul class="small unset-list">' + unsetCl.map((c) => '<li><a href="#/bill/client/' + c.id + '">' + esc(c.companyName) + '</a>：' + esc(X.clientUnset(c).join('、')) + '</li>').join('') + unsetCt.map((c) => '<li><a href="#/bill/contract/' + c.id + '">' + esc(c.name) + '</a>（' + esc(X.clientLabel(X.client(c.clientId))) + '）：' + esc(X.contractUnset(c).join('、')) + '</li>').join('') + '</ul>' : '<p class="muted">ありません。</p>') + '</div></div>' +
      '<div class="panel"><h2>月ごとの売上見込みと実績</h2><p class="small muted">見込み＝契約からの請求予定額、発行＝その月に発行した請求額、入金＝その月の入金額</p><div class="table-wrap"><table class="tbl"><thead><tr><th>月</th><th class="num">見込み</th><th class="num">発行（実績）</th><th class="num">入金</th><th>見込みに含まない契約</th></tr></thead><tbody>' +
      sum.byMonth.map((m) => '<tr><td>' + B.ymLabel(m.ym) + '</td><td class="money">' + B.yen(m.forecast) + '</td><td class="money">' + B.yen(m.issued) + '</td><td class="money">' + B.yen(m.paid) + '</td><td>' + (m.forecastUnknown ? '<span class="badge danger">金額未設定 ' + m.forecastUnknown + '件</span>' : '—') + '</td></tr>').join('') + '</tbody></table></div></div>' +
      '<div class="grid3">' + [['顧客別', sum.byClient, 'client'], ['店舗別', sum.byStore, 'store'], ['案件別', sum.byProject, 'project']].map(([t2, list, k]) => '<div class="panel"><h2>' + t2 + 'の発行済み請求額</h2><p class="small muted">' + per + '・発行日基準</p>' + (list.length ? '<table class="tbl small">' + list.map((r) => '<tr><td>' + esc(name(r.key === '（未設定）' ? '' : r.key, k)) + '</td><td class="num">' + r.count + '件</td><td class="money">' + B.yen(r.amount) + '</td></tr>').join('') + '</table>' : '<p class="muted small">ありません。</p>') + '</div>').join('') + '</div>' +
      '<div class="btns"><a class="btn primary" href="#/bill/bulk">定期請求をまとめて作成</a><a class="btn" href="#/bill/inv/new">請求書を1枚作成</a><button class="btn" id="sample">テスト用データを追加</button></div>';
    const save = () => { const nf = { from: U.$('#pf', main).value || X.thisMonth(), to: U.$('#pt', main).value || X.thisMonth() }; if (nf.to < nf.from) nf.to = nf.from; sessionStorage.setItem('bill-period', JSON.stringify(nf)); home(main); };
    U.$('#pf', main).addEventListener('change', save);
    U.$('#pt', main).addEventListener('change', save);
    U.$('#thism', main).addEventListener('click', () => { sessionStorage.removeItem('bill-period'); home(main); });
    U.$('#sample', main).addEventListener('click', async () => {
      const ok = await U.modal({ title: 'テスト用データ', body: '<p>架空の請求先・契約（【テスト】表記）と、確認用の設定（発行者名・振込先・税率の確認済み・端数処理など）を追加します。<b>実際の業務の設定には使わないでください。</b>設定が既に入力されている項目は変更しません。</p>', confirmLabel: '追加する' });
      if (!ok) return;
      loadSample();
      U.toast('テスト用データを追加しました', 'ok');
      home(main);
    });
  }

  function settingsIssues(s) {
    const out = [];
    if (!s.issuer.name) out.push('発行者名');
    if (s.invoiceMode === 'undecided') out.push('適格請求書として発行するか');
    if (s.invoiceMode === 'qualified' && s.issuer.registrationStatus !== 'registered') out.push('登録番号の確認');
    if (!s.rounding) out.push('消費税の端数処理');
    if (!s.taxCategories.some((c) => c.verified)) out.push('税区分・税率の確認');
    if (!s.bankAccounts.length) out.push('振込先');
    return out;
  }

  // ───────── 入金・未入金 ─────────
  function payments(main) {
    const b = X.bill();
    const t = X.today();
    const tab = sessionStorage.getItem('pay-tab') || 'unpaid';
    const rows = b.invoices.filter((i) => i.status === 'issued').map((inv) => ({ inv, ps: B.paymentState(inv, b.payments, t) }));
    const unpaid = rows.filter((r) => r.ps.state === 'unpaid' || r.ps.state === 'partial').sort((a, z) => (a.inv.dueDate || '').localeCompare(z.inv.dueDate || ''));
    const over = rows.filter((r) => r.ps.state === 'over');
    main.innerHTML = '<h1>入金・未入金</h1><p class="lead">' + t + '時点の状況です。入金は請求書ごとに手動で登録するか、CSVでまとめて取り込めます。</p>' +
      '<div class="tabs">' + [['unpaid', '未入金・期限超過（' + unpaid.length + '）'], ['list', '入金一覧'], ['import', '入金CSV取込']].map(([k, l]) => '<button data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '">' + l + '</button>').join('') + '</div><div id="pane"></div>';
    U.$$('.tabs button', main).forEach((bt) => bt.addEventListener('click', () => { sessionStorage.setItem('pay-tab', bt.dataset.tab); payments(main); }));
    const pane = U.$('#pane', main);
    if (tab === 'unpaid') {
      const byClient = {};
      unpaid.forEach((r) => { const k = r.inv.clientId; byClient[k] = byClient[k] || { amount: 0, count: 0, overdue: 0 }; byClient[k].amount += r.ps.remaining; byClient[k].count++; if (r.ps.overdue) byClient[k].overdue++; });
      pane.innerHTML = (over.length ? '<div class="alert warn">過入金の請求書が' + over.length + '件あります：' + over.map((r) => '<a href="#/bill/inv/' + r.inv.id + '">' + esc(r.inv.number) + '</a>').join('、') + '</div>' : '') +
        '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>請求書番号</th><th>請求先</th><th>支払期限</th><th class="num">経過日数</th><th class="num">請求額</th><th class="num">入金済み</th><th class="num">残額</th><th>状態</th><th></th></tr></thead><tbody>' +
        (unpaid.length ? unpaid.map(({ inv, ps }) => '<tr class="' + (ps.overdue ? 'flag' : '') + '"><td><a href="#/bill/inv/' + inv.id + '">' + esc(inv.number) + '</a></td><td>' + esc(X.clientLabel(X.client(inv.clientId))) + '</td><td class="nowrap">' + esc(inv.dueDate) + '</td><td class="num">' + (ps.overdue ? '<span class="overdue">' + ps.daysOverdue + '日</span>' : '—') + '</td><td class="money">' + B.yen(ps.total) + '</td><td class="money">' + B.yen(ps.paid) + '</td><td class="money"><b>' + B.yen(ps.remaining) + '</b></td><td>' + X.statusBadge(inv) + '</td><td>' + (ps.overdue ? '<button class="btn small" data-rem="' + inv.id + '">催促文を作る</button>' : '') + '</td></tr>').join('') : '<tr><td colspan="9" class="muted">未入金の請求書はありません。</td></tr>') + '</tbody></table></div>' +
        '<div class="panel"><h2>請求先別の未入金</h2>' + (Object.keys(byClient).length ? '<table class="tbl">' + Object.keys(byClient).map((k) => '<tr><td>' + esc(X.clientLabel(X.client(k))) + '</td><td>' + byClient[k].count + '件' + (byClient[k].overdue ? '（期限超過 ' + byClient[k].overdue + '件）' : '') + '</td><td class="money">' + B.yen(byClient[k].amount) + '</td></tr>').join('') + '</table>' : '<p class="muted">ありません。</p>') + '</div>' +
        remindersHtml();
      U.$$('[data-rem]', pane).forEach((bt) => bt.addEventListener('click', () => createReminder(X.invoice(bt.dataset.rem))));
    } else if (tab === 'list') {
      const pays = b.payments.slice().sort((a, z) => (z.date || '').localeCompare(a.date || ''));
      pane.innerHTML = '<div class="btns" style="margin-bottom:8px"><button class="btn" id="exp">入金一覧・請求一覧をCSV出力</button></div><div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>入金日</th><th>請求書番号</th><th>請求先</th><th class="num">入金額</th><th>方法</th><th>メモ</th><th>登録</th></tr></thead><tbody>' +
        (pays.length ? pays.map((p) => { const i = X.invoice(p.invoiceId) || {}; return '<tr class="' + (p.voided ? 'muted' : '') + '"><td>' + esc(p.date) + '</td><td><a href="#/bill/inv/' + i.id + '">' + esc(i.number || '') + '</a></td><td>' + esc(X.clientLabel(X.client(i.clientId))) + '</td><td class="money">' + (p.voided ? '<s>' + B.yen(p.amount) + '</s> 取消' : B.yen(p.amount)) + '</td><td>' + esc(p.method) + '</td><td class="small">' + esc(p.memo) + '</td><td class="small muted">' + esc(p.by) + (p.source === 'csv' ? '（CSV）' : '') + '</td></tr>'; }).join('') : '<tr><td colspan="7" class="muted">入金の記録はありません。</td></tr>') + '</tbody></table></div>';
      U.$('#exp', pane).addEventListener('click', () => X.exportDialog());
    } else {
      pane.innerHTML = '<div class="panel"><h2>入金CSVの取込</h2><p class="small">次の列を持つCSVを取り込めます（1行目は見出し）：<b>請求書番号・入金日・入金額</b>（必須）、入金方法・メモ（任意）。取込前に内容を確認できます。銀行の明細データは形式が銀行ごとに違うため、この形式に整えてから取り込んでください。</p>' +
        '<div class="btns"><label class="btn primary">CSVファイルを選ぶ<input type="file" id="f" accept=".csv,.txt" hidden></label><button class="btn" id="tpl">ひな形をダウンロード</button></div></div>';
      U.$('#tpl', pane).addEventListener('click', () => U.download('入金取込ひな形.csv', B.toCsv(['請求書番号', '入金日', '入金額', '入金方法', 'メモ'], []), 'text/csv;charset=utf-8'));
      U.$('#f', pane).addEventListener('change', async (e) => { const file = e.target.files[0]; e.target.value = ''; if (file) await importPayments(file, () => payments(main)); });
    }
  }

  async function importPayments(file, done) {
    const b = X.bill();
    const rows = CSV.parse(await root.FS.files.readText(file));
    if (rows.length < 2) { U.toast('データ行がありません', 'error'); return; }
    const v = B.validatePaymentRows(rows, b.invoices, b.payments, X.today());
    if (v.error) { U.toast(v.error, 'error'); return; }
    const okItems = v.items.filter((x) => !x.errs.length);
    const res = await U.modal({
      title: '入金CSVの取込確認：' + file.name,
      body: '<p>' + v.items.length + '行中 <b>' + okItems.length + '件</b>を登録します。エラーの行は登録しません。</p><div class="table-wrap" style="max-height:360px;overflow:auto"><table class="tbl small"><thead><tr><th>行</th><th>請求書番号</th><th>入金日</th><th class="num">入金額</th><th>方法</th><th>結果</th></tr></thead><tbody>' +
        v.items.map((x) => '<tr class="' + (x.errs.length || x.warns.length ? 'flag' : '') + '"><td>' + x.line + '</td><td>' + esc(x.number) + '</td><td>' + esc(x.date || '') + '</td><td class="money">' + B.yen(x.amount) + '</td><td>' + esc(x.method) + '</td><td>' + (x.errs.length ? '<b style="color:var(--danger)">' + esc(x.errs.join('／')) + '</b>' : '登録します') + (x.warns.length ? '<div style="color:var(--warn)">' + esc(x.warns.join('／')) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>',
      check: okItems.length ? '取込対象のファイルと内容（注意事項を含む）を確認しました' : null,
      confirmLabel: okItems.length ? okItems.length + '件を登録' : null, cancelLabel: '閉じる',
    });
    if (!res || !okItems.length) return;
    okItems.forEach((x) => {
      b.payments.push({ id: S.uid('pay'), invoiceId: x.inv.id, date: x.date, amount: x.amount, method: x.method, memo: x.memo, by: S.user(), at: Date.now(), source: 'csv', file: file.name });
      x.inv.history = x.inv.history || [];
      x.inv.history.push({ at: Date.now(), user: S.user(), action: '入金をCSVから登録しました', detail: x.date + '・' + B.yen(x.amount) + '（' + file.name + ' ' + x.line + '行目）' });
    });
    S.log('入金CSVを取り込みました', { type: 'billing', id: '', label: file.name }, okItems.length + '件・合計 ' + B.yen(okItems.reduce((s, x) => s + x.amount, 0)));
    S.save(true);
    U.toast(okItems.length + '件の入金を登録しました', 'ok');
    done();
  }

  // ───── 催促文（承認後にコピー。送信はしない）─────
  function remindersHtml() {
    const b = X.bill();
    if (!b.reminders.length) return '';
    return '<div class="panel"><h2>催促文</h2><table class="tbl">' + b.reminders.slice().reverse().map((r) => { const i = X.invoice(r.invoiceId) || {}; return '<tr class="clickable" onclick="location.hash=\'#/bill/remind/' + r.id + '\'"><td>' + esc(i.number || '') + '</td><td>' + esc(X.clientLabel(X.client(i.clientId))) + '</td><td>' + U.statusBadge(r.status) + '</td><td class="small muted">' + F.fmtDateTime(r.createdAt) + '</td></tr>'; }).join('') + '</table></div>';
  }

  function createReminder(inv) {
    const b = X.bill();
    const ps = B.paymentState(inv, b.payments, X.today());
    const r = { id: S.uid('rem'), invoiceId: inv.id, status: 'draft', text: B.reminderText(inv, ps, (inv.issuerSnapshot || b.settings.issuer).name, X.today()), history: [], createdAt: Date.now(), createdBy: S.user() };
    b.reminders.push(r);
    S.log('催促文の下書きを作成しました', { type: 'billing', id: r.id, label: inv.number }, '残額 ' + B.yen(ps.remaining), r);
    S.save(true);
    location.hash = '#/bill/remind/' + r.id;
  }

  function reminder(main, id) {
    const b = X.bill();
    const r = b.reminders.find((x) => x.id === id);
    const inv = r && X.invoice(r.invoiceId);
    if (!r || !inv) { main.innerHTML = '<div class="empty">見つかりません。</div>'; return; }
    const ps = B.paymentState(inv, b.payments, X.today());
    const locked = U.isLocked(r);
    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/bill/payments">← 入金・未入金</a><div class="grow"><b>催促文：' + esc(inv.number) + '</b>' + U.statusSteps(r.status) + '</div><div id="wf" class="btns"></div></div>' +
      '<div class="alert info small">このツールはメールを送信しません。承認後に「送信用にコピー」し、担当者が宛先を確認して送ってください。送付前に、入金の行き違いが無いか通帳等で最新の入金を確認してください。</div>' +
      '<div class="grid2"><div class="panel"><h2>文面</h2><textarea id="tx" class="tall"' + (locked ? ' readonly' : '') + '>' + esc(r.text) + '</textarea></div>' +
      '<div class="panel"><h2>対象の請求</h2><table class="tbl"><tr><th>請求先</th><td>' + esc(inv.billTo.name) + ' ' + esc(inv.billTo.honorific) + '</td></tr><tr><th>宛先メール</th><td>' + esc(inv.billTo.email || '未設定') + '</td></tr><tr><th>請求額</th><td>' + B.yen(ps.total) + '</td></tr><tr><th>入金済み</th><td>' + B.yen(ps.paid) + '</td></tr><tr><th>残額</th><td><b>' + B.yen(ps.remaining) + '</b></td></tr><tr><th>支払期限</th><td>' + esc(inv.dueDate) + (ps.overdue ? '（' + ps.daysOverdue + '日超過）' : '') + '</td></tr></table><h3 style="margin-top:12px">履歴</h3>' + U.historyList(r) + '</div></div>';
    const tx = U.$('#tx', main);
    tx.addEventListener('input', () => { r.text = tx.value; S.save(); });
    tx.addEventListener('change', () => S.log('催促文を編集しました', { type: 'billing', id: r.id, label: inv.number }, '', r));
    U.workflow(U.$('#wf', main), r, {
      type: 'billing', requireStore: false,
      getStore: () => null,
      targetHtml: () => '<div class="confirm-target badge client" style="display:block">宛先：' + esc(inv.billTo.name) + ' ' + esc(inv.billTo.honorific) + '<div class="small" style="font-weight:400">' + esc(inv.billTo.email || 'メール未設定') + '／' + esc(inv.number) + '・残額 ' + B.yen(ps.remaining) + '</div></div>',
      copyHint: 'メールソフト等に貼り付け、宛先・金額を確認してから送信してください。',
      copyCheck: '宛先・請求書番号・未入金額が正しく、最新の入金状況を確認したことを確認しました',
      doneText: '担当者が催促文を送ったことを記録します（このツールからは送信しません）。',
      getChecks: () => {
        const ch = [];
        const now = B.paymentState(inv, b.payments, X.today());
        if (now.remaining !== ps.remaining) ch.push('文面作成後に入金状況が変わっています（現在の残額 ' + B.yen(now.remaining) + '）。');
        if (!r.text.includes(B.yen(now.remaining))) ch.push('文面の未入金額が現在の残額（' + B.yen(now.remaining) + '）と一致しません。');
        if (!inv.billTo.email) ch.push('請求書に宛先メールアドレスが記録されていません。');
        return ch;
      },
      getLabel: () => '催促文：' + inv.number,
      getText: () => r.text,
      onChanged: () => reminder(main, id),
    });
  }

  // ───────── 請求管理の設定 ─────────
  function settings(main) {
    const b = X.bill();
    const s = b.settings;
    const iss = s.issuer;
    main.innerHTML = '<h1>請求管理の設定</h1><p class="lead">請求書の発行者情報・税・端数処理・番号・振込先を設定します。<b>確認できた情報だけを入力してください。</b>不明な項目は空欄・未設定のままにし、税理士等に確認してください。変更は操作履歴に残り、発行済みの請求書には影響しません。</p>' +
      (settingsIssues(s).length ? '<div class="alert danger">未設定：' + esc(settingsIssues(s).join('、')) + '</div>' : '') +
      '<div class="grid2"><div>' +
      '<div class="panel"><h2>発行者（自社）</h2><div class="field"><label>名称</label><input type="text" id="in" value="' + esc(iss.name) + '" placeholder="例：合同会社Four Seasons"></div><div class="field"><label>住所</label><input type="text" id="ia" value="' + esc(iss.address) + '"></div><div class="row"><div class="field"><label>電話</label><input type="text" id="it" value="' + esc(iss.tel) + '"></div><div class="field"><label>メール</label><input type="text" id="ie" value="' + esc(iss.email) + '"></div></div></div>' +
      '<div class="panel"><h2>適格請求書（インボイス）</h2><div class="alert warn small">適格請求書発行事業者の登録の有無・登録番号は、国税庁の「適格請求書発行事業者公表サイト」や登録通知書で確認してください。記載要件や端数処理の扱いは、最新の国税庁の情報と税理士への確認をおすすめします。</div>' +
      '<div class="field"><label>請求書の種類</label><select id="mode"><option value="undecided"' + (s.invoiceMode === 'undecided' ? ' selected' : '') + '>未確認（発行できません）</option><option value="qualified"' + (s.invoiceMode === 'qualified' ? ' selected' : '') + '>適格請求書として発行する（登録番号を記載）</option><option value="normal"' + (s.invoiceMode === 'normal' ? ' selected' : '') + '>通常の請求書として発行する（登録番号を記載しない）</option></select></div>' +
      '<div class="row"><div class="field"><label>登録番号（T＋13桁）</label><input type="text" id="rn" value="' + esc(iss.registrationNumber) + '" placeholder="T0000000000000"></div><div class="field"><label>確認状況</label><select id="rs"><option value="unknown"' + (iss.registrationStatus === 'unknown' ? ' selected' : '') + '>未確認</option><option value="registered"' + (iss.registrationStatus === 'registered' ? ' selected' : '') + '>登録を確認済み</option><option value="not_registered"' + (iss.registrationStatus === 'not_registered' ? ' selected' : '') + '>登録していない</option></select></div></div>' +
      (iss.registrationCheckedAt ? '<p class="small muted">確認：' + esc(iss.registrationCheckedBy) + '・' + esc(iss.registrationCheckedAt) + '</p>' : '') + '</div>' +
      '<div class="panel"><h2>振込先</h2><div id="banks"></div><button class="btn small" id="addBank">＋ 振込先を追加</button><p class="small muted">口座番号は請求書に記載するために保存します。ネットバンキングのID・パスワード等は登録しないでください。</p></div>' +
      '</div><div>' +
      '<div class="panel"><h2>税区分・税率</h2><p class="small muted">税率は最新の法令を確認してから「確認済み」にしてください。未確認の税区分を使う請求書は確定できません。</p><table class="tbl"><thead><tr><th>税区分</th><th>税率（%）</th><th>確認済み</th></tr></thead>' + s.taxCategories.map((c, i) => '<tr><td>' + esc(c.label) + '</td><td>' + (c.taxable ? '<input type="text" data-rate="' + i + '" value="' + c.rate + '" style="width:70px">' : '—') + '</td><td><input type="checkbox" data-ver="' + i + '"' + (c.verified ? ' checked' : '') + '></td></tr>').join('') + '</table></div>' +
      '<div class="panel"><h2>端数処理</h2><p class="small muted">初期値は設定していません。会社の方針・税理士の指示に合わせて選んでください。</p><div class="row"><div class="field"><label>消費税額の端数（請求書ごと・税率ごとに1回）</label><select id="rd"><option value="">未設定</option>' + Object.keys(B.ROUNDING).map((k) => '<option value="' + k + '"' + (s.rounding === k ? ' selected' : '') + '>' + B.ROUNDING[k] + '</option>').join('') + '</select></div><div class="field"><label>日割り計算の端数</label><select id="prd"><option value="">未設定</option>' + Object.keys(B.ROUNDING).map((k) => '<option value="' + k + '"' + (s.prorationRounding === k ? ' selected' : '') + '>' + B.ROUNDING[k] + '</option>').join('') + '</select></div></div></div>' +
      '<div class="panel"><h2>請求書番号</h2><div class="field"><label>形式（{YYYY}年・{MM}月・{SEQ3}連番3桁）</label><input type="text" id="nf" value="' + esc(s.numberFormat) + '"></div><p class="small">次に発行される番号の例：<b id="nfp"></b>（発行時に、既存の番号・取消済みの番号と重ならない番号を割り当てます）</p></div>' +
      '<div class="panel"><h2>保存先フォルダ</h2><p class="small">CSV等を保存するフォルダを指定できます（Chrome・Edge）。既存のファイルは上書きせず、保存前に確認します。PDFは印刷画面で保存先を選びます。</p><p>現在：<b id="dirName">確認中…</b></p><div class="btns"><button class="btn small" id="dir"' + (X.fsSupported() ? '' : ' disabled') + '>フォルダを選ぶ</button><button class="btn small" id="dirClear">指定を解除（ダウンロードに保存）</button></div></div>' +
      '</div></div>' +
      '<div class="btns"><button class="btn primary" id="save">設定を保存</button></div>' +
      '<div class="panel" style="margin-top:16px"><h2>バックアップ</h2><p class="small">請求管理のデータは業務アシスト全体のバックアップ（「設定」→「バックアップを書き出す」）に含まれます。CSVでの書き出しは「請求書」画面の「CSV出力」から行えます。</p><a class="btn small" href="#/settings">バックアップの画面へ</a></div>';
    let banks = JSON.parse(JSON.stringify(s.bankAccounts));
    let defBank = s.defaultBankId;
    const renderBanks = () => {
      U.$('#banks', main).innerHTML = banks.length ? banks.map((a, i) => '<div class="panel" style="padding:10px"><div class="row"><div class="field"><label>表示名</label><input type="text" data-bk="' + i + '" data-f="label" value="' + esc(a.label) + '"></div><div class="field"><label>銀行名</label><input type="text" data-bk="' + i + '" data-f="bankName" value="' + esc(a.bankName) + '"></div><div class="field"><label>支店名</label><input type="text" data-bk="' + i + '" data-f="branch" value="' + esc(a.branch) + '"></div></div><div class="row"><div class="field"><label>種別</label><select data-bk="' + i + '" data-f="type">' + ['普通', '当座'].map((t) => '<option' + (a.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div><div class="field"><label>口座番号</label><input type="text" data-bk="' + i + '" data-f="number" value="' + esc(a.number) + '"></div><div class="field"><label>口座名義</label><input type="text" data-bk="' + i + '" data-f="holder" value="' + esc(a.holder) + '"></div></div><label class="small"><input type="radio" name="defbk" value="' + a.id + '"' + (defBank === a.id ? ' checked' : '') + '> 新しい請求書の初期値にする</label> <button class="btn small danger" data-bkdel="' + i + '">削除</button></div>').join('') : '<p class="small muted">振込先が登録されていません。</p>';
      U.$$('[data-bk]', main).forEach((el) => el.addEventListener('input', () => { banks[Number(el.dataset.bk)][el.dataset.f] = el.value; }));
      U.$$('[name=defbk]', main).forEach((el) => el.addEventListener('change', () => { defBank = el.value; }));
      U.$$('[data-bkdel]', main).forEach((el) => el.addEventListener('click', () => { banks.splice(Number(el.dataset.bkdel), 1); renderBanks(); }));
    };
    renderBanks();
    U.$('#addBank', main).addEventListener('click', () => { banks.push({ id: S.uid('bk'), label: '', bankName: '', branch: '', type: '普通', number: '', holder: '' }); renderBanks(); });
    const prev = () => { try { U.$('#nfp', main).textContent = B.nextNumber(U.$('#nf', main).value, X.today(), b.invoices.map((i) => i.number).filter(Boolean)); } catch (e) { U.$('#nfp', main).textContent = e.message; } };
    U.$('#nf', main).addEventListener('input', prev);
    prev();
    X.getDir().then((d) => { U.$('#dirName', main).textContent = d ? d.name : '未指定（ブラウザのダウンロードに保存）'; });
    U.$('#dir', main).addEventListener('click', async () => { try { await X.chooseDir(); settings(main); } catch (e) { if (e.name !== 'AbortError') U.toast('フォルダを指定できませんでした：' + e.message, 'error'); } });
    U.$('#dirClear', main).addEventListener('click', async () => { await X.clearDir(); S.log('保存先フォルダの指定を解除しました', { type: 'billing', id: '', label: '保存先' }, ''); settings(main); });

    U.$('#save', main).addEventListener('click', async () => {
      const errs = [];
      const rn = U.$('#rn', main).value.trim().toUpperCase();
      const rs = U.$('#rs', main).value;
      const mode = U.$('#mode', main).value;
      if (rn && !/^T\d{13}$/.test(rn)) errs.push('登録番号は「T」＋13桁の数字で入力してください');
      if (rs === 'registered' && !rn) errs.push('登録を確認済みにするには登録番号を入力してください');
      if (mode === 'qualified' && rs !== 'registered') errs.push('適格請求書として発行するには、登録番号の確認状況を「登録を確認済み」にしてください');
      const fmt = U.$('#nf', main).value.trim();
      if (!/\{SEQ\d?\}/.test(fmt)) errs.push('請求書番号の形式には {SEQ3} などの連番が必要です（重複防止のため）');
      const rates = {};
      U.$$('[data-rate]', main).forEach((el) => { const n = Number(el.value); if (!isFinite(n) || n < 0 || n > 100) errs.push('税率は0〜100の数値で入力してください'); rates[el.dataset.rate] = n; });
      const cleanBanks = banks.filter((a) => a.bankName || a.number);
      cleanBanks.forEach((a, i) => { if (!a.bankName || !a.branch || !a.number || !a.holder) errs.push('振込先' + (i + 1) + '：銀行名・支店名・口座番号・名義をすべて入力してください'); });
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      const changes = [];
      const taxChanged = s.taxCategories.some((c, i) => (rates[i] !== undefined && rates[i] !== c.rate) || U.$('[data-ver="' + i + '"]', main).checked !== c.verified);
      const roundChanged = (U.$('#rd', main).value || null) !== s.rounding || (U.$('#prd', main).value || null) !== s.prorationRounding;
      if (taxChanged || roundChanged || mode !== s.invoiceMode || rn !== iss.registrationNumber || rs !== iss.registrationStatus) {
        const ok = await U.modal({ title: '税・インボイス設定の変更', body: '<p>税率・確認状況・端数処理・請求書の種類・登録番号を変更します。<b>発行済みの請求書は変わりません</b>が、これから作成・発行する請求書の金額と記載に影響します。</p>', check: '国税庁の情報・税理士の確認などで内容を確認しました', confirmLabel: '変更する' });
        if (!ok) return;
      }
      const set = (label, before, after) => { if (JSON.stringify(before) !== JSON.stringify(after)) changes.push(label + '：' + (before === null || before === '' ? '未設定' : before) + ' → ' + (after === null || after === '' ? '未設定' : after)); };
      set('発行者名', iss.name, U.$('#in', main).value.trim());
      set('請求書の種類', s.invoiceMode, mode);
      set('登録番号', iss.registrationNumber, rn);
      set('登録の確認状況', iss.registrationStatus, rs);
      set('消費税の端数処理', B.ROUNDING[s.rounding] || null, B.ROUNDING[U.$('#rd', main).value] || null);
      set('日割りの端数処理', B.ROUNDING[s.prorationRounding] || null, B.ROUNDING[U.$('#prd', main).value] || null);
      set('番号の形式', s.numberFormat, fmt);
      s.taxCategories.forEach((c, i) => { const nr = rates[i] !== undefined ? rates[i] : c.rate; const nv = U.$('[data-ver="' + i + '"]', main).checked; set(c.label, c.rate + '%・' + (c.verified ? '確認済み' : '未確認'), nr + '%・' + (nv ? '確認済み' : '未確認')); c.rate = nr; c.verified = nv; });
      if (rs !== iss.registrationStatus || rn !== iss.registrationNumber) { iss.registrationCheckedAt = X.today(); iss.registrationCheckedBy = S.user(); }
      Object.assign(iss, { name: U.$('#in', main).value.trim(), address: U.$('#ia', main).value.trim(), tel: U.$('#it', main).value.trim(), email: U.$('#ie', main).value.trim(), registrationNumber: rn, registrationStatus: rs });
      s.invoiceMode = mode;
      s.rounding = U.$('#rd', main).value || null;
      s.prorationRounding = U.$('#prd', main).value || null;
      s.numberFormat = fmt;
      if (JSON.stringify(s.bankAccounts) !== JSON.stringify(cleanBanks)) changes.push('振込先を変更（' + cleanBanks.length + '件）');
      s.bankAccounts = cleanBanks;
      s.defaultBankId = cleanBanks.some((a) => a.id === defBank) ? defBank : (cleanBanks[0] ? cleanBanks[0].id : '');
      S.log('請求管理の設定を変更しました', { type: 'billing', id: '', label: '請求管理の設定' }, changes.join('／') || '変更なし');
      S.save(true);
      U.toast('保存しました', 'ok');
      settings(main);
    });
  }

  // ───────── テスト用データ（架空）─────────
  function loadSample() {
    const b = X.bill();
    const s = b.settings;
    const all = S.get();
    const note = [];
    if (!s.issuer.name) { s.issuer.name = '【テスト】発行者'; note.push('発行者名'); }
    if (s.invoiceMode === 'undecided') { s.invoiceMode = 'normal'; note.push('請求書の種類＝通常'); }
    if (!s.rounding) { s.rounding = 'floor'; note.push('端数処理＝切り捨て（テスト用）'); }
    if (!s.prorationRounding) { s.prorationRounding = 'floor'; }
    if (!s.taxCategories.some((c) => c.verified)) { s.taxCategories.forEach((c) => { c.verified = true; }); note.push('税区分を確認済み（テスト用）'); }
    if (!s.bankAccounts.length) { s.bankAccounts.push({ id: S.uid('bk'), label: '【テスト】口座', bankName: 'テスト銀行', branch: 'テスト支店', type: '普通', number: '0000000', holder: 'テスト（架空）' }); s.defaultBankId = s.bankAccounts[0].id; note.push('振込先'); }
    let store = all.stores.find((x) => x.name === '【サンプル】カフェA');
    if (!store) { store = { id: S.uid('store'), name: '【サンプル】カフェA', kind: 'client', aliases: [], memo: '動作確認用（実在しません）', reportTemplate: '', createdAt: Date.now() }; all.stores.push(store); }
    let store2 = all.stores.find((x) => x.name === '【サンプル】カフェA 駅前店');
    if (!store2) { store2 = { id: S.uid('store'), name: '【サンプル】カフェA 駅前店', kind: 'client', aliases: [], memo: '動作確認用（実在しません）', reportTemplate: '', createdAt: Date.now() }; all.stores.push(store2); }
    const cl = Object.assign(X.newClient(), { companyName: '【テスト】株式会社カフェA', billingName: '【テスト】株式会社カフェA', postal: '000-0000', address: 'テスト県テスト市1-1（架空）', contactName: 'テスト担当', email: 'test@example.com', paymentTerms: { type: 'next_month_end' }, storeIds: [store.id, store2.id], notes: 'テスト用の架空データです' });
    const cl2 = Object.assign(X.newClient(), { companyName: '【テスト】美容室B', billingName: '【テスト】美容室B', honorific: '様', address: 'テスト県テスト市2-2（架空）', paymentTerms: { type: 'unset' } });
    b.clients.push(cl, cl2);
    const base = { startDate: '2026-04-01', billingStartMonth: '2026-04', priceTaxMode: 'excluded', taxCategory: 'std10', billingTiming: { type: 'same_month', text: '' }, proration: { enabled: false, method: '' } };
    b.contracts.push(Object.assign(X.newContract(cl.id), base, { storeId: store.id, name: '【テスト】SNS運用（本店）', service: 'SNS運用代行', amount: 50000, adjustments: [{ label: '長期契約値引き', amount: -5000, fromMonth: '2026-10', toMonth: '' }] }));
    b.contracts.push(Object.assign(X.newContract(cl.id), base, { storeId: store2.id, name: '【テスト】広告運用（駅前店）', service: '広告運用代行', amount: 30000, prepaid: [{ from: '2026-10', to: '2026-12', note: 'テスト：3か月前払い済み', invoiceId: null }] }));
    b.contracts.push(Object.assign(X.newContract(cl.id), base, { storeId: store.id, name: '【テスト】撮影（単発）', service: 'メニュー撮影', billingType: 'one_time', amount: 80000, billingStartMonth: '2026-10', startDate: '2026-10-01' }));
    b.contracts.push(Object.assign(X.newContract(cl2.id), { name: '【テスト】MEO対策（条件未確認）', service: 'Googleマップ運用', startDate: '2026-10-15', billingStartMonth: '2026-10' }));
    b.contracts.forEach((c) => { if (!c.history.length) c.history.push({ at: Date.now(), user: S.user(), action: '登録', detail: 'テスト用データ' }); });
    S.log('請求管理のテスト用データを追加しました', { type: 'billing', id: '', label: 'テスト用データ' }, note.length ? '設定：' + note.join('、') : '');
    S.save(true);
  }

  root.FS.views.billHome = home;
  root.FS.views.billPayments = payments;
  root.FS.views.billReminder = reminder;
  root.FS.views.billSettings = settings;
})(self);
