// Google投稿作成（core/gpost.js）のテスト。node --test tests/gpost.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const fs = require('node:fs');
const path = require('node:path');
const { GP, state } = require('./fixtures/gpost.js');
const CSV = require('../app/js/core/csv.js');

const TODAY = '2026-10-06';
const codes = (r) => r.checks.map((c) => c.code);
function ctxFor(st, storeId, req) { return GP.buildContext(GP.bundleOf(st, storeId), req || {}, st.gpost.spec, TODAY); }
function demo(st, storeId, req) {
  const ctx = ctxFor(st, storeId, req);
  return { ctx, sets: GP.demoGenerate(ctx), markers: GP.otherStoreMarkers(st, ctx) };
}
let n = 0;
const uid = (p) => p + '_t' + (++n);

describe('店舗情報・ブランド共通情報', () => {
  test('1店舗分の情報だけを取り出し、トーンは「投稿入力 → 店舗 → ブランド」の順で使う', () => {
    const st = state();
    const b = GP.bundleOf(st, 'store_s1');
    assert.equal(b.store.name, 'バル・ソレイユ 新浦安店');
    assert.equal(b.brand.name, 'バル・ソレイユ（架空）');
    assert.equal(b.menu.length, 2);
    assert.equal(ctxFor(st, 'store_s1').toneSource, 'ブランド共通');
    st.stores[1].gpost.tone = '落ち着いた大人向け';
    const c = ctxFor(st, 'store_s1');
    assert.equal(c.tone, '落ち着いた大人向け');
    assert.equal(c.toneSource, '店舗固有');
    assert.equal(ctxFor(st, 'store_s1', { tone: 'カジュアル' }).toneSource, '投稿入力');
    assert.equal(ctxFor(st, 'store_s2').tone, '明るく親しみやすい');
  });

  test('Google投稿用の情報が無い既存店舗でも壊れずに扱える', () => {
    const st = state();
    const b = GP.bundleOf(st, 'store_own_3');
    assert.equal(b.brand, null);
    assert.deepEqual(b.menu, []);
    const c = GP.buildContext(b, { theme: 'テスト' }, st.gpost.spec, TODAY);
    assert.ok(c.confirmations.some((x) => /地域名が未登録/.test(x)));
    assert.ok(c.confirmations.some((x) => /ブランド共通の情報が未設定/.test(x)));
  });

  test('店舗・メニュー・ブランドをCSVで書き出し、編集して取り込める', () => {
    const st = state();
    const sc = GP.storesCsv(st);
    const rows = CSV.parse(CSV.stringify(sc.head, sc.rows));
    const s1Row = rows.findIndex((r) => r[1] === 'バル・ソレイユ 新浦安店');
    rows[s1Row][sc.head.indexOf('駐車場')] = '提携駐車場あり（2時間無料）';
    rows.push(['', '新規テスト店', '顧客案件', 'バル・ソレイユ（架空）', '新宿'].concat(new Array(sc.head.length - 5).fill('')));
    const plan = GP.planStoreImport(st, rows, st.gpost.spec, ['出世魚']);
    assert.deepEqual(plan.errors, []);
    GP.applyStoreImport(st, plan, uid, 1);
    assert.equal(GP.bundleOf(st, 'store_s1').gp.parking, '提携駐車場あり（2時間無料）');
    assert.equal(GP.bundleOf(st, 'store_s1').gp.ctaOptions[0].url, 'https://reserve.example.com/soleil-shinurayasu');
    assert.equal(GP.bundleOf(st, 'store_s1').menu.length, 2, 'メニューは店舗CSVで消えない');
    const added = st.stores.find((s) => s.name === '新規テスト店');
    assert.equal(added.kind, 'client');
    assert.equal(added.gpost.area, '新宿');
    assert.equal(added.gpost.brandId, 'brand_soleil');

    const mc = GP.menuCsv(st);
    const mrows = [mc.head].concat(mc.rows);
    mrows[1][mc.head.indexOf('価格')] = '2,080円';
    mrows.push(['store_s2', 'バル・ソレイユ 海浜幕張店', '', 'ガスパチョ', '冷製スープ', '600円', '通年']);
    const mplan = GP.planMenuImport(st, mrows);
    assert.deepEqual(mplan.errors, []);
    GP.applyMenuImport(st, mplan, uid, 1);
    assert.equal(GP.bundleOf(st, 'store_s1').menu[0].price, '2,080円');
    assert.ok(GP.bundleOf(st, 'store_s2').menu.some((m) => m.name === 'ガスパチョ'));

    const bc = GP.brandsCsv(st);
    const brows = [bc.head].concat(bc.rows, [['', '蕎麦処 テスト庵ブランド', '蕎麦', '', '落ち着いた丁寧な文体', '', '', '', '']]);
    const bplan = GP.planBrandImport(st, brows);
    assert.deepEqual(bplan.errors, []);
    GP.applyBrandImport(st, bplan, uid, 1);
    assert.equal(st.gpost.brands.length, 2);
  });

  test('CSVに1行でもエラーがあれば、何も取り込まない', () => {
    const st = state();
    const before = JSON.stringify(st);
    const sc = GP.storesCsv(st);
    const rows = [sc.head].concat(sc.rows.map((r) => r.slice()));
    rows[2][sc.head.indexOf('区分')] = '自社店舗'; // 区分の変更はCSVでは不可
    rows.push(['', '新しい自社店', '自社店舗', ''].concat(new Array(sc.head.length - 4).fill('')));
    rows.push(['', '別ブランド店', '顧客案件', '未登録ブランド'].concat(new Array(sc.head.length - 4).fill('')));
    const plan = GP.planStoreImport(st, rows, st.gpost.spec, ['出世魚']);
    assert.equal(plan.errors.length, 3);
    assert.match(plan.errors.join('\n'), /区分の変更/);
    assert.match(plan.errors.join('\n'), /自社店舗として新規登録できる/);
    assert.match(plan.errors.join('\n'), /未登録です/);
    assert.equal(JSON.stringify(st), before);
    const m = GP.planMenuImport(st, [['店舗名', '名前'], ['存在しない店', 'X']]);
    assert.equal(m.errors.length, 1);
    const c = GP.parseCtaText('BOOK=https://a.example; FOO=https://b.example', st.gpost.spec);
    assert.equal(c.errors.length, 1);
  });
});

