// 実行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const F = require('../app/js/core/format.js');
const C = require('../app/js/core/calc.js');
const CSV = require('../app/js/core/csv.js');
const G = require('../app/js/core/guard.js');
const R = require('../app/js/core/report.js');
const M = require('../app/js/core/minutes.js');

const mv = (o) => Object.fromEntries(Object.entries(o).map(([k, v]) => [k, { value: v, source: 'テスト', needsCheck: false, note: '' }]));
const STORES = [
  { id: 'a', name: '【サンプル】カフェA', kind: 'client' },
  { id: 'b', name: '【サンプル】美容室B', kind: 'client' },
  { id: 'own3', name: '出世魚', kind: 'own' },
];

test('数値の読み取り：カンマ・円・全角を扱い、読めない値は null', () => {
  assert.equal(F.parseNumber('30,000'), 30000);
  assert.equal(F.parseNumber('¥1,234円'), 1234);
  assert.equal(F.parseNumber('１２３'), 123);
  assert.equal(F.parseNumber('-'), null);
  assert.equal(F.parseNumber('約100'), null);
});

test('指標の計算：計算式と使用した数値を残す', () => {
  const d = C.computeDerived(mv({ spend: 30000, clicks: 600, impressions: 31250, reach: 12500, follows: 85, profileVisits: 420 }));
  const by = Object.fromEntries(d.map((x) => [x.key, x]));
  assert.equal(by.cpc.value, 50);
  assert.equal(by.cpc.formula, '広告費 30,000円 ÷ クリック数 600 = 50.0円（小数第2位を四捨五入）');
  assert.equal(F.round(by.cpf.value, 1), 352.9);
  assert.equal(by.cpm.value, 960);
  assert.equal(F.round(by.ctr.value, 2), 1.92);
  assert.equal(by.frequency.value, 2.5);
  assert.equal(F.round(by.followRate.value, 2), 20.24);
  assert.equal(by.cpr.value, null);
  assert.match(by.cpr.reason, /成果数が未入力/);
});

test('分母が0なら算出しない', () => {
  const d = C.computeDerived(mv({ spend: 1000, follows: 0 }));
  const cpf = d.find((x) => x.key === 'cpf');
  assert.equal(cpf.value, null);
  assert.equal(cpf.status, 'zero');
});

test('前回値が無ければ前回比を作らない／ある項目だけ比較する', () => {
  assert.deepEqual(C.compare(mv({ spend: 1000 }), null), []);
  const rows = C.compare(mv({ spend: 30000, clicks: 600 }), mv({ spend: 30000, clicks: 480, follows: 60 }));
  const keys = rows.map((r) => r.key);
  assert.ok(keys.includes('clicks'));
  assert.ok(!keys.includes('follows')); // 今回のフォロー数が無いので比較しない
  const c = rows.find((r) => r.key === 'clicks');
  assert.equal(c.changePct, 25);
  assert.equal(c.changeDisplay, '+25.0%');
  const out = R.build({ periodStart: '2026-09-01', periodEnd: '2026-09-30', objective: '認知拡大', metrics: mv({ spend: 1000, reach: 500 }), hasPrevious: false }, STORES[0], null, { senderName: '嶋野', stores: STORES });
  assert.equal(out.compare.length, 0);
  assert.ok(!/前回/.test(out.text));
});

test('所見は目的が無ければ良し悪しを判断しない', () => {
  const r = C.buildFindings({ metrics: mv({ spend: 1000, reach: 500 }) });
  assert.match(r.findings[0].text, /配信目的が未入力/);
});

test('CSV：引用符内のカンマ、列の自動対応、単価列を数値列と取り違えない', () => {
  const text = fs.readFileSync(path.join(__dirname, '../samples/sample_meta_ads.csv'), 'utf8');
  const rows = CSV.parse(text);
  const map = CSV.autoMap(rows[0]);
  assert.equal(rows[0][map.clicks], 'リンクのクリック');
  assert.equal(rows[0][map.spend], '消化金額 (JPY)');
  const agg = CSV.aggregate(rows.slice(1), rows[0], map, [0], 'x.csv', C.BASE_METRICS);
  assert.equal(agg.metrics.spend.value, 30000);
  assert.equal(agg.metrics.reach.value, 12500);
  assert.equal(agg.metrics.reach.needsCheck, false);
  assert.deepEqual(agg.period, { start: '2026-09-01', end: '2026-09-30' });
  const both = CSV.aggregate(rows.slice(1), rows[0], map, [0, 1], 'x.csv', C.BASE_METRICS);
  assert.equal(both.metrics.spend.value, 50000);
  assert.equal(both.metrics.reach.needsCheck, true); // リーチは合算で重複の可能性
  assert.match(both.metrics.spend.source, /2行を合算/);
});

test('CSV：タブ区切り（表計算ソフトからの貼り付け）', () => {
  const rows = CSV.parse('リーチ\t消化金額\n1,000\t5000\n');
  const map = CSV.autoMap(rows[0]);
  const agg = CSV.aggregate(rows.slice(1), rows[0], map, [0], '貼り付け', C.BASE_METRICS);
  assert.equal(agg.metrics.reach.value, 1000);
  assert.equal(agg.metrics.spend.value, 5000);
});

