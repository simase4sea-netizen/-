// URL・過去投稿からの店舗情報の整理の画面通し確認（Instagram公式APIは架空の応答に置き換え）。node tests/ui-gcollect.js
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');
const SHOTS = process.env.SHOTS || '';

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = [];
  const external = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  await p.route('https://graph.facebook.com/**', (route) => {
    const f = new URL(route.request().url()).searchParams.get('fields') || '';
    assert.match(f, /business_discovery\.username\(soleil_test\)/);
    return route.fulfill({ status: 200, contentType: 'application/json', headers: { 'access-control-allow-origin': '*' }, body: JSON.stringify({ business_discovery: {
      username: 'soleil_test', name: 'バル・ソレイユ 新浦安店（テスト）', biography: 'JR新浦安駅から徒歩5分\n営業時間 11:00〜22:00\n定休日：施設の休館日に準ずる', website: 'https://soleil.example.com',
      media: { data: [
        { caption: '＼新浦安で囲む、鉄鍋のパエリア／\n魚介のパエリア 1,980円\n#新浦安ランチ #パエリア', timestamp: '2026-09-20T10:00:00+0000', permalink: 'https://www.instagram.com/p/T1/' },
        { caption: '秋のきのこアヒージョ 880円 はじまりました #新浦安ランチ', timestamp: '2026-09-02T10:00:00+0000', permalink: 'https://www.instagram.com/p/T2/' },
      ] } } }) });
  });
  const st = () => p.evaluate(() => FS.store.get());
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const okModal = async () => { const c = await p.$('.modal #mdl-check'); if (c) await c.check(); await p.click('.modal [data-act=ok]'); };

  await p.goto(APP);
  await p.evaluate(() => { FS.sample.load(); const s = FS.store.get(); s.inf.auto = Object.assign({}, s.inf.auto || {}, { igToken: 'TEST_TOKEN', igUserId: '178000000', graphVersion: 'v26.0' }); FS.store.save(true); });
  let s = await st();
  const S1 = s.stores.find((x) => x.name === '【サンプル】バル・ソレイユ 新浦安店').id;
  const S2 = s.stores.find((x) => x.name === '【サンプル】バル・ソレイユ 海浜幕張店').id;

  // 1. URLをまとめて貼り付け → 店舗ごと・媒体ごとに振り分け、Instagramは公式APIで取得
  await p.goto(APP + '#/gpost/collect');
  await p.fill('#cUrls', ['【【サンプル】バル・ソレイユ 新浦安店】', 'https://tabelog.com/chiba/test/1/', 'https://www.instagram.com/soleil_test/', 'https://maps.app.goo.gl/testmap', '【【サンプル】バル・ソレイユ 海浜幕張店】', 'https://www.hotpepper.jp/strTEST/', '【登録されていない店】', 'https://tabelog.com/x/'].join('\n'));
  await p.click('#cGo');
  await p.waitForSelector('.modal #mdl-check');
  const m1 = await p.textContent('.modal');
  assert.match(m1, /登録されていない店/);
  assert.match(m1, /食べログ[\s\S]*Instagram[\s\S]*Googleマップ[\s\S]*ホットペッパーグルメ/);
  assert.equal(await p.$$eval('.modal [data-cg]', (e) => e.length), 2);
  assert.equal(await p.isChecked('#cIg'), true);
  await shot('gc01_urls');
  await okModal();
  await p.waitForFunction(() => /登録しました/.test((document.querySelector('.modal h2') || {}).textContent || ''));
  assert.match(await p.textContent('.modal'), /過去投稿2件/);
  await p.click('.modal [data-act=ok]');
  s = await st();
  let i1 = s.stores.find((x) => x.id === S1).gpost;
  assert.deepEqual(i1.sources.map((x) => x.media).sort(), ['gmap', 'instagram', 'tabelog']);
  assert.equal(i1.pastPosts.length, 2);
  assert.ok(i1.candidates.some((c) => c.field === 'mapsUrl' && c.value === 'https://maps.app.goo.gl/testmap'));
  assert.ok(i1.candidates.some((c) => c.field === 'hours' && /Instagramプロフィール/.test(c.sourceLabel)));
  assert.deepEqual(s.stores.find((x) => x.id === S2).gpost.sources.map((x) => x.media), ['hotpepper']);
  assert.equal(s.stores.find((x) => x.id === S2).gpost.pastPosts.length, 0, '別店舗に入らない');

  // 2. 食べログの本文を貼り付けて整理（ルール・外部送信なし）
  await p.goto(APP + '#/gpost/info/' + S1);
  assert.match(await p.textContent('#gpTarget'), /新浦安店/);
  const tabelogId = i1.sources.find((x) => x.media === 'tabelog').id;
  await p.click('[data-paste="' + tabelogId + '"]');
  await p.fill('.modal #gcText', '営業時間 11:30〜21:30\n定休日：不定休\n駐車場：なし\n魚介のパエリア 2,200円\nチュロス 480円\n予算 ￥3,000～￥3,999');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('.modal input[name=cm][value=rule]');
  assert.equal(await p.$('.modal input[name=cm][value=ai]'), null, 'AI未設定ならルールのみ');
  await okModal();
  await p.waitForFunction(() => /整理しました/.test((document.querySelector('.modal h2') || {}).textContent || ''));
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('#candList');
  const list = await p.textContent('#candList');
  assert.match(list, /営業時間[\s\S]*食い違い/);
  assert.match(list, /11:30〜21:30/);
  assert.match(list, /過去投稿の情報：現在も同じか確認/);
  assert.ok(!/3,000/.test(list), '予算は価格として扱わない');
  await shot('gc02_candidates');
  s = await st();
  i1 = s.stores.find((x) => x.id === S1).gpost;
  assert.ok(!JSON.stringify(i1).includes('定休日：不定休\n駐車場'), '貼り付けた本文そのものは保存しない');

  // 3. 食い違いのある候補を採用（確認が必要）→ 店舗情報と出典に反映
  const hoursCand = i1.candidates.find((c) => c.field === 'hours' && c.value === '11:30〜21:30');
  await p.click('[data-apply="' + hoursCand.id + '"]');
  await p.waitForSelector('.modal #mdl-check');
  assert.match(await p.textContent('.modal'), /食い違っています/);
  await okModal();
  await p.waitForTimeout(150);
  s = await st();
  i1 = s.stores.find((x) => x.id === S1).gpost;
  assert.equal(i1.hours, '11:30〜21:30');
  assert.equal(i1.fieldSources.hours.sourceLabel, '食べログの本文');
  // 不採用
  const parkCand = i1.candidates.find((c) => c.field === 'parking' && c.status === 'pending');
  await p.click('[data-reject="' + parkCand.id + '"]');
  await p.waitForTimeout(100);
  s = await st();
  assert.equal(s.stores.find((x) => x.id === S1).gpost.candidates.find((c) => c.id === parkCand.id).status, 'rejected');
  // まとめて採用（食い違い・過去投稿・要確認のないものだけ）
  await p.click('#applySafe');
  await p.waitForSelector('.modal #mdl-check');
  const safeText = await p.textContent('.modal');
  assert.match(safeText, /チュロス/);
  assert.ok(!/魚介のパエリア/.test(safeText), '食い違いのある価格はまとめて採用しない');
  await okModal();
  await p.waitForTimeout(150);
  s = await st();
  i1 = s.stores.find((x) => x.id === S1).gpost;
  assert.ok(i1.menu.some((m) => m.name === 'チュロス' && m.price === '480円'));
  assert.equal(i1.menu.find((m) => m.name === '魚介のパエリア').price, '1,980円');
  // 店舗情報の編集画面に出典が出る
  await p.goto(APP + '#/gpost/store/' + S1);
  assert.match(await p.textContent('main'), /出典：食べログの本文/);

  // 4. 過去投稿を貼り付けて追加・整理
  await p.goto(APP + '#/gpost/info/' + S1);
  await p.selectOption('#ppPf', 'Google投稿');
  await p.fill('#ppDate', '2026-08-01');
  await p.fill('#ppText', '＼夏のテラス席／\nサングリア 600円で乾杯\n---\n＼ランチのご案内／\nランチセット 1,200円');
  await p.click('#ppAdd');
  await p.waitForSelector('.modal input[name=cm]');
  await okModal();
  await p.waitForFunction(() => /整理しました/.test((document.querySelector('.modal h2') || {}).textContent || ''));
  await p.click('.modal [data-act=ok]');
  s = await st();
  i1 = s.stores.find((x) => x.id === S1).gpost;
  assert.equal(i1.pastPosts.length, 4);
  assert.ok(i1.candidates.some((c) => c.field === 'menu' && c.value.name === 'ランチセット' && c.fromPastPost));
  assert.match(await p.textContent('#ppList'), /夏のテラス席/);
  assert.match(await p.textContent('main'), /#新浦安ランチ（2）/);

  // 5. AIで整理：確認画面を通るまで送信しない（送信関数を記録用に置き換え）
  await p.evaluate(() => {
    const st = FS.store.get(); st.settings.ai = { enabled: true, apiKey: 'sk-ant-test-dummy' }; FS.store.save(true);
    window.__calls = [];
    FS.ai.extractStoreInfo = async (name, source) => { window.__calls.push({ name, source }); return FS.gcollect.fromAiResult({ facts: [{ field: 'atmosphere', value: 'テラコッタ調の明るい店内', evidence: 'テラコッタ調の明るい店内' }], menu: [], notes: ['口コミより：家族連れが多い'] }, source.text, false); };
  });
  await p.goto(APP + '#/gpost/info/' + S1);
  await p.click('[data-paste=""]');
  await p.fill('.modal #gcText', 'テラコッタ調の明るい店内');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('.modal input[name=cm][value=ai]');
  assert.equal(await p.isChecked('.modal input[name=cm][value=ai]'), true);
  assert.match(await p.textContent('.modal'), /外部送信あり/);
  assert.equal((await p.evaluate(() => window.__calls)).length, 0, '確認前は送信しない');
  await p.click('.modal [data-act=cancel]');
  await p.waitForTimeout(100);
  assert.equal((await p.evaluate(() => window.__calls)).length, 0, 'キャンセルしたら送信しない');
  await p.click('[data-paste=""]');
  await p.fill('.modal #gcText', 'テラコッタ調の明るい店内');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('.modal input[name=cm][value=ai]');
  await okModal();
  await p.waitForFunction(() => /整理しました/.test((document.querySelector('.modal h2') || {}).textContent || ''));
  assert.match(await p.textContent('.modal'), /口コミより/);
  await p.click('.modal [data-act=ok]');
  const calls = await p.evaluate(() => window.__calls);
  assert.equal(calls.length, 1);
  assert.equal(calls[0].name, '【サンプル】バル・ソレイユ 新浦安店');

  // 6. この店舗の投稿を作成 → 過去投稿を参考にする（件数が確認画面と確認欄に出る）
  await p.evaluate(() => { const st = FS.store.get(); st.settings.ai = { enabled: false, apiKey: '' }; FS.store.save(true); });
  await p.goto(APP + '#/gpost/info/' + S1);
  await p.click('a[href="#/gpost?store=' + S1 + '"]');
  await p.waitForSelector('[data-store="' + S1 + '"]');
  assert.equal(await p.isChecked('[data-store="' + S1 + '"]'), true);
  await p.fill('[data-c=theme]', '定番メニュー');
  await p.fill('[data-c=mainItem]', 'チュロス');
  await p.click('#gGen');
  await p.waitForSelector('.modal #mdl-check');
  assert.match(await p.textContent('.modal'), /参考にする過去投稿：4件/);
  await okModal();
  await p.waitForSelector('#gResults .gp-card');
  assert.match(await p.textContent('#gResults .gp-review'), /参考にした過去投稿4件/);
  s = await st();
  const post = s.gpost.posts[s.gpost.posts.length - 1];
  assert.match(post.bodyJa, /480円/, '採用したメニューの価格を使う');
  assert.ok(!/1,200円|600円/.test(post.bodyJa), '過去投稿の価格は使わない');
  await shot('gc03_generate');

  assert.deepEqual(external.filter((u) => !u.startsWith('https://graph.facebook.com/')), [], 'Instagram公式API以外に通信しない');
  assert.equal(external.length, 1);
  assert.deepEqual(errs, []);
  await b.close();
  console.log('ui-gcollect: OK');
})().catch((e) => { console.error(e); process.exit(1); });
