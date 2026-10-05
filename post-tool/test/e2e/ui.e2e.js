// 画面の通し確認（Playwright）。 npm run test:e2e
// 店舗選択 → 入力 → 生成前確認 → 生成 → コピー（4種）→ 編集保存 → 一覧検索 → スマートフォン幅の表示
import assert from 'node:assert/strict';
import fs from 'node:fs';
import path from 'node:path';
import { chromium } from 'playwright-core';
import { startTestServer } from '../helpers.js';

const shots = process.env.E2E_SCREENSHOTS || '';

const t = await startTestServer();
const browser = await chromium.launch(process.env.CHROMIUM_PATH ? { executablePath: process.env.CHROMIUM_PATH } : {});
try {
  const ctx = await browser.newContext({ viewport: { width: 1280, height: 900 }, permissions: ['clipboard-read', 'clipboard-write'] });
  const page = await ctx.newPage();
  page.on('pageerror', (e) => { throw e; });
  await page.goto(t.base);
  await page.fill('#userName', 'E2E担当');
  await page.dispatchEvent('#userName', 'change');

  // 異なる顧客の店舗は同時に選べない
  await page.check(`#storePicker input[value="${t.ids.s1.id}"]`);
  await page.click(`#storePicker input[value="${t.ids.s3.id}"]`);
  assert.equal(await page.isChecked(`#storePicker input[value="${t.ids.s3.id}"]`), false);

  await page.fill('input[name=theme]', '秋のおすすめ');
  await page.fill('input[name=mainItem]', '魚介のパエリア');
  await page.fill('input[name=price]', '1,500円');
  await page.fill('input[name=postDate]', '2026-10-15');
  await page.selectOption('#ctaSelect', 'BOOK');
  await page.check('input[name=setCount][value="3"]');
  await page.click('#genForm button[type=submit]');

  // 価格の食い違いを確認してから生成
  await page.waitForSelector('.conflict');
  await page.check(`input[name="r-${t.ids.s1.id}-price"][value="store"]`);
  await page.click('#runGen');
  await page.waitForSelector('#genResults .post');
  const cards = await page.$$('#genResults .post');
  assert.equal(cards.length, 3);
  if (shots) await page.screenshot({ path: path.join(shots, 'generate-desktop.png'), fullPage: true });

  const first = cards[0];
  const copy = await first.$eval('.f-copy', (e) => e.value);
  const ja = await first.$eval('.f-ja', (e) => e.value);
  const en = await first.$eval('.f-en', (e) => e.value);
  assert.ok(ja.includes('1,980円') && !ja.includes('1,500円'));
  const clip = () => page.evaluate(() => navigator.clipboard.readText());
  await (await first.$('[data-copy=copy]')).click(); assert.equal(await clip(), copy);
  await (await first.$('[data-copy=ja]')).click(); assert.equal(await clip(), ja);
  await (await first.$('[data-copy=en]')).click(); assert.equal(await clip(), en);
  await (await first.$('[data-copy=set]')).click();
  assert.equal(await clip(), `【バル・ソレイユ 新浦安店】\n\n案1\n\n画像用キャッチコピー：\n${copy}\n\n日本語投稿文：\n${ja}\n\nーーーーーー\n\nEnglish:\n${en}`);
  // 担当者向け確認はコピーに含まれない
  assert.ok(!(await clip()).includes('担当者向け'));

  // 編集して保存
  await (await first.$('.f-copy')).fill('新浦安で囲む、鉄鍋のパエリア');
  await (await first.$('.save')).click();
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('保存しました'));
  // 状態を確認待ちへ
  await (await first.$('.statusSel')).selectOption('review');
  await page.waitForTimeout(300);

  // 一覧で検索
  await page.click('.tabs button[data-tab=posts]');
  await page.selectOption('#statusFilter', 'review');
  await page.click('#postFilter button[type=submit]');
  await page.waitForTimeout(300);
  const listed = await page.$$eval('#postList .post .f-copy', (els) => els.map((e) => e.value));
  assert.deepEqual(listed, ['新浦安で囲む、鉄鍋のパエリア']);

  // 店舗情報の編集
  await page.click('.tabs button[data-tab=master]');
  await page.click(`#tree a[data-e=stores][data-id="${t.ids.s2.id}"]`);
  await page.fill('#entityForm input[name=verified_at]', '2026-10-05');
  await page.click('#entityForm button[type=submit]');
  await page.waitForFunction(() => document.querySelector('#notice').textContent.includes('保存しました'));
  const s2 = (await t.call('GET', `/api/stores/${t.ids.s2.id}`)).data;
  assert.equal(s2.verified_at, '2026-10-05');
  assert.equal(s2.updated_by, 'E2E担当');

  // スマートフォン幅
  const phone = await browser.newContext({ viewport: { width: 390, height: 844 }, isMobile: true });
  const mp = await phone.newPage();
  await mp.goto(t.base);
  await mp.click('.tabs button[data-tab=posts]');
  await mp.waitForSelector('#postList .post');
  const overflow = await mp.evaluate(() => document.documentElement.scrollWidth - window.innerWidth);
  assert.ok(overflow <= 0, `横スクロールが発生しています（${overflow}px）`);
  if (shots) await mp.screenshot({ path: path.join(shots, 'posts-mobile.png'), fullPage: false });
  console.log('E2E: すべての確認に合格しました');
} finally {
  await browser.close();
  await t.close();
}
