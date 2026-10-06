// URL一括登録の画面通し確認（公式APIは架空の応答に置き換え）。node tests/ui-inf-bulk.js
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
  const errs = [], other = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('request', (r) => { const u = r.url(); if (!/^(file|blob|data):/.test(u) && !/googleapis\.com|graph\.facebook\.com/.test(u)) other.push(u); });
  const json = (route, status, body) => route.fulfill({ status, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify(body) });
  await p.route('https://www.googleapis.com/youtube/v3/**', (route) => {
    const u = new URL(route.request().url());
    const name = u.pathname.split('/').pop();
    if (name === 'channels') {
      const h = u.searchParams.get('forHandle');
      return json(route, 200, { items: Y.channels.items.filter((c) => (h ? c.snippet.customUrl === h : (u.searchParams.get('id') || '').split(',').includes(c.id))) });
    }
    if (name === 'playlistItems') return json(route, 200, Y.playlist[u.searchParams.get('playlistId')] || { items: [] });
    if (name === 'videos') return json(route, 200, { items: u.searchParams.get('id').split(',').map((id) => Y.videos[id]).filter(Boolean) });
    return json(route, 404, {});
  });
  await p.route('https://graph.facebook.com/**', (route) => {
    const m = /business_discovery\.username\(([^)]+)\)/.exec(new URL(route.request().url()).searchParams.get('fields') || '');
    const body = m && Y.igBusinessDiscovery[m[1]];
    return body ? json(route, 200, body) : json(route, 400, { error: { message: '(#110) Cannot find User', code: 110 } });
  });
  const st = () => p.evaluate(() => FS.store.get().inf);

  await p.goto(APP + '#/inf');
  await p.click('#sample');
  await p.goto(APP + '#/inf/settings');
  await p.uncheck('#aEn'); // 自動検索は止めて、URL一括登録だけを確認
  await p.fill('#aYt', 'TEST_FAKE_KEY'); await p.fill('#aIg', 'TEST_FAKE_TOKEN'); await p.fill('#aIgId', '178000000');
  await p.click('#aSave');
  const camp = (await st()).campaigns[0];
  await p.goto(APP + '#/inf/c/' + camp.id + '?tab=cond');
  await p.fill('#fmin', '5000'); await p.fill('#fmax', '100000');
  await p.click('#save');
  await p.waitForSelector('#bulkUrl');
  await p.click('#bulkUrl');
  await p.fill('.modal #bu', [
    'https://www.instagram.com/test_tkm_sweets/?igsh=abc',
    '紹介：@test_unknown_user',
    'https://www.instagram.com/p/POST123/',
    'https://instagram.com/TEST_TKM_SWEETS',
    'https://www.youtube.com/@test_tkm_sweets',
    'https://www.tiktok.com/@test_tkm_tt',
    'https://www.instagram.com/test_takamatsu_gourmet/',
  ].join('\n'));
  await p.fill('.modal #bm', 'テスト：店舗からの紹介');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('.modal #mdl-check');
  const confirmText = await p.textContent('.modal');
  assert.match(confirmText, /新規 4件/);
  assert.match(confirmText, /登録済み 1件/); // テスト用データの高松グルメ子
  assert.match(confirmText, /投稿のURL/);
  assert.match(confirmText, /1件にまとめます/);
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'bulk01_confirm.png') });
  await p.check('.modal #mdl-check');
  await p.click('.modal [data-act=ok]');
  await p.waitForFunction(() => /一括登録の結果/.test((document.querySelector('.modal') || {}).textContent || ''), null, { timeout: 15000 });
  const resultText = await p.textContent('.modal');
  if (SHOTS) await p.screenshot({ path: path.join(SHOTS, 'bulk02_result.png') });
  assert.match(resultText, /新規登録：4件/);
  assert.match(resultText, /Instagram 1件・YouTube 1件/);
  assert.match(resultText, /test_unknown_user/); // 取得できなかったもの
  assert.match(resultText, /TikTok・Xは商用で使える公式APIが無い/);
  await p.click('.modal [data-act=ok]');

  const inf = await st();
  const find = (pf, h) => inf.candidates.find((c) => c.platform === pf && c.handle.toLowerCase() === h);
  const ig = find('instagram', 'test_tkm_sweets');
  assert.equal(ig.followers.value, 8800);
  assert.equal(ig.source.type, 'URL一括登録');
  assert.equal(ig.source.detail, 'テスト：店舗からの紹介');
  assert.equal(find('youtube', 'test_tkm_sweets').followers.value, 12300);
  assert.equal(find('instagram', 'test_unknown_user').followers.status, 'unknown'); // 取得できなければ未確認のまま
  assert.equal(find('tiktok', 'test_tkm_tt').followers.status, 'unknown');
  assert.equal(inf.candidates.filter((c) => c.platform === 'instagram' && c.handle.toLowerCase() === 'test_tkm_sweets').length, 1); // 重複登録しない
  const link = (c) => inf.links.find((l) => l.campaignId === camp.id && l.candidateId === c.id);
  assert.ok(link(ig) && ['候補', '優先候補'].includes(link(ig).status)); // 自動選定
  assert.equal(link(find('instagram', 'test_unknown_user')).status, '未確認');
  // 表示名が無い候補はアカウント名で表示し、「名称未入力」と出さない
  await p.goto(APP + '#/inf/cands');
  const listText = await p.textContent('main');
  assert.ok(!listText.includes('名称未入力'));
  assert.match(listText, /@test_unknown_user/);
  // まとめて再取得（取得できないものは未確認のまま）
  await p.click('#refetch');
  await p.click('.modal [data-act=ok]');
  await p.waitForFunction(() => /取得の結果/.test((document.querySelector('.modal') || {}).textContent || ''), null, { timeout: 15000 });
  assert.match(await p.textContent('.modal'), /test_unknown_user/);
  await p.click('.modal [data-act=ok]');
  assert.deepEqual(other, []);
  assert.deepEqual(errs, []);
  await b.close();
  console.log('ui-inf-bulk: OK');
})().catch((e) => { console.error(e); process.exit(1); });
