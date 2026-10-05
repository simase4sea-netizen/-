// 実行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const B = require('../app/js/core/billing.js');
const CSV = require('../app/js/core/csv.js');

// テスト用の設定・請求先・契約（すべて架空）
function settings(over) {
  const s = B.defaultSettings();
  s.issuer.name = '【テスト】発行者';
  s.invoiceMode = 'normal';
  s.rounding = 'floor';
  s.prorationRounding = 'floor';
  s.taxCategories.forEach((c) => { c.verified = true; });
  return Object.assign(s, over || {});
}
const CLIENT = { id: 'cl1', companyName: '【テスト】株式会社A', status: 'active', paymentTerms: { type: 'next_month_end' } };
function contract(over) {
  return Object.assign({
    id: 'ct1', clientId: 'cl1', name: '【テスト】SNS運用', service: 'SNS運用代行', billingType: 'monthly', amount: 50000, priceTaxMode: 'excluded', taxCategory: 'std10',
    startDate: '2026-04-01', endDate: '', billingStartMonth: '2026-04', billingEndMonth: '', status: 'active', proration: { enabled: false }, adjustments: [], prepaid: [], suspensions: [], priceHistory: [],
  }, over || {});
}
function draftFrom(c, ym, s, id) {
  const { lines, issues } = B.contractLinesForMonth(c, ym, s);
  return { inv: { id: id || 'inv1', status: 'draft', clientId: 'cl1', billTo: { name: '【テスト】株式会社A', honorific: '御中' }, issueDate: '2026-10-05', dueDate: '2026-11-30', bank: { bankName: 'テスト銀行' }, priceMode: c.priceTaxMode, lines }, issues };
}
const ctx = (contracts, invoices, s) => ({ clients: [CLIENT], contracts, invoices, settings: s || settings(), payments: [] });

test('月額契約から請求書の明細・金額を作れる（税抜・10%・切り捨て）', () => {
  const c = contract();
  const { inv, issues } = draftFrom(c, '2026-10', settings());
  assert.deepEqual(issues, []);
  assert.equal(inv.lines.length, 1);
  assert.match(inv.lines[0].description, /2026年10月分/);
  const t = B.calcTotals(inv.lines, 'excluded', settings());
  assert.equal(t.subtotal, 50000);
  assert.equal(t.tax, 5000);
  assert.equal(t.total, 55000);
  const r = B.checkInvoice(inv, ctx([c], []));
  assert.deepEqual(r.errors, []);
  assert.deepEqual(r.warnings, []);
});

test('端数処理は設定に従い、税率ごとに1回だけ行う', () => {
  const lines = [{ qty: 1, unitPrice: 1234, taxCategory: 'std10' }, { qty: 1, unitPrice: 1235, taxCategory: 'std10' }, { qty: 3, unitPrice: 333, taxCategory: 'red8' }];
  const f = B.calcTotals(lines, 'excluded', settings({ rounding: 'floor' }));
  // 10%：2469×0.1=246.9 → 246（行ごとに丸めると 123+123=246 だが、合計に1回）／8%：999×0.08=79.92 → 79
  assert.deepEqual(f.groups.map((g) => [g.rate, g.base, g.tax]), [[10, 2469, 246], [8, 999, 79]]);
  assert.equal(B.calcTotals(lines, 'excluded', settings({ rounding: 'round' })).tax, 247 + 80);
  assert.equal(B.calcTotals(lines, 'excluded', settings({ rounding: 'ceil' })).tax, 247 + 80);
  // 税込：11000 → 税 1000
  const inc = B.calcTotals([{ qty: 1, unitPrice: 11000, taxCategory: 'std10' }], 'included', settings());
  assert.deepEqual([inc.subtotal, inc.tax, inc.total], [10000, 1000, 11000]);
});

