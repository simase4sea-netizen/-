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
    S.save(true);
  }

  root.FS = root.FS || {};
  root.FS.sample = { load, MEMO };
})(self);