describe('生成（デモ生成）', () => {
  test('キャッチコピー・日本語・英語が1セットで作られ、見出しとキャッチコピーが一致する', () => {
    const st = state();
    const { ctx, sets, markers } = demo(st, 'store_s1', { theme: '看板メニュー', mainItem: '魚介のパエリア', price: '1,980円', cta: 'BOOK', postDate: '2026-10-10', useSeason: true, setCount: 1 });
    assert.equal(sets.length, 1);
    const s = sets[0];
    assert.ok(s.catchcopy && s.bodyJa && s.bodyEn);
    assert.equal(s.bodyJa.split('\n')[0], '＼' + s.catchcopy + '／');
    assert.match(s.bodyJa, /魚介のパエリア/);
    assert.match(s.bodyEn, /1,980円/);
    const v = GP.validateSet(s, ctx, st.gpost.spec, { otherMarkers: markers, siblings: sets });
    assert.deepEqual(v.checks.filter((c) => c.level === 'error'), []);
    assert.ok(!codes(v).includes('copy_body_mismatch'));
    assert.ok(!codes(v).includes('no_heading'));
  });

  test('1案と3案を切り替えられ、3案ではキャッチコピーの切り口が変わる', () => {
    const st = state();
    assert.equal(demo(st, 'store_s1', { theme: 'x', mainItem: '魚介のパエリア', setCount: 1 }).sets.length, 1);
    const three = demo(st, 'store_s1', { theme: 'x', mainItem: '魚介のパエリア', setCount: '3' }).sets;
    assert.equal(three.length, 3);
    assert.equal(new Set(three.map((s) => s.catchcopy)).size, 3);
    assert.equal(new Set(three.map((s) => s.angle)).size, 3);
  });

  test('一括生成：店舗ごとの住所・商品・価格・営業時間が混ざらない', () => {
    const st = state();
    const input = {
      storeIds: ['store_s1', 'store_s2'],
      common: { theme: '秋のおすすめ', postDate: '2026-10-10', useSeason: true, cta: 'BOOK', setCount: 3 },
      perStore: { store_s1: { mainItem: '魚介のパエリア', price: '1,980円' }, store_s2: { mainItem: 'イベリコ豚の鉄板焼き', price: '2,480円' } },
    };
    assert.deepEqual(GP.checkBatch(st, input.storeIds), []);
    const pre = GP.preflight(st, st.gpost.spec, input, TODAY);
    assert.equal(pre.length, 2);
    const own = { store_s1: ['テスト町1-1', '11:00〜22:00', '魚介のパエリア', '1,980円', 'soleil-shinurayasu'], store_s2: ['テスト2-2', '17:00〜23:00', 'イベリコ豚の鉄板焼き', '2,480円', 'soleil-makuhari'] };
    pre.forEach((x) => {
      assert.deepEqual(x.unresolved, []);
      const other = x.storeId === 'store_s1' ? own.store_s2 : own.store_s1;
      // 事実シート・プロンプトに他店舗の情報が入らない
      const prompt = GP.buildUserPrompt(x.ctx);
      other.forEach((w) => assert.ok(!prompt.includes(w), x.storeName + ' のプロンプトに他店舗の「' + w + '」'));
      own[x.storeId].slice(0, 4).forEach((w) => assert.ok(prompt.includes(w)));
      const sets = GP.demoGenerate(x.ctx);
      assert.equal(sets.length, 3);
      const markers = GP.otherStoreMarkers(st, x.ctx);
      sets.forEach((s) => {
        const all = s.catchcopy + s.bodyJa + s.bodyEn;
        other.forEach((w) => assert.ok(!all.includes(w), x.storeName + ' の投稿に他店舗の「' + w + '」'));
        const v = GP.validateSet(s, x.ctx, st.gpost.spec, { otherMarkers: markers, siblings: sets });
        assert.ok(!codes(v).includes('other_store_leak'));
      });
    });
  });

  test('他店舗の店名・住所・メニュー・URLが入ると検出する', () => {
    const st = state();
    const { ctx, sets, markers } = demo(st, 'store_s1', { theme: 'x', mainItem: '魚介のパエリア' });
    const s = Object.assign({}, sets[0], { bodyJa: sets[0].bodyJa + '\n\nイベリコ豚の鉄板焼きもどうぞ。姉妹店のバル・ソレイユ 海浜幕張店（千葉県千葉市美浜区テスト2-2 テストプラザ幕張 1階）も。https://reserve.example.com/soleil-makuhari' });
    const leaks = GP.validateSet(s, ctx, st.gpost.spec, { otherMarkers: markers }).checks.filter((c) => c.code === 'other_store_leak').map((c) => c.message).join('\n');
    ['イベリコ豚の鉄板焼き', '海浜幕張店', 'テスト2-2', 'soleil-makuhari'].forEach((w) => assert.match(leaks, new RegExp(w)));
  });

  test('季節表現は投稿予定日に合い、使わない設定では入らない', () => {
    const st = state();
    const autumn = demo(st, 'store_s1', { theme: 'x', mainItem: '魚介のパエリア', postDate: '2026-10-10', useSeason: true });
    assert.match(autumn.sets[0].bodyJa, /秋の日/);
    assert.ok(!codes(GP.validateSet(autumn.sets[0], autumn.ctx, st.gpost.spec)).includes('season_mismatch'));
    const winter = demo(st, 'store_s1', { theme: 'x', mainItem: '魚介のパエリア', postDate: '2027-01-10', useSeason: true });
    assert.match(winter.sets[0].bodyJa, /冬の日/);
    const off = demo(st, 'store_s1', { theme: 'x', mainItem: '秋のきのこアヒージョ', postDate: '2026-10-10', useSeason: false });
    const all = (off.sets[0].catchcopy + off.sets[0].bodyJa + off.sets[0].bodyEn).split('秋のきのこアヒージョ').join('');
    assert.deepEqual(GP.findSeasonWords(all, 'ja').concat(GP.findSeasonWords(all, 'en')), []);
    assert.deepEqual(codes(GP.validateSet(off.sets[0], off.ctx, st.gpost.spec)).filter((c) => /season/.test(c)), [], 'メニュー名の「秋」は季節表現とみなさない');
    // チェック：合わない季節語・使わない設定での季節語
    const s = autumn.sets[0];
    assert.ok(codes(GP.validateSet(Object.assign({}, s, { bodyJa: s.bodyJa + '\n\n夏休みのお出かけにも。' }), autumn.ctx, st.gpost.spec)).includes('season_mismatch'));
    assert.ok(codes(GP.validateSet(Object.assign({}, s, { bodyEn: s.bodyEn + ' Perfect for autumn.' }), off.ctx, st.gpost.spec)).includes('season_not_allowed'));
    assert.deepEqual(['2026-03-01', '2026-06-30', '2026-11-30', '2026-12-01', '2027-02-28'].map(GP.seasonOf), ['spring', 'summer', 'autumn', 'winter', 'winter']);
    assert.equal(GP.seasonPlan('', true, '').use, false, '投稿予定日が無ければ季節表現を使わない');
  });

  test('未登録の情報は推測で補わず、確認事項に出す', () => {
    const st = state();
    const { ctx, sets } = demo(st, 'store_s3', { theme: '新そば', mainItem: '季節の天ぷら', cta: 'BOOK' });
    const body = sets[0].bodyJa + sets[0].bodyEn;
    assert.ok(!/徒歩|駅|営業時間|Hours/.test(body), 'アクセス・営業時間を創作しない');
    const n = ctx.confirmations.join('\n');
    ['主役メニュー「季節の天ぷら」は店舗のメニューに未登録', '地域名が未登録', 'アクセス・施設内の位置が未登録', '営業時間が未登録', '確認日が未登録', 'CTA「予約」は店舗の「使用できるCTA」に登録されていません', 'リンク先URLが未登録'].forEach((w) => assert.ok(n.includes(w), w));
    const old = ctxFor(st, 'store_s2', { theme: 'x' });
    assert.ok(old.confirmations.some((x) => /90日以上/.test(x)));
  });

  test('投稿入力と登録情報が違う項目は、どちらを使うか選ぶまで未解決のまま', () => {
    const st = state();
    const input = { storeIds: ['store_s1'], common: { theme: 'x', mainItem: '魚介のパエリア', price: '1,500円', cta: 'BOOK', ctaUrl: 'https://other.example.com' }, perStore: {}, resolutions: {} };
    const pre = GP.preflight(st, st.gpost.spec, input, TODAY)[0];
    assert.deepEqual(pre.unresolved.map((c) => c.field).sort(), ['ctaUrl', 'price']);
    input.resolutions = { store_s1: { price: 'store' } };
    assert.deepEqual(GP.preflight(st, st.gpost.spec, input, TODAY)[0].unresolved.map((c) => c.field), ['ctaUrl']);
    input.resolutions = { store_s1: { price: 'store', ctaUrl: 'input' } };
    const ok = GP.preflight(st, st.gpost.spec, input, TODAY)[0];
    assert.deepEqual(ok.unresolved, []);
    assert.equal(ok.ctx.post.price, '1,980円');
    assert.equal(ok.ctx.post.cta.url, 'https://other.example.com');
  });

  test('異なる区分・ブランドの店舗は一括生成できない', () => {
    const st = state();
    assert.match(GP.checkBatch(st, ['store_own_3', 'store_s1']).join(), /自社店舗と顧客案件/);
    assert.match(GP.checkBatch(st, ['store_s1', 'store_s3']).join(), /同じブランド/);
    assert.deepEqual(GP.checkBatch(st, ['store_s3']), []);
  });

  test('AIの出力は3つ揃ったセットだけ採用し、案数に切りそろえる', () => {
    const raw = { sets: [{ catchcopy: 'a', body_ja: 'b', body_en: 'c' }, { catchcopy: 'a', body_ja: '', body_en: 'c' }, { catchcopy: 'x', body_ja: 'y', body_en: 'z' }] };
    assert.equal(GP.normalizeSets(raw, 3).length, 2);
    assert.equal(GP.normalizeSets(raw, 1).length, 1);
    const st = state();
    const ctx = ctxFor(st, 'store_s1', { theme: 'x', useSeason: false, setCount: 3 });
    assert.match(GP.buildUserPrompt(ctx), /季節表現を使わない/);
    assert.match(GP.buildUserPrompt(ctx), /案数: 3/);
    assert.match(GP.buildSystemPrompt(ctx), /上限 1500 文字/);
    assert.deepEqual(GP.OUTPUT_SCHEMA.properties.sets.items.required.slice(0, 3), ['catchcopy', 'body_ja', 'body_en']);
  });
});