test('端数処理・税区分・料金が未設定なら計算せずエラー（推測しない）', () => {
  const s = settings({ rounding: null });
  const t = B.calcTotals([{ qty: 1, unitPrice: 1000, taxCategory: 'std10' }], 'excluded', s);
  assert.equal(t.total, null);
  assert.ok(t.errors.some((e) => e.includes('端数処理')));
  const c = contract({ amount: null, taxCategory: null, priceTaxMode: null });
  const { issues } = B.contractLinesForMonth(c, '2026-10', settings());
  assert.ok(issues.some((x) => x.includes('税区分が未設定')));
  assert.ok(issues.some((x) => x.includes('税抜か税込か未設定')));
  assert.ok(issues.some((x) => x.includes('月額料金が未設定')));
  const s2 = B.defaultSettings();
  const { inv } = draftFrom(contract(), '2026-10', settings());
  const r = B.checkInvoice(inv, ctx([contract()], [], s2));
  assert.ok(r.errors.some((e) => e.code === 'MODE_UNDECIDED'));
  assert.ok(r.errors.some((e) => e.code === 'TAX_UNVERIFIED'));
  assert.ok(r.errors.some((e) => e.code === 'NO_ISSUER'));
});

test('同じ契約・同じ対象月への二重請求を警告し、理由を確認するまで未確認のまま', () => {
  const c = contract();
  const a = draftFrom(c, '2026-10', settings(), 'a').inv;
  a.status = 'issued'; a.number = 'INV-202610-001';
  const b = draftFrom(c, '2026-10', settings(), 'b').inv;
  const r = B.checkInvoice(b, ctx([c], [a, b]));
  assert.ok(r.warnings.some((w) => w.code === 'DUPLICATE' && w.msg.includes('INV-202610-001')));
  assert.equal(B.unacknowledged(b, r.warnings).length, 1);
  b.acks = [{ code: 'DUPLICATE', msg: r.warnings[0].msg, reason: '' }];
  assert.equal(B.unacknowledged(b, r.warnings).length, 1); // 理由が空なら確認済みにならない
  b.acks[0].reason = '前回分の取消・再発行のため';
  assert.equal(B.unacknowledged(b, r.warnings).length, 0);
  // 取消済みの請求書とは重複しない
  a.status = 'cancelled';
  assert.ok(!B.checkInvoice(b, ctx([c], [a, b])).warnings.some((w) => w.code === 'DUPLICATE'));
});

test('単発請求・追加料金・値引き・初期費用を登録できる', () => {
  const c = contract({ adjustments: [{ label: '撮影追加', amount: 10000, fromMonth: '2026-10', toMonth: '2026-10' }, { label: '長期契約値引き', amount: -5000, fromMonth: '2026-10', toMonth: '' }], initialFee: { label: '初期設定費', amount: 30000, month: '2026-10' } });
  const { lines } = B.contractLinesForMonth(c, '2026-10', settings());
  assert.deepEqual(lines.map((l) => [l.kind, l.unitPrice]), [['regular', 50000], ['extra', 10000], ['discount', -5000], ['initial', 30000]]);
  assert.equal(B.calcTotals(lines, 'excluded', settings()).total, 93500);
  assert.equal(B.contractLinesForMonth(c, '2026-11', settings()).lines.length, 2); // 値引きは継続、追加・初期費用は10月のみ
  const one = contract({ id: 'ct2', billingType: 'one_time', amount: 80000, billingStartMonth: '2026-10' });
  assert.deepEqual(B.contractLinesForMonth(one, '2026-10', settings()).lines.map((l) => l.kind), ['one_time']);
  assert.equal(B.contractLinesForMonth(one, '2026-11', settings()).lines.length, 0);
});

test('前払い期間と請求対象月の重複を検知する', () => {
  const c = contract({ prepaid: [{ from: '2026-10', to: '2027-03', invoiceId: 'pre' }] });
  const { inv } = draftFrom(c, '2026-12', settings());
  const r = B.checkInvoice(inv, ctx([c], []));
  assert.ok(r.warnings.some((w) => w.code === 'PREPAID' && w.msg.includes('2026年10月〜2027年3月')));
  assert.ok(!B.checkInvoice(draftFrom(c, '2027-04', settings()).inv, ctx([c], [])).warnings.some((w) => w.code === 'PREPAID'));
  // 前払い期間は請求漏れに出さない
  assert.equal(B.omissions('2026-12', ctx([c], [])).length, 0);
});