test('取り違え防止：報告文に別店舗名があれば要確認にする', () => {
  const rep = { periodStart: '2026-09-01', periodEnd: '2026-09-30', objective: '認知拡大', metrics: mv({ spend: 1000 }), hasPrevious: false, textOverride: '【サンプル】美容室B 様\n広告費：1,000円' };
  const out = R.build(rep, STORES[0], null, { senderName: '嶋野', stores: STORES });
  assert.ok(out.checks.some((c) => c.includes('【サンプル】美容室B')));
  assert.deepEqual(G.findOtherStoreMentions('出世魚の件', 'a', STORES).map((h) => h.storeId), ['own3']);
  assert.deepEqual(G.findOtherStoreMentions('カフェAの件', 'a', STORES), []);
});

test('数値照合：報告文に入力・計算に無い数値があれば要確認にする', () => {
  const rep = { periodStart: '2026-09-01', periodEnd: '2026-09-30', objective: '認知拡大', metrics: mv({ spend: 30000, clicks: 600 }), hasPrevious: false };
  const ok = R.build(rep, STORES[0], null, { senderName: '嶋野', stores: STORES });
  assert.ok(!ok.checks.some((c) => c.includes('一致しません')), ok.checks.join('\n'));
  rep.textOverride = ok.text.replace('30,000円', '3,000円');
  const ng = R.build(rep, STORES[0], null, { senderName: '嶋野', stores: STORES });
  assert.ok(ng.checks.some((c) => c.includes('「3,000」')));
});

test('報告文：未入力の値は【要確認】として残り、推測で埋めない', () => {
  const rep = { metrics: {}, hasPrevious: false };
  const out = R.build(rep, STORES[0], null, { senderName: '嶋野', stores: STORES });
  assert.match(out.text, /【要確認：配信期間未入力】/);
  assert.match(out.text, /【要確認：広告費未入力】/);
  assert.ok(out.checks.some((c) => c.includes('【要確認】')));
});

test('報告文：店舗の形式（テンプレート）を優先する', () => {
  const store = Object.assign({}, STORES[0], { reportTemplate: '{店舗名}様 {期間} 費用{広告費} CPC{クリック単価}' });
  const out = R.build({ periodStart: '2026-09-01', periodEnd: '2026-09-30', metrics: mv({ spend: 30000, clicks: 600 }) }, store, null, { senderName: '嶋野', stores: STORES });
  assert.equal(out.text, '【サンプル】カフェA様 2026年9月1日〜2026年9月30日 費用30,000円 CPC50.0円');
});

const MEMO = fs.readFileSync(path.join(__dirname, '../samples/sample_minutes.txt'), 'utf8');
const META = { date: '2026-10-05', participants: '嶋野成優(Four Seasons), 田中(店舗), 佐藤(デザイナー)' };

test('議事録：決定・未決・共有・タスクに分ける', () => {
  const r = M.extract(MEMO, META);
  assert.deepEqual(r.decisions.map((d) => d.sourceLine), [2, 4]);
  assert.equal(r.undecided.length, 2);
  assert.ok(r.undecided.some((u) => u.text.includes('ハロウィン')));
  assert.ok(r.shared.some((s) => s.text.includes('フォロワー数')));
});

test('議事録：担当者・期限・区分の判定と、重複タスクの統合', () => {
  const r = M.extract(MEMO, META);
  const cal = r.tasks.filter((t) => t.text.includes('投稿カレンダー'));
  assert.equal(cal.length, 1); // 同じタスクは1件にまとめる
  assert.deepEqual(cal[0].sourceLines, [5, 8]);
  assert.equal(cal[0].assignee, '嶋野成優');
  assert.equal(cal[0].side, 'fs');
  assert.equal(cal[0].dueDate, '2026-10-08');
  const photo = r.tasks.find((t) => t.text.includes('写真'));
  assert.equal(photo.assignee, '田中');
  assert.equal(photo.side, 'store');
  assert.equal(photo.materials, '写真');
  const logo = r.tasks.find((t) => t.text.includes('ロゴ'));
  assert.equal(logo.assignee, '佐藤');
  assert.equal(logo.side, 'other');
  assert.equal(logo.dueDate, null); // 「来週中」は日付を確定しない
  assert.equal(logo.dueNeedsCheck, true);
});

test('議事録：書かれていない担当者・期限は「未設定」', () => {
  const r = M.extract('・価格表の最新版を共有してもらう', META);
  assert.equal(r.tasks.length, 1);
  assert.equal(r.tasks[0].assignee, '未設定');
  assert.equal(r.tasks[0].due, '未設定');
  const checks = M.collectChecks(Object.assign({ title: 't', date: META.date, participants: META.participants }, r));
  assert.ok(checks.some((c) => c.includes('担当者が未設定')));
  assert.ok(checks.some((c) => c.includes('期限が未設定')));
});

test('議事録：行頭タグと見出しを優先する', () => {
  const r = M.extract('■決定事項\n・A案で進める\n■未決事項\n・B案の費用\nTODO：田中さんが見積書を送る 11/2まで', META);
  assert.equal(r.decisions[0].text, 'A案で進める');
  assert.equal(r.undecided[0].text, 'B案の費用');
  assert.equal(r.tasks[0].assignee, '田中');
  assert.equal(r.tasks[0].dueDate, '2026-11-02');
  assert.equal(r.tasks[0].materials, '見積書');
});

test('議事録：会議日より大きく前の月日は翌年として要確認', () => {
  const d = M.extractDue('1/10まで', '2026-12-20');
  assert.equal(d.date, '2027-01-10');
  assert.equal(d.needsCheck, true);
  assert.equal(M.extractDue('1/10まで', '').needsCheck, true);
});
