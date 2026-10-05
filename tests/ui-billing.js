// 請求管理の画面通し確認（任意）。node tests/ui-billing.js
// テスト用データのみ使用。PDFの文字確認に pdftotext（poppler）を使う（無ければその確認は省略）。
const path = require('path');
const fs = require('fs');
const os = require('os');
const { execFileSync } = require('child_process');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');
const SHOTS = process.env.SHOTS || '';
const TMP = fs.mkdtempSync(path.join(os.tmpdir(), 'bill-'));

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [], external = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('request', (r) => { if (!/^(file|blob|data):/.test(r.url())) external.push(r.url()); });
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const ok = async () => { const c = await p.$('#mdl-check'); if (c) await c.check(); await p.click('.modal [data-act=ok]'); await p.waitForTimeout(150); };
  const st = () => p.evaluate(() => FS.store.get().bill);

  // 設定前は発行できないことを表示
  await p.goto(URL + '#/bill');
  assert.match(await p.textContent('main'), /請求書を発行する前に設定が必要です/);
  await p.click('#sample'); await ok();
  await shot('bill01_home');
  assert.match(await p.textContent('main'), /MEO対策（条件未確認）/); // 未設定の項目に出る

  // 定期請求のまとめ作成（請求先・店舗ごと）
  await p.goto(URL + '#/bill/bulk');
  await p.fill('#ym', '2026-10'); await p.dispatchEvent('#ym', 'change');
  await p.fill('#idt', '2026-10-05'); await p.dispatchEvent('#idt', 'change');
  await p.selectOption('#gr', 'store');
  await p.waitForTimeout(200);
  await shot('bill02_bulk');
  const bulkText = await p.textContent('main');
  assert.match(bulkText, /前払い済み期間/); // 前払い期間との重複を検知
  const checked = await p.$$eval('[data-k]', (els) => els.map((e) => e.checked));
  assert.deepEqual(checked.filter(Boolean).length, 2); // 前払いの店舗は初期状態で未選択
  await p.click('#make'); await ok();
  let bill = await st();
  assert.equal(bill.invoices.length, 2);

  // 本店分：SNS 50,000 − 値引き 5,000 ＋ 撮影 80,000 ＝ 125,000（税 12,500）＝ 137,500
  const main = bill.invoices.find((i) => i.lines.some((l) => l.description.includes('メニュー撮影')));
  await p.goto(URL + '#/bill/inv/' + main.id);
  assert.match(await p.textContent('main'), /137,500円/);
  await p.click('[data-a=review]'); await p.waitForTimeout(150);
  await p.click('[data-a=approve]');
  assert.equal(await p.$eval('.modal [data-act=ok]', (e) => e.disabled), true);
  await ok();
  await p.click('[data-a=issue]');
  assert.match(await p.textContent('.modal'), /INV-202610-001/);
  await ok();
  await shot('bill03_issued');
  bill = await st();
  const issued = bill.invoices.find((i) => i.id === main.id);
  assert.equal(issued.number, 'INV-202610-001');
  assert.equal(issued.totalsSnapshot.total, 137500);

  // 条件未確認の契約の請求書は確認待ちにできない
  const meo = bill.invoices.find((i) => i.id !== main.id);
  await p.goto(URL + '#/bill/inv/' + meo.id);
  await p.click('[data-a=review]');
  assert.match(await p.textContent('.modal'), /税区分が未設定|月額料金が未設定|単価または数量/);
  await p.click('.modal [data-act=ok]');

  // 二重請求：同じ契約・同じ月を手動で作ると警告、理由を記録するまで承認できない
  await p.goto(URL + '#/bill/inv/new');
  await p.selectOption('.modal #cl', { label: '【テスト】株式会社カフェA' });
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('#addFromContract');
  await p.click('#addFromContract');
  await p.selectOption('.modal #ct', { label: '【テスト】SNS運用（本店）' });
  await p.fill('.modal #f', '2026-10');
  await p.click('.modal [data-act=ok]');
  await p.waitForTimeout(200);
  assert.match(await p.textContent('main'), /二重請求の可能性/);
  await p.click('[data-a=review]'); await p.waitForTimeout(100);
  await p.click('[data-a=approve]');
  assert.match(await p.textContent('.modal'), /警告の理由が未確認/);
  await p.click('.modal [data-act=ok]');
  await shot('bill04_duplicate');

  // 単発・追加・値引きの手入力 ＋ 期限超過用に過去日付で発行
  await p.goto(URL + '#/bill/inv/new');
  await p.selectOption('.modal #cl', { label: '【テスト】株式会社カフェA' });
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('#addLine');
  const addManual = async (desc, price) => {
    await p.click('#addLine'); await p.waitForTimeout(100);
    const n = (await p.$$('[data-f=description]')).length - 1;
    await p.fill('[data-l="' + n + '"][data-f=description]', desc); await p.dispatchEvent('[data-l="' + n + '"][data-f=description]', 'change'); await p.waitForTimeout(80);
    await p.fill('[data-l="' + n + '"][data-f=unitPrice]', String(price)); await p.dispatchEvent('[data-l="' + n + '"][data-f=unitPrice]', 'change'); await p.waitForTimeout(80);
    await p.selectOption('[data-l="' + n + '"][data-f=taxCategory]', 'std10'); await p.waitForTimeout(80);
  };
  await addManual('追加撮影（テスト）', 20000);
  await addManual('値引き（テスト）', -2000);
  await p.selectOption('[data-l="1"][data-f=kind]', 'discount'); await p.waitForTimeout(80);
  await p.selectOption('#pm', 'excluded'); await p.waitForTimeout(80);
  await p.fill('#idt', '2026-08-01'); await p.dispatchEvent('#idt', 'change'); await p.waitForTimeout(80);
  await p.fill('#ddt', '2026-08-31'); await p.dispatchEvent('#ddt', 'change'); await p.waitForTimeout(80);
  assert.match(await p.textContent('main'), /19,800円/); // (20,000−2,000)×1.1
  await p.click('[data-a=review]'); await p.waitForTimeout(100);
  await p.click('[data-a=approve]'); await ok();
  await p.click('[data-a=issue]'); await ok();
  bill = await st();
  const old = bill.invoices.find((i) => i.issueDate === '2026-08-01');
  assert.equal(old.number, 'INV-202608-001');

  // 一部入金 → 残額
  await p.goto(URL + '#/bill/inv/' + main.id);
  await p.click('#addPay');
  await p.fill('.modal #d', '2026-10-04');
  await p.fill('.modal #a', '50000');
  await p.click('.modal [data-act=ok]'); await p.waitForTimeout(100);
  assert.match(await p.textContent('.modal'), /87,500円/);
  await ok();
  assert.match(await p.textContent('main'), /一部入金/);

  // 期限超過の一覧
  await p.goto(URL + '#/bill/payments');
  await shot('bill05_unpaid');
  const unpaidText = await p.textContent('#pane');
  assert.match(unpaidText, /INV-202608-001/);
  assert.match(unpaidText, /\d+日/);
  // 催促文：承認前はコピーできない
  await p.click('[data-rem]');
  await p.waitForSelector('#tx');
  assert.equal(await p.$('[data-wf=copy]'), null);
  assert.match(await p.inputValue('#tx'), /19,800円/);

  // 入金CSV取込（残額 87,500 を入金 → 入金済み）
  await p.goto(URL + '#/bill/payments');
  await p.click('.tabs button[data-tab=import]');
  const csvPath = path.join(TMP, 'pay.csv');
  fs.writeFileSync(csvPath, '﻿請求書番号,入金日,入金額,入金方法,メモ\r\nINV-202610-001,2026/10/05,"87,500",銀行振込,残額（テスト）\r\nINV-999,2026/10/05,100,,\r\n');
  await p.setInputFiles('#f', csvPath);
  await p.waitForSelector('.modal');
  assert.match(await p.textContent('.modal'), /見つかりません/);
  await ok();
  bill = await st();
  assert.equal(bill.payments.filter((x) => !x.voided).reduce((s, x) => s + x.amount, 0), 137500);

  // 契約の料金を変更しても、発行済み請求書は変わらない
  const sns = bill.contracts.find((c) => c.name.includes('SNS運用'));
  await p.goto(URL + '#/bill/contract/' + sns.id);
  await p.click('#price');
  await p.fill('.modal #em', '2026-10'); await p.fill('.modal #na', '60000'); await p.fill('.modal #rs', 'テスト：料金改定');
  await ok();
  bill = await st();
  assert.equal(bill.invoices.find((i) => i.id === main.id).totalsSnapshot.total, 137500);
  assert.match(JSON.stringify(bill.invoices.find((i) => i.id === main.id).lines), /50000/);

  // 請求書の表示とPDF（印刷用ページ）
  await p.goto(URL + '#/bill/print/' + main.id);
  await shot('bill06_print');
  const pdfPath = path.join(TMP, 'inv.pdf');
  await p.emulateMedia({ media: 'print' });
  await p.pdf({ path: pdfPath, format: 'A4' });
  await p.emulateMedia({ media: 'screen' });
  try {
    const txt = execFileSync('pdftotext', ['-layout', pdfPath, '-'], { encoding: 'utf8' });
    for (const s of ['INV-202610-001', '2026年10月5日', '2026年11月30日', '137,500円', '12,500円', '【テスト】株式会社カフェA', 'テスト銀行']) assert.ok(txt.includes(s), 'PDFに「' + s + '」がありません');
    assert.ok(!/下書き/.test(txt));
    console.log('PDF text check: OK');
  } catch (e) { if (e.code === 'ENOENT') console.log('pdftotext が無いため PDF 文字確認は省略'); else throw e; }

  // CSV出力（保存先未指定 → 確認してダウンロード）
  await p.goto(URL + '#/bill/invoices');
  await p.click('#exp');
  await p.click('.modal [data-act=ok]'); await p.waitForTimeout(150);
  assert.match(await p.textContent('.modal'), /保存先フォルダが指定されていない/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('.modal [data-act=ok]')]);
  const out = fs.readFileSync(await dl.path(), 'utf8');
  assert.equal(out.charCodeAt(0), 0xfeff);
  assert.match(out, /"INV-202610-001","入金済み","【テスト】株式会社カフェA"/);
  assert.match(out, /"125000","12500","137500","137500","0"/);

  // 請求書番号の重複なし
  bill = await st();
  const nums = bill.invoices.map((i) => i.number).filter(Boolean);
  assert.equal(new Set(nums).size, nums.length);

  // 取消：理由が必要、番号は再利用しない
  await p.goto(URL + '#/bill/inv/' + old.id);
  await p.click('[data-a=reissue]');
  await p.fill('.modal #rs', 'テスト：宛名修正');
  await ok();
  await p.waitForTimeout(200);
  bill = await st();
  assert.equal(bill.invoices.find((i) => i.id === old.id).status, 'cancelled');
  const re = bill.invoices.find((i) => i.replacesId === old.id);
  assert.equal(re.status, 'draft');
  assert.equal(re.number, null);

  for (const r of ['#/bill', '#/bill/clients', '#/bill/contracts', '#/bill/settings', '#/log']) { await p.goto(URL + r); await p.waitForTimeout(120); }
  await shot('bill07_home_after');
  const sp = await (await b.newContext({ viewport: { width: 390, height: 844 } })).newPage();
  await sp.goto(URL + '#/bill');
  for (const r of ['#/bill', '#/bill/invoices', '#/bill/payments', '#/bill/contracts']) { await sp.goto(URL + r); await sp.waitForTimeout(120); const w = await sp.evaluate(() => document.documentElement.scrollWidth); assert.ok(w <= 392, r + ' がスマホ幅をはみ出しています（' + w + 'px）'); }
  assert.deepEqual(errs, []);
  assert.deepEqual(external, []);
  await b.close();
  console.log('ui-billing: OK');
})().catch((e) => { console.error(e); process.exit(1); });