test('契約開始前・終了後・請求停止中の請求を警告する', () => {
  const c = contract({ startDate: '2026-06-01', billingStartMonth: '2026-06', endDate: '2026-12-31', billingEndMonth: '2026-12', suspensions: [{ from: '2026-09', to: '2026-09' }] });
  const w = (ym) => B.checkInvoice(draftFrom(c, ym, settings()).inv, ctx([c], [])).warnings.map((x) => x.code);
  assert.ok(w('2026-05').includes('BEFORE_START'));
  assert.ok(w('2026-05').includes('OUT_OF_PERIOD'));
  assert.ok(w('2027-01').includes('AFTER_END'));
  assert.ok(w('2026-09').includes('SUSPENDED'));
  assert.deepEqual(w('2026-10'), []);
});

test('請求漏れ：対象の契約に請求書が無いと一覧に出る', () => {
  const c = contract();
  assert.equal(B.omissions('2026-10', ctx([c], [])).length, 1);
  const { inv } = draftFrom(c, '2026-10', settings());
  assert.equal(B.omissions('2026-10', ctx([c], [inv])).length, 0);
  assert.equal(B.omissions('2026-03', ctx([c], [])).length, 0); // 請求開始前
});

test('日割り：有無が未設定ならエラー、設定済みなら計算式付きで日割り', () => {
  const c = contract({ startDate: '2026-10-16', billingStartMonth: '2026-10', proration: { enabled: null } });
  assert.ok(B.contractLinesForMonth(c, '2026-10', settings()).issues.some((x) => x.includes('日割りの有無が未設定')));
  c.proration = { enabled: true, method: 'daily' };
  const { lines, issues } = B.contractLinesForMonth(c, '2026-10', settings());
  assert.deepEqual(issues, []);
  assert.equal(lines[0].unitPrice, Math.floor((50000 * 16) / 31)); // 16/31日
  assert.match(lines[0].description, /16\/31日/);
});

test('料金変更後も、作成済みの請求書の明細は変わらない', () => {
  const c = contract();
  const { inv } = draftFrom(c, '2026-10', settings());
  const snap = JSON.stringify(inv.lines);
  c.priceHistory = [{ effectiveMonth: '2026-11', amount: 60000 }];
  c.amount = 99999; // 契約を書き換えても
  assert.equal(JSON.stringify(inv.lines), snap);
  assert.equal(B.amountForMonth(c, '2026-10'), 99999);
  assert.equal(B.amountForMonth(c, '2026-11'), 60000);
});

test('請求書番号は重複しない（取消済みの番号も再利用しない）', () => {
  const nums = [];
  for (let i = 0; i < 5; i++) nums.push(B.nextNumber('INV-{YYYY}{MM}-{SEQ3}', '2026-10-05', nums));
  assert.deepEqual(nums, ['INV-202610-001', 'INV-202610-002', 'INV-202610-003', 'INV-202610-004', 'INV-202610-005']);
  assert.equal(new Set(nums).size, 5);
  assert.equal(B.nextNumber('INV-{YYYY}{MM}-{SEQ3}', '2026-11-01', nums), 'INV-202611-001');
  assert.throws(() => B.nextNumber('FIXED', '2026-10-05', ['FIXED']));
});

test('一部入金後の残額と、支払期限超過の判定', () => {
  const inv = { id: 'i', status: 'issued', dueDate: '2026-10-31', totalsSnapshot: { total: 55000 } };
  const pays = [{ invoiceId: 'i', amount: 20000, date: '2026-10-20' }];
  let ps = B.paymentState(inv, pays, '2026-10-25');
  assert.deepEqual([ps.paid, ps.remaining, ps.state, ps.overdue], [20000, 35000, 'partial', false]);
  ps = B.paymentState(inv, pays, '2026-11-10');
  assert.equal(ps.overdue, true);
  assert.equal(ps.daysOverdue, 10);
  assert.equal(B.displayStatus(inv, ps).label, '期限超過（一部入金）');
  pays.push({ invoiceId: 'i', amount: 35000, date: '2026-11-11' });
  ps = B.paymentState(inv, pays, '2026-11-12');
  assert.deepEqual([ps.remaining, ps.state, ps.overdue], [0, 'paid', false]);
  pays[1].voided = true; // 取り消した入金は数えない
  assert.equal(B.paymentState(inv, pays, '2026-11-12').remaining, 35000);
});

