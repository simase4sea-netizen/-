/* 動作確認用のサンプルデータ。実在の店舗データと混ざらないよう、店舗名に【サンプル】を付ける。 */
(function (root) {
  'use strict';
  const S = root.FS.store;

  const MEMO = [
    '■10月定例ミーティング（サンプル）',
    '嶋野：10月の投稿は週3回で進めることに決定しました。',
    '田中：秋の新作の写真は10/10までに店舗側で用意します。',
    '・広告の配信開始は10月15日で確定',
    '・嶋野さんが投稿カレンダーを10/8までに作成する',
    '・ハロウィン企画をやるかどうかは次回相談',
    '・価格表の最新版を共有してもらう',
    '・嶋野さんが投稿カレンダーを10/8までに作成する',
    '・佐藤さんにロゴデータの修正をお願いする。来週中。',
    '・先月のフォロワー数は前月より増えたと報告あり',
    '・LINE配信の頻度は未定',
  ].join('\n');

  function load() {
    const st = S.get();
    const now = Date.now();
    const mk = (name) => {
      let s = st.stores.find((x) => x.name === name);
      if (!s) { s = { id: S.uid('store'), name, kind: 'client', aliases: [], memo: '動作確認用のサンプル店舗です（実在しません）', reportTemplate: '', createdAt: now }; st.stores.push(s); }
      return s;
    };
    const a = mk('【サンプル】カフェA');
    mk('【サンプル】美容室B');
    const pj = { id: S.uid('pj'), storeId: a.id, name: '【サンプル】2026年9月 Instagram広告', assignee: '嶋野成優', createdAt: now };
    st.projects.push(pj);

    const rep = root.FS.views.newReport(a.id);
    Object.assign(rep, {
      projectId: pj.id,
      periodStart: '2026-09-01', periodEnd: '2026-09-30', objective: 'フォロワー獲得',
      metrics: {
        spend: { value: 30000, source: 'サンプル（手入力）', needsCheck: false, note: '' },
        reach: { value: 12500, source: 'サンプル（手入力）', needsCheck: false, note: '' },
        impressions: { value: 31250, source: 'サンプル（手入力）', needsCheck: false, note: '' },
        clicks: { value: 600, source: 'サンプル（手入力）', needsCheck: false, note: '' },
        profileVisits: { value: 420, source: 'サンプル画像から転記', needsCheck: true, note: '画像が不鮮明（サンプル）' },
        follows: { value: 85, source: 'サンプル（手入力）', needsCheck: false, note: '' },
      },
      hasPrevious: true, previousLabel: '2026年8月分（サンプル）',
      previous: {
        spend: { value: 30000, source: 'サンプル', needsCheck: false, note: '' },
        reach: { value: 10000, source: 'サンプル', needsCheck: false, note: '' },
        clicks: { value: 480, source: 'サンプル', needsCheck: false, note: '' },
        follows: { value: 60, source: 'サンプル', needsCheck: false, note: '' },
      },
    });
    st.reports.push(rep);
    S.log('サンプルの広告レポートを追加しました', { type: 'report', id: rep.id, label: '【サンプル】カフェA 広告レポート' }, '', rep);

    const m = {
      id: S.uid('min'), type: 'minutes', title: '【サンプル】10月定例ミーティング', date: '2026-10-05',
      participants: '嶋野成優(Four Seasons), 田中(店舗), 佐藤(デザイナー)', storeId: a.id, projectId: pj.id,
      rawText: MEMO, summary: '', decisions: [], shared: [], undecided: [], tasks: [], possibleDuplicates: [],
      extractedAt: null, status: 'draft', history: [], attachments: [], createdAt: now, createdBy: S.user(), updatedAt: now,
    };
    const r = root.FS.minutes.extract(m.rawText, { date: m.date, participants: m.participants });
    Object.assign(m, { decisions: r.decisions, shared: r.shared, undecided: r.undecided, tasks: r.tasks, possibleDuplicates: r.possibleDuplicates, extractedAt: now });
    m.summary = root.FS.minutes.draftSummary(m);
    st.minutes.push(m);
    S.log('サンプルの議事録を追加しました', { type: 'minutes', id: m.id, label: m.title }, '', m);
    loadGpost(st, now);
    S.save(true);
  }

  // Google投稿作成のサンプル（架空のブランド・2店舗・メニュー）。実在の店舗・施設とは関係ありません。
  function loadGpost(st, now) {
    const GP = root.FS.gpost;
    let brand = st.gpost.brands.find((b) => b.name === '【サンプル】バル・ソレイユ');
    if (!brand) {
      brand = Object.assign(GP.emptyBrand(), {
        id: S.uid('brand'), name: '【サンプル】バル・ソレイユ', industry: 'スペイン料理', features: '鉄板で仕上げるパエリアと、タパスを気軽に楽しめるスペインバル',
        tone: '明るく親しみやすい', preferredPhrases: 'タパス、シェアして楽しむ', avoidPhrases: '激安\n日本一', referencePosts: '', notes: '価格は税込表記', createdAt: now, updatedAt: now, history: [],
      });
      st.gpost.brands.push(brand);
    }
    const mk = (name, info, menu) => {
      let s = st.stores.find((x) => x.name === name);
      if (!s) { s = { id: S.uid('store'), name, kind: 'client', aliases: [], memo: '動作確認用のサンプル店舗です（実在しません）', reportTemplate: '', createdAt: now }; st.stores.push(s); }
      s.gpost = Object.assign(GP.emptyStoreInfo(), info, { brandId: brand.id, menu: menu.map((m) => Object.assign({ id: S.uid('menu'), createdAt: now }, m)) });
      return s;
    };
    mk('【サンプル】バル・ソレイユ 新浦安店', {
      area: '新浦安', address: '千葉県浦安市テスト町1-1 テストモール新浦安 3階', mapsUrl: 'https://maps.example.com/soleil-shinurayasu', access: 'JR新浦安駅から徒歩5分', floorInfo: 'テストモール新浦安 3階',
      hours: '11:00〜22:00（L.O. 21:00）', holidays: '施設の休館日に準ずる', reserveMethod: 'Web予約', reserveUrl: 'https://reserve.example.com/soleil-shinurayasu',
      atmosphere: 'テラコッタ調の明るい店内で、ベビーカーでも入りやすい広めの通路', scenes: 'お買い物途中のランチ、家族での食事、友人との女子会', target: 'ファミリー、近隣の買い物客',
      features: 'ランチタイムはパエリアのハーフサイズを用意', facilities: 'キッズチェアあり',
      ctaOptions: [{ type: 'BOOK', url: 'https://reserve.example.com/soleil-shinurayasu' }, { type: 'LEARN_MORE', url: 'https://soleil.example.com/shinurayasu' }],
      verifiedAt: '2026-09-20', verifiedSource: '店長へのヒアリング（サンプル）', verifiedBy: '嶋野成優',
    }, [
      { name: '魚介のパエリア', description: 'エビやムール貝をたっぷり使い、鉄鍋で炊き上げるパエリア', price: '1,980円', period: '通年' },
      { name: '秋のきのこアヒージョ', description: '数種類のきのこをオリーブオイルとにんにくで煮込んだアヒージョ', price: '880円', period: '2026年9月1日〜11月30日' },
    ]);
    mk('【サンプル】バル・ソレイユ 海浜幕張店', {
      area: '海浜幕張', address: '千葉県千葉市美浜区テスト2-2 テストプラザ幕張 1階', access: 'JR海浜幕張駅南口から徒歩3分', floorInfo: 'テストプラザ幕張 1階',
      hours: '17:00〜23:00', holidays: '月曜日', reserveMethod: '電話またはWeb予約', reserveUrl: 'https://reserve.example.com/soleil-makuhari',
      atmosphere: 'カウンター中心の落ち着いたバル空間', scenes: '仕事帰りの一杯、少人数での飲み会',
      ctaOptions: [{ type: 'BOOK', url: 'https://reserve.example.com/soleil-makuhari' }],
      verifiedAt: '2026-04-01', verifiedSource: '公式サイト（サンプル）', verifiedBy: '嶋野成優',
    }, [
      { name: 'イベリコ豚の鉄板焼き', description: '香ばしく焼き上げたイベリコ豚', price: '2,480円', period: '通年' },
    ]);
    S.log('サンプルのGoogle投稿用の店舗情報を追加しました', { type: 'gstore', id: '', label: '【サンプル】バル・ソレイユ' }, '2店舗');
  }

  root.FS = root.FS || {};
  root.FS.sample = { load, MEMO };
})(self);
