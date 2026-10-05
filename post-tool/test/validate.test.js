import { test, describe, before } from 'node:test';
import assert from 'node:assert/strict';
import { openDb, storeWithParents } from '../src/db.js';
import { buildContext } from '../src/context.js';
import { validateSet, otherStoreMarkers } from '../src/validate.js';
import { loadSpec } from '../src/spec.js';
import { seasonOf } from '../src/season.js';
import { seedSampleData } from './fixtures.js';

const codes = (r) => r.checks.map((c) => c.code);

describe('生成結果の自動チェック', () => {
  let db; let ids; let spec; let ctx; let markers;
  const base = {
    catchcopy: '新浦安で囲む、鉄鍋のパエリア',
    body_ja: '＼新浦安で囲む、鉄鍋のパエリア／\n\nテストモール新浦安 3階のバル・ソレイユ 新浦安店から。\n\n魚介のパエリアは1,980円。鉄鍋で炊き上げます。',
    body_en: 'Bal Soleil Shin-Urayasu serves seafood paella (1,980 yen). Book with the button below.',
  };
  before(() => {
    db = openDb(':memory:');
    ids = seedSampleData(db);
    spec = loadSpec();
    ctx = buildContext(storeWithParents(db, ids.s1.id), { theme: '秋', mainItem: '魚介のパエリア', postDate: '2026-10-10', useSeason: true }, spec);
    markers = otherStoreMarkers(db, ctx);
  });

  test('登録情報どおりの投稿はエラーにならない', () => {
    const r = validateSet(base, ctx, spec, { otherMarkers: markers });
    assert.deepEqual(r.checks.filter((c) => c.level === 'error'), []);
    assert.equal(r.googleSpec.ok, true);
  });

  test('未登録の価格・距離・URLを検出する', () => {
    const r = validateSet({ ...base, body_ja: `${base.body_ja}\n\n駅から徒歩2分。ランチは1,200円。詳しくは https://example.com/other へ。` }, ctx, spec, { otherMarkers: markers });
    const msgs = r.checks.filter((c) => c.code === 'unregistered_number').map((c) => c.message).join();
    assert.match(msgs, /徒歩2分|2分/);
    assert.match(msgs, /1,200円/);
    assert.ok(codes(r).includes('unregistered_url'));
  });

  test('登録済みのアクセス情報（徒歩5分）は許可する', () => {
    const r = validateSet({ ...base, body_ja: `${base.body_ja}\n\nJR新浦安駅から徒歩5分です。` }, ctx, spec, { otherMarkers: markers });
    assert.ok(!codes(r).includes('unregistered_number'));
  });

  test('他店舗の店名・住所・メニュー・URLの混入を検出する', () => {
    const r = validateSet({ ...base, body_ja: `${base.body_ja}\n\nイベリコ豚の鉄板焼きもどうぞ。姉妹店のバル・ソレイユ 海浜幕張店も。` }, ctx, spec, { otherMarkers: markers });
    const leaks = r.checks.filter((c) => c.code === 'other_store_leak').map((c) => c.message).join('\n');
    assert.match(leaks, /イベリコ豚の鉄板焼き/);
    assert.match(leaks, /海浜幕張店/);
  });

  test('投稿予定日と合わない季節表現、季節なし設定での季節語を検出する', () => {
    const summer = validateSet({ ...base, body_ja: `${base.body_ja}\n\n夏休みのお出かけにも。` }, ctx, spec);
    assert.ok(codes(summer).includes('season_mismatch'));
    const autumn = validateSet({ ...base, body_ja: `${base.body_ja}\n\n食欲の秋にぴったり。` }, ctx, spec);
    assert.ok(!codes(autumn).includes('season_mismatch'));
    const noSeason = { ...ctx, season: { use: false } };
    assert.ok(codes(validateSet({ ...base, body_ja: `${base.body_ja}\n\nこの秋おすすめ。` }, noSeason, spec)).includes('season_not_allowed'));
    assert.ok(codes(validateSet({ ...base, body_en: `${base.body_en} Perfect for autumn.` }, noSeason, spec)).includes('season_not_allowed'));
  });

  test('地名に含まれる季節の字（秋葉原など）は季節表現とみなさない', () => {
    const akiba = { ...ctx, season: { use: false }, store: { ...ctx.store, area: '秋葉原', facts: { ...ctx.store.facts } } };
    assert.ok(!codes(validateSet({ ...base, catchcopy: '秋葉原で囲む、鉄鍋のパエリア', body_ja: '＼秋葉原で囲む、鉄鍋のパエリア／\n\n秋葉原の店でパエリアを。' }, akiba, spec)).includes('season_not_allowed'));
  });

  test('Google上限超過・電話番号・抽象的な褒め言葉・避けたい表現・見出し欠落を検出する', () => {
    const over = validateSet({ ...base, body_en: 'a'.repeat(spec.postBody.maxChars + 1) }, ctx, spec);
    assert.ok(codes(over).includes('en_over_limit'));
    const r = validateSet({ catchcopy: '絶品パエリア', body_ja: '激安のパエリア。予約は 047-123-4567 まで。', body_en: 'x' }, ctx, spec);
    for (const c of ['abstract_praise', 'phone_number', 'avoid_phrase', 'no_heading', 'copy_body_mismatch']) assert.ok(codes(r).includes(c), c);
  });

  test('英語版にだけある数値を検出する', () => {
    const r = validateSet({ ...base, body_ja: base.body_ja.replace('1,980円', 'お手頃価格') }, ctx, spec);
    assert.ok(codes(r).includes('en_extra_number'));
  });

  test('文字数はコードポイント単位で数える', () => {
    const r = validateSet({ ...base, body_ja: '＼a／\n\n🍽️' }, ctx, spec);
    assert.equal(r.counts.ja, [...'＼a／\n\n🍽️'].length);
  });

  test('ブランド共通より店舗固有の設定を優先する', () => {
    db.prepare("UPDATE stores SET tone = '落ち着いた大人向け' WHERE id = ?").run(ids.s1.id);
    const c2 = buildContext(storeWithParents(db, ids.s1.id), {}, spec);
    assert.equal(c2.tone, '落ち着いた大人向け');
    assert.equal(c2.toneSource, '店舗固有');
    const c3 = buildContext(storeWithParents(db, ids.s2.id), {}, spec);
    assert.equal(c3.tone, '明るく親しみやすい');
    assert.equal(c3.toneSource, 'ブランド共通');
    const c4 = buildContext(storeWithParents(db, ids.s2.id), { tone: 'カジュアル' }, spec);
    assert.equal(c4.toneSource, '投稿入力');
  });

  test('季節は日本の月区分で判定する', () => {
    assert.deepEqual(['2026-03-01', '2026-06-30', '2026-11-30', '2026-12-01', '2027-02-28'].map(seasonOf), ['spring', 'summer', 'autumn', 'winter', 'winter']);
  });
});