test('支払期限の計算（支払条件が未設定なら null）', () => {
  assert.equal(B.dueDateFor('2026-10-05', { type: 'next_month_end' }), '2026-11-30');
  assert.equal(B.dueDateFor('2026-01-31', { type: 'next_month_end' }), '2026-02-28');
  assert.equal(B.dueDateFor('2026-10-05', { type: 'days_after', days: 30 }), '2026-11-04');
  assert.equal(B.dueDateFor('2026-10-05', { type: 'month_end_after', months: 2 }), '2026-12-31');
  assert.equal(B.dueDateFor('2026-10-05', { type: 'unset' }), null);
});

test('入金CSV：文字化け・金額のずれがなく、不正な行・過入金を検出する', () => {
  const invs = [{ id: 'i1', number: 'INV-202610-001', status: 'issued', dueDate: '2026-10-31', totalsSnapshot: { total: 55000 } }];
  const text = '﻿請求書番号,入金日,入金額,入金方法,メモ\r\nINV-202610-001,2026/10/20,"20,000",銀行振込,一部（テスト）\r\nINV-202610-001,2026-10-21,40000,銀行振込,\r\nINV-999,2026-10-21,100,,\r\nINV-202610-001,2026-10-22,100.5,,\r\n';
  const rows = CSV.parse(text);
  const v = B.validatePaymentRows(rows, invs, [], '2026-10-30');
  assert.equal(v.error, '');
  assert.equal(v.items[0].amount, 20000);
  assert.equal(v.items[0].date, '2026-10-20');
  assert.equal(v.items[0].memo, '一部（テスト）');
  assert.deepEqual(v.items[0].errs, []);
  assert.ok(v.items[1].warns.some((w) => w.includes('過入金')));
  assert.ok(v.items[2].errs.some((e) => e.includes('見つかりません')));
  assert.ok(v.items[3].errs.some((e) => e.includes('入金額')));
});

test('CSV出力：BOM付きUTF-8、金額・記号・改行が往復で変わらない', () => {
  const text = B.toCsv(['請求書番号', '請求先', '合計'], [['INV-1', '【テスト】"株式会社",A\n本店', 1234567]]);
  assert.equal(text.charCodeAt(0), 0xfeff);
  const rows = CSV.parse(text);
  assert.deepEqual(rows[1], ['INV-1', '【テスト】"株式会社",A\n本店', '1234567']);
  assert.equal(B.parseYen(rows[1][2]), 1234567);
});

test('適格請求書モードでは登録番号（確認済み）が必須', () => {
  const s = settings({ invoiceMode: 'qualified' });
  const { inv } = draftFrom(contract(), '2026-10', s);
  assert.ok(B.checkInvoice(inv, ctx([contract()], [], s)).errors.some((e) => e.code === 'NO_REGNO'));
  s.issuer.registrationNumber = 'T1234567890123';
  s.issuer.registrationStatus = 'registered';
  assert.ok(!B.checkInvoice(inv, ctx([contract()], [], s)).errors.some((e) => e.code === 'NO_REGNO'));
});

test('集計：対象期間の発行額・入金額・未入金額・期限超過', () => {
  const invs = [
    { id: 'a', status: 'issued', clientId: 'cl1', issueDate: '2026-10-05', dueDate: '2026-10-31', totalsSnapshot: { total: 55000 }, lines: [] },
    { id: 'b', status: 'issued', clientId: 'cl1', issueDate: '2026-09-05', dueDate: '2026-09-30', totalsSnapshot: { total: 11000 }, lines: [] },
    { id: 'c', status: 'cancelled', clientId: 'cl1', issueDate: '2026-10-06', dueDate: '2026-10-31', totalsSnapshot: { total: 99999 }, lines: [] },
  ];
  const pays = [{ invoiceId: 'a', amount: 20000, date: '2026-10-20' }];
  const r = B.summarize('2026-10', '2026-10', Object.assign(ctx([contract()], invs), { payments: pays }), '2026-11-05');
  assert.equal(r.issuedAmount, 55000);
  assert.equal(r.paidAmount, 20000);
  assert.equal(r.unpaidAmount, 35000);
  assert.deepEqual(r.overdue.map((o) => o.inv.id), ['b', 'a']);
  assert.equal(r.byMonth[0].forecast, 55000);
});
