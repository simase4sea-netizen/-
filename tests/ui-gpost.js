// Google投稿作成の画面通し確認。node tests/ui-gpost.js
// 既存データの読み込み → 店舗情報・メニュー・ブランドの登録 → 生成（1案／3案／一括） → 食い違い → 編集・複製・承認・コピー4種類 → 仕様値の変更 → AI送信の確認画面
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const APP = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');
const SHOTS = process.env.SHOTS || '';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 } });
  const p = await ctx.newPage();
  const errs = [];
  const external = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  p.on('request', (r) => { if (!/^(file|data|blob):/.test(r.url())) external.push(r.url()); });
  const st = () => p.evaluate(() => FS.store.get());
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };
  const okModal = async () => { const c = await p.$('.modal #mdl-check'); if (c) await c.check(); await p.click('.modal [data-act=ok]'); };

  // 1. Google投稿の項目が無い既存データを読み込んでも壊れない
  await p.goto(APP);
  await p.evaluate(() => {
    const old = FS.store.defaultState();
    delete old.gpost;
    old.stores.push({ id: 'store_old1', name: '既存のお客様店', kind: 'client', aliases: ['既存店'], memo: '既存メモ', reportTemplate: '', createdAt: 1 });
    old.reports.push({ id: 'rep_old1', type: 'report', storeId: 'store_old1', status: 'approved', metrics: {}, history: [], createdAt: 1, updatedAt: 1 });
    localStorage.setItem(FS.store.KEY, JSON.stringify(old));
  });
  await p.reload();
  let s = await st();
  assert.ok(s.gpost && Array.isArray(s.gpost.posts) && s.gpost.spec.postBody.maxChars === 1500);
  assert.equal(s.stores.find((x) => x.id === 'store_old1').memo, '既存メモ');
  assert.equal(s.reports[0].id, 'rep_old1');
  await p.goto(APP + '#/gpost/store/store_old1');
  assert.match(await p.textContent('#gpTarget'), /既存のお客様店/);
  await p.evaluate(() => FS.sample.load());
  s = await st();
  const id = (name) => s.stores.find((x) => x.name === name).id;
  const S1 = id('【サンプル】バル・ソレイユ 新浦安店');
  const S2 = id('【サンプル】バル・ソレイユ 海浜幕張店');

  // 2. ブランド共通の情報・店舗情報・メニューを登録・編集
  await p.goto(APP + '#/gpost/stores');
  await p.click('#addBrand');
  await p.fill('#gb-name', 'テストブランド');
  await p.fill('#gb-industry', 'カフェ');
  await p.fill('#gb-tone', '落ち着いた文体');
  await p.click('#gbSave');
  await p.waitForSelector('#brandList');
  assert.match(await p.textContent('#brandList'), /テストブランド/);
  await p.goto(APP + '#/gpost/store/' + S1);
  assert.match(await p.textContent('#gpTarget'), /新浦安店/);
  await p.fill('#gs-parking', '提携駐車場あり');
  await p.click('#gsSave');
  await p.click('#menuAdd');
  await p.fill('.modal #mn', 'チュロス');
  await p.fill('.modal #mp', '480円');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('#menuList');
  assert.match(await p.textContent('#menuList'), /チュロス/);
  s = await st();
  assert.equal(s.stores.find((x) => x.id === S1).gpost.parking, '提携駐車場あり');
  // ブランドを別区分の店舗と共有できない
  await p.goto(APP + '#/gpost/store/' + s.stores.find((x) => x.kind === 'own').id);
  await p.selectOption('#gBrand', { label: '【サンプル】バル・ソレイユ' });
  await p.click('#gsSave');
  await p.waitForSelector('.toast.error');
  assert.match(await p.textContent('#toast'), /自社店舗と顧客案件で同じブランドは使えません/);
  // CSVでメニューを取り込む
  await p.goto(APP + '#/gpost/stores');
  await p.setInputFiles('[data-imp=menu]', { name: 'menu.csv', mimeType: 'text/csv', buffer: Buffer.from('店舗ID,店舗名,メニューID,名前,説明,価格,販売期間\r\n' + S2 + ',【サンプル】バル・ソレイユ 海浜幕張店,,ガスパチョ,冷製スープ,600円,通年\r\n') });
  await p.waitForSelector('.modal #mdl-check');
  assert.match(await p.textContent('.modal'), /新規 1件・更新 0件/);
  await okModal();
  await p.waitForTimeout(200);
  s = await st();
  assert.ok(s.stores.find((x) => x.id === S2).gpost.menu.some((m) => m.name === 'ガスパチョ'));

  // 3. 生成（デモ）：食い違いを選ぶまで生成できない
  await p.goto(APP + '#/gpost');
  assert.match(await p.textContent('#demoNotice'), /デモ生成（テンプレート）/);
  await p.check('[data-store=' + S1 + ']');
  assert.match(await p.textContent('#gpTarget'), /新浦安店/);
  await p.fill('[data-c=theme]', '秋のおすすめ');
  await p.fill('[data-c=mainItem]', '魚介のパエリア');
  await p.fill('[data-c=price]', '1,500円');
  await p.selectOption('[data-c=cta]', 'BOOK');
  await p.fill('[data-c=postDate]', '2026-10-10');
  await p.click('#gGen');
  await p.waitForSelector('.modal #mdl-check');
  const preText = await p.textContent('.modal');
  assert.match(preText, /投稿入力と登録情報が違います/);
  assert.match(preText, /1,980円/);
  await p.check('.modal #mdl-check');
  assert.equal(await p.$eval('.modal [data-act=ok]', (e) => e.disabled), true, '食い違いを選ぶまで生成できない');
  await p.check('.modal input[value=store]');
  assert.equal(await p.$eval('.modal [data-act=ok]', (e) => e.disabled), false);
  await shot('gpost01_preflight');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('#gResults .gp-card');
  assert.equal(await p.$$eval('#gResults .gp-card', (e) => e.length), 1);
  let card = await p.textContent('#gResults .gp-card');
  assert.match(card, /画像用キャッチコピー：[\s\S]*日本語投稿文：[\s\S]*ーーーーーー[\s\S]*English:/);
  assert.match(card, /担当者向け確認/);
  s = await st();
  let post = s.gpost.posts[s.gpost.posts.length - 1];
  assert.equal(post.ctx.post.price, '1,980円', '選んだ登録情報の価格を使う');
  assert.match(post.bodyJa, /1,980円/);
  assert.ok(!post.bodyJa.includes('1,500円'));
  assert.match(post.bodyJa.split('\n')[0], new RegExp('＼' + post.catchcopy + '／'));
  assert.match(post.bodyJa, /秋の日/, '投稿予定日（10月）に合う季節表現');
  assert.equal(post.checks.errorCount, 0);
  await shot('gpost02_result');

  // 4. 3案・季節表現なし
  await p.fill('[data-c=price]', '');
  await p.check('[data-c=setCount][value="3"]');
  await p.uncheck('[data-c=useSeason]');
  await p.click('#gGen');
  await okModal();
  await p.waitForFunction(() => document.querySelectorAll('#gResults .gp-card').length === 3);
  s = await st();
  const three = s.gpost.posts.slice(-3);
  assert.equal(new Set(three.map((x) => x.catchcopy)).size, 3);
  three.forEach((x) => assert.ok(!/秋の日|この秋|紅葉/.test(x.bodyJa), '季節表現を使わない設定'));

  // 5. 複数店舗に一括生成（店舗ごとの情報が混ざらない）
  await p.check('[data-c=setCount][value="1"]');
  await p.check('[data-store=' + S2 + ']');
  assert.match(await p.textContent('#gpTarget'), /2店舗に一括生成/);
  await p.fill('[data-c=mainItem]', '');
  await p.fill('[data-ps="' + S1 + '|mainItem"]', '魚介のパエリア');
  await p.fill('[data-ps="' + S2 + '|mainItem"]', 'イベリコ豚の鉄板焼き');
  await p.click('#gGen');
  await p.waitForSelector('.modal #mdl-check');
  assert.equal(await p.$$eval('.modal [data-pre]', (e) => e.length), 2);
  await okModal();
  await p.waitForSelector('[data-result-store="' + S2 + '"] .gp-card');
  const r1 = await p.textContent('[data-result-store="' + S1 + '"]');
  const r2 = await p.textContent('[data-result-store="' + S2 + '"]');
  ['テスト2-2', '17:00〜23:00', 'イベリコ豚', '2,480円', '海浜幕張店'].forEach((w) => assert.ok(!r1.includes(w), '新浦安店の結果に「' + w + '」'));
  ['テスト町1-1', '11:00〜22:00', '魚介のパエリア', '1,980円', '新浦安店'].forEach((w) => assert.ok(!r2.includes(w), '海浜幕張店の結果に「' + w + '」'));
  assert.match(r1, /11:00〜22:00/);
  assert.match(r2, /17:00〜23:00/);
  assert.ok(!/別店舗/.test(r1 + r2), '他店舗混入のエラーが出ない');
  await shot('gpost03_batch');
  // 自社店舗と顧客案件は同時に選べない
  const ownId = s.stores.find((x) => x.kind === 'own').id;
  await p.click('[data-store=' + ownId + ']');
  await p.waitForSelector('.toast.error');
  assert.equal(await p.isChecked('[data-store=' + ownId + ']'), false);

  // 6. 詳細：編集・保存（再チェック）・複製・承認・コピー4種類
  s = await st();
  post = s.gpost.posts.find((x) => x.storeId === S1 && x.theme === '秋のおすすめ' && x.setNo === 1);
  await p.goto(APP + '#/gpost/p/' + post.id);
  assert.match(await p.textContent('#gpTarget'), /新浦安店/);
  assert.equal(await p.$eval('[data-copy=all]', (e) => e.disabled), true, '承認前はコピーできない');
  await p.fill('.gp-ja', (await p.inputValue('.gp-ja')) + '\n\n駅から徒歩2分です。');
  await p.click('[data-act=save]');
  await p.waitForSelector('.gp-review');
  assert.match(await p.textContent('.gp-review'), /「2分」は登録情報・投稿入力にない数値/);
  s = await st();
  const saved = s.gpost.posts.find((x) => x.id === post.id);
  assert.match(saved.bodyJa, /徒歩2分/);
  assert.ok(saved.history.some((h) => /編集・保存/.test(h.action)));
  await p.click('[data-act=dup]');
  await p.waitForFunction((pid) => !location.hash.endsWith(pid), post.id);
  s = await st();
  const dup = s.gpost.posts[s.gpost.posts.length - 1];
  assert.equal(dup.duplicatedFrom, post.id);
  assert.equal(dup.status, 'draft');
  assert.equal(dup.bodyJa, saved.bodyJa);
  // 元の案に戻って承認（エラーが残っていると確認が出る）
  await p.goto(APP + '#/gpost/p/' + post.id);
  await p.click('[data-wf=review]');
  await p.click('[data-wf=approve]');
  await p.waitForSelector('.modal');
  assert.match(await p.textContent('.modal h2'), /エラーが残っています/);
  await p.click('.modal [data-act=cancel]');
  s = await st();
  assert.equal(s.gpost.posts.find((x) => x.id === post.id).status, 'review');
  await p.fill('.gp-ja', (await p.inputValue('.gp-ja')).replace('\n\n駅から徒歩2分です。', ''));
  await p.click('[data-act=save]');
  await p.click('[data-wf=approve]');
  await p.waitForSelector('.modal #mdl-check');
  assert.match(await p.textContent('.modal h2'), /承認の確認/);
  await okModal();
  await p.waitForSelector('[data-wf=done]');
  assert.equal(await p.$eval('.gp-ja', (e) => e.readOnly), true);
  await p.evaluate(() => { window.__copied = []; navigator.clipboard.writeText = (t) => { window.__copied.push(t); return Promise.resolve(); }; });
  for (const k of ['copy', 'ja', 'en', 'all']) {
    await p.click('[data-copy=' + k + ']');
    await p.waitForSelector('.modal #mdl-check');
    await okModal();
    await p.waitForFunction((n) => window.__copied.length === n, ['copy', 'ja', 'en', 'all'].indexOf(k) + 1);
  }
  const copied = await p.evaluate(() => window.__copied);
  s = await st();
  post = s.gpost.posts.find((x) => x.id === post.id);
  assert.equal(copied[0], post.catchcopy);
  assert.equal(copied[1], post.bodyJa);
  assert.equal(copied[2], post.bodyEn);
  assert.match(copied[3], /^【【サンプル】バル・ソレイユ 新浦安店】\n\n案1\n\n画像用キャッチコピー：/);
  copied.forEach((c) => assert.ok(!/担当者向け確認|自動チェック/.test(c), 'コピーに確認欄を含めない'));
  await shot('gpost04_approved');

  // 7. 一覧で検索
  await p.goto(APP + '#/gpost/list');
  await p.selectOption('[data-f=status]', 'approved');
  await p.waitForFunction(() => document.querySelectorAll('#gpList tbody tr').length === 1);
  await p.selectOption('[data-f=status]', '');
  await p.selectOption('[data-f=storeId]', S2);
  await p.waitForFunction(() => document.querySelectorAll('#gpList tbody tr').length === 1);
  await p.click('#gpClear');

  // 8. 仕様値を変えるとチェックに反映される
  await p.goto(APP + '#/gpost/spec');
  await p.fill('#spMax', '100');
  await p.click('#spSave');
  await p.waitForSelector('.toast.ok');
  await p.goto(APP + '#/gpost/p/' + dup.id);
  assert.match(await p.textContent('.gp-review'), /Google仕様の上限 100 文字を超えています/);
  await p.goto(APP + '#/gpost/spec');
  await p.click('#spReset');
  await p.click('.modal [data-act=ok]');
  await p.waitForTimeout(100);
  s = await st();
  assert.equal(s.gpost.spec.postBody.maxChars, 1500);
  assert.equal(s.gpost.specHistory.length, 2);

  // ここまで外部への通信は一切ない
  assert.deepEqual(external, []);

  // 9. AI生成：確認画面を通るまで送信しない（送信関数を記録用に置き換えて確認）
  await p.evaluate(() => { const st = FS.store.get(); st.settings.ai = { enabled: true, apiKey: 'sk-ant-test-dummy' }; FS.store.save(true); });
  await p.goto(APP + '#/gpost');
  await p.evaluate(() => {
    window.__aiCalls = [];
    FS.ai.generateGooglePosts = async (ctx, images) => {
      window.__aiCalls.push({ store: ctx.store.name, facts: JSON.stringify(ctx) });
      return [{ catchcopy: ctx.store.area + 'で楽しむ一皿', bodyJa: '＼' + ctx.store.area + 'で楽しむ一皿／\n\n' + ctx.store.name + 'の一皿。', bodyEn: ctx.store.name + '.', angle: 'テスト', seasonExpressions: [], usedFacts: [], reviewerNotes: [] }];
    };
  });
  assert.equal(await p.$eval('#gMode', (e) => e.value), 'ai');
  assert.equal(await p.$('#demoNotice'), null);
  // 前の入力（2店舗選択）が残っている
  await p.click('#gGen');
  await p.waitForSelector('.modal #mdl-check');
  assert.match(await p.textContent('.modal'), /外部送信あり/);
  assert.equal((await p.evaluate(() => window.__aiCalls)).length, 0, '確認画面の時点では送信しない');
  await p.click('.modal [data-act=cancel]');
  await p.waitForTimeout(100);
  assert.equal((await p.evaluate(() => window.__aiCalls)).length, 0, 'キャンセルしたら送信しない');
  await p.click('#gGen');
  await okModal();
  await p.waitForFunction(() => window.__aiCalls.length === 2);
  const calls = await p.evaluate(() => window.__aiCalls);
  assert.ok(!calls[0].facts.includes('海浜幕張店') && !calls[0].facts.includes('テスト2-2'), '1店舗目に2店舗目の情報を送らない');
  assert.ok(!calls[1].facts.includes('新浦安店') && !calls[1].facts.includes('テスト町1-1'), '2店舗目に1店舗目の情報を送らない');
  await p.waitForSelector('#gResults .badge.client');
  s = await st();
  assert.equal(s.gpost.posts[s.gpost.posts.length - 1].provider, 'ai');

  // 10. バックアップに含まれ、APIキーは含まれない
  const backup = JSON.parse(await p.evaluate(() => FS.store.exportJson()));
  assert.ok(backup.gpost.posts.length >= 7 && backup.gpost.brands.length >= 2);
  assert.equal(backup.settings.ai.apiKey, '');
  // 操作履歴
  await p.goto(APP + '#/log');
  assert.match(await p.textContent('main'), /Google投稿案を生成しました/);
  // 使い方・仕様
  await p.goto(APP + '#/guide');
  assert.match(await p.textContent('main'), /Google投稿作成/);

  assert.deepEqual(errs, []);
  await b.close();
  console.log('ui-gpost: OK');
})().catch((e) => { console.error(e); process.exit(1); });
