import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import { startTestServer, genBody } from './helpers.js';

describe('顧客・ブランド・店舗の登録と編集', () => {
  let t;
  before(async () => { t = await startTestServer({ seed: false }); });
  after(() => t.close());

  test('登録・編集でき、店舗IDが一意に割り当てられ、更新者と履歴が残る', async () => {
    const c = await t.call('POST', '/api/clients', { name: '新規顧客', contact_person: '田中' });
    assert.equal(c.status, 201);
    const b = await t.call('POST', '/api/brands', { client_id: c.data.id, name: 'ブランドA', tone: '上品' });
    const s1 = await t.call('POST', '/api/stores', { brand_id: b.data.id, name: '店舗1', area: '渋谷' });
    const s2 = await t.call('POST', '/api/stores', { brand_id: b.data.id, name: '店舗2', area: '恵比寿' });
    assert.match(s1.data.store_code, /^ST-\d{5}$/);
    assert.notEqual(s1.data.store_code, s2.data.store_code);

    const u = await t.call('PUT', `/api/stores/${s1.data.id}`, { business_hours: '11:00〜20:00', verified_at: '2026-10-01' }, { user: '鈴木' });
    assert.equal(u.data.business_hours, '11:00〜20:00');
    assert.equal(u.data.updated_by, '鈴木');
    assert.equal(u.data.store_code, s1.data.store_code);

    const h = await t.call('GET', `/api/history/stores/${s1.data.id}`);
    assert.deepEqual(h.data.map((x) => x.action), ['update', 'create']);
    assert.equal(h.data[0].user_name, '鈴木');
    assert.equal(JSON.parse(h.data[0].before_json).business_hours, null);

    const m = await t.call('POST', '/api/menu_items', { store_id: s1.data.id, name: 'ランチ', price: '1,000円' });
    assert.equal(m.status, 201);
    const detail = await t.call('GET', `/api/stores/${s1.data.id}`);
    assert.equal(detail.data.menu.length, 1);
    assert.equal(detail.data.client.name, '新規顧客');
  });

  test('担当者名なしの更新は拒否する', async () => {
    const r = await t.call('POST', '/api/clients', { name: 'x' }, { user: null });
    assert.equal(r.status, 400);
  });

  test('店舗の所属ブランドは更新で付け替えられない', async () => {
    const c = await t.call('POST', '/api/clients', { name: '別顧客' });
    const b = await t.call('POST', '/api/brands', { client_id: c.data.id, name: '別ブランド' });
    const stores = await t.call('GET', '/api/stores');
    const s = stores.data[0];
    const r = await t.call('PUT', `/api/stores/${s.id}`, { brand_id: b.data.id, name: s.name });
    assert.equal(r.data.brand_id, s.brand_id);
  });

  test('配下にデータがある顧客は削除できない', async () => {
    const clients = await t.call('GET', '/api/clients?q=新規顧客');
    const r = await t.call('DELETE', `/api/clients/${clients.data[0].id}`);
    assert.equal(r.status, 409);
  });
});

