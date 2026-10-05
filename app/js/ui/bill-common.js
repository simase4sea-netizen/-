/* 請求管理：画面共通（データ取得・ラベル・状態表示・保存先フォルダへの保存） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const B = root.FS.bill;
  const FILES = root.FS.files;
  const esc = U.esc;

  function bill() { return S.get().bill; }
  function today() { return B.isoDate(new Date()); }
  function thisMonth() { return today().slice(0, 7); }
  function client(id) { return bill().clients.find((c) => c.id === id) || null; }
  function contract(id) { return bill().contracts.find((c) => c.id === id) || null; }
  function invoice(id) { return bill().invoices.find((c) => c.id === id) || null; }
  function clientLabel(c) { return c ? c.companyName || c.billingName || '名称未入力' : '（請求先なし）'; }
  function ctx() { const b = bill(); return { clients: b.clients, contracts: b.contracts, invoices: b.invoices, payments: b.payments, settings: b.settings }; }

  function statusBadge(inv) {
    const ps = B.paymentState(inv, bill().payments, today());
    const d = B.displayStatus(inv, ps);
    const cls = { draft: 'st-draft', review: 'st-review', approved: 'st-approved', issued: 'client', partial: 'warn', paid: 'st-approved', over: 'warn', overdue: 'danger', cancelled: 'gray' }[d.key] || 'gray';
    return '<span class="badge ' + cls + '">' + esc(d.label) + '</span>';
  }

  function unsetBadge(text) { return '<span class="badge danger">' + esc(text || '未設定') + '</span>'; }
  function val(v, fmt) { return v === null || v === undefined || v === '' ? unsetBadge() : esc(fmt ? fmt(v) : v); }

  function logBill(action, target, detail, doc) {
    return S.log(action, target, detail, doc);
  }

  // ───── 保存先フォルダ（Chrome / Edge の File System Access API）─────
  // 既存ファイルは上書きしない。同名があれば「(2)」などを付けた新しい名前で保存する。
  const HANDLE_KEY = 'bill-save-dir';
  function fsSupported() { return typeof window !== 'undefined' && 'showDirectoryPicker' in window; }

  async function getDir() {
    try { return await FILES.get(HANDLE_KEY); } catch (e) { return null; }
  }
  async function chooseDir() {
    if (!fsSupported()) { U.toast('このブラウザは保存先フォルダの指定に対応していません（Chrome・Edgeで利用できます）', 'error'); return null; }
    const h = await window.showDirectoryPicker({ mode: 'readwrite' });
    await FILES.put(HANDLE_KEY, h);
    S.log('請求書類の保存先フォルダを設定しました', { type: 'billing', id: '', label: '保存先' }, h.name);
    S.save(true);
    return h;
  }
  async function clearDir() { await FILES.remove(HANDLE_KEY); }

  async function freeName(dir, name) {
    const dot = name.lastIndexOf('.');
    const base = dot > 0 ? name.slice(0, dot) : name, ext = dot > 0 ? name.slice(dot) : '';
    for (let i = 1; i < 1000; i++) {
      const cand = i === 1 ? name : base + '(' + i + ')' + ext;
      try { await dir.getFileHandle(cand, { create: false }); } catch (e) { if (e.name === 'NotFoundError') return cand; throw e; }
    }
    throw new Error('空いているファイル名が見つかりません');
  }

  // 保存前に必ず保存先とファイル名を確認する
  async function saveFile(name, text, mime, what) {
    const dir = await getDir();
    if (dir) {
      let perm = 'denied';
      try { perm = await dir.queryPermission({ mode: 'readwrite' }); if (perm !== 'granted') perm = await dir.requestPermission({ mode: 'readwrite' }); } catch (e) { perm = 'denied'; }
      if (perm === 'granted') {
        const finalName = await freeName(dir, name);
        const ok = await U.modal({ title: '保存の確認', body: '<p>' + esc(what || 'ファイル') + 'を保存します。既存のファイルは上書きしません。</p><table class="tbl"><tr><th>保存先フォルダ</th><td>' + esc(dir.name) + '</td></tr><tr><th>ファイル名</th><td>' + esc(finalName) + (finalName !== name ? '<div class="small" style="color:var(--warn)">同じ名前のファイルがあるため名前を変えています</div>' : '') + '</td></tr></table>', confirmLabel: '保存する' });
        if (!ok) return false;
        const fh = await dir.getFileHandle(finalName, { create: true });
        const w = await fh.createWritable();
        await w.write(new Blob([text], { type: mime }));
        await w.close();
        S.log((what || 'ファイル') + 'を保存しました', { type: 'billing', id: '', label: finalName }, '保存先：' + dir.name);
        U.toast('保存しました：' + dir.name + '/' + finalName, 'ok');
        return true;
      }
    }
    const ok = await U.modal({ title: '保存の確認', body: '<p>保存先フォルダが指定されていないため、ブラウザの「ダウンロード」に保存します（既存のファイルは上書きされません）。保存先は「請求管理の設定」で指定できます。</p><p>ファイル名：<b>' + esc(name) + '</b></p>', confirmLabel: 'ダウンロードする' });
    if (!ok) return false;
    U.download(name, text, mime);
    S.log((what || 'ファイル') + 'をダウンロードしました', { type: 'billing', id: '', label: name }, '');
    return true;
  }

  function fileSafe(s) { return String(s || '').replace(/[\\/:*?"<>|\s]+/g, '_').slice(0, 60); }

  root.FS = root.FS || {};
  root.FS.billui = { bill, today, thisMonth, client, contract, invoice, clientLabel, ctx, statusBadge, unsetBadge, val, logBill, fsSupported, getDir, chooseDir, clearDir, saveFile, fileSafe };
})(self);
