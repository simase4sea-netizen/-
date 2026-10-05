// 実行：node --test tests/
const test = require('node:test');
const assert = require('node:assert/strict');
const fs = require('fs');
const path = require('path');
const I = require('../app/js/core/influencer.js');
const CSV = require('../app/js/core/csv.js');

const CAMP = {
  address: '香川県高松市丸亀町1-1', areas: ['高松市', '瓦町'], genres: ['スイーツ'], dishes: 'ケーキ', products: '',
  purposes: ['来店促進', 'リール等の動画素材獲得'], platforms: ['instagram'], formats: ['リール'], compensation: 'free', budgetMax: '',
};
function loadCsv() {
  const rows = CSV.parse(fs.readFileSync(path.join(__dirname, '../samples/sample_influencers.csv'), 'utf8'));
  return rows.slice(1).map((r, i) => {
    const obj = Object.fromEntries(rows[0].map((h, j) => [h, r[j]]));
    const res = I.fromCsvRow(obj, { by: 'テスト' });
    res.cand.id = 'c' + i;
    return res;
  });
}

test('CSV取込：値・状態・取得元・確認日を記録し、空欄は未確認', () => {
  const [a, b, c] = loadCsv();
  assert.equal(a.cand.platform, 'instagram');
  assert.deepEqual(a.cand.followers, { value: 12000, status: 'confirmed', source: 'プロフィール画面', checkedAt: '2026-10-01', checkedBy: '嶋野成優' });
  assert.deepEqual(a.cand.recentReactions.value, [420, 380, 510, 450]);
  assert.equal(a.cand.fee.value, 0);
  assert.equal(b.cand.fee.status, 'unknown');
  assert.equal(b.cand.recentViews.value.length, 3);
  assert.equal(c.cand.followers.status, 'estimated'); // 「推定」と明記
  assert.equal(c.cand.pastWork.status, 'unknown');
});

test('取得元・確認日の無い数値は「推定」扱いにして警告する', () => {
  const { cand, warnings } = I.fromCsvRow({ 'プロフィールURL': 'https://www.instagram.com/x_test/', 'フォロワー数': '1.2万' });
  assert.equal(cand.followers.value, 12000);
  assert.equal(cand.followers.status, 'estimated');
  assert.ok(warnings.some((w) => w.includes('推定')));
});

test('評価：未確認の項目は0点にせず、総合点の計算から外す', () => {
  const [, , c] = loadCsv();
  const ev = I.evaluate(CAMP, c.cand, null);
  const by = Object.fromEntries(ev.items.map((x) => [x.key, x]));
  assert.equal(by.engagement.score, null);
  assert.equal(by.quality.score, null);
  assert.equal(by.cost.score, null);
  assert.ok(by.engagement.checks.length > 0);
  // 既知の項目だけの加重平均になっている
  const known = ev.items.filter((x) => x.score !== null);
  const expect = Math.round(known.reduce((a, x) => a + x.score * x.weight, 0) / known.reduce((a, x) => a + x.weight, 0));
  assert.equal(ev.score, expect);
  assert.equal(ev.insufficient, true); // 判定材料不足
  assert.ok(ev.coverage < 100);
});

test('評価：フォロワー数だけでは高評価にならない', () => {
  const big = { platform: 'instagram', profileUrl: 'https://instagram.com/big', followers: I.fact(1000000, 'confirmed', 'p', '2026-10-01') };
  const ev = I.evaluate(CAMP, big, null);
  const by = Object.fromEntries(ev.items.map((x) => [x.key, x]));
  assert.equal(by.engagement.score, null);
  assert.ok(ev.insufficient);
});

test('評価：理由・懸念点・追加確認事項を返す', () => {
  const [a, b] = loadCsv();
  const ea = I.evaluate(CAMP, a.cand, null);
  assert.equal(ea.insufficient, false);
  assert.ok(ea.score >= 80, String(ea.score));
  assert.ok(ea.reasons.some((r) => r.includes('瓦町') || r.includes('高松市')));
  assert.ok(ea.reasons.some((r) => r.includes('反応率')));
  assert.ok(ea.checks.some((r) => r.includes('広告表記')));
  const eb = I.evaluate(CAMP, b.cand, null);
  assert.ok(eb.concerns.some((x) => x.includes('希望SNS')));
  assert.ok(eb.checks.some((x) => x.includes('無料招待')));
});