describe('投稿案の生成', () => {
  let t;
  before(async () => { t = await startTestServer(); });
  after(() => t.close());

  test('キャッチコピー・日本語・英語が1セットで生成され、下書き保存される', async () => {
    const r = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { mainItem: '魚介のパエリア', postDate: '2026-10-15' }));
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.equal(r.data.results.length, 1);
    const [p] = r.data.results[0].posts;
    assert.ok(p.catchcopy && p.body_ja && p.body_en);
    assert.equal(p.status, 'draft');
    assert.equal(p.store_id, t.ids.s1.id);
    assert.ok(p.body_ja.startsWith(`＼${p.catchcopy}／`), 'キャッチコピーと連動した見出し');
    assert.ok(p.body_ja.includes('魚介のパエリア'));
    assert.equal(p.validation.counts.ja, [...p.body_ja].length);
    assert.equal(p.context.store.code, t.ids.s1.store_code);
  });

  test('1案と3案を切り替えて生成できる', async () => {
    const one = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { setCount: 1, mainItem: '魚介のパエリア' }));
    const three = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { setCount: 3, mainItem: '魚介のパエリア' }));
    assert.equal(one.data.results[0].posts.length, 1);
    const posts = three.data.results[0].posts;
    assert.equal(posts.length, 3);
    assert.deepEqual(posts.map((p) => p.set_no), [1, 2, 3]);
    assert.equal(new Set(posts.map((p) => p.catchcopy)).size, 3, '案ごとに異なるキャッチコピー');
    for (const p of posts) assert.ok(p.body_ja.startsWith(`＼${p.catchcopy}／`), '各案でコピーと本文がセット');
  });

  test('複数店舗に一括生成すると、店舗ごとの住所・商品・価格・営業時間が混ざらない', async () => {
    const r = await t.call('POST', '/api/generate', {
      storeIds: [t.ids.s1.id, t.ids.s2.id],
      common: { theme: '秋のおすすめ', useSeason: false, setCount: 1, cta: 'BOOK' },
      perStore: {
        [t.ids.s1.id]: { mainItem: '魚介のパエリア', price: '1,980円' },
        [t.ids.s2.id]: { mainItem: 'イベリコ豚の鉄板焼き', price: '2,480円' },
      },
      provider: 'mock',
    });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const [a, b] = r.data.results;
    const pa = a.posts[0]; const pb = b.posts[0];
    assert.equal(pa.store_id, t.ids.s1.id);
    assert.equal(pb.store_id, t.ids.s2.id);
    const all = (p) => `${p.catchcopy}${p.body_ja}${p.body_en}`;
    assert.ok(all(pa).includes('1,980円') && !all(pa).includes('2,480円'));
    assert.ok(all(pb).includes('2,480円') && !all(pb).includes('1,980円'));
    assert.ok(all(pa).includes('11:00〜22:00') && !all(pa).includes('17:00〜23:00'));
    assert.ok(!all(pa).includes('テストプラザ幕張') && !all(pb).includes('テストモール新浦安'));
    assert.equal(pb.context.post.cta.url, 'https://reserve.example.com/soleil-makuhari');
    assert.equal(pa.context.post.cta.url, 'https://reserve.example.com/soleil-shinurayasu');
    // 生成用の事実シートにも他店舗の情報が入っていない
    assert.ok(!JSON.stringify(pa.context).includes('海浜幕張'));
    for (const p of [pa, pb]) assert.ok(!p.validation.checks.some((c) => c.code === 'other_store_leak'));
  });

  test('異なる顧客の店舗は同時に生成できない', async () => {
    const r = await t.call('POST', '/api/generate', genBody([t.ids.s1.id, t.ids.s3.id]));
    assert.equal(r.status, 400);
    assert.match(r.data.error, /異なる顧客/);
  });

  test('投稿入力と店舗登録情報が違う場合は確認を求め、選んだ方を使う', async () => {
    const body = genBody([t.ids.s1.id], { mainItem: '魚介のパエリア', price: '1,500円' });
    const pre = await t.call('POST', '/api/generate/preflight', body);
    assert.equal(pre.data[0].conflicts[0].field, 'price');
    assert.equal(pre.data[0].conflicts[0].store, '1,980円');

    const blocked = await t.call('POST', '/api/generate', body);
    assert.equal(blocked.status, 409);

    body.perStore = { [t.ids.s1.id]: { resolutions: { price: 'store' } } };
    const ok = await t.call('POST', '/api/generate', body);
    const p = ok.data.results[0].posts[0];
    assert.equal(p.context.post.price, '1,980円');
    assert.ok(p.body_ja.includes('1,980円') && !p.body_ja.includes('1,500円'));
    assert.equal(p.context.conflicts[0].chosen, 'store');
  });

  test('季節表現は投稿予定日に合わせ、使わない設定では入れない', async () => {
    const autumn = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { postDate: '2026-10-15', useSeason: true }));
    const pa = autumn.data.results[0].posts[0];
    assert.equal(pa.context.season.season, 'autumn');
    assert.ok(pa.body_ja.includes('秋'));
    assert.ok(!pa.validation.checks.some((c) => c.code === 'season_mismatch'));

    const winter = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { postDate: '2027-01-10', useSeason: true }));
    assert.equal(winter.data.results[0].posts[0].context.season.season, 'winter');

    const none = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { postDate: '2026-10-15', useSeason: false, theme: 'ランチのご案内' }));
    const pn = none.data.results[0].posts[0];
    assert.equal(pn.context.season.use, false);
    assert.ok(!pn.validation.checks.some((c) => c.code === 'season_not_allowed'), JSON.stringify(pn.validation.checks));

    const noDate = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { useSeason: true }));
    assert.equal(noDate.data.results[0].posts[0].context.season.use, false, '投稿予定日がなければ季節に依存しない');
  });

  test('未登録情報は補わず、確認事項として表示する', async () => {
    const r = await t.call('POST', '/api/generate', genBody([t.ids.s3.id], { mainItem: '季節の天ぷら', cta: 'BOOK' }, { common: { theme: '新メニュー', mainItem: '季節の天ぷら', cta: 'BOOK', setCount: 1, useSeason: false } }));
    const p = r.data.results[0].posts[0];
    const conf = p.context.confirmations.join('\n');
    assert.match(conf, /未登録です。投稿入力の内容だけ/);
    assert.match(conf, /アクセス・施設内の位置が未登録/);
    assert.match(conf, /確認日が未登録/);
    assert.match(conf, /リンク先URLが未登録/);
    assert.ok(!/徒歩|駅/.test(p.body_ja), 'アクセス情報を創作しない');
    assert.equal(p.context.post.cta.url, null);
  });
});

