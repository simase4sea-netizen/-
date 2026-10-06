// 店舗情報の収集・整理（core/gcollect.js）のテスト。node --test tests/gcollect.test.js
const { test, describe } = require('node:test');
const assert = require('node:assert/strict');
const GC = require('../app/js/core/gcollect.js');
const { GP, state } = require('./fixtures/gpost.js');

let n = 0;
const uid = (p) => p + '_t' + (++n);

describe('URLの媒体判定と店舗ごとの振り分け', () => {
  test('媒体を判定し、Instagramはアカウント名を取り出す', () => {
    const c = (u) => GC.classifyUrl(u);
    assert.equal(c('https://tabelog.com/chiba/A1/123/').media, 'tabelog');
    assert.equal(c('https://r.gnavi.co.jp/abc/').media, 'gnavi');
    assert.equal(c('https://www.hotpepper.jp/strJ001/').media, 'hotpepper');
    assert.equal(c('https://retty.me/area/x/').media, 'retty');
    assert.equal(c('https://www.instagram.com/Shop_Name/?igsh=1').handle, 'shop_name');
    assert.equal(c('https://www.instagram.com/p/ABC/').post, true);
    assert.equal(c('https://maps.app.goo.gl/xyz').media, 'gmap');
    assert.equal(c('https://www.google.com/maps/place/abc').media, 'gmap');
    assert.equal(c('https://goo.gl/maps/abc').media, 'gmap');
    assert.equal(c('https://x.com/shop').media, 'x');
    assert.equal(c('https://www.tablecheck.com/shops/x/reserve').kind, 'reserve');
    assert.equal(c('https://example-shop.jp/').kind, 'official');
    assert.equal(c('ftp://x'), null);
    assert.equal(c('なし'), null);
    assert.equal(GC.howTo('tabelog').auto, false);
    assert.equal(GC.howTo('instagram').auto, true);
  });

  test('「【店舗名】」の見出しで店舗ごとに振り分け、見つからない店舗・店舗不明のURLはエラーにする', () => {
    const st = state();
    st.stores[1].aliases = ['ソレイユ新浦安'];
    const text = 'https://example.com/no-store\n【バル・ソレイユ 新浦安店】\nhttps://tabelog.com/a/\nhttps://tabelog.com/a/\n食べログ https://www.instagram.com/soleil_test/\n【ソレイユ新浦安】\nhttps://maps.app.goo.gl/q\n【存在しない店】\nhttps://tabelog.com/zzz/\n【バル・ソレイユ 海浜幕張店】\nhttps://www.hotpepper.jp/str1/';
    const r = GC.parseUrlBlock(text, st.stores, null);
    assert.equal(r.groups.length, 2);
    assert.deepEqual(r.groups[0].items.map((x) => x.media), ['tabelog', 'instagram', 'gmap']);
    assert.equal(r.groups[0].storeId, 'store_s1');
    assert.equal(r.groups[1].storeId, 'store_s2');
    assert.equal(r.errors.length, 2);
    assert.match(r.errors.join('\n'), /どの店舗のURLか分かりません/);
    assert.match(r.errors.join('\n'), /「存在しない店」が登録されていません/);
    const d = GC.parseUrlBlock('https://tabelog.com/b/', st.stores, 'store_s2');
    assert.equal(d.groups[0].storeId, 'store_s2');
  });
});

