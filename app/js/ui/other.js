/* 画面：ホーム／店舗・案件／タスク一覧／操作履歴／設定 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const F = root.FS.format;
  const G = root.FS.guard;
  const M = root.FS.minutes;
  const R = root.FS.report;
  const V = root.FS.views;
  const esc = U.esc;

  function todayIso() {
    const d = new Date();
    return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0');
  }
  function daysBetween(a, b) {
    return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000);
  }

  // すべての議事録からタスクを集める
  function allTasks() {
    const out = [];
    S.get().minutes.forEach((m) => (m.tasks || []).forEach((t, i) => out.push({ t, i, m })));
    return out;
  }

  function dueBadge(t) {
    if (!t.dueDate) return t.due && t.due !== M.UNSET ? esc(t.due) + ' <span class="badge warn">日付未確定</span>' : '<span class="muted">未設定</span>';
    const d = daysBetween(todayIso(), t.dueDate);
    const cls = t.status !== '完了' && d < 0 ? 'overdue' : t.status !== '完了' && d <= 3 ? 'soon-due' : '';
    return '<span class="' + cls + '">' + esc(t.dueDate) + (t.status !== '完了' ? (d < 0 ? '（' + -d + '日超過）' : d === 0 ? '（今日）' : d <= 3 ? '（あと' + d + '日）' : '') : '') + '</span>';
  }

  // ───────── ホーム ─────────
  function home(main) {
    const st = S.get();
    const docs = st.reports.map((r) => ({ kind: '広告レポート', label: V.reportLabel(r), href: '#/report/' + r.id, d: r })).concat(st.minutes.map((m) => ({ kind: '議事録', label: V.minutesLabel(m), href: '#/minutes/' + m.id, d: m })));
    const waiting = docs.filter((x) => x.d.status === 'review');
    const drafts = docs.filter((x) => x.d.status === 'draft');
    const approved = docs.filter((x) => x.d.status === 'approved');
    const tasks = allTasks().filter(({ t }) => t.status !== '完了');
    const urgent = tasks.filter(({ t }) => t.dueDate && daysBetween(todayIso(), t.dueDate) <= 3).sort((a, b) => (a.t.dueDate < b.t.dueDate ? -1 : 1));
    const unset = tasks.filter(({ t }) => !t.dueDate || t.assignee === M.UNSET);
    const docRow = (x) => '<tr class="clickable" data-href="' + x.href + '"><td><span class="chip">' + x.kind + '</span> ' + esc(x.label) + '</td><td>' + (S.storeById(x.d.storeId) ? U.kindBadge(S.storeById(x.d.storeId).kind) + ' ' + esc(S.storeById(x.d.storeId).name) : '<span class="muted small">—</span>') + '</td><td>' + U.statusBadge(x.d.status) + '</td></tr>';

    main.innerHTML =
      '<h1>ホーム</h1><p class="lead">確認待ちの作成物と、期限が近いタスクをまとめて表示します。</p>' +
      (st.reports.length + st.minutes.length === 0 ? guideHtml() : '') +
      '<div class="cards">' +
      '<div class="card"><div class="muted small">確認待ち</div><div class="big">' + waiting.length + '</div><div class="small muted">承認すると送信用にコピーできます</div></div>' +
      '<div class="card"><div class="muted small">承認済み（未送信）</div><div class="big">' + approved.length + '</div><div class="small muted">送信後に「完了」にします</div></div>' +
      '<div class="card"><div class="muted small">期限3日以内・超過のタスク</div><div class="big">' + urgent.length + '</div><a class="btn small" href="#/tasks">タスク一覧へ</a></div>' +
      '<div class="card"><div class="muted small">担当・期限が未設定のタスク</div><div class="big">' + unset.length + '</div><a class="btn small" href="#/tasks?f=unset">確認する</a></div>' +
      '</div>' +
      '<div class="grid2"><div class="panel"><h2>確認待ち・承認済み</h2>' + (waiting.concat(approved).length ? '<table class="tbl">' + waiting.concat(approved).map(docRow).join('') + '</table>' : '<p class="muted">ありません。</p>') +
      (drafts.length ? '<h3 style="margin-top:14px">下書き</h3><table class="tbl">' + drafts.slice(0, 8).map(docRow).join('') + '</table>' : '') + '</div>' +
      '<div class="panel"><h2>期限が近いタスク</h2>' + (urgent.length ? '<table class="tbl"><thead><tr><th>タスク</th><th>担当</th><th>期限</th></tr></thead>' + urgent.slice(0, 10).map(({ t, m }) => '<tr class="clickable" data-href="#/minutes/' + m.id + '"><td>' + esc(t.text) + '<div class="small muted">' + esc(V.minutesLabel(m)) + '</div></td><td>' + esc(t.assignee) + '</td><td class="nowrap">' + dueBadge(t) + '</td></tr>').join('') + '</table>' : '<p class="muted">期限3日以内のタスクはありません。</p>') + '</div></div>' +
      '<div class="btns"><a class="btn primary" href="#/reports">広告レポートを作る</a><a class="btn primary" href="#/minutes">議事録を整理する</a><a class="btn" href="#/guide">使い方・仕様を見る</a></div>';
    U.$$('[data-href]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = tr.dataset.href; }));
    const ls = U.$('#loadSample', main);
    if (ls) ls.addEventListener('click', () => { root.FS.sample.load(); U.toast('サンプルデータを追加しました', 'ok'); home(main); });
  }

  function guideHtml() {
    return '<div class="panel"><h2>はじめての方へ</h2><ol>' +
      '<li><b>画面左下（スマホは上部）の利用者名</b>が自分になっているか確認します。操作履歴に記録されます。</li>' +
      '<li><b>広告レポート</b>：「新しいレポートを作る」→ 店舗を検索して選ぶ → 期間・目的を入力 → 数値を手入力、またはCSV・画像から取り込む → 右側の出力を確認・編集 → 「確認待ちにする」→「承認する」→「送信用にコピー」。</li>' +
      '<li><b>議事録</b>：「新しい議事録を作る」→ 会議名・日付・参加者を入力 → 文字起こし・メモを貼り付け →「内容を整理する」→ 担当者・期限を確認・修正 → 承認。</li>' +
      '<li>このアプリは<b>外部へ送信・投稿しません</b>。承認後にコピーして、宛先を確認してから手動で送ってください。</li>' +
      '<li>データはこのブラウザに保存されます。定期的に「設定」→「バックアップを書き出す」を行ってください。</li></ol>' +
      '<button class="btn" id="loadSample">サンプルデータで試す</button></div>';
  }

  // ───────── 店舗・案件 ─────────
  function stores(main) {
    const st = S.get();
    const q = sessionStorage.getItem('store-q') || '';
    const list = st.stores.filter((s) => !q || s.name.includes(q) || (s.aliases || []).some((a) => a.includes(q)))
      .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'own' ? -1 : 1));
    main.innerHTML = '<h1>店舗・案件</h1><p class="lead">自社店舗と顧客案件を区別して登録します。区分は作成物の上部に常に表示され、取り違えの確認に使われます。</p>' +
      '<div class="row" style="margin-bottom:12px"><div class="field" style="flex:2 1 220px"><label>店舗名で検索</label><input type="search" id="q" value="' + esc(q) + '"></div><div class="field" style="flex:0 0 auto"><button class="btn primary" id="add">＋ 店舗を追加</button></div></div>' +
      (list.length ? list.map((s) => {
        const ps = st.projects.filter((p) => p.storeId === s.id);
        const nRep = st.reports.filter((r) => r.storeId === s.id).length;
        const nMin = st.minutes.filter((m) => m.storeId === s.id).length;
        return '<div class="panel"><div class="row" style="align-items:center"><div style="flex:1"><h2 style="margin:0">' + esc(s.name) + ' ' + U.kindBadge(s.kind) + '</h2>' +
          '<div class="small muted">' + (s.aliases && s.aliases.length ? '別名：' + esc(s.aliases.join('、')) + '　' : '') + 'レポート' + nRep + '件・議事録' + nMin + '件' + (s.reportTemplate ? '・報告文の形式：登録済み' : '') + '</div>' + (s.memo ? '<div class="small">' + esc(s.memo) + '</div>' : '') + '</div>' +
          '<div class="btns"><button class="btn small" data-edit="' + s.id + '">編集</button><button class="btn small" data-proj="' + s.id + '">＋ 案件</button></div></div>' +
          (ps.length ? '<table class="tbl" style="margin-top:8px"><thead><tr><th>案件名</th><th>担当者</th><th></th></tr></thead>' + ps.map((p) => '<tr><td>' + esc(p.name) + '</td><td>' + esc(p.assignee || '未設定') + '</td><td class="right"><button class="btn small" data-pedit="' + p.id + '">編集</button></td></tr>').join('') + '</table>' : '') + '</div>';
      }).join('') : '<div class="empty">該当する店舗はありません。</div>');

    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('store-q', e.target.value); stores(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$('#add', main).addEventListener('click', () => editStore(null, () => stores(main)));
    U.$$('[data-edit]', main).forEach((b) => b.addEventListener('click', () => editStore(S.storeById(b.dataset.edit), () => stores(main))));
    U.$$('[data-proj]', main).forEach((b) => b.addEventListener('click', () => editProject(null, b.dataset.proj, () => stores(main))));
    U.$$('[data-pedit]', main).forEach((b) => b.addEventListener('click', () => { const p = S.projectById(b.dataset.pedit); editProject(p, p.storeId, () => stores(main)); }));
  }

  async function editStore(store, done) {
    const st = S.get();
    const isNew = !store;
    const s = store || { id: S.uid('store'), name: '', kind: 'client', aliases: [], memo: '', reportTemplate: '', createdAt: Date.now() };
    const res = await U.modal({
      title: isNew ? '店舗を追加' : '店舗を編集',
      body: '<div class="field"><label>店舗名（正式名称）</label><input type="text" id="sn" value="' + esc(s.name) + '"></div>' +
        '<div class="field"><label>区分</label><select id="sk"><option value="client"' + (s.kind === 'client' ? ' selected' : '') + '>顧客案件</option><option value="own"' + (s.kind === 'own' ? ' selected' : '') + '>自社店舗</option></select><div class="hint">自社店舗：' + G.OWN_STORE_NAMES.join('、') + '（指示により変更する場合のみ区分を変えてください）</div></div>' +
        '<div class="field"><label>別名・略称（カンマ区切り。取り違えチェックに使います）</label><input type="text" id="sa" value="' + esc((s.aliases || []).join(', ')) + '"></div>' +
        '<div class="field"><label>メモ（任意）</label><textarea id="sm" style="min-height:60px">' + esc(s.memo) + '</textarea></div>' +
        '<details><summary>この店舗の報告文の形式（任意）</summary><p class="small muted">過去に使った報告文を貼り付け、数値の部分を差し込み項目に置き換えてください。空欄なら標準形式を使います。</p><textarea id="st" class="mono" style="min-height:180px" placeholder="' + esc(R.DEFAULT_TEMPLATE) + '">' + esc(s.reportTemplate) + '</textarea><div class="small muted">差し込み項目：' + R.PLACEHOLDERS.map((p) => esc(p[0])).join(' ') + '</div></details>',
      confirmLabel: isNew ? '追加' : '保存',
      collect: (bg) => ({ name: bg.querySelector('#sn').value.trim(), kind: bg.querySelector('#sk').value, aliases: bg.querySelector('#sa').value.split(/[,、，]/).map((x) => x.trim()).filter(Boolean), memo: bg.querySelector('#sm').value, reportTemplate: bg.querySelector('#st').value }),
    });
    if (!res) return;
    if (!res.name) { U.toast('店舗名を入力してください', 'error'); return; }
    const dup = st.stores.find((x) => x.id !== s.id && x.name === res.name);
    if (dup) { U.toast('同じ名前の店舗が既に登録されています', 'error'); return; }
    if (!isNew && res.kind !== s.kind) {
      const ok = await U.modal({ title: '区分の変更', body: '<p>「' + esc(s.name) + '」の区分を <b>' + G.kindLabel(s.kind) + '</b> から <b>' + G.kindLabel(res.kind) + '</b> に変更します。最新の指示に基づく変更ですか？</p>', check: '指示に基づく変更であることを確認しました', confirmLabel: '変更する', danger: true });
      if (!ok) return;
      S.log('店舗の区分を変更しました', { type: 'store', id: s.id, label: s.name }, G.kindLabel(s.kind) + ' → ' + G.kindLabel(res.kind));
    }
    const before = s.name;
    Object.assign(s, res);
    if (isNew) { st.stores.push(s); S.log('店舗を追加しました', { type: 'store', id: s.id, label: s.name }, G.kindLabel(s.kind)); }
    else S.log('店舗情報を編集しました', { type: 'store', id: s.id, label: s.name }, before !== s.name ? '店舗名：' + before + ' → ' + s.name : '');
    S.save(true);
    done();
  }

  async function editProject(project, storeId, done) {
    const st = S.get();
    const store = S.storeById(storeId);
    const p = project || { id: S.uid('pj'), storeId, name: '', assignee: '', createdAt: Date.now() };
    const res = await U.modal({
      title: (project ? '案件を編集' : '案件を追加') + '：' + store.name,
      body: '<div class="field"><label>案件名</label><input type="text" id="pn" value="' + esc(p.name) + '"></div><div class="field"><label>担当者（任意）</label><input type="text" id="pa" value="' + esc(p.assignee) + '"></div>',
      confirmLabel: '保存',
      collect: (bg) => ({ name: bg.querySelector('#pn').value.trim(), assignee: bg.querySelector('#pa').value.trim() }),
    });
    if (!res || !res.name) return;
    Object.assign(p, res);
    if (!project) st.projects.push(p);
    S.log(project ? '案件を編集しました' : '案件を追加しました', { type: 'project', id: p.id, label: p.name }, '店舗：' + store.name);
    S.save(true);
    done();
  }

  // ───────── タスク一覧 ─────────
  function tasks(main, params) {
    const st = S.get();
    const f = {
      side: sessionStorage.getItem('tk-side') || '',
      store: sessionStorage.getItem('tk-store') || '',
      status: sessionStorage.getItem('tk-status') || 'open',
      q: sessionStorage.getItem('tk-q') || '',
      special: (params && params.get('f')) || '',
    };
    let rows = allTasks().filter(({ t, m }) => {
      if (f.side && t.side !== f.side) return false;
      if (f.store && m.storeId !== f.store) return false;
      if (f.status === 'open' && t.status === '完了') return false;
      if (f.status && f.status !== 'open' && t.status !== f.status) return false;
      if (f.q && !(t.text.includes(f.q) || (t.assignee || '').includes(f.q))) return false;
      if (f.special === 'unset' && !(t.assignee === M.UNSET || !t.dueDate)) return false;
      return true;
    });
    rows.sort((a, b) => (a.t.dueDate || '9999') < (b.t.dueDate || '9999') ? -1 : (a.t.dueDate || '9999') > (b.t.dueDate || '9999') ? 1 : 0);
    const storeOpts = '<option value="">すべて</option>' + st.stores.map((s) => '<option value="' + s.id + '"' + (f.store === s.id ? ' selected' : '') + '>' + esc(s.name) + '</option>').join('');
    main.innerHTML = '<h1>タスク一覧</h1><p class="lead">議事録から登録したタスクを、期限の近い順に表示します。担当者・期限が未入力のものは「未設定」と表示します。</p>' +
      (f.special === 'unset' ? '<div class="alert info">担当者または期限日が未設定のタスクだけを表示しています。<a href="#/tasks">すべて表示</a></div>' : '') +
      '<div class="row" style="margin-bottom:10px"><div class="field"><label>検索</label><input type="search" id="q" value="' + esc(f.q) + '" placeholder="内容・担当者"></div>' +
      '<div class="field"><label>区分</label><select id="side"><option value="">すべて</option>' + Object.keys(M.SIDES).map((k) => '<option value="' + k + '"' + (f.side === k ? ' selected' : '') + '>' + M.SIDES[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>店舗</label><select id="store">' + storeOpts + '</select></div>' +
      '<div class="field"><label>状況</label><select id="status"><option value="open"' + (f.status === 'open' ? ' selected' : '') + '>完了以外</option><option value=""' + (f.status === '' ? ' selected' : '') + '>すべて</option>' + ['未着手', '進行中', '確認待ち', '完了'].map((s) => '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:0 0 auto"><button class="btn" id="csvOut">CSVで書き出す</button></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>期限</th><th>タスク</th><th>区分</th><th>担当者</th><th>必要な素材・情報</th><th>店舗・会議</th><th>状況</th></tr></thead><tbody>' +
        rows.map(({ t, i, m }) => {
          const store = S.storeById(m.storeId);
          return '<tr><td class="nowrap">' + dueBadge(t) + '</td><td>' + esc(t.text) + '</td><td class="nowrap">' + M.SIDES[t.side] + '</td><td>' + (t.assignee === M.UNSET ? '<span class="badge warn">未設定</span>' : esc(t.assignee)) + '</td><td class="small">' + esc(t.materials) + '</td><td class="small">' + (store ? U.kindBadge(store.kind) + ' ' + esc(store.name) + '<br>' : '') + '<a href="#/minutes/' + m.id + '">' + esc(V.minutesLabel(m)) + '</a></td>' +
            '<td><select data-mid="' + m.id + '" data-i="' + i + '">' + ['未着手', '進行中', '確認待ち', '完了'].map((s) => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">該当するタスクはありません。</div>');

    const bindF = (sel, key) => U.$(sel, main).addEventListener(sel === '#q' ? 'input' : 'change', (e) => { sessionStorage.setItem('tk-' + key, e.target.value); tasks(main, params); if (sel === '#q') { const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); } });
    bindF('#q', 'q'); bindF('#side', 'side'); bindF('#store', 'store'); bindF('#status', 'status');
    U.$$('select[data-mid]', main).forEach((sel) => sel.addEventListener('change', () => {
      const m = st.minutes.find((x) => x.id === sel.dataset.mid);
      const t = m.tasks[Number(sel.dataset.i)];
      const before = t.status;
      t.status = sel.value;
      S.log('タスクの状況を変更しました', { type: 'minutes', id: m.id, label: V.minutesLabel(m) }, '「' + t.text.slice(0, 30) + '」' + before + ' → ' + t.status, m);
      S.save(true);
      tasks(main, params);
    }));
    U.$('#csvOut', main).addEventListener('click', () => {
      const q = (s) => '"' + String(s === null || s === undefined ? '' : s).replace(/"/g, '""') + '"';
      const lines = [['期限日', '期限（メモの表記）', 'タスク', '区分', '担当者', '必要な素材・情報', '状況', '店舗', '会議'].map(q).join(',')].concat(rows.map(({ t, m }) => {
        const store = S.storeById(m.storeId);
        return [t.dueDate || '未設定', t.due, t.text, M.SIDES[t.side], t.assignee, t.materials, t.status, store ? store.name : '', V.minutesLabel(m)].map(q).join(',');
      }));
      U.download('タスク一覧_' + todayIso() + '.csv', '﻿' + lines.join('\r\n'), 'text/csv;charset=utf-8');
      S.log('タスク一覧をCSVで書き出しました', { type: 'tasks', id: '', label: 'タスク一覧' }, rows.length + '件');
    });
  }

  // ───────── 操作履歴 ─────────
  function auditLog(main) {
    const st = S.get();
    const q = sessionStorage.getItem('log-q') || '';
    const rows = st.audit.slice().reverse().filter((e) => !q || [e.user, e.action, e.targetLabel, e.detail].join(' ').includes(q)).slice(0, 500);
    const typeLabel = { report: '広告レポート', minutes: '議事録', store: '店舗', project: '案件', settings: '設定', tasks: 'タスク', data: 'データ', campaign: 'インフルエンサー起用', influencer: 'インフルエンサー候補', invoice: '請求書', billing: '請求管理' };
    main.innerHTML = '<h1>操作履歴</h1><p class="lead">誰が・いつ・何を作成・編集・承認したかを記録しています（新しい順、最大500件表示）。</p>' +
      '<div class="row" style="margin-bottom:10px"><div class="field"><label>検索（利用者・操作・対象）</label><input type="search" id="q" value="' + esc(q) + '"></div></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>日時</th><th>利用者</th><th>対象</th><th>操作</th><th>詳細</th></tr></thead><tbody>' +
        rows.map((e) => {
          const href = e.targetType === 'report' ? '#/report/' + e.targetId : e.targetType === 'minutes' ? '#/minutes/' + e.targetId : e.targetType === 'invoice' ? '#/bill/inv/' + e.targetId : e.targetType === 'campaign' ? '#/inf/c/' + e.targetId : e.targetType === 'influencer' && /^cand_/.test(e.targetId || '') ? '#/inf/cand/' + e.targetId : '';
          return '<tr><td class="nowrap small">' + F.fmtDateTime(e.at) + '</td><td class="nowrap">' + esc(e.user) + '</td><td class="small">' + esc(typeLabel[e.targetType] || '') + '<br>' + (href ? '<a href="' + href + '">' + esc(e.targetLabel || '') + '</a>' : esc(e.targetLabel || '')) + '</td><td>' + esc(e.action) + '</td><td class="small muted">' + esc(e.detail) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">履歴はありません。</div>');
    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('log-q', e.target.value); auditLog(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
  }

  // ───────── 設定 ─────────
  function settings(main) {
    const st = S.get();
    const s = st.settings;
    main.innerHTML = '<h1>設定</h1>' +
      '<div class="panel"><h2>利用者</h2><p class="small muted">操作履歴に記録される名前です。作業する人を画面左下（スマホは上部）で切り替えます。</p>' +
      '<div class="field"><label>利用者一覧（1行に1人）</label><textarea id="users" style="min-height:80px">' + esc(s.users.join('\n')) + '</textarea></div>' +
      '<div class="field"><label>報告文の差出人名（{差出人} に入ります）</label><input type="text" id="sender" value="' + esc(s.senderName) + '"></div>' +
      '<button class="btn primary" id="saveUsers">保存</button></div>' +
      '<div class="panel"><h2>AI読み取り・整理（任意）</h2>' +
      '<p class="small">有効にすると、画像からの数値読み取りと議事録の整理に Claude（Anthropic API）を使えます。<b>使うたびに送信確認が表示され、結果はすべて「要確認」の下書き</b>になります。無効のままでも、手入力・CSV取り込み・ルールでの整理ですべての作業ができます。</p>' +
      '<div class="alert warn small">APIキーはこのブラウザ内にだけ保存され、バックアップには含まれません。共用パソコンでは使用しないでください。APIの利用料金は Anthropic の契約に基づき発生します。</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="aiOn"' + (s.ai.enabled ? ' checked' : '') + '> AI読み取り・整理を有効にする</label>' +
      '<div class="field" style="margin-top:8px"><label>Anthropic APIキー</label><input type="password" id="aiKey" value="' + esc(s.ai.apiKey) + '" autocomplete="off" placeholder="sk-ant-..."></div>' +
      '<div class="btns"><button class="btn primary" id="saveAi">保存</button><button class="btn" id="testAi">接続テスト</button></div></div>' +
      '<div class="panel"><h2>データの保存・バックアップ</h2><p class="small">データはこのブラウザ（端末）にだけ保存されています。別の端末で使う場合や、ブラウザのデータを消す前には、バックアップを書き出してください。添付画像はバックアップに含まれません（元ファイルを保管してください）。</p>' +
      '<div class="btns"><button class="btn" id="exp">バックアップを書き出す</button><label class="btn">バックアップを読み込む<input type="file" id="imp" accept=".json,application/json" hidden></label><button class="btn" id="sample">サンプルデータを追加</button><button class="btn danger" id="reset">すべてのデータを消去</button></div></div>';

    U.$('#saveUsers', main).addEventListener('click', () => {
      const users = U.$('#users', main).value.split(/\n/).map((x) => x.trim()).filter(Boolean);
      if (!users.length) { U.toast('利用者を1人以上入力してください', 'error'); return; }
      s.users = users;
      if (!users.includes(s.currentUser)) s.currentUser = users[0];
      s.senderName = U.$('#sender', main).value.trim();
      S.log('利用者・差出人の設定を変更しました', { type: 'settings', id: '', label: '設定' }, '利用者：' + users.join('、'));
      S.save(true);
      U.toast('保存しました', 'ok');
      root.FS.app.renderUser();
    });
    U.$('#saveAi', main).addEventListener('click', () => {
      s.ai.enabled = U.$('#aiOn', main).checked;
      s.ai.apiKey = U.$('#aiKey', main).value.trim();
      if (s.ai.enabled && !s.ai.apiKey) { U.toast('APIキーを入力してください', 'error'); return; }
      S.log('AI設定を変更しました', { type: 'settings', id: '', label: '設定' }, s.ai.enabled ? '有効' : '無効');
      S.save(true);
      U.toast('保存しました', 'ok');
    });
    U.$('#testAi', main).addEventListener('click', async () => {
      try {
        const r = await root.FS.ai.ping(U.$('#aiKey', main).value.trim());
        U.toast('接続できました：' + r, 'ok');
      } catch (e) { U.toast('接続できませんでした：' + e.message, 'error'); }
    });
    U.$('#exp', main).addEventListener('click', () => {
      U.download('FourSeasons業務アシスト_バックアップ_' + todayIso() + '.json', S.exportJson(), 'application/json');
      S.log('バックアップを書き出しました', { type: 'data', id: '', label: 'データ' }, '');
    });
    U.$('#imp', main).addEventListener('change', async (e) => {
      const f = e.target.files[0];
      if (!f) return;
      const ok = await U.modal({ title: 'バックアップの読み込み', body: '<p>現在のデータを「' + esc(f.name) + '」の内容で置き換えます。現在のデータは消えます。先に現在のデータのバックアップを書き出すことをおすすめします。</p>', check: '現在のデータが置き換わることを理解しました', confirmLabel: '読み込む', danger: true });
      if (!ok) return;
      try {
        S.importJson(await f.text());
        S.log('バックアップを読み込みました', { type: 'data', id: '', label: 'データ' }, f.name);
        S.save(true);
        U.toast('読み込みました', 'ok');
        root.FS.app.route();
      } catch (err) { U.toast('読み込めませんでした：' + err.message, 'error'); }
    });
    U.$('#sample', main).addEventListener('click', () => { root.FS.sample.load(); U.toast('サンプルデータを追加しました', 'ok'); location.hash = '#/home'; });
    U.$('#reset', main).addEventListener('click', async () => {
      const ok = await U.modal({ title: 'すべてのデータを消去', body: '<p>店舗・レポート・議事録・操作履歴をすべて消去し、初期状態に戻します。元に戻せません。</p>', check: 'バックアップを書き出した、または消去してよいことを確認しました', confirmLabel: '消去する', danger: true });
      if (!ok) return;
      S.reset();
      U.toast('初期状態に戻しました', 'ok');
      location.hash = '#/home';
      root.FS.app.route();
    });
  }

  V.home = home;
  V.stores = stores;
  V.tasks = tasks;
  V.auditLog = auditLog;
  V.settings = settings;
})(self);
