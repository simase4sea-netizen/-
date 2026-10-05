const test = require('node:test');
const assert = require('node:assert/strict');
const I = require('../app/js/core/influencer.js');
const A = require('../app/js/core/inf-auto.js');
const Y = require('./fixtures/youtube.js');

const CAMP = { address: '香川県高松市（テスト）', areas: ['高松市', '瓦町'], genres: ['スイーツ', 'カフェ'], dishes: 'パフェ', products: '', purposes: ['来店促進'], platforms: ['youtube', 'instagram'], formats: [], compensation: 'free', followerMin: 5000, followerMax: 100000 };
const ctx = { today: '2026-10-05' };
const vids = (ids) => ids.map((id) => Y.videos[id]);

test('検索語：地域 × ジャンルで作る', () => {
  const q = A.buildQueries(CAMP, 4);
  assert.deepEqual(q.slice(0, 2), ['高松市 スイーツ', '高松市 カフェ']);
  assert.equal(q.length, 4);
});

test('YouTube：地域・ジャンル・登録者数・再生数を根拠付きで取り込む', () => {
  const c = A.fromYouTube(Y.channels.items[0], vids(['v1', 'v2', 'v3']), CAMP, ctx);
  assert.equal(c.platform, 'youtube');
  assert.equal(c.profileUrl, 'https://www.youtube.com/@test_tkm_sweets');
  assert.deepEqual(c.followers, { value: 12300, status: 'confirmed', source: 'YouTube Data API（登録者数は1,000人超で上3桁に丸めた値）', checkedAt: '2026-10-05', checkedBy: '自動取得' });
  assert.ok(c.areas.includes('高松'));
  assert.ok(c.areas.includes('瓦町'));
  assert.ok(c.genres.includes('スイーツ') && c.genres.includes('カフェ'));
  assert.ok(c.auto.regionEvidence.some((e) => e.includes('高松')));
  assert.deepEqual(c.recentViews.value, [8000, 6000, 7000]);
  assert.deepEqual(c.recentReactions.value, [320, 260, 295]);
  assert.equal(c.postFrequency.value, '週1.0回程度');
  assert.deepEqual(c.auto.linked.map((l) => l.platform + ':' + l.handle), ['tiktok:test_tkm_tt', 'instagram:test_tkm_sweets']);
});

test('登録者数が非公開なら未確認（推測しない）', () => {
  const ch = JSON.parse(JSON.stringify(Y.channels.items[0]));
  ch.statistics = { hiddenSubscriberCount: true };
  assert.equal(A.fromYouTube(ch, [], CAMP, ctx).followers.status, 'unknown');
});

test('Instagram：Business Discovery の値を取り込み、投稿形式を判定', () => {
  const c = A.fromInstagram(Y.igBusinessDiscovery.test_tkm_sweets.business_discovery, CAMP, ctx);
  assert.equal(c.followers.value, 8800);
  assert.deepEqual(c.recentReactions.value, [412, 359, 391]);
  assert.deepEqual(c.formats, ['リール', 'フィード']);
  assert.ok(c.areas.includes('高松'));
});

test('3条件（地域・フォロワー数・ジャンル）で自動選定し、上位を優先候補にする', () => {
  const s = I.defaultSettings();
  const mk = (c) => { const ev = I.evaluate(CAMP, c, null, s); return { cand: c, ev, j: A.judge(CAMP, c, ev, s) }; };
  const tk = mk(A.fromYouTube(Y.channels.items[0], vids(['v1', 'v2', 'v3']), CAMP, ctx));
  const os = mk(A.fromYouTube(Y.channels.items[1], vids(['v9', 'v10', 'v11']), CAMP, ctx));
  const ig = mk(A.fromInstagram(Y.igBusinessDiscovery.test_tkm_sweets.business_discovery, CAMP, ctx));
  assert.equal(tk.j.pass, true, tk.j.reasons.join('\n'));
  assert.equal(os.j.pass, false); // 大阪：地域・ジャンルが合わず、フォロワー数も上限超
  assert.equal(os.j.follower, false);
  assert.ok(os.j.reasons.some((r) => r.includes('上限')));
  const plan = A.autoSelect([tk, os, ig], CAMP, s, { priorityCount: 1 });
  const byName = Object.fromEntries(plan.map((p) => [p.row.cand.platform + ':' + p.row.cand.handle, p.to]));
  assert.equal(byName['youtube:test_osaka_men'], '未確認');
  assert.equal(Object.values(byName).filter((v) => v === '優先候補').length, 1);
  assert.ok(['候補', '優先候補'].includes(byName['youtube:test_tkm_sweets']));
});

test('フォロワー数の条件：未確認は条件を満たさない（0扱いにしない）', () => {
  const r = A.followerOk(CAMP, { followers: I.fact() });
  assert.equal(r.ok, false);
  assert.equal(r.unknown, true);
  assert.equal(A.followerOk({}, { followers: I.fact() }).ok, true);
});