describe('表示・コピー・検索', () => {
  test('表示形式とコピー4種類', () => {
    const p = { setNo: 2, catchcopy: 'コピー', bodyJa: '＼コピー／\n\n本文', bodyEn: 'English body' };
    assert.equal(GP.fullSetText('店A', 2, p), '【店A】\n\n案2\n\n画像用キャッチコピー：\nコピー\n\n日本語投稿文：\n＼コピー／\n\n本文\n\nーーーーーー\n\nEnglish:\nEnglish body');
    assert.equal(GP.copyText('copy', '店A', p), 'コピー');
    assert.equal(GP.copyText('ja', '店A', p), p.bodyJa);
    assert.equal(GP.copyText('en', '店A', p), p.bodyEn);
    assert.match(GP.copyText('all', '店A', p), /^【店A】/);
  });

  test('店舗・テーマ・作成日・状態・キーワードで検索できる', () => {
    const st = state();
    const t = (d) => new Date(d + 'T12:00:00Z').getTime();
    const posts = [
      { id: 'a', storeId: 'store_s1', theme: '秋の新メニュー', status: 'draft', createdAt: t('2026-10-01'), setNo: 1, catchcopy: 'パエリア', bodyJa: '', bodyEn: '' },
      { id: 'b', storeId: 'store_s2', theme: 'ランチ', status: 'approved', createdAt: t('2026-10-05'), setNo: 1, catchcopy: 'イベリコ', bodyJa: '', bodyEn: '' },
    ];
    assert.deepEqual(GP.filterPosts(posts, st.stores, { storeId: 'store_s2' }).map((p) => p.id), ['b']);
    assert.deepEqual(GP.filterPosts(posts, st.stores, { theme: '秋' }).map((p) => p.id), ['a']);
    assert.deepEqual(GP.filterPosts(posts, st.stores, { status: 'approved' }).map((p) => p.id), ['b']);
    assert.deepEqual(GP.filterPosts(posts, st.stores, { from: '2026-10-02', to: '2026-10-31' }).map((p) => p.id), ['b']);
    assert.deepEqual(GP.filterPosts(posts, st.stores, { q: '新浦安' }).map((p) => p.id), ['a']);
  });
});