describe('投稿案の編集・保存・複製・検索', () => {
  let t; let post;
  before(async () => {
    t = await startTestServer();
    const r = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { theme: 'パエリア特集', mainItem: '魚介のパエリア' }));
    post = r.data.results[0].posts[0];
  });
  after(() => t.close());

  test('編集して保存すると自動チェックが再実行され、履歴が残る', async () => {
    const r = await t.call('PUT', `/api/posts/${post.id}`, { body_ja: `${post.body_ja}\n\nお電話は 03-1234-5678 まで`, status: 'review' }, { user: '確認者A' });
    assert.equal(r.status, 200);
    assert.equal(r.data.status, 'review');
    assert.equal(r.data.updated_by, '確認者A');
    assert.ok(r.data.validation.checks.some((c) => c.code === 'phone_number'));
    const h = await t.call('GET', `/api/history/post_sets/${post.id}`);
    assert.equal(h.data[0].action, 'update');
  });

  test('不正な状態は拒否する', async () => {
    const r = await t.call('PUT', `/api/posts/${post.id}`, { status: 'published' });
    assert.equal(r.status, 400);
  });

  test('複製すると下書きの別投稿案になる', async () => {
    const r = await t.call('POST', `/api/posts/${post.id}/duplicate`);
    assert.equal(r.status, 201);
    assert.notEqual(r.data.id, post.id);
    assert.equal(r.data.status, 'draft');
    assert.equal(r.data.duplicated_from, post.id);
    assert.equal(r.data.catchcopy, post.catchcopy);
  });

  test('店舗・テーマ・作成日・状態で検索できる', async () => {
    const today = new Date().toISOString().slice(0, 10);
    const byStore = await t.call('GET', `/api/posts?store_id=${t.ids.s1.id}`);
    assert.ok(byStore.data.length >= 2);
    assert.equal((await t.call('GET', `/api/posts?store_id=${t.ids.s2.id}`)).data.length, 0);
    assert.ok((await t.call('GET', `/api/posts?theme=${encodeURIComponent('パエリア')}`)).data.length >= 1);
    assert.equal((await t.call('GET', `/api/posts?theme=${encodeURIComponent('存在しない')}`)).data.length, 0);
    assert.ok((await t.call('GET', `/api/posts?from=${today}&to=${today}`)).data.length >= 1);
    assert.equal((await t.call('GET', '/api/posts?from=2000-01-01&to=2000-01-02')).data.length, 0);
    assert.equal((await t.call('GET', '/api/posts?status=review')).data.length, 1);
  });
});

describe('Google仕様の上限チェック（設定変更に追従）', () => {
  let t;
  before(async () => { t = await startTestServer(); });
  after(() => t.close());

  test('上限を超えると警告し、仕様値を変更するとチェックも変わる', async () => {
    const r = await t.call('POST', '/api/generate', genBody([t.ids.s1.id]));
    const p = r.data.results[0].posts[0];
    const long = `${p.body_ja}\n\n${'あ'.repeat(1600)}`;
    const e1 = await t.call('PUT', `/api/posts/${p.id}`, { body_ja: long });
    assert.ok(e1.data.validation.checks.some((c) => c.code === 'ja_over_limit' && c.level === 'error'));
    assert.equal(e1.data.validation.googleSpec.ok, false);

    const spec = (await t.call('GET', '/api/spec')).data;
    spec.postBody.maxChars = 5000;
    spec.verifiedAt = '2026-10-05';
    const s = await t.call('PUT', '/api/spec', spec);
    assert.equal(s.status, 200);
    const e2 = await t.call('PUT', `/api/posts/${p.id}`, { body_ja: long });
    assert.ok(!e2.data.validation.checks.some((c) => c.code === 'ja_over_limit'));
    assert.equal(e2.data.validation.counts.maxChars, 5000);

    const bad = await t.call('PUT', '/api/spec', { ...spec, postBody: { maxChars: -1 } });
    assert.equal(bad.status, 400);
  });
});