describe('過去投稿・本文からの抜き出し', () => {
  test('過去投稿は「---」の行で区切り、日本語と英語の区切り（ーーーーーー）は同じ投稿とする', () => {
    const parts = GC.splitPastPosts('＼見出し／\n本文1\n\nーーーーーー\n\nEnglish 1\n---\n2件目の投稿です\n===\n3件目の投稿です\n---\n');
    assert.equal(parts.length, 3);
    assert.match(parts[0], /English 1/);
  });

  test('ルールで営業時間・定休日・住所・アクセス・駐車場・メニューと価格・予約URLを根拠つきで抜き出す', () => {
    const text = ['■営業時間：11:00〜22:00（L.O.21:00）', '定休日：月曜日', '住所 千葉県浦安市テスト町1-1 テストモール 3階', 'JR新浦安駅から徒歩5分', '駐車場：あり（提携）',
      '・魚介のパエリア 1,980円（税込）', 'ガスパチョ ¥600', '予算 ￥3,000～￥3,999', 'ご予約 https://www.tablecheck.com/shops/test/reserve', '電話受付時間 10:00〜18:00'].join('\n');
    const c = GC.ruleExtract(text);
    const v = (f) => c.filter((x) => x.field === f).map((x) => x.value);
    assert.deepEqual(v('hours'), ['11:00〜22:00（L.O.21:00）']);
    assert.deepEqual(v('holidays'), ['月曜日']);
    assert.match(v('address')[0], /^千葉県浦安市テスト町1-1/);
    assert.deepEqual(v('access'), ['JR新浦安駅から徒歩5分']);
    assert.deepEqual(v('parking'), ['あり（提携）']);
    const menu = c.filter((x) => x.field === 'menu').map((x) => x.value.name + '=' + x.value.price);
    assert.deepEqual(menu, ['魚介のパエリア=1,980円（税込）', 'ガスパチョ=600円']);
    assert.deepEqual(v('reserveUrl'), ['https://www.tablecheck.com/shops/test/reserve']);
    c.forEach((x) => assert.ok(text.includes(x.evidence.slice(0, 10)), '根拠は元の文章の行'));
    assert.deepEqual(GC.ruleExtract('とても雰囲気の良いお店でした'), [], '決まった形でない情報は推測しない');
    assert.deepEqual(GC.hashtags(['#新浦安ランチ #パエリア', '#新浦安ランチ']).map((h) => h.tag), ['#新浦安ランチ', '#パエリア']);
  });

  test('AIの結果は、根拠が元の文章に無いもの・数値が根拠に無いものを要確認にする', () => {
    const src = '営業時間 11:00〜22:00\n魚介のパエリア 1,980円';
    const r = GC.fromAiResult({ facts: [{ field: 'hours', value: '11:00〜22:00', evidence: '営業時間 11:00〜22:00' }, { field: 'access', value: '駅から徒歩3分', evidence: '駅近です' }, { field: 'nope', value: 'x', evidence: 'x' }], menu: [{ name: '魚介のパエリア', description: '', price: '2,200円', period: '', evidence: '魚介のパエリア 1,980円' }], notes: ['n'] }, src, false);
    assert.equal(r.candidates.length, 3, '項目外は捨てる');
    assert.deepEqual(r.candidates[0].checkNotes, []);
    assert.match(r.candidates[1].checkNotes.join(), /元の文章に見つかりません/);
    assert.match(r.candidates[2].checkNotes.join(), /2200/);
    const img = GC.fromAiResult({ facts: [{ field: 'hours', value: '11:00〜', evidence: '11:00〜' }], menu: [], notes: [] }, '', true);
    assert.match(img.candidates[0].checkNotes[0], /画像/);
  });
});