describe('自動チェック', () => {
  const base = {
    catchcopy: '新浦安で囲む、鉄鍋のパエリア',
    bodyJa: '＼新浦安で囲む、鉄鍋のパエリア／\n\nテストモール新浦安 3階のバル・ソレイユ 新浦安店から。\n\n魚介のパエリアは1,980円。鉄鍋で炊き上げます。',
    bodyEn: 'Bal Soleil Shin-Urayasu serves seafood paella (1,980 yen). Book with the button below.',
  };
  const setup = () => { const st = state(); const ctx = ctxFor(st, 'store_s1', { theme: '秋', mainItem: '魚介のパエリア', postDate: '2026-10-10', useSeason: true }); return { st, ctx, markers: GP.otherStoreMarkers(st, ctx) }; };

  test('登録情報どおりの投稿はエラーにならない', () => {
    const { st, ctx, markers } = setup();
    const r = GP.validateSet(base, ctx, st.gpost.spec, { otherMarkers: markers });
    assert.equal(r.errorCount, 0);
    assert.equal(r.googleSpec.ok, true);
    assert.equal(r.googleSpec.needsReverification, true);
  });

  test('未登録の価格・距離・URL、英語版にだけある数値を検出し、登録済みの徒歩5分は許可する', () => {
    const { st, ctx, markers } = setup();
    const r = GP.validateSet(Object.assign({}, base, { bodyJa: base.bodyJa + '\n\n駅から徒歩2分。ランチは1,200円。詳しくは https://example.com/other へ。' }), ctx, st.gpost.spec, { otherMarkers: markers });
    const msgs = r.checks.filter((c) => c.code === 'unregistered_number').map((c) => c.message).join();
    assert.match(msgs, /2分/);
    assert.match(msgs, /1,200円/);
    assert.ok(codes(r).includes('unregistered_url'));
    assert.ok(!codes(GP.validateSet(Object.assign({}, base, { bodyJa: base.bodyJa + '\n\nJR新浦安駅から徒歩5分です。' }), ctx, st.gpost.spec)).includes('unregistered_number'));
    assert.ok(codes(GP.validateSet(Object.assign({}, base, { bodyJa: base.bodyJa.replace('1,980円', 'お手頃価格') }), ctx, st.gpost.spec)).includes('en_extra_number'));
    assert.ok(codes(GP.validateSet(Object.assign({}, base, { bodyEn: base.bodyEn + ' Only 7 min from the station.' }), ctx, st.gpost.spec)).includes('unregistered_number_en'));
  });

  test('電話番号・抽象的な褒め言葉・避けたい表現・見出し欠落・キャッチコピーと本文の不一致を検出する', () => {
    const { st, ctx } = setup();
    const r = GP.validateSet({ catchcopy: '絶品パエリア', bodyJa: '激安のスープ。予約は 047-123-4567 まで。', bodyEn: 'x' }, ctx, st.gpost.spec);
    ['abstract_praise', 'phone_number', 'avoid_phrase', 'no_heading', 'copy_body_mismatch'].forEach((c) => assert.ok(codes(r).includes(c), c));
    const missing = GP.validateSet({ catchcopy: '', bodyJa: '', bodyEn: '' }, ctx, st.gpost.spec);
    ['missing_catchcopy', 'missing_ja', 'missing_en'].forEach((c) => assert.ok(codes(missing).includes(c), c));
  });

  test('上限を超えると警告し、仕様値を変えるとチェックに反映される', () => {
    const { st, ctx } = setup();
    const long = Object.assign({}, base, { bodyEn: 'a'.repeat(1501) });
    assert.ok(codes(GP.validateSet(long, ctx, st.gpost.spec)).includes('en_over_limit'));
    const sp = JSON.parse(JSON.stringify(st.gpost.spec));
    sp.postBody.maxChars = 2000;
    assert.ok(!codes(GP.validateSet(long, ctx, sp)).includes('en_over_limit'));
    sp.postBody.maxChars = 50;
    const r = GP.validateSet(base, ctx, sp);
    assert.ok(codes(r).includes('ja_over_limit'));
    assert.equal(r.counts.maxChars, 50);
    sp.policyChecks.phoneNumberInBody.enabled = false;
    assert.ok(!codes(GP.validateSet(Object.assign({}, base, { bodyJa: base.bodyJa + ' 047-123-4567' }), ctx, sp)).includes('phone_number'));
  });

  test('文字数はコードポイント単位で数える', () => {
    const { st, ctx } = setup();
    assert.equal(GP.validateSet(Object.assign({}, base, { bodyJa: '＼a／\n\n🍽️' }), ctx, st.gpost.spec).counts.ja, Array.from('＼a／\n\n🍽️').length);
    assert.equal(GP.countChars('🍽'), 1);
  });

  test('仕様値の入力チェック', () => {
    const { st } = setup();
    assert.deepEqual(GP.validateSpec(st.gpost.spec), []);
    const bad = JSON.parse(JSON.stringify(st.gpost.spec));
    bad.postBody.maxChars = 0;
    bad.writingGuide.jaRecommendedMin = 2000;
    bad.ctaTypes = [];
    assert.equal(GP.validateSpec(bad).length, 3);
  });
});