describe('承認前に外部サービスへ投稿しない', () => {
  test('生成から承認まで、外部への通信が一切発生しない', async () => {
    const t = await startTestServer();
    const realFetch = globalThis.fetch;
    const external = [];
    // テスト用クライアントの通信（127.0.0.1）以外を記録する
    globalThis.fetch = (url, opts) => {
      if (!String(url).startsWith(t.base)) external.push(String(url));
      return realFetch(url, opts);
    };
    try {
      const r = await t.call('POST', '/api/generate', genBody([t.ids.s1.id], { cta: 'BOOK' }));
      const p = r.data.results[0].posts[0];
      await t.call('PUT', `/api/posts/${p.id}`, { status: 'approved' });
      await t.call('PUT', `/api/posts/${p.id}`, { status: 'used' });
      const meta = await t.call('GET', '/api/meta');
      assert.equal(meta.data.externalPosting, false);
      for (const path of ['/api/publish', `/api/posts/${p.id}/publish`]) {
        assert.equal((await t.call('POST', path, {})).status, 404);
      }
    } finally {
      globalThis.fetch = realFetch;
      await t.close();
    }
    assert.deepEqual(external, []);
  });
});

describe('CSV・バックアップ', () => {
  let t;
  before(async () => { t = await startTestServer(); });
  after(() => t.close());

  test('店舗CSVを出力し、編集したCSVで一括更新・新規登録できる', async () => {
    const out = await t.call('GET', '/api/export/stores.csv', undefined, { raw: true });
    assert.equal(out.status, 200);
    assert.match(out.headers.get('content-type'), /text\/csv/);
    const bytes = Buffer.from(await (await fetch(`${t.base}/api/export/stores.csv`)).arrayBuffer());
    assert.deepEqual([...bytes.subarray(0, 3)], [0xef, 0xbb, 0xbf], 'Excel 用の BOM 付き');
    assert.ok(out.data.replace(/^\uFEFF/, '').startsWith('id,store_code,brand_id,name'));
    assert.ok(out.data.includes('"[{""type"":""BOOK""'), 'JSON 列が正しくエスケープされる');

    const csv = `id,brand_id,name,area,access\r\n${t.ids.s2.id},${t.ids.b1.id},バル・ソレイユ 海浜幕張店,海浜幕張,"JR海浜幕張駅南口から徒歩3分\n改札を出て右"\r\n,${t.ids.b1.id},バル・ソレイユ 船橋店,船橋,\r\n`;
    const r = await t.call('POST', '/api/import/stores', csv, { headers: { 'content-type': 'text/csv' } });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    assert.deepEqual([r.data.created, r.data.updated], [1, 1]);
    const s2 = await t.call('GET', `/api/stores/${t.ids.s2.id}`);
    assert.equal(s2.data.access, 'JR海浜幕張駅南口から徒歩3分\n改札を出て右');
    assert.equal(s2.data.reservation_url, 'https://reserve.example.com/soleil-makuhari', '列にない項目は変更しない');
    const list = await t.call('GET', `/api/stores?q=${encodeURIComponent('船橋')}`);
    assert.match(list.data[0].store_code, /^ST-/);
  });

  test('エラー行があれば全件取り消す', async () => {
    const before = (await t.call('GET', '/api/clients')).data.length;
    const csv = 'id,name,contact_person\n,新顧客A,a\n,,b\n';
    const r = await t.call('POST', '/api/import/clients', csv);
    assert.equal(r.status, 400);
    assert.equal(r.data.rolledBack, true);
    assert.match(r.data.errors[0], /3行目/);
    assert.equal((await t.call('GET', '/api/clients')).data.length, before);
  });

  test('バックアップに全データと履歴が含まれる', async () => {
    const r = await t.call('GET', '/api/backup');
    assert.ok(r.data.data.stores.length >= 3);
    assert.ok(r.data.data.history.length > 0);
    assert.ok(r.data.spec.postBody.maxChars > 0);
  });
});
