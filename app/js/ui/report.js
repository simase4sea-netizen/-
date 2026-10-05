/* 画面：広告レポート（一覧・作成） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const C = root.FS.calc;
  const R = root.FS.report;
  const F = root.FS.format;
  const CSV = root.FS.csv;
  const G = root.FS.guard;
  const FILES = root.FS.files;
  const esc = U.esc;

  function newReport(storeId) {
    return {
      id: S.uid('rep'), type: 'report', title: '', storeId: storeId || null, projectId: null,
      periodStart: '', periodEnd: '', objective: '', resultLabel: '',
      metrics: {}, customMetrics: [], hasPrevious: false, previousLabel: '', previous: {},
      attachments: [], findingsText: '', ideasText: '', template: '', textOverride: '',
      status: 'draft', history: [], createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(),
    };
  }

  function labelOf(rep) {
    const st = S.storeById(rep.storeId);
    return rep.title || ((st ? st.name : '店舗未選択') + ' 広告レポート' + (rep.periodStart ? '（' + F.fmtPeriod(rep.periodStart, rep.periodEnd) + '）' : ''));
  }

  function buildOutput(rep) {
    const st = S.get();
    const store = S.storeById(rep.storeId);
    const project = S.projectById(rep.projectId);
    return R.build(rep, store, project, { senderName: st.settings.senderName, stores: st.stores });
  }

  // ───────── 一覧 ─────────
  function list(main) {
    const st = S.get();
    const q = (sessionStorage.getItem('rep-q') || '');
    const fs = (sessionStorage.getItem('rep-status') || '');
    const rows = st.reports.slice().sort((a, b) => b.updatedAt - a.updatedAt).filter((r) => {
      const store = S.storeById(r.storeId);
      if (fs && r.status !== fs) return false;
      if (q && !((store && store.name.includes(q)) || labelOf(r).includes(q))) return false;
      return true;
    });
    main.innerHTML =
      '<h1>広告レポート</h1><p class="lead">広告の数値を入力・取り込みして、指標の計算・所見案・店舗向け報告文を作ります。承認するまで外部には出しません。</p>' +
      '<div class="row" style="margin-bottom:12px"><div class="field" style="flex:2 1 220px"><label>店舗名・件名で検索</label><input type="search" id="q" value="' + esc(q) + '" placeholder="例：77スイーツ"></div>' +
      '<div class="field"><label>ステータス</label><select id="fs"><option value="">すべて</option>' + Object.keys(S.STATUS).map((k) => '<option value="' + k + '"' + (fs === k ? ' selected' : '') + '>' + S.STATUS[k].label + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:0 0 auto"><button class="btn primary" id="new">＋ 新しいレポートを作る</button></div></div>' +
      (rows.length
        ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>店舗・案件</th><th>件名</th><th>配信期間</th><th>ステータス</th><th>更新</th></tr></thead><tbody>' +
          rows.map((r) => {
            const store = S.storeById(r.storeId);
            const pj = S.projectById(r.projectId);
            return '<tr class="clickable" data-id="' + r.id + '"><td>' + (store ? U.kindBadge(store.kind) + ' ' + esc(store.name) : '<span class="badge warn">店舗未選択</span>') + (pj ? '<div class="small muted">' + esc(pj.name) + '</div>' : '') + '</td><td>' + esc(labelOf(r)) + '</td><td class="nowrap">' + esc(F.fmtPeriod(r.periodStart, r.periodEnd) || '未入力') + '</td><td>' + U.statusBadge(r.status) + '</td><td class="small muted nowrap">' + F.fmtDateTime(r.updatedAt) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty">レポートはまだありません。「新しいレポートを作る」から始めてください。</div>');
    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('rep-q', e.target.value); list(main); U.$('#q', main).focus(); const v = U.$('#q', main); v.setSelectionRange(v.value.length, v.value.length); });
    U.$('#fs', main).addEventListener('change', (e) => { sessionStorage.setItem('rep-status', e.target.value); list(main); });
    U.$('#new', main).addEventListener('click', () => {
      const rep = newReport();
      st.reports.push(rep);
      S.log('広告レポートを作成しました', { type: 'report', id: rep.id, label: '新規レポート' }, '', rep);
      S.save(true);
      location.hash = '#/report/' + rep.id;
    });
    U.$$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/report/' + tr.dataset.id; }));
  }

  // ───────── 作成・編集 ─────────
  function edit(main, id) {
    const st = S.get();
    const rep = st.reports.find((r) => r.id === id);
    if (!rep) { main.innerHTML = '<div class="empty">レポートが見つかりません。<a href="#/reports">一覧へ戻る</a></div>'; return; }
    const locked = U.isLocked(rep);
    const target = () => ({ type: 'report', id: rep.id, label: labelOf(rep) });

    main.innerHTML =
      '<div class="sticky-actions"><a class="btn small" href="#/reports">← 一覧</a><div class="grow"><b id="ttl"></b>' + U.statusSteps(rep.status) + '</div><div id="wf" class="btns"></div></div>' +
      '<div id="banner"></div>' +
      (locked ? '<div class="alert info">この レポートは' + S.STATUS[rep.status].label + 'のため編集できません。修正する場合は「修正する（下書きへ戻す）」を押してください。</div>' : '') +
      '<div class="grid2"><div id="left"></div><div id="right"></div></div>' +
      '<div class="panel"><h2>操作履歴</h2>' + U.historyList(rep) + '</div>';

    const left = U.$('#left', main);
    const right = U.$('#right', main);

    // ① 対象と基本情報
    left.innerHTML =
      '<div class="panel"><h2><span class="num">1</span>対象の店舗・案件と基本情報</h2>' +
      '<div class="field"><label>対象の店舗（検索して選択）</label><div id="picker"></div></div>' +
      '<div class="row"><div class="field"><label>案件</label><select id="project"></select></div><div class="field" style="flex:0 0 auto"><button class="btn small" id="newProject">＋ 案件を追加</button></div></div>' +
      '<div class="field"><label>件名（空欄なら自動）</label><input type="text" id="title" value="' + esc(rep.title) + '" placeholder="' + esc(labelOf(Object.assign({}, rep, { title: '' }))) + '"></div>' +
      '<div class="row"><div class="field"><label>配信開始日</label><input type="date" id="ps" value="' + esc(rep.periodStart) + '"></div><div class="field"><label>配信終了日</label><input type="date" id="pe" value="' + esc(rep.periodEnd) + '"></div></div>' +
      '<div class="row"><div class="field"><label>配信目的</label><select id="obj"><option value="">（未入力）</option>' + C.OBJECTIVES.map((o) => '<option' + (rep.objective === o ? ' selected' : '') + '>' + o + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>成果数の内容（成果数を入れる場合）</label><input type="text" id="rl" value="' + esc(rep.resultLabel) + '" placeholder="例：予約数、来店数、メッセージ数"></div></div>' +
      '</div>' +
      // ② 取り込み
      '<div class="panel"><h2><span class="num">2</span>データの取り込み（任意）</h2>' +
      '<div class="tabs"><button data-tab="csv" class="on">CSV・表</button><button data-tab="img">画像（スクリーンショット）</button></div>' +
      '<div data-pane="csv"><p class="small muted">広告管理画面から書き出したCSV、または表計算ソフトからコピーした表を読み込みます。列の対応と集計する行を確認してから取り込みます。</p>' +
      '<div class="dropzone" id="csvDrop">CSVファイルをここにドロップ、またはクリックして選択<input type="file" id="csvFile" accept=".csv,.tsv,.txt,text/csv" hidden></div>' +
      '<div class="field" style="margin-top:10px"><label>または表を貼り付け</label><textarea id="csvPaste" class="mono" placeholder="表計算ソフトでセル範囲をコピーして貼り付け（1行目は見出し）"></textarea></div>' +
      '<button class="btn small" id="csvParse">貼り付けた表を読み込む</button><div id="csvArea" style="margin-top:12px"></div></div>' +
      '<div data-pane="img" hidden><p class="small muted">広告管理画面のスクリーンショットを保存し、画像を見ながら数値を転記します。画像から転記した数値は「要確認」が付きます。</p>' +
      '<div class="dropzone" id="imgDrop">画像をここにドロップ、またはクリックして選択<input type="file" id="imgFile" accept="image/*" multiple hidden></div>' +
      '<div class="thumbs" id="thumbs" style="margin-top:10px"></div></div>' +
      '</div>' +
      // ③ 主要数値
      '<div class="panel"><h2><span class="num">3</span>主要数値（今回）</h2><p class="small muted">分からない数値は空欄のままにしてください（推測で入れない）。読み取りに自信がない数値は「要確認」にチェックを入れます。</p>' +
      '<div class="table-wrap"><table class="tbl" id="mt"></table></div>' +
      '<h3 style="margin-top:14px">追加の項目（任意・計算には使いません）</h3><div id="custom"></div><button class="btn small" id="addCustom">＋ 項目を追加</button></div>' +
      // ④ 前回値
      '<div class="panel"><h2><span class="num">4</span>前回値（任意）</h2>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="hasPrev"' + (rep.hasPrevious ? ' checked' : '') + '> 前回値と比較する</label>' +
      '<p class="small muted">前回値が無い場合は前回比を作りません。</p><div id="prevArea"></div></div>';

    function save(detail) {
      rep.updatedAt = Date.now();
      S.save();
      if (detail) S.log(detail, target(), '', rep);
      refresh();
    }

    // 店舗ピッカー
    function renderPicker() {
      U.storePicker(U.$('#picker', left), {
        value: rep.storeId,
        disabled: locked,
        onChange: async (sid) => {
          if (sid === rep.storeId) return;
          const before = S.storeById(rep.storeId);
          const after = S.storeById(sid);
          if (before && after) {
            const ok = await U.modal({ title: '対象店舗の変更', body: '<p>対象店舗を変更します。入力済みの数値・文面は「' + esc(before.name) + '」のものです。別店舗のデータが混ざらないよう、数値と文面を必ず確認し直してください。</p><p><b>' + esc(before.name) + '</b> → <b>' + esc(after.name) + '</b>（' + G.kindLabel(after.kind) + '）</p>', confirmLabel: '変更する', danger: true });
            if (!ok) { renderPicker(); return; }
          }
          rep.storeId = sid;
          rep.projectId = null;
          renderPicker();
          renderProjects();
          save('対象店舗を「' + (after ? after.name : '未選択') + '」に設定しました');
        },
      });
    }
    function renderProjects() {
      const sel = U.$('#project', left);
      sel.innerHTML = rep.storeId ? U.projectOptions(rep.storeId, rep.projectId) : '<option value="">（先に店舗を選択）</option>';
    }
    renderPicker();
    renderProjects();
    U.$('#project', left).addEventListener('change', (e) => { rep.projectId = e.target.value || null; save('案件を設定しました'); });
    U.$('#newProject', left).addEventListener('click', async () => {
      if (!rep.storeId) { U.toast('先に店舗を選択してください', 'error'); return; }
      const res = await U.modal({ title: '案件を追加', body: '<div class="field"><label>案件名</label><input type="text" id="pn" placeholder="例：2026年10月 Instagram広告"></div><div class="field"><label>担当者（任意）</label><input type="text" id="pa"></div>', confirmLabel: '追加', collect: (bg) => ({ name: bg.querySelector('#pn').value.trim(), assignee: bg.querySelector('#pa').value.trim() }) });
      if (!res || !res.name) return;
      const p = { id: S.uid('pj'), storeId: rep.storeId, name: res.name, assignee: res.assignee, createdAt: Date.now() };
      st.projects.push(p);
      S.log('案件を追加しました', { type: 'project', id: p.id, label: p.name }, '店舗：' + S.storeById(rep.storeId).name);
      rep.projectId = p.id;
      renderProjects();
      save();
    });
    const bindText = (sel, key, logLabel) => {
      const el = U.$(sel, left);
      el.addEventListener('input', () => { rep[key] = el.value; save(); });
      if (logLabel) el.addEventListener('change', () => S.log(logLabel + '：' + (el.value || '空欄'), target(), '', rep));
    };
    bindText('#title', 'title');
    bindText('#ps', 'periodStart', '配信開始日を変更');
    bindText('#pe', 'periodEnd', '配信終了日を変更');
    bindText('#obj', 'objective', '配信目的を変更');
    bindText('#rl', 'resultLabel');

    // タブ
    U.$$('.tabs button', left).forEach((b) => b.addEventListener('click', () => {
      U.$$('.tabs button', left).forEach((x) => x.classList.toggle('on', x === b));
      U.$$('[data-pane]', left).forEach((p) => { p.hidden = p.dataset.pane !== b.dataset.tab; });
    }));

    // 主要数値テーブル
    function metricRow(key, m, prefix) {
      const v = m || {};
      return '<tr class="' + (v.needsCheck ? 'flag' : '') + '"><td class="nowrap"><b>' + esc(C.labelOf(key, rep)) + '</b></td>' +
        '<td style="min-width:120px"><input type="text" inputmode="decimal" data-' + prefix + '="' + key + '" data-f="value" value="' + esc(F.isNum(v.value) ? String(v.value) : '') + '" placeholder="未入力"></td>' +
        '<td class="nowrap"><label class="small"><input type="checkbox" data-' + prefix + '="' + key + '" data-f="needsCheck"' + (v.needsCheck ? ' checked' : '') + '> 要確認</label></td>' +
        '<td style="min-width:140px"><input type="text" data-' + prefix + '="' + key + '" data-f="note" value="' + esc(v.note || '') + '" placeholder="メモ"><div class="small muted">' + (v.source ? '出典：' + esc(v.source) : '') + '</div></td></tr>';
    }
    function renderMetrics() {
      U.$('#mt', left).innerHTML = '<thead><tr><th>項目</th><th>値</th><th></th><th>メモ・出典</th></tr></thead><tbody>' + C.BASE_METRICS.map((m) => metricRow(m.key, rep.metrics[m.key], 'm')).join('') + '</tbody>';
      bindMetricInputs(U.$('#mt', left), 'm', rep.metrics, '');
    }
    function bindMetricInputs(container, prefix, bag, labelPrefix) {
      U.$$('[data-' + prefix + ']', container).forEach((el) => {
        const key = el.dataset[prefix];
        const f = el.dataset.f;
        const evt = el.type === 'checkbox' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          bag[key] = bag[key] || { value: null, source: '', needsCheck: false, note: '' };
          const m = bag[key];
          if (f === 'value') {
            const raw = el.value.trim();
            const n = F.parseNumber(raw);
            el.style.borderColor = raw && n === null ? 'var(--danger)' : '';
            if (raw && n === null) return;
            if (m.source && !/^手入力/.test(m.source) && F.isNum(m.value) && n !== m.value && !m._origin) m._origin = m.source + ' の値 ' + F.fmtRaw(m.value);
            m.value = n;
            m.source = m._origin ? '手入力（' + m._origin + ' から変更）' : (/^画像/.test(m.source) || /^AI/.test(m.source) ? m.source : '手入力');
          } else if (f === 'needsCheck') {
            m.needsCheck = el.checked;
            el.closest('tr').classList.toggle('flag', el.checked);
          } else m[f] = el.value;
          rep.updatedAt = Date.now();
          S.save();
          refresh();
        });
        if (f === 'value') el.addEventListener('change', () => {
          const m = bag[key];
          S.log(labelPrefix + C.labelOf(key, rep) + 'を入力：' + (m && F.isNum(m.value) ? F.fmtRaw(m.value) : '空欄'), target(), m && m.source ? '出典：' + m.source : '', rep);
        });
      });
    }
    renderMetrics();

    // 追加項目
    function renderCustom() {
      const box = U.$('#custom', left);
      box.innerHTML = (rep.customMetrics || []).map((cm, i) =>
        '<div class="row" style="margin-bottom:6px"><div class="field" style="margin:0"><input type="text" data-ci="' + i + '" data-f="label" value="' + esc(cm.label) + '" placeholder="項目名（例：保存数）"></div>' +
        '<div class="field" style="margin:0"><input type="text" data-ci="' + i + '" data-f="value" value="' + esc(cm.value) + '" placeholder="値"></div>' +
        '<label class="small nowrap"><input type="checkbox" data-ci="' + i + '" data-f="needsCheck"' + (cm.needsCheck ? ' checked' : '') + '> 要確認</label>' +
        '<button class="btn small danger" data-del="' + i + '">削除</button></div>').join('');
      U.$$('[data-ci]', box).forEach((el) => el.addEventListener(el.type === 'checkbox' ? 'change' : 'input', () => {
        const cm = rep.customMetrics[Number(el.dataset.ci)];
        cm[el.dataset.f] = el.type === 'checkbox' ? el.checked : el.value;
        save();
      }));
      U.$$('[data-del]', box).forEach((b) => b.addEventListener('click', () => { rep.customMetrics.splice(Number(b.dataset.del), 1); renderCustom(); save('追加項目を削除しました'); }));
    }
    renderCustom();
    U.$('#addCustom', left).addEventListener('click', () => { rep.customMetrics = rep.customMetrics || []; rep.customMetrics.push({ label: '', value: '', needsCheck: false, source: '手入力' }); renderCustom(); save(); });

    // 前回値
    function renderPrev() {
      const area = U.$('#prevArea', left);
      if (!rep.hasPrevious) { area.innerHTML = ''; return; }
      const others = st.reports.filter((r) => r.id !== rep.id && r.storeId && r.storeId === rep.storeId && (r.status === 'approved' || r.status === 'done'));
      area.innerHTML =
        '<div class="row"><div class="field"><label>前回値の出典</label><input type="text" id="prevLabel" value="' + esc(rep.previousLabel) + '" placeholder="例：2026年8月分の報告"></div>' +
        '<div class="field"><label>同じ店舗の承認済みレポートから読み込む</label><select id="prevFrom"><option value="">' + (others.length ? '（選択）' : '（同じ店舗の承認済みレポートがありません）') + '</option>' + others.map((r) => '<option value="' + r.id + '">' + esc(labelOf(r)) + '</option>').join('') + '</select></div></div>' +
        '<div class="table-wrap"><table class="tbl" id="pt"><thead><tr><th>項目</th><th>前回の値</th><th></th><th>メモ・出典</th></tr></thead><tbody>' + C.BASE_METRICS.map((m) => metricRow(m.key, rep.previous[m.key], 'p')).join('') + '</tbody></table></div>';
      bindMetricInputs(U.$('#pt', left), 'p', rep.previous, '前回の');
      U.$('#prevLabel', left).addEventListener('input', (e) => { rep.previousLabel = e.target.value; save(); });
      U.$('#prevFrom', left).addEventListener('change', async (e) => {
        const src = st.reports.find((r) => r.id === e.target.value);
        if (!src) return;
        if (src.storeId !== rep.storeId) { U.toast('別店舗のレポートは読み込めません', 'error'); return; }
        const ok = await U.modal({ title: '前回値の読み込み', body: '<p>「' + esc(labelOf(src)) + '」の数値を前回値として読み込みます。入力済みの前回値は上書きされます。</p>', confirmLabel: '読み込む' });
        if (!ok) { e.target.value = ''; return; }
        rep.previous = {};
        C.BASE_METRICS.forEach((m) => {
          const v = src.metrics[m.key];
          if (v && F.isNum(v.value)) rep.previous[m.key] = { value: v.value, source: '承認済みレポート「' + labelOf(src) + '」', needsCheck: !!v.needsCheck, note: v.needsCheck ? '元レポートで要確認' : '' };
        });
        rep.previousLabel = labelOf(src);
        renderPrev();
        save('前回値を「' + labelOf(src) + '」から読み込みました');
      });
    }
    U.$('#hasPrev', left).addEventListener('change', (e) => { rep.hasPrevious = e.target.checked; renderPrev(); save(e.target.checked ? '前回値との比較を有効にしました' : '前回値との比較をやめました'); });
    renderPrev();

    // CSV 取り込み
    const csvDrop = U.$('#csvDrop', left);
    const csvFile = U.$('#csvFile', left);
    csvDrop.addEventListener('click', () => csvFile.click());
    ['dragover', 'dragenter'].forEach((ev) => csvDrop.addEventListener(ev, (e) => { e.preventDefault(); csvDrop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => csvDrop.addEventListener(ev, () => csvDrop.classList.remove('over')));
    csvDrop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadCsvFile(e.dataTransfer.files[0]); });
    csvFile.addEventListener('change', () => { if (csvFile.files[0]) loadCsvFile(csvFile.files[0]); csvFile.value = ''; });
    U.$('#csvParse', left).addEventListener('click', () => {
      const t = U.$('#csvPaste', left).value;
      if (!t.trim()) { U.toast('表が貼り付けられていません', 'error'); return; }
      showCsv(t, '貼り付けた表');
    });
    async function loadCsvFile(file) {
      const text = await FILES.readText(file);
      const aid = S.uid('att');
      await FILES.put(aid, file);
      rep.attachments.push({ id: aid, name: file.name, type: file.type || 'text/csv', size: file.size, addedAt: Date.now(), kind: 'csv' });
      S.log('CSVを添付しました：' + file.name, target(), '', rep);
      S.save();
      showCsv(text, file.name);
    }

    function showCsv(text, fileName) {
      const rows = CSV.parse(text);
      const area = U.$('#csvArea', left);
      if (rows.length < 2) { area.innerHTML = '<div class="alert danger">表として読み込めませんでした（見出し行とデータ行が必要です）。</div>'; return; }
      const headers = rows[0];
      const data = rows.slice(1);
      const map = CSV.autoMap(headers);
      const hasTotal = data.some((r) => CSV.isTotalRow(r, map));
      const selected = new Set(data.map((r, i) => i).filter((i) => (hasTotal ? CSV.isTotalRow(data[i], map) : true)));
      const fields = C.BASE_METRICS.map((m) => [m.key, C.labelOf(m.key, rep)]).concat([['name', 'キャンペーン名など（取り違え確認用）'], ['start', '開始日'], ['end', '終了日']]);
      const colOpts = (sel) => '<option value="">（使わない）</option>' + headers.map((h, i) => '<option value="' + i + '"' + (sel === i ? ' selected' : '') + '>' + esc(h) + '</option>').join('');

      const draw = () => {
        // 取り違え確認：名前列に別店舗名が含まれていないか
        let warn = '';
        if (map.name !== undefined && rep.storeId) {
          const names = Array.from(selected).map((i) => data[i][map.name]).join('\n');
          const hits = G.findOtherStoreMentions(names, rep.storeId, st.stores);
          if (hits.length) warn = '<div class="alert danger">選択した行に別の店舗名（' + hits.map((h) => esc(h.matched)).join('、') + '）が含まれています。対象店舗「' + esc(S.storeById(rep.storeId).name) + '」のデータか確認してください。</div>';
        }
        if (!rep.storeId) warn = '<div class="alert warn">対象店舗が未選択です。取り込む前に店舗を選んでください。</div>';
        area.innerHTML = '<h3>読み込み結果：' + esc(fileName) + '（' + data.length + '行）</h3>' + warn +
          '<details open><summary class="small">列の対応（自動判定。違っていれば変更）</summary><div class="grid3" style="margin-top:8px">' +
          fields.map(([k, l]) => '<div class="field"><label>' + esc(l) + '</label><select data-map="' + k + '">' + colOpts(map[k]) + '</select></div>').join('') + '</div></details>' +
          '<p class="small muted">集計する行にチェックを入れてください。' + (hasTotal ? '合計行が見つかったため、合計行のみ選択しています。' : '複数行を選ぶと合算します（リーチは重複の可能性があるため要確認になります）。') + '</p>' +
          '<div class="table-wrap" style="max-height:280px;overflow:auto"><table class="tbl small"><thead><tr><th></th>' + headers.map((h) => '<th>' + esc(h) + '</th>').join('') + '</tr></thead><tbody>' +
          data.map((r, i) => '<tr><td><input type="checkbox" data-row="' + i + '"' + (selected.has(i) ? ' checked' : '') + '></td>' + r.map((c) => '<td class="nowrap">' + esc(c) + '</td>').join('') + '</tr>').join('') + '</tbody></table></div>' +
          '<div class="btns" style="margin-top:10px"><button class="btn primary" id="csvApply"' + (locked ? ' disabled' : '') + '>選択した行を主要数値に取り込む</button><button class="btn" id="csvCancel">閉じる</button></div>';
        U.$$('[data-map]', area).forEach((s) => s.addEventListener('change', () => { if (s.value === '') delete map[s.dataset.map]; else map[s.dataset.map] = Number(s.value); draw(); }));
        U.$$('[data-row]', area).forEach((c) => c.addEventListener('change', () => { const i = Number(c.dataset.row); if (c.checked) selected.add(i); else selected.delete(i); draw(); }));
        U.$('#csvCancel', area).addEventListener('click', () => { area.innerHTML = ''; });
        U.$('#csvApply', area).addEventListener('click', applyCsv);
      };

      async function applyCsv() {
        if (!rep.storeId) { U.toast('対象店舗を選択してから取り込んでください', 'error'); return; }
        const idx = Array.from(selected).sort((a, b) => a - b);
        const agg = CSV.aggregate(data, headers, map, idx, fileName, C.BASE_METRICS);
        const keys = Object.keys(agg.metrics);
        if (!keys.length) { U.toast('取り込める数値がありません。列の対応を確認してください。', 'error'); return; }
        const store = S.storeById(rep.storeId);
        const lines = keys.map((k) => {
          const before = rep.metrics[k] && F.isNum(rep.metrics[k].value) ? F.fmtRaw(rep.metrics[k].value) : '未入力';
          return '<tr><td>' + esc(C.labelOf(k, rep)) + '</td><td class="num">' + before + '</td><td class="num"><b>' + F.fmtRaw(agg.metrics[k].value) + '</b></td><td class="small">' + esc(agg.metrics[k].source) + (agg.metrics[k].needsCheck ? '<br><span class="badge warn">要確認</span> ' + esc(agg.metrics[k].note) : '') + '</td></tr>';
        }).join('');
        let periodNote = '';
        if (agg.period.start || agg.period.end) {
          periodNote = '<p>CSVの期間：' + esc(F.fmtPeriod(agg.period.start, agg.period.end)) + (rep.periodStart && (rep.periodStart !== agg.period.start || rep.periodEnd !== agg.period.end) ? '<br><span class="badge warn">入力済みの期間（' + esc(F.fmtPeriod(rep.periodStart, rep.periodEnd)) + '）と異なります。期間は上書きしません。</span>' : rep.periodStart ? '' : '（配信期間に反映します）') + '</p>';
        }
        const ok = await U.modal({
          title: 'CSVの取り込み確認',
          body: '<p>対象：<b>' + esc(store.name) + '</b>（' + G.kindLabel(store.kind) + '）</p>' +
            (agg.warnings.length ? '<div class="alert warn">' + agg.warnings.map(esc).join('<br>') + '</div>' : '') +
            '<div class="table-wrap"><table class="tbl small"><thead><tr><th>項目</th><th class="num">現在</th><th class="num">取り込み後</th><th>出典</th></tr></thead><tbody>' + lines + '</tbody></table></div>' + periodNote,
          check: 'この店舗のデータであることを確認しました',
          confirmLabel: '取り込む',
        });
        if (!ok) return;
        keys.forEach((k) => { rep.metrics[k] = agg.metrics[k]; });
        if (!rep.periodStart && !rep.periodEnd) {
          if (agg.period.start) rep.periodStart = agg.period.start;
          if (agg.period.end) rep.periodEnd = agg.period.end;
          U.$('#ps', left).value = rep.periodStart;
          U.$('#pe', left).value = rep.periodEnd;
        }
        S.log('CSV・表から数値を取り込みました（' + fileName + '）', target(), keys.map((k) => C.labelOf(k, rep) + '=' + F.fmtRaw(agg.metrics[k].value)).join('、'), rep);
        renderMetrics();
        area.innerHTML = '<div class="alert info">取り込みました。「3 主要数値」で値と出典を確認してください。</div>';
        save();
      }
      draw();
    }

    // 画像
    const imgDrop = U.$('#imgDrop', left);
    const imgFile = U.$('#imgFile', left);
    imgDrop.addEventListener('click', () => imgFile.click());
    ['dragover', 'dragenter'].forEach((ev) => imgDrop.addEventListener(ev, (e) => { e.preventDefault(); imgDrop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => imgDrop.addEventListener(ev, () => imgDrop.classList.remove('over')));
    imgDrop.addEventListener('drop', (e) => { e.preventDefault(); addImages(e.dataTransfer.files); });
    imgFile.addEventListener('change', () => { addImages(imgFile.files); imgFile.value = ''; });
    async function addImages(fileList) {
      for (const file of Array.from(fileList)) {
        if (!/^image\//.test(file.type)) continue;
        const aid = S.uid('att');
        await FILES.put(aid, file);
        rep.attachments.push({ id: aid, name: file.name, type: file.type, size: file.size, addedAt: Date.now(), kind: 'image' });
        S.log('画像を添付しました：' + file.name, target(), '', rep);
      }
      S.save();
      renderThumbs();
    }
    async function renderThumbs() {
      const box = U.$('#thumbs', left);
      const imgs = rep.attachments.filter((a) => a.kind === 'image');
      if (!imgs.length) { box.innerHTML = ''; return; }
      box.innerHTML = imgs.map((a) => '<div class="thumb"><img data-aid="' + a.id + '" alt=""><div class="cap">' + esc(a.name) + '<br><button class="btn small" data-open="' + a.id + '">見ながら転記</button> <button class="btn small danger" data-rm="' + a.id + '"' + (locked ? ' disabled' : '') + '>削除</button></div></div>').join('');
      for (const a of imgs) {
        const blob = await FILES.get(a.id);
        const img = box.querySelector('img[data-aid="' + a.id + '"]');
        if (blob && img) img.src = URL.createObjectURL(blob);
        else if (img) img.alt = '（この端末に画像がありません）';
      }
      U.$$('[data-open]', box).forEach((b) => b.addEventListener('click', () => openImage(b.dataset.open)));
      U.$$('img[data-aid]', box).forEach((im) => im.addEventListener('click', () => openImage(im.dataset.aid)));
      U.$$('[data-rm]', box).forEach((b) => b.addEventListener('click', async () => {
        const a = rep.attachments.find((x) => x.id === b.dataset.rm);
        const ok = await U.modal({ title: '画像の削除', body: '<p>「' + esc(a.name) + '」を削除します。</p>', confirmLabel: '削除', danger: true });
        if (!ok) return;
        rep.attachments = rep.attachments.filter((x) => x.id !== a.id);
        await FILES.remove(a.id);
        S.log('画像を削除しました：' + a.name, target(), '', rep);
        S.save();
        renderThumbs();
      }));
    }
    renderThumbs();

    // 画像を見ながら転記するモーダル
    async function openImage(aid) {
      const a = rep.attachments.find((x) => x.id === aid);
      const blob = await FILES.get(aid);
      if (!blob) { U.toast('この端末に画像が保存されていません', 'error'); return; }
      const url = URL.createObjectURL(blob);
      const aiOn = st.settings.ai && st.settings.ai.enabled && st.settings.ai.apiKey;
      const res = await U.modal({
        title: '画像を見ながら転記：' + a.name,
        body: '<div class="grid2"><div><img class="imgview" src="' + url + '" alt=""></div><div>' +
          '<p class="small muted">画像に写っている数値だけを入力してください。写っていない項目は空欄のままにします。ここで入力した数値には「要確認」が付きます。</p>' +
          (aiOn ? '<button class="btn small" id="aiRead"' + (locked ? ' disabled' : '') + '>AIで読み取って下書き入力</button><div id="aiMsg" class="small muted" style="margin:6px 0"></div>' : '<p class="small muted">（設定画面でAI読み取りを有効にすると、画像から数値の下書きを作れます）</p>') +
          C.BASE_METRICS.map((m) => '<div class="field"><label>' + esc(C.labelOf(m.key, rep)) + '</label><input type="text" inputmode="decimal" data-im="' + m.key + '" value="' + esc(rep.metrics[m.key] && F.isNum(rep.metrics[m.key].value) ? rep.metrics[m.key].value : '') + '"' + (locked ? ' disabled' : '') + '><div class="small muted" data-imnote="' + m.key + '"></div></div>').join('') +
          '</div></div>',
        confirmLabel: locked ? null : '入力した値を反映',
        cancelLabel: '閉じる',
        onOpen: (bg) => {
          const btn = bg.querySelector('#aiRead');
          if (!btn) return;
          btn.addEventListener('click', async () => {
            const store = S.storeById(rep.storeId);
            const ok = window.confirm('この画像を Anthropic API（外部サービス）へ送信して数値を読み取ります。\n画像に個人情報・ログイン情報・決済情報が写っていないことを確認しましたか？');
            if (!ok) return;
            const msg = bg.querySelector('#aiMsg');
            msg.textContent = '読み取り中…';
            btn.disabled = true;
            try {
              const out = await root.FS.ai.readAdMetricsFromImage(blob, { storeName: store ? store.name : '' });
              Object.keys(out.metrics).forEach((k) => {
                const v = out.metrics[k];
                const inp = bg.querySelector('[data-im="' + k + '"]');
                if (inp && v && F.isNum(v.value)) { inp.value = v.value; inp.dataset.ai = '1'; }
                const note = bg.querySelector('[data-imnote="' + k + '"]');
                if (note && v) note.textContent = (v.evidence ? '画像の表記：「' + v.evidence + '」' : '') + (v.confident === false ? '（読み取りに自信なし）' : '');
              });
              msg.textContent = 'AIの読み取り結果を入力欄に入れました。画像と見比べて、違う数値は修正してください。' + (out.notes ? ' メモ：' + out.notes : '');
              S.log('AIで画像から数値を読み取りました：' + a.name, target(), '', rep);
            } catch (err) {
              msg.textContent = 'AI読み取りに失敗しました：' + err.message;
            }
            btn.disabled = false;
          });
        },
        collect: (bg) => {
          const vals = {};
          U.$$('[data-im]', bg).forEach((inp) => { vals[inp.dataset.im] = { raw: inp.value.trim(), ai: inp.dataset.ai === '1' }; });
          return { vals };
        },
      });
      URL.revokeObjectURL(url);
      if (!res || !res.vals) return;
      const changed = [];
      Object.keys(res.vals).forEach((k) => {
        const raw = res.vals[k].raw;
        const n = F.parseNumber(raw);
        const cur = rep.metrics[k] && F.isNum(rep.metrics[k].value) ? rep.metrics[k].value : null;
        if (raw === '' && cur === null) return;
        if (n === cur) return;
        if (raw !== '' && n === null) { U.toast(C.labelOf(k, rep) + '「' + raw + '」は数値として読めないため反映しませんでした', 'error'); return; }
        rep.metrics[k] = { value: n, source: (res.vals[k].ai ? 'AI読取・' : '') + '画像「' + a.name + '」から転記', needsCheck: true, note: '画像から転記した数値です。元画像と照合してください' };
        changed.push(C.labelOf(k, rep) + '=' + (n === null ? '空欄' : F.fmtRaw(n)));
      });
      if (changed.length) {
        S.log('画像から数値を転記しました（' + a.name + '）', target(), changed.join('、'), rep);
        renderMetrics();
        save();
      }
    }

    // ───── 右側：出力 ─────
    right.innerHTML =
      '<div class="panel"><h2>出力（自動作成）</h2>' +
      '<div class="out-section"><h3>1. 店舗名・広告期間</h3><div id="o1"></div></div>' +
      '<div class="out-section"><h3>2. 主要数値の一覧</h3><div id="o2"></div></div>' +
      '<div class="out-section"><h3>3. 指標の計算結果</h3><div id="o3"></div></div>' +
      '<div class="out-section"><h3>4. 数値から読み取れること</h3><p class="small muted">自動作成した所見案です。断定を避け、目的と配信条件を踏まえて編集してください。</p><textarea id="o4" style="min-height:150px"></textarea><div class="btns" style="margin-top:6px"><button class="btn small" id="o4reset">自動案に戻す</button></div><details style="margin-top:6px"><summary class="small">所見案の根拠を見る</summary><div id="o4b" class="small"></div></details></div>' +
      '<div class="out-section"><h3>5. 次回に向けた改善案</h3><textarea id="o5" style="min-height:110px"></textarea><div class="btns" style="margin-top:6px"><button class="btn small" id="o5reset">自動案に戻す</button></div></div>' +
      '<div class="out-section"><h3>6. 店舗へ送る報告文</h3>' +
      '<details id="tplBox"><summary class="small">報告文の形式（テンプレート）を変更する</summary><p class="small muted">過去の報告文を貼り付け、数値の部分を {広告費} のような差し込み項目に置き換えると、同じ形式で作成できます。店舗ごとの標準形式は「店舗・案件」画面で登録できます。</p>' +
      '<textarea id="tpl" class="mono" style="min-height:200px"></textarea><div class="btns" style="margin:6px 0"><button class="btn small" id="tplReset">標準形式に戻す</button></div>' +
      '<div class="small muted">差し込み項目：' + R.PLACEHOLDERS.map((p) => '<code title="' + esc(p[1]) + '">' + esc(p[0]) + '</code>').join(' ') + '</div></details>' +
      '<div id="o6warn"></div><textarea id="o6" class="tall"></textarea><div class="btns" style="margin-top:6px"><button class="btn small" id="o6reset">自動生成に戻す</button><span class="small muted">送信は承認後に「送信用にコピー」から行います。</span></div></div>' +
      '<div class="out-section"><h3>7. 要確認事項</h3><div id="o7"></div></div>' +
      '</div>';

    const o4 = U.$('#o4', right), o5 = U.$('#o5', right), o6 = U.$('#o6', right), tpl = U.$('#tpl', right);
    o4.addEventListener('input', () => { rep.findingsText = o4.value; rep.updatedAt = Date.now(); S.save(); refresh(); });
    o5.addEventListener('input', () => { rep.ideasText = o5.value; rep.updatedAt = Date.now(); S.save(); refresh(); });
    o4.addEventListener('change', () => S.log('所見を編集しました', target(), '', rep));
    o5.addEventListener('change', () => S.log('改善案を編集しました', target(), '', rep));
    U.$('#o4reset', right).addEventListener('click', () => { rep.findingsText = ''; save('所見を自動案に戻しました'); });
    U.$('#o5reset', right).addEventListener('click', () => { rep.ideasText = ''; save('改善案を自動案に戻しました'); });
    o6.addEventListener('input', () => { rep.textOverride = o6.value; rep.updatedAt = Date.now(); S.save(); refresh(); });
    o6.addEventListener('change', () => S.log('報告文を手動で編集しました', target(), '', rep));
    U.$('#o6reset', right).addEventListener('click', async () => {
      if (rep.textOverride) {
        const ok = await U.modal({ title: '報告文を作り直す', body: '<p>手動で編集した報告文を破棄し、現在の数値・所見・改善案から作り直します。</p>', confirmLabel: '作り直す', danger: true });
        if (!ok) return;
      }
      rep.textOverride = '';
      save('報告文を自動生成に戻しました');
    });
    const store0 = S.storeById(rep.storeId);
    tpl.value = rep.template || (store0 && store0.reportTemplate) || R.DEFAULT_TEMPLATE;
    tpl.addEventListener('input', () => { rep.template = tpl.value; rep.updatedAt = Date.now(); S.save(); refresh(); });
    tpl.addEventListener('change', () => S.log('報告文の形式を変更しました', target(), '', rep));
    U.$('#tplReset', right).addEventListener('click', () => { rep.template = ''; const s = S.storeById(rep.storeId); tpl.value = (s && s.reportTemplate) || R.DEFAULT_TEMPLATE; save('報告文の形式を標準に戻しました'); });

    let lastOut = null;
    function refresh() {
      const out = buildOutput(rep);
      lastOut = out;
      const store = S.storeById(rep.storeId);
      const project = S.projectById(rep.projectId);
      U.$('#ttl', main).textContent = labelOf(rep);
      U.$('#title', left).placeholder = labelOf(Object.assign({}, rep, { title: '' }));
      U.$('#banner', main).innerHTML = U.targetBanner(store, project, rep.periodStart ? '配信期間：' + esc(F.fmtPeriod(rep.periodStart, rep.periodEnd)) : '');
      U.$('#o1', right).innerHTML = '<table class="tbl"><tr><th>店舗名</th><td>' + (store ? esc(store.name) + ' ' + U.kindBadge(store.kind) : '<span class="badge warn">未選択</span>') + '</td></tr><tr><th>案件</th><td>' + esc(out.header.projectName || '未選択') + '</td></tr><tr><th>広告期間</th><td>' + esc(out.header.period || '未入力') + '</td></tr><tr><th>配信目的</th><td>' + esc(out.header.objective || '未入力') + '</td></tr></table>';
      U.$('#o2', right).innerHTML = out.baseRows.length
        ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>項目</th><th class="num">値</th><th>出典</th></tr></thead><tbody>' + out.baseRows.map((r) => '<tr class="' + (r.needsCheck ? 'flag' : '') + '"><td>' + esc(r.label) + (r.needsCheck ? ' <span class="badge warn">要確認</span>' : '') + '</td><td class="num">' + esc(r.display) + '</td><td class="small">' + esc(r.source) + (r.note ? '<div class="muted">' + esc(r.note) + '</div>' : '') + '</td></tr>').join('') + '</tbody></table></div>'
        : '<p class="muted">まだ数値が入力されていません。</p>';
      let o3 = '<div class="table-wrap"><table class="tbl"><thead><tr><th>指標</th><th class="num">結果</th><th>計算式（使用した数値）</th></tr></thead><tbody>' +
        out.derived.map((d) => '<tr class="' + (d.needsCheck && d.value !== null ? 'flag' : '') + '"><td>' + esc(d.label) + (d.needsCheck && d.value !== null ? ' <span class="badge warn">要確認の数値を使用</span>' : '') + '</td><td class="num nowrap">' + esc(d.value !== null ? d.display : '—') + '</td><td class="formula">' + esc(d.value !== null ? d.formula : d.reason) + '</td></tr>').join('') + '</tbody></table></div>';
      if (rep.hasPrevious) {
        o3 += '<h3 style="margin-top:12px">前回比' + (rep.previousLabel ? '（' + esc(rep.previousLabel) + '）' : '') + '</h3>' + (out.compare.length
          ? '<div class="table-wrap"><table class="tbl"><thead><tr><th>項目</th><th class="num">前回</th><th class="num">今回</th><th class="num">増減</th><th>計算式</th></tr></thead><tbody>' + out.compare.map((r) => '<tr><td>' + esc(r.label) + '</td><td class="num nowrap">' + esc(r.previousDisplay) + '</td><td class="num nowrap">' + esc(r.currentDisplay) + '</td><td class="num nowrap">' + esc(r.changeDisplay) + '</td><td class="formula">' + esc(r.formula) + '</td></tr>').join('') + '</tbody></table></div>'
          : '<p class="muted small">今回と前回の両方に入力された項目がないため、前回比はありません。</p>');
      }
      U.$('#o3', right).innerHTML = o3;
      if (document.activeElement !== o4) o4.value = out.findingsText;
      if (document.activeElement !== o5) o5.value = out.ideasText;
      U.$('#o4b', right).innerHTML = out.findings.length ? '<ul>' + out.findings.map((f) => '<li>' + esc(f.text) + (f.basis ? '<div class="formula">根拠：' + esc(f.basis) + '</div>' : '') + '</li>').join('') + '</ul>' : '<p class="muted">所見案はありません。</p>';
      if (document.activeElement !== o6) o6.value = out.finalText;
      U.$('#o6warn', right).innerHTML = rep.textOverride && rep.textOverride !== out.generatedText ? '<div class="alert warn small">報告文は手動で編集されています。数値・所見を変えても自動では反映されません。</div>' : '';
      U.$('#o7', right).innerHTML = U.checksList(out.checks);
      U.workflow(U.$('#wf', main), rep, {
        type: 'report',
        requireStore: true,
        getStore: () => S.storeById(rep.storeId),
        getChecks: () => buildOutput(rep).checks,
        getLabel: () => labelOf(rep),
        getText: () => buildOutput(rep).finalText,
        onChanged: () => edit(main, rep.id),
      });
    }
    refresh();

    if (locked) {
      U.$$('input, select, textarea, button', left).forEach((el) => {
        if (el.dataset.open || el.closest('.tabs')) return;
        el.disabled = true;
      });
      U.$$('input, select, textarea', right).forEach((el) => { el.readOnly = true; if (el.tagName === 'SELECT') el.disabled = true; });
      U.$$('#o4reset, #o5reset, #o6reset, #tplReset', right).forEach((b) => { b.disabled = true; });
    }
    return lastOut;
  }

  root.FS = root.FS || {};
  root.FS.views = root.FS.views || {};
  root.FS.views.reportList = list;
  root.FS.views.reportEdit = edit;
  root.FS.views.reportLabel = labelOf;
  root.FS.views.newReport = newReport;
})(self);
