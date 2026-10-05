/* 画面：候補者データベース（一覧・登録・編集・CSV取込/出力・検索結果の手動登録） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const I = root.FS.inf;
  const X = root.FS.infui;
  const CSV = root.FS.csv;
  const F = root.FS.format;
  const esc = U.esc;

  const SOURCE_TYPES = ['手動登録', 'Instagram検索', 'TikTok検索', 'YouTube検索', 'Google検索', '紹介', 'CSV取込', 'その他'];
  const CONTACT_METHODS = ['', 'プロフィール記載のメール', 'プロフィール記載の問い合わせフォーム', 'SNSのDM', '所属事務所', 'その他（公開情報）'];

  // ───────── 一覧 ─────────
  function list(main) {
    const st = X.inf();
    const q = sessionStorage.getItem('cand-q') || '';
    const pf = sessionStorage.getItem('cand-pf') || '';
    const rows = st.candidates.filter((c) => I.matchesText(c, q) && (!pf || c.platform === pf)).sort((a, b) => b.updatedAt - a.updatedAt);
    main.innerHTML = '<h1>候補者データベース</h1><p class="lead">インフルエンサー候補を登録・管理します。確認できない情報は「未確認」のままにし、数値には取得元と確認日を記録します。</p>' +
      '<div class="row" style="margin-bottom:10px"><div class="field" style="flex:2 1 240px"><label>検索（地域・駅名・料理・ハッシュタグ・名前）</label><input type="search" id="q" value="' + esc(q) + '" placeholder="例：高松 スイーツ"></div>' +
      '<div class="field"><label>SNS</label><select id="pf"><option value="">すべて</option>' + Object.keys(I.PLATFORMS).map((k) => '<option value="' + k + '"' + (pf === k ? ' selected' : '') + '>' + I.PLATFORMS[k] + '</option>').join('') + '</select></div></div>' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn primary" id="add">＋ 候補者を登録</button><button class="btn" id="search">検索結果をまとめて登録</button><label class="btn">CSVから一括登録<input type="file" id="csvIn" accept=".csv,.tsv,.txt" hidden></label><button class="btn" id="csvOut">CSVで書き出す（' + rows.length + '件）</button><button class="btn" id="tpl">CSVのひな形</button></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>候補者</th><th>SNS</th><th>活動地域</th><th>ジャンル</th><th class="num">フォロワー数</th><th>費用</th><th>情報の充足度</th><th>取得元</th></tr></thead><tbody>' +
        rows.map((c) => {
          const comp = I.completeness(c);
          const dup = I.findDuplicates(c, st.candidates);
          return '<tr class="clickable" data-id="' + c.id + '"><td><b>' + esc(c.displayName || '名称未入力') + '</b><div class="small muted">@' + esc(c.handle) + '</div>' + (dup.same.length ? '<span class="badge warn">重複の可能性</span>' : '') + (c.personId ? ' <span class="chip">別アカウントあり</span>' : '') + '</td>' +
            '<td>' + esc(I.PLATFORMS[c.platform] || c.platform) + '</td><td class="small">' + esc(I.toList(c.areas).join('、') || '未確認') + '</td><td class="small">' + esc(I.toList(c.genres).join('、') || '未確認') + '</td>' +
            '<td class="num">' + X.factView(c.followers, X.fmtNum) + '</td><td class="nowrap">' + X.feeView(c.fee) + '</td><td>' + comp.pct + '%</td><td class="small">' + esc(c.source.type) + '<div class="muted">' + esc(c.source.obtainedAt || '') + '</div></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">該当する候補者はいません。「候補者を登録」「検索結果をまとめて登録」「CSVから一括登録」で追加できます。</div>');

    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('cand-q', e.target.value); list(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$('#pf', main).addEventListener('change', (e) => { sessionStorage.setItem('cand-pf', e.target.value); list(main); });
    U.$('#add', main).addEventListener('click', () => { location.hash = '#/inf/cand/new'; });
    U.$('#search', main).addEventListener('click', () => registerSearch(null, () => list(main)));
    U.$$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/inf/cand/' + tr.dataset.id; }));
    U.$('#csvOut', main).addEventListener('click', () => {
      U.download('インフルエンサー候補_' + X.today() + '.csv', I.toCsv(rows), 'text/csv;charset=utf-8');
      S.log('候補者をCSVで書き出しました', { type: 'influencer', id: '', label: '候補者データベース' }, rows.length + '件');
    });
    U.$('#tpl', main).addEventListener('click', () => U.download('候補者CSVひな形.csv', '﻿' + I.CSV_COLUMNS.map((c) => I.csvCell(c[1])).join(',') + '\r\n', 'text/csv;charset=utf-8'));
    U.$('#csvIn', main).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      e.target.value = '';
      if (f) await importCsv(f, () => list(main));
    });
  }

  // ───────── CSV 一括登録 ─────────
  async function importCsv(file, done) {
    const st = X.inf();
    const rows = CSV.parse(await root.FS.files.readText(file));
    if (rows.length < 2) { U.toast('CSVにデータ行がありません', 'error'); return; }
    const head = rows[0];
    const known = I.CSV_COLUMNS.map((c) => c[1]);
    const unknownCols = head.filter((h) => !known.includes(h));
    const items = rows.slice(1).map((r, i) => {
      const obj = Object.fromEntries(head.map((h, j) => [h, r[j] || '']));
      const res = I.fromCsvRow(obj, { by: S.user(), detail: file.name, date: X.today() });
      const tmp = Object.assign(X.newCandidate(), res.cand);
      const dupDb = I.findDuplicates(tmp, st.candidates);
      return { line: i + 2, res, tmp, dupDb };
    });
    // CSV内での重複も検出
    items.forEach((it, i) => {
      it.dupInFile = items.slice(0, i).some((o) => I.parseProfileUrl(o.tmp.profileUrl).key && I.parseProfileUrl(o.tmp.profileUrl).key === I.parseProfileUrl(it.tmp.profileUrl).key);
    });
    const addable = items.filter((it) => !it.dupDb.same.length && !it.dupInFile && it.tmp.profileUrl);
    const ok = await U.modal({
      title: 'CSVの取り込み確認：' + file.name,
      body: (unknownCols.length ? '<div class="alert warn small">使わない列：' + esc(unknownCols.join('、')) + '</div>' : '') +
        '<p>' + items.length + '行中、<b>' + addable.length + '件</b>を新規登録します。重複・URLなしの行は登録しません。</p>' +
        '<div class="table-wrap" style="max-height:340px;overflow:auto"><table class="tbl small"><thead><tr><th>行</th><th>候補者</th><th>結果</th><th>注意</th></tr></thead><tbody>' +
        items.map((it) => '<tr class="' + (addable.includes(it) ? '' : 'flag') + '"><td>' + it.line + '</td><td>' + esc(X.candLabel(it.tmp)) + '<div class="muted">' + esc(it.tmp.profileUrl) + '</div></td><td>' +
          (it.dupDb.same.length ? '登録済みと重複（' + esc(X.candLabel(it.dupDb.same[0])) + '）' : it.dupInFile ? 'CSV内で重複' : !it.tmp.profileUrl ? 'URLなし' : '新規登録') +
          (it.dupDb.related.length ? '<div>同一人物の別アカウントの可能性：' + esc(it.dupDb.related.map(X.candLabel).join('、')) + '</div>' : '') + '</td><td>' + esc(it.res.warnings.join('／')) + '</td></tr>').join('') + '</tbody></table></div>',
      confirmLabel: addable.length + '件を登録',
    });
    if (!ok) return;
    addable.forEach((it) => {
      st.candidates.push(it.tmp);
      X.pushHistory(it.tmp, ['CSV「' + file.name + '」' + it.line + '行目から登録'].concat(it.res.warnings), '候補者を登録しました（CSV）');
    });
    S.save(true);
    U.toast(addable.length + '件を登録しました', 'ok');
    done();
  }

  // ───────── 検索結果の手動登録 ─────────
  async function registerSearch(campaign, done) {
    const st = X.inf();
    const res = await U.modal({
      title: '検索結果をまとめて登録',
      body: '<p class="small">SNSやGoogleで手動検索して見つけたアカウントのURLを貼り付けます。検索した場所・検索語・検索日を出典として記録します。自動での検索・取得は行いません。</p>' +
        (campaign ? '<p class="small">キャンペーン「' + esc(campaign.title) + '」の検索記録として保存します。</p>' : '') +
        '<div class="row"><div class="field"><label>検索した場所</label><select id="sp">' + SOURCE_TYPES.filter((t) => t !== 'CSV取込' && t !== '手動登録').map((t) => '<option>' + t + '</option>').join('') + '</select></div><div class="field"><label>検索日</label><input type="date" id="sd" value="' + X.today() + '"></div></div>' +
        '<div class="field"><label>検索語（地域・駅名・料理・ハッシュタグ等）</label><input type="text" id="sq" placeholder="例：#高松スイーツ"></div>' +
        '<div class="field"><label>見つかったプロフィールURL（1行に1件）</label><textarea id="su" class="mono" style="min-height:140px" placeholder="https://www.instagram.com/xxxx/"></textarea></div>',
      confirmLabel: '登録する',
      collect: (bg) => ({ place: bg.querySelector('#sp').value, date: bg.querySelector('#sd').value, query: bg.querySelector('#sq').value.trim(), urls: bg.querySelector('#su').value.split(/\n/).map((x) => x.trim()).filter(Boolean) }),
    });
    if (!res) return;
    if (!res.query) { U.toast('検索語を入力してください（出典として記録します）', 'error'); return; }
    const added = [], existed = [], bad = [];
    res.urls.forEach((url) => {
      const p = I.parseProfileUrl(url);
      if (!/^https?:\/\//i.test(url) || !p.key) { bad.push(url); return; }
      const c = X.newCandidate();
      Object.assign(c, { profileUrl: url, platform: p.platform, handle: p.handle, displayName: '' });
      c.source = { type: res.place, detail: '検索語「' + res.query + '」', obtainedAt: res.date, by: S.user() };
      const d = I.findDuplicates(c, st.candidates);
      if (d.same.length) { existed.push(d.same[0]); return; }
      st.candidates.push(c);
      X.pushHistory(c, ['出典：' + res.place + '「' + res.query + '」' + res.date], '候補者を登録しました（検索結果）');
      added.push(c);
    });
    const rec = { id: S.uid('srch'), campaignId: campaign ? campaign.id : null, place: res.place, query: res.query, searchedAt: res.date, by: S.user(), resultUrls: res.urls, addedIds: added.map((c) => c.id), existingIds: existed.map((c) => c.id), at: Date.now() };
    st.searches.push(rec);
    S.log('検索結果を登録しました', { type: 'influencer', id: rec.id, label: res.place + '「' + res.query + '」' }, '新規' + added.length + '件・登録済み' + existed.length + '件' + (bad.length ? '・URL不正' + bad.length + '件' : ''));
    S.save(true);
    U.toast('新規' + added.length + '件を登録（登録済み' + existed.length + '件）。各候補者の詳細を確認・入力してください。', added.length ? 'ok' : '');
    if (bad.length) U.toast('URLとして読めない行：' + bad.join(' '), 'error');
    done();
  }

  // ───────── 登録・編集 ─────────
  function edit(main, id) {
    const st = X.inf();
    const isNew = id === 'new';
    const c = isNew ? X.newCandidate() : st.candidates.find((x) => x.id === id);
    if (!c) { main.innerHTML = '<div class="empty">候補者が見つかりません。<a href="#/inf/cands">一覧へ</a></div>'; return; }
    const related = c.personId ? st.candidates.filter((o) => o.personId === c.personId && o.id !== c.id) : [];
    const dup = isNew ? { same: [], related: [] } : I.findDuplicates(c, st.candidates);
    const links = st.links.filter((l) => l.candidateId === c.id);

    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/inf/cands">← 候補者一覧</a><div class="grow"><b>' + esc(isNew ? '候補者を登録' : X.candLabel(c)) + '</b></div><button class="btn primary" id="save">保存</button>' + (isNew ? '' : '<button class="btn danger" id="del">削除</button>') + '</div>' +
      '<div id="dupBox">' + dupHtml(dup) + '</div>' +
      '<div class="alert info small">確認できない情報は空欄（未確認）のままにしてください。数値を「確認済み」にするには取得元と確認日が必要です。推測した値は「推定」を選んでください。連絡先は<b>公開されているものだけ</b>を、必要な範囲で記録します。</div>' +
      '<div class="grid2"><div>' +
      '<div class="panel"><h2>基本情報</h2>' +
      '<div class="field"><label>プロフィールURL（必須）</label><input type="text" id="url" value="' + esc(c.profileUrl) + '" placeholder="https://www.instagram.com/xxxx/"></div>' +
      '<div class="row"><div class="field"><label>表示名</label><input type="text" id="dn" value="' + esc(c.displayName) + '"></div><div class="field"><label>アカウント名</label><input type="text" id="hd" value="' + esc(c.handle) + '"></div><div class="field" style="flex:0 1 140px"><label>SNS</label><select id="pf">' + Object.keys(I.PLATFORMS).map((k) => '<option value="' + k + '"' + (c.platform === k ? ' selected' : '') + '>' + I.PLATFORMS[k] + '</option>').join('') + '</select></div></div>' +
      '<div class="field"><label>主な活動地域（市区町村・駅名など。区切りは「、」）</label><input type="text" id="ar" value="' + esc(I.toList(c.areas).join('、')) + '"></div>' +
      '<div class="field"><label>発信ジャンル</label><input type="text" id="gn" value="' + esc(I.toList(c.genres).join('、')) + '" placeholder="例：スイーツ、カフェ、ラーメン"></div>' +
      '<div class="field"><label>よく使うハッシュタグ</label><input type="text" id="ht" value="' + esc(I.toList(c.hashtags).join('、')) + '" placeholder="例：高松スイーツ、香川カフェ"></div>' +
      '<div class="field"><label>普段の投稿形式</label><div class="btns">' + I.FORMATS.map((f) => '<label class="small nowrap"><input type="checkbox" data-fmt="' + f + '"' + (I.toList(c.formats).includes(f) ? ' checked' : '') + '> ' + f + '</label>').join('') + '</div></div></div>' +
      '<div class="panel"><h2>品質の評価（担当者が投稿を見て判断）</h2><div class="row"><div class="field" style="flex:0 1 160px"><label>品質評価</label><select id="qr"><option value="">未評価</option>' + [5, 4, 3, 2, 1].map((n) => '<option value="' + n + '"' + (Number(c.quality.rating) === n ? ' selected' : '') + '>' + n + '（' + ['', '低い', 'やや低い', '普通', '良い', 'とても良い'][n] + '）</option>').join('') + '</select></div><div class="field"><label>投稿の雰囲気</label><input type="text" id="qm" value="' + esc(c.quality.mood) + '" placeholder="例：明るい・高級感・テンポが良い"></div></div>' +
      '<div class="field"><label>写真・動画の品質、構成、説明の分かりやすさのメモ</label><textarea id="qn" style="min-height:60px">' + esc(c.quality.note) + '</textarea></div>' + (c.quality.checkedBy ? '<p class="small muted">評価者：' + esc(c.quality.checkedBy) + '・' + esc(c.quality.checkedAt) + '</p>' : '') + '</div>' +
      '<div class="panel"><h2>連絡方法（公開情報のみ）</h2><div class="row"><div class="field"><label>連絡方法</label><select id="cm">' + CONTACT_METHODS.map((m) => '<option value="' + esc(m) + '"' + (c.contact.method === m ? ' selected' : '') + '>' + (m || '未確認') + '</option>').join('') + '</select></div><div class="field"><label>公開連絡先（任意）</label><input type="text" id="cv" value="' + esc(c.contact.value) + '" placeholder="プロフィールに公開されているもののみ"></div></div>' +
      '<div class="field"><label>連絡先を確認したページ</label><input type="text" id="cs" value="' + esc(c.contact.sourceUrl) + '"></div></div>' +
      '<div class="panel"><h2>情報の取得元</h2><div class="row"><div class="field"><label>取得方法</label><select id="st">' + SOURCE_TYPES.map((t) => '<option' + (c.source.type === t ? ' selected' : '') + '>' + t + '</option>').join('') + '</select></div><div class="field"><label>取得日</label><input type="date" id="sd" value="' + esc(c.source.obtainedAt) + '"></div><div class="field"><label>確認者</label><input type="text" id="sb" value="' + esc(c.source.by) + '"></div></div>' +
      '<div class="field"><label>詳細（検索語・紹介者など）</label><input type="text" id="sdt" value="' + esc(c.source.detail) + '"></div>' +
      '<div class="field"><label>Four Seasons内のメモ</label><textarea id="nt">' + esc(c.notes) + '</textarea></div></div>' +
      '</div><div>' +
      '<div class="panel"><h2>数値・実績（取得元と確認日を記録）</h2><div class="small muted" style="margin-bottom:8px">各欄：値／状態（確認済み・推定・未確認）／取得元／確認日／確認者</div>' +
      X.factEditor('followers', 'フォロワー数', c.followers, { placeholder: '例：12000 または 1.2万' }) +
      X.factEditor('recentReactions', '直近投稿の反応数（いいね＋コメント、投稿ごとにカンマ区切り）', c.recentReactions, { placeholder: '例：420, 380, 510' }) +
      X.factEditor('recentViews', '直近投稿の再生数（動画、投稿ごとにカンマ区切り）', c.recentViews, { placeholder: '例：30000, 12000' }) +
      X.factEditor('postFrequency', '投稿頻度', c.postFrequency, { placeholder: '例：週3回' }) +
      X.factEditor('pastWork', '過去の飲食店・類似店舗の紹介実績', c.pastWork, { placeholder: '例：高松のカフェ紹介多数（投稿URLなど）' }) +
      X.factEditor('prFrequency', 'スポンサー投稿・PR投稿の頻度', c.prFrequency, { placeholder: '例：月1回程度' }) +
      X.factEditor('fee', '起用料金（円）', c.fee, { placeholder: '確認できた場合のみ。無料で受けられる場合は 0', hint: '本人の公開情報・回答で確認できた場合のみ' }) +
      '</div>' +
      (isNew ? '' : '<div class="panel"><h2>同一人物の別アカウント</h2>' + (related.length ? '<ul>' + related.map((o) => '<li><a href="#/inf/cand/' + o.id + '">' + esc(X.candLabel(o)) + '</a>（' + esc(I.PLATFORMS[o.platform]) + '） <button class="btn small" data-unlink="' + o.id + '">関連付けを外す</button></li>').join('') + '</ul>' : '<p class="muted small">関連付けられたアカウントはありません。</p>') +
        (dup.related.filter((o) => !related.includes(o)).length ? '<p class="small">同一人物の可能性があるアカウント：</p><ul>' + dup.related.filter((o) => !related.includes(o)).map((o) => '<li><a href="#/inf/cand/' + o.id + '">' + esc(X.candLabel(o)) + '</a>（' + esc(I.PLATFORMS[o.platform]) + '） <button class="btn small" data-link="' + o.id + '">同一人物として関連付ける</button></li>').join('') + '</ul>' : '') + '</div>' +
        '<div class="panel"><h2>キャンペーンごとの起用状況</h2>' + (links.length ? '<table class="tbl">' + links.map((l) => { const cp = st.campaigns.find((x) => x.id === l.campaignId); return cp ? '<tr><td><a href="#/inf/link/' + l.id + '">' + esc(cp.title) + '</a></td><td>' + esc(l.status) + '</td></tr>' : ''; }).join('') + '</table>' : '<p class="muted small">まだキャンペーンで検討されていません。</p>') + '</div>' +
        '<div class="panel"><h2>更新履歴</h2>' + historyHtml(c) + '</div>') +
      '</div></div>';

    const $ = (s) => U.$(s, main);
    $('#url').addEventListener('change', () => {
      const p = I.parseProfileUrl($('#url').value);
      if (p.platform && p.platform !== 'other') $('#pf').value = p.platform;
      // アカウント名はURLから取る（URLを変えたのに古いアカウント名が残らないように）
      if (p.handle) $('#hd').value = p.handle.replace(/^channel:/, '');
      const tmp = Object.assign({}, c, { profileUrl: $('#url').value, platform: $('#pf').value, handle: $('#hd').value, displayName: $('#dn').value });
      $('#dupBox').innerHTML = dupHtml(I.findDuplicates(tmp, st.candidates));
    });
    U.$$('[data-link]', main).forEach((b) => b.addEventListener('click', () => {
      const o = st.candidates.find((x) => x.id === b.dataset.link);
      const pid = c.personId || o.personId || S.uid('person');
      st.candidates.filter((x) => x.personId && (x.personId === c.personId || x.personId === o.personId)).forEach((x) => { x.personId = pid; });
      c.personId = pid; o.personId = pid;
      X.pushHistory(c, ['「' + X.candLabel(o) + '」（' + I.PLATFORMS[o.platform] + '）と同一人物として関連付け'], '別アカウントを関連付けました');
      S.save(true);
      edit(main, id);
    }));
    U.$$('[data-unlink]', main).forEach((b) => b.addEventListener('click', () => {
      const o = st.candidates.find((x) => x.id === b.dataset.unlink);
      o.personId = null;
      if (!st.candidates.some((x) => x.id !== c.id && x.personId === c.personId)) c.personId = null;
      X.pushHistory(c, ['「' + X.candLabel(o) + '」との関連付けを解除'], '別アカウントの関連付けを外しました');
      S.save(true);
      edit(main, id);
    }));
    if (!isNew) $('#del').addEventListener('click', async () => {
      const ok = await U.modal({ title: '候補者の削除', body: '<p>「' + esc(X.candLabel(c)) + '」と、キャンペーンでの起用状況・連絡文の下書きを削除します。</p>', confirmLabel: '削除', danger: true });
      if (!ok) return;
      st.candidates = st.candidates.filter((x) => x.id !== c.id);
      st.links = st.links.filter((l) => l.candidateId !== c.id);
      S.log('候補者を削除しました', { type: 'influencer', id: c.id, label: X.candLabel(c) }, '');
      S.save(true);
      location.hash = '#/inf/cands';
    });

    $('#save').addEventListener('click', async () => {
      const errors = [];
      const changes = [];
      const url = $('#url').value.trim();
      if (!/^https?:\/\//i.test(url)) errors.push('プロフィールURLを https:// から入力してください');
      const next = {
        profileUrl: url, displayName: $('#dn').value.trim(), handle: $('#hd').value.trim().replace(/^@/, ''), platform: $('#pf').value,
        areas: I.toList($('#ar').value), genres: I.toList($('#gn').value), hashtags: I.toList($('#ht').value),
        formats: U.$$('[data-fmt]', main).filter((x) => x.checked).map((x) => x.dataset.fmt),
      };
      const tmp = Object.assign({}, c, next);
      const d = I.findDuplicates(tmp, st.candidates);
      if (d.same.length) errors.push('同じアカウントが既に登録されています：' + X.candLabel(d.same[0]));
      const labels = { profileUrl: 'プロフィールURL', displayName: '表示名', handle: 'アカウント名', platform: 'SNS', areas: '活動地域', genres: '発信ジャンル', hashtags: 'ハッシュタグ', formats: '投稿形式' };
      Object.keys(next).forEach((k) => {
        const a = JSON.stringify(c[k] || ''), b = JSON.stringify(next[k] || '');
        if (a !== b) changes.push(labels[k] + '：' + (Array.isArray(c[k]) ? c[k].join('、') : c[k] || '未入力') + ' → ' + (Array.isArray(next[k]) ? next[k].join('、') : next[k] || '未入力'));
      });
      const factDefs = [['followers', 'フォロワー数', I.parseNum, X.fmtNum], ['recentReactions', '直近の反応数', I.toNumList], ['recentViews', '直近の再生数', I.toNumList], ['postFrequency', '投稿頻度'], ['pastWork', '紹介実績'], ['prFrequency', 'PR投稿の頻度'], ['fee', '起用料金', I.parseNum, (v) => X.fmtNum(v) + '円']];
      const facts = {};
      factDefs.forEach(([k, label, conv, fmt]) => {
        const r = X.readFact(main, k, conv, c[k]);
        r.errors.forEach((e) => errors.push(label + '：' + e));
        facts[k] = r.f;
        if (r.changed && JSON.stringify(c[k] && I.isKnown(c[k]) ? c[k] : null) !== JSON.stringify(I.isKnown(r.f) ? r.f : null)) changes.push(label + '：' + X.describeFact(c[k], fmt) + ' → ' + X.describeFact(r.f, fmt));
      });
      const rating = $('#qr').value ? Number($('#qr').value) : null;
      const quality = { rating, mood: $('#qm').value.trim(), note: $('#qn').value.trim(), checkedBy: c.quality.checkedBy, checkedAt: c.quality.checkedAt };
      if (rating !== c.quality.rating || quality.mood !== c.quality.mood || quality.note !== c.quality.note) {
        quality.checkedBy = S.user(); quality.checkedAt = X.today();
        changes.push('品質評価：' + (c.quality.rating || '未評価') + ' → ' + (rating || '未評価'));
      }
      const contact = { method: $('#cm').value, value: $('#cv').value.trim(), sourceUrl: $('#cs').value.trim() };
      if (contact.value && !contact.method) errors.push('連絡先を記録する場合は連絡方法を選んでください');
      if (JSON.stringify(contact) !== JSON.stringify(c.contact)) changes.push('連絡方法：' + (c.contact.method || '未確認') + ' → ' + (contact.method || '未確認'));
      const source = { type: $('#st').value, detail: $('#sdt').value.trim(), obtainedAt: $('#sd').value, by: $('#sb').value.trim() || S.user() };
      if (!source.obtainedAt) errors.push('取得日を入力してください');
      if (JSON.stringify(source) !== JSON.stringify(c.source)) changes.push('取得元：' + source.type + ' ' + source.detail + '（' + source.obtainedAt + '・' + source.by + '）');
      const notes = $('#nt').value;
      if (notes !== c.notes) changes.push('メモを更新');
      if (errors.length) {
        await U.modal({ title: '保存できません', body: '<ul class="checks">' + errors.map((e) => '<li>' + esc(e) + '</li>').join('') + '</ul>', confirmLabel: 'OK', hideCancel: true });
        return;
      }
      Object.assign(c, next, facts, { quality, contact, source, notes, updatedAt: Date.now() });
      if (isNew) st.candidates.push(c);
      if (isNew || changes.length) X.pushHistory(c, isNew ? ['新規登録：' + source.type + ' ' + source.detail].concat(changes) : changes, isNew ? '候補者を登録しました' : '候補者情報を更新しました');
      S.save(true);
      U.toast('保存しました', 'ok');
      if (isNew) location.hash = '#/inf/cand/' + c.id;
      else edit(main, c.id);
    });
  }

  function dupHtml(d) {
    let h = '';
    if (d.same.length) h += '<div class="alert danger">同じアカウントが既に登録されています：' + d.same.map((o) => '<a href="#/inf/cand/' + o.id + '">' + esc(X.candLabel(o)) + '</a>').join('、') + '。重複登録はできません。</div>';
    if (d.related.length) h += '<div class="alert warn">同一人物の別アカウントの可能性：' + d.related.map((o) => '<a href="#/inf/cand/' + o.id + '">' + esc(X.candLabel(o)) + '（' + esc(I.PLATFORMS[o.platform]) + '）</a>').join('、') + '</div>';
    return h;
  }

  function historyHtml(c) {
    const h = (c.history || []).slice().reverse();
    if (!h.length) return '<p class="muted small">履歴はありません。</p>';
    return '<ul class="history">' + h.map((e) => '<li><span class="muted">' + F.fmtDateTime(e.at) + '</span>　<span class="who">' + esc(e.user) + '</span>　' + esc(e.action) + (e.changes && e.changes.length ? '<div class="muted">' + e.changes.map(esc).join('<br>') + '</div>' : '') + '</li>').join('') + '</ul>';
  }

  root.FS.views.infCandidates = list;
  root.FS.views.infCandidate = edit;
  root.FS.infui.registerSearch = registerSearch;
})(self);
