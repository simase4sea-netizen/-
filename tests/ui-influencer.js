// インフルエンサー候補選定の画面通し確認（任意）。node tests/ui-influencer.js
const path = require('path');
const fs = require('fs');
let chromium;
try { ({ chromium } = require('playwright')); } catch (e) { ({ chromium } = require('/opt/node22/lib/node_modules/playwright')); }
const URL = 'file://' + path.resolve(__dirname, '../app/index.html');
const assert = require('node:assert/strict');
const SHOTS = process.env.SHOTS || '';

(async () => {
  const b = await chromium.launch();
  const ctx = await b.newContext({ viewport: { width: 1400, height: 1000 }, acceptDownloads: true });
  const p = await ctx.newPage();
  const errs = [];
  const external = [];
  p.on('pageerror', (e) => errs.push(e.message));
  p.on('console', (m) => { if (m.type() === 'error') errs.push(m.text()); });
  // 外部への通信が一切ないこと（DM・メール・SNS APIへの自動送信なし）
  p.on('request', (r) => { if (!r.url().startsWith('file://') && !r.url().startsWith('blob:') && !r.url().startsWith('data:')) external.push(r.url()); });
  const shot = async (n) => { if (SHOTS) await p.screenshot({ path: path.join(SHOTS, n + '.png'), fullPage: true }); };

  await p.goto(URL + '#/inf');
  await p.click('#sample');
  await p.click('tr[data-id]');
  await p.waitForSelector('[data-status]');
  await shot('inf01_cands');
  // 評価順：高松グルメ子が先頭、データの少ない候補は判定材料不足
  const firstName = await p.textContent('tbody tr:first-child [data-open]');
  assert.match(firstName, /高松グルメ子/);
  assert.match(await p.textContent('tbody'), /判定材料不足/);
  assert.match(await p.textContent('tbody'), /費用未確認/);
  // 地域で絞り込み
  await p.check('#fr');
  await p.waitForTimeout(150);
  assert.equal(await p.$$eval('[data-status]', (els) => els.length), 1);
  await p.uncheck('#fr');
  await p.waitForTimeout(150);
  // キーワード絞り込み
  await p.fill('#fq', 'うどん');
  await p.dispatchEvent('#fq', 'change');
  await p.waitForTimeout(150);
  assert.equal(await p.$$eval('[data-status]', (els) => els.length), 1);
  await p.fill('#fq', '');
  await p.dispatchEvent('#fq', 'change');
  await p.waitForTimeout(150);

  // 起用状況を更新
  await p.selectOption('tbody tr:first-child [data-status]', '優先候補');
  await p.waitForTimeout(150);
  // 比較
  const boxes = await p.$$('[data-sel]');
  await boxes[0].check(); await boxes[1].check();
  await p.click('#toCompare');
  await p.waitForTimeout(200);
  await shot('inf02_compare');
  assert.match(await p.textContent('#pane'), /地域との適合性/);
  assert.match(await p.textContent('#pane'), /未確認/);

  // 候補詳細：担当者評価・連絡文
  await p.click('.tabs button[data-tab=cands]');
  await p.waitForSelector('[data-open]');
  await p.click('tbody tr:first-child [data-open]');
  await p.waitForSelector('#saveManual');
  await shot('inf03_link');
  assert.match(await p.textContent('main'), /候補にした理由/);
  assert.match(await p.textContent('main'), /懸念点/);
  // 優先候補には自動選定で連絡文の下書きが作られている（無ければ作る）
  if (await p.$('#mkDraft')) { await p.click('#mkDraft'); }
  await p.waitForSelector('#ctext');
  assert.match(await p.inputValue('#ctext'), /【テスト】高松グルメ子 様/);
  // 承認前は「送信用にコピー」が無い
  assert.equal(await p.$('[data-wf=copy]'), null);
  // 承認せずに連絡済みにしようとすると確認画面
  await p.selectOption('#status', '連絡済み');
  await p.click('#setStatus');
  assert.match(await p.textContent('.modal'), /まだ承認されていません/);
  await p.click('.modal [data-act=cancel]');
  // 確認待ち → 承認 → 完了で連絡済みに
  await p.click('[data-wf=review]');
  await p.click('[data-wf=approve]');
  assert.equal(await p.$eval('.modal [data-act=ok]', (e) => e.disabled), true);
  await p.check('#mdl-check');
  await p.click('.modal [data-act=ok]');
  await p.waitForSelector('[data-wf=copy]');
  await p.click('[data-wf=done]');
  await p.check('#mdl-check');
  await p.click('.modal [data-act=ok]');
  await p.waitForTimeout(300);
  assert.equal(await p.inputValue('#status'), '連絡済み');

  // 担当者評価（理由必須）
  await p.fill('[data-ms=quality]', '90');
  await p.fill('[data-mr=quality]', '動画の構成が分かりやすい');
  await p.click('#saveManual');
  await p.waitForTimeout(200);
  assert.match(await p.textContent('main'), /担当者評価：動画の構成が分かりやすい/);

  // 重みの変更
  await p.goto(URL + '#/inf/settings');
  await p.fill('[data-w=region]', '50');
  await p.click('#save');
  await p.waitForTimeout(200);
  const w = await p.evaluate(() => FS.store.get().inf.settings.weights.region);
  assert.equal(w, 50);

  // 候補者DB：CSV取込（重複はスキップ）、取得元・確認日の追跡
  await p.goto(URL + '#/inf/cands');
  await p.setInputFiles('#csvIn', path.resolve(__dirname, '../samples/sample_influencers.csv'));
  await p.waitForSelector('.modal');
  assert.match(await p.textContent('.modal'), /登録済みと重複/);
  await p.click('.modal [data-act=ok]');
  await p.waitForTimeout(200);
  assert.equal(await p.evaluate(() => FS.store.get().inf.candidates.length), 3);
  // 同じURLを手動登録すると保存できない
  await p.goto(URL + '#/inf/cand/new');
  await p.fill('#url', 'https://instagram.com/test_takamatsu_gourmet?igsh=abc');
  await p.dispatchEvent('#url', 'change');
  assert.match(await p.textContent('#dupBox'), /既に登録されています/);
  await p.click('#save');
  assert.match(await p.textContent('.modal'), /同じアカウントが既に登録/);
  await p.click('.modal [data-act=ok]');
  // 確認済みには取得元・確認日が必要
  await p.fill('#url', 'https://www.instagram.com/test_new_account/');
  await p.dispatchEvent('#url', 'change');
  assert.equal(await p.inputValue('#hd'), 'test_new_account');
  await p.fill('[data-fact=followers][data-ff=value]', '5000');
  await p.selectOption('[data-fact=followers][data-ff=status]', 'confirmed');
  await p.click('#save');
  assert.match(await p.textContent('.modal'), /取得元と確認日が必要/);
  await p.click('.modal [data-act=ok]');
  await p.fill('[data-fact=followers][data-ff=source]', 'プロフィール画面');
  await p.fill('[data-fact=followers][data-ff=checkedAt]', '2026-10-05');
  await p.click('#save');
  await p.waitForTimeout(300);
  await shot('inf04_cand');
  assert.match(await p.textContent('.history'), /フォロワー数：未確認 → 5,000［確認済み・プロフィール画面・2026-10-05］/);

  // 提案リスト：CSV出力
  await p.goto(URL + '#/inf');
  await p.click('tr[data-id]');
  await p.click('.tabs button[data-tab=output]');
  await p.waitForSelector('#csv');
  await shot('inf05_output');
  assert.match(await p.textContent('#prev'), /下書き・社内検討用/);
  const [dl] = await Promise.all([p.waitForEvent('download'), p.click('#csv')]);
  const csv = fs.readFileSync(await dl.path(), 'utf8');
  assert.match(csv, /test_takamatsu_gourmet/);
  assert.match(csv, /起用前に確認すること/);

  for (const r of ['#/log', '#/home', '#/inf/cands']) { await p.goto(URL + r); await p.waitForTimeout(100); }
  assert.deepEqual(errs, []);
  assert.deepEqual(external, []);
  await b.close();
  console.log('ui-influencer: OK');
})().catch((e) => { console.error(e); process.exit(1); });
