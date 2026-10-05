// 自動選定の画面通し確認（YouTube・Instagram の公式APIを架空の応答で置き換えて実行）。node tests/ui-inf-auto.js
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');
const Y = require('./fixtures/youtube.js');
const SHOTS = process.env.SHOTS || '';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = [], calls = [], other = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('request', (r) => { const u = r.url(); if (/^(file|blob|data):/.test(u)) return; if (/googleapis\.com|graph\.facebook\.com/.test(u)) calls.push(r.method() + ' ' + u); else other.push(u); });
  await p.route('https://www.googleapis.com/youtube/v3/**', (route) => {
    const u = new URL(route.request().url());
    const name = u.pathname.split('/').pop();
    let body;
    if (name === 'search') body = Y.search;
    else if (name === 'channels') body = { items: Y.channels.items.filter((c) => u.searchParams.get('id').split(',').includes(c.id)) };
    else if (name === 'playlistItems') body = Y.playlist[u.searchParams.get('playlistId')] || { items: [] };
    else if (name === 'videos') body = { items: u.searchParams.get('id').split(',').map((id) => Y.videos[id]).filter(Boolean) };
    else if (name === 'i18nRegions') body = { items: [] };
    else return route.fulfill({ status: 404, body: '{}' });
    route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  await p.route('https://graph.facebook.com/**', (route) => {
    const f = new URL(route.request().url()).searchParams.get('fields') || '';
    const m = /business_discovery\.username\(([^)]+)\)/.exec(f);
    const body = m && Y.igBusinessDiscovery[m[1]] ? Y.igBusinessDiscovery[m[1]] : { error: { message: '(#110) Cannot find User', code: 110 } };
    route.fulfill({ status: body.error ? 400 : 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  });
  const st = () => p.evaluate(() => FS.store.get().inf);

  await p.goto(APP + '#/inf');
  await p.click('#sample');
  // 設定：APIキー（テスト用の偽の値）
  await p.goto(APP + '#/inf/settings');
  await p.fill('#aYt', 'TEST_FAKE_KEY'); await p.fill('#aIg', 'TEST_FAKE_TOKEN'); await p.fill('#aIgId', '178000000');
  await p.fill('#aP', '1');
  await p.click('#aSave');
  // キャンペーン条件：地域・フォロワー数・ジャンル
  const camp = (await st()).campaigns[0];
  await p.goto(APP + '#/inf/c/' + camp.id + '?tab=cond');
  await p.fill('#fmin', '5000'); await p.fill('#fmax', '100000');
  await p.check('[data-platform=youtube]');
  await p.check('[data-platform=tiktok]');
  await p.click('#save');
  await p.waitForFunction(() => (FS.store.get().inf.runs || []).length > 0, null, { timeout: 15000 });
  await p.waitForTimeout(400);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'auto01_cands.png'), fullPage: true });

  const inf = await st();
  const run = inf.runs[inf.runs.length - 1];
  // 架空の旧サンプル（API上に存在しないアカウント）だけが取得エラーになる
  assert.ok(run.errors.every((e) => /test_takamatsu_gourmet|test_osaka_ramen/.test(e)), run.errors.join('\n'));
  const find = (pf, h) => inf.candidates.find((c) => c.platform === pf && c.handle === h);
  const yt = find('youtube', 'test_tkm_sweets');
  const ig = find('instagram', 'test_tkm_sweets');
  const tt = find('tiktok', 'test_tkm_tt');
  const os = find('youtube', 'test_osaka_men');
  assert.ok(yt && ig && tt && os, '自動で候補が登録されていません');
  assert.equal(yt.followers.value, 12300);
  assert.equal(yt.followers.source.includes('YouTube Data API'), true);
  assert.equal(ig.followers.value, 8800);
  assert.equal(tt.followers.status, 'unknown'); // TikTok は取得しない（推測しない）
  assert.ok(yt.personId && yt.personId === ig.personId && ig.personId === tt.personId); // 同一人物として関連付け
  const status = (c) => (inf.links.find((l) => l.campaignId === camp.id && l.candidateId === c.id) || {}).status;
  assert.equal(status(os), '未確認'); // 大阪：地域・ジャンル・フォロワー数が条件外
  assert.deepEqual([status(yt), status(ig)].sort(), ['候補', '優先候補'].sort());
  assert.ok(run.drafts >= 1);
  assert.match(await p.textContent('#pane'), /自動選定/);
  assert.match(await p.textContent('#pane'), /○ 地域/);

  // 担当者が手動で変えた状況は、再実行しても自動で変えない
  const sel = '[data-status="' + os.id + '"]';
  await p.selectOption(sel, '優先候補');
  await p.waitForTimeout(150);
  await p.click('#runAuto');
  await p.waitForFunction((n) => FS.store.get().inf.runs.length > n, inf.runs.length, { timeout: 15000 });
  const inf2 = await st();
  assert.equal(inf2.links.find((l) => l.campaignId === camp.id && l.candidateId === os.id).status, '優先候補');

  // 公式APIへのGETのみ（DM・投稿などの送信はしない）。キーはバックアップに含めない
  assert.ok(calls.length > 0 && calls.every((c) => c.startsWith('GET ')));
  assert.ok(!calls.some((c) => /\/messages|\/comments|media_publish/.test(c)));
  assert.deepEqual(other, []);
  const backup = await p.evaluate(() => FS.store.exportJson());
  assert.ok(!backup.includes('TEST_FAKE_KEY') && !backup.includes('TEST_FAKE_TOKEN'));
  assert.deepEqual(errs, []);
  await b.close();
  console.log('ui-inf-auto: OK（API呼び出し ' + calls.length + '回）');
})().catch((e) => { console.error(e); process.exit(1); });