describe('外部への投稿処理が存在しない', () => {
  test('Googleビジネスプロフィールへ送信する処理・エンドポイントを持たない', () => {
    const dir = path.resolve(__dirname, '../app');
    const files = [];
    const walk = (d) => fs.readdirSync(d, { withFileTypes: true }).forEach((e) => (e.isDirectory() ? walk(path.join(d, e.name)) : /\.(js|html)$/.test(e.name) && files.push(path.join(d, e.name))));
    walk(dir);
    files.forEach((f) => {
      const src = fs.readFileSync(f, 'utf8');
      // 出典として載せている公式ドキュメントへのリンクは対象外。APIの送信先（googleapis.com）を持たないことを確認する
      assert.ok(!/mybusiness[a-z]*\.googleapis\.com|businessprofile[a-z]*\.googleapis\.com|googleapis\.com\/[^'"\s]*(localPosts|mybusiness)/i.test(src), f + ' にGoogleビジネスプロフィールAPIの呼び出し');
    });
    ['app/js/core/gpost.js', 'app/js/ui/gpost.js', 'app/config/google-spec.default.js'].forEach((f) => {
      const src = fs.readFileSync(path.resolve(__dirname, '..', f), 'utf8');
      assert.ok(!/\bfetch\(|XMLHttpRequest|sendBeacon|WebSocket|\.submit\(/.test(src), f + ' に通信処理');
    });
  });
});