test('重みを変更すると総合点が変わる', () => {
  const [a] = loadCsv();
  const s = I.defaultSettings();
  const before = I.evaluate(CAMP, a.cand, null, s).score;
  const s2 = JSON.parse(JSON.stringify(s));
  s2.weights = { region: 0, genre: 0, engagement: 0, quality: 100, campaign: 0, cost: 0 };
  const after = I.evaluate(CAMP, a.cand, null, s2);
  assert.equal(after.score, 80); // 品質 4/5 のみ
  assert.notEqual(before, after.score);
});

test('担当者評価で項目を上書きできる（理由付き）', () => {
  const [, , c] = loadCsv();
  const ev = I.evaluate(CAMP, c.cand, { manual: { quality: { score: 60, reason: '写真は良いが説明が少ない', by: '嶋野' } } });
  const q = ev.items.find((x) => x.key === 'quality');
  assert.equal(q.score, 60);
  assert.equal(q.manual, true);
  assert.match(q.reasons[0], /写真は良い/);
});

test('所在地・ジャンル・目的で絞り込める', () => {
  const rows = loadCsv().map(({ cand }) => ({ cand, ev: I.evaluate(CAMP, cand, null), link: null }));
  const regional = I.filterForCampaign(rows, { regionFit: true, threshold: 60 });
  assert.deepEqual(regional.map((r) => r.cand.handle), ['test_takamatsu_gourmet']);
  const genre = I.filterForCampaign(rows, { genreFit: true, threshold: 60 });
  assert.deepEqual(genre.map((r) => r.cand.handle), ['test_takamatsu_gourmet']);
  const purpose = I.filterForCampaign(rows, { purposeFit: true, threshold: 60 });
  assert.ok(purpose.every((r) => r.cand.handle !== 'test_osaka_ramen'));
  assert.equal(I.filterForCampaign(rows, { text: 'うどん' }).length, 1);
  assert.equal(I.filterForCampaign(rows, { text: '#香川カフェ' }).length, 1);
});

test('同じプロフィールURLの重複と、同一人物の別アカウントを検出する', () => {
  const all = [
    { id: '1', platform: 'instagram', handle: 'abc_food', displayName: 'ABCグルメ', profileUrl: 'https://www.instagram.com/abc_food/' },
    { id: '2', platform: 'tiktok', handle: 'abc_food', displayName: 'ABCグルメ', profileUrl: 'https://www.tiktok.com/@abc_food' },
  ];
  const dup = I.findDuplicates({ id: 'new', platform: 'instagram', handle: 'ABC_food', profileUrl: 'http://instagram.com/abc_food?igsh=xyz', displayName: '' }, all);
  assert.deepEqual(dup.same.map((x) => x.id), ['1']);
  const rel = I.findDuplicates(all[0], all);
  assert.deepEqual(rel.related.map((x) => x.id), ['2']);
  assert.equal(I.parseProfileUrl('https://m.youtube.com/@Foo/videos').key, 'youtube:foo');
});

test('CSV出力：見出しと値が往復する', () => {
  const cands = loadCsv().map((x) => x.cand);
  const text = I.toCsv(cands);
  const rows = CSV.parse(text);
  assert.equal(rows.length, 4);
  assert.equal(rows[0][0], '表示名');
  const back = I.fromCsvRow(Object.fromEntries(rows[0].map((h, j) => [h, rows[1][j]])));
  assert.equal(back.cand.followers.value, 12000);
  assert.equal(back.cand.followers.status, 'confirmed');
  assert.equal(back.cand.followers.checkedAt, '2026-10-01');
  const r3 = Object.fromEntries(rows[0].map((h, j) => [h, rows[3][j]]));
  assert.equal(r3['フォロワー数の状態'], '推定');
  assert.equal(r3['起用料金(円)'], '');
  assert.equal(r3['料金の状態'], '未確認');
});

test('連絡文の下書き：未入力の条件は【要確認】として残す', () => {
  const [a] = loadCsv();
  const t = I.contactDraft({ address: '香川県高松市', formats: ['リール'], compensation: 'free' }, a.cand, { name: '【テスト】店舗' }, '嶋野');
  assert.match(t, /【要確認：来店日】/);
  assert.match(t, /無料でのご招待/);
  assert.match(t, /PR/);
});