describe('候補の確認と採用', () => {
  test('食い違いを示し、採用すると店舗情報と出典に反映し、同じ項目の他の候補は不採用になる', () => {
    const st = state();
    const info = GP.storeInfo(st.stores[1]);
    const src1 = { id: 'a', label: '食べログの本文', url: 'https://tabelog.com/a/' };
    const src2 = { id: 'b', label: '過去投稿（Instagram）', type: 'pastpost', date: '2025-05-01' };
    assert.equal(GC.addCandidates(info, [{ field: 'hours', value: '11:00〜22:00', evidence: 'e' }, { field: 'parking', value: 'あり', evidence: 'e' }], src1, uid, 1, '嶋野'), 2);
    assert.equal(GC.addCandidates(info, [{ field: 'hours', value: '11:00〜22:00', evidence: 'e' }], src1, uid, 1, '嶋野'), 0, '同じ候補は重複しない');
    GC.addCandidates(info, [{ field: 'hours', value: '11:30〜21:00', evidence: 'e' }, { field: 'menu', value: { name: '魚介のパエリア', price: '1,780円', description: '', period: '' }, evidence: 'e' }], src2, uid, 1, '嶋野');
    const rows = GC.reviewRows(info);
    const hours = rows.find((r) => r.field === 'hours');
    assert.equal(hours.conflict, true);
    assert.equal(hours.candidates.length, 2);
    assert.equal(rows.find((r) => r.field === 'parking').conflict, false);
    const menuRow = rows.find((r) => r.field === 'menu');
    assert.equal(menuRow.conflict, true, '登録済みの価格（1,980円）と違う');
    assert.equal(hours.candidates[1].fromPastPost, true);

    const desc = GC.applyCandidate(info, hours.candidates[0], uid, 2, '嶋野');
    assert.match(desc, /営業時間/);
    assert.equal(info.hours, '11:00〜22:00');
    assert.equal(info.fieldSources.hours.sourceLabel, '食べログの本文');
    assert.equal(hours.candidates[1].status, 'rejected');
    GC.applyCandidate(info, menuRow.candidates[0], uid, 2, '嶋野');
    assert.equal(info.menu.find((m) => m.name === '魚介のパエリア').price, '1,780円');
    assert.equal(info.menu.length, 2, '同じ名前のメニューは追加せず更新');
    assert.deepEqual(GC.reviewRows(info).map((r) => r.field), ['parking']);
  });
});

describe('過去投稿を投稿文の参考にする', () => {
  test('参考にするのはその店舗の過去投稿だけで、過去投稿の価格は事実として扱わない', () => {
    const st = state();
    st.stores[1].gpost.pastPosts = [
      { id: 'p1', platform: 'Instagram', date: '2025-05-01', text: '＼新浦安で囲む、夏のパエリア／\n期間限定 ランチセット 1,200円', addedAt: 1 },
      { id: 'p2', platform: 'Google投稿', date: '2026-01-10', text: '新年のごあいさつ', addedAt: 2 },
    ];
    st.stores[2].gpost.pastPosts = [{ id: 'p3', platform: 'Instagram', date: '2026-02-01', text: '海浜幕張店だけの過去投稿テキスト', addedAt: 3 }];
    const ctx = GP.buildContext(GP.bundleOf(st, 'store_s1'), { theme: 'x', mainItem: '魚介のパエリア', useSeason: false }, st.gpost.spec, '2026-10-06');
    assert.deepEqual(ctx.pastPosts.map((p) => p.date), ['2026-01-10', '2025-05-01'], '新しい順');
    const prompt = GP.buildUserPrompt(ctx);
    assert.match(prompt, /<past_posts>[\s\S]*新年のごあいさつ[\s\S]*<\/past_posts>/);
    assert.ok(!prompt.includes('海浜幕張店だけの過去投稿テキスト'), '他店舗の過去投稿は使わない');
    assert.match(prompt, /<past_posts> の価格・販売期間・キャンペーンは古い可能性/);
    const set = GP.demoGenerate(ctx)[0];
    const withOldPrice = Object.assign({}, set, { bodyJa: set.bodyJa + '\n\nランチセットは1,200円です。' });
    const v = GP.validateSet(withOldPrice, ctx, st.gpost.spec);
    assert.ok(v.checks.some((c) => c.code === 'unregistered_number' && /1,200円/.test(c.message)), '過去投稿にしか無い価格はエラー');
    const reused = GP.validateSet(Object.assign({}, set, { catchcopy: '新浦安で囲む、夏のパエリア' }), ctx, st.gpost.spec);
    assert.ok(reused.checks.some((c) => c.code === 'copy_reused'));
  });
});
