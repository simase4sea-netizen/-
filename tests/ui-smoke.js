// 画面の通し確認（任意）。Playwright が入っている環境で：node tests/ui-smoke.js
// サンプル投入 → 承認フロー → CSV取り込み → 画像から転記 → 議事録 → 各画面のエラー確認
const path = require('path');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');

(async () => {
  const b = await chromium.launch();
  const p = await (await b.newContext({ viewport: { width: 1400, height: 1000 } })).newPage();
  const errs = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  await p.goto(URL);
  await p.click('#loadSample');
  await p.goto(URL + '#/reports');
  await p.click('tr[data-id]');
  // 承認フロー：チェックを入れるまで承認できない
  await p.click('[data-wf=review]');
  await p.click('[data-wf=approve]');
  assert.equal(await p.$eval('.modal [data-act=ok]', (e) => e.disabled), true);
  await p.check('#mdl-check');
  await p.click('.modal [data-act=ok]');
  assert.match(await p.textContent('#wf'), /承認済み/);
  assert.equal(await p.$eval('#o6', (e) => e.readOnly), true);

  // 新規レポート：CSV取り込み
  await p.goto(URL + '#/reports');
  await p.click('#new');
  await p.click('#picker input');
  await p.fill('#picker input', 'カフェ');
  await p.keyboard.press('Enter');
  await p.setInputFiles('#csvFile', path.resolve(__dirname, '../samples/sample_meta_ads.csv'));
  await p.click('#csvApply');
  await p.check('#mdl-check');
  await p.click('.modal [data-act=ok]');
  assert.equal(await p.inputValue('[data-m=spend][data-f=value]'), '50000');
  assert.match(await p.textContent('#o7'), /リーチ（20,500）は要確認/);

  // 画像を見ながら転記 → 要確認が付く
  await p.click('.tabs button[data-tab=img]');
  const png = Buffer.from('iVBORw0KGgoAAAANSUhEUgAAAAEAAAABCAYAAAAfFcSJAAAADUlEQVR42mNkYPhfDwAChwGA60e6kgAAAABJRU5ErkJggg==', 'base64');
  await p.setInputFiles('#imgFile', { name: 'screen.png', mimeType: 'image/png', buffer: png });
  await p.waitForSelector('[data-open]');
  await p.click('[data-open]');
  await p.fill('.modal [data-im=follows]', '230');
  await p.click('.modal [data-act=ok]');
  await p.waitForTimeout(300);
  assert.equal(await p.inputValue('[data-m=follows][data-f=value]'), '230');
  assert.equal(await p.isChecked('[data-m=follows][data-f=needsCheck]'), true);

  // 店舗変更時は確認画面が出る
  await p.click('#picker input');
  await p.fill('#picker input', '美容室');
  await p.keyboard.press('Enter');
  assert.match(await p.textContent('.modal'), /対象店舗の変更/);
  await p.click('.modal [data-act=cancel]');

  // 議事録
  await p.goto(URL + '#/minutes');
  await p.click('tr[data-id]');
  assert.match(await p.textContent('#outText'), /3\. Four Seasons側のタスク\n・嶋野さんが投稿カレンダー/);

  for (const r of ['#/tasks', '#/stores', '#/log', '#/settings', '#/guide', '#/home']) { await p.goto(URL + r); await p.waitForTimeout(100); }
  assert.deepEqual(errs, []);
  await b.close();
  console.log('ui-smoke: OK');
})().catch((e) => { console.error(e); process.exit(1); });
