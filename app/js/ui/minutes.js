/* 画面：議事録・タスク整理（一覧・作成） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const M = root.FS.minutes;
  const F = root.FS.format;
  const G = root.FS.guard;
  const FILES = root.FS.files;
  const esc = U.esc;

  const CATS = [['decisions', '決定事項'], ['shared', '共有事項'], ['undecided', '未決事項']];

  function newMinutes() {
    return {
      id: S.uid('min'), type: 'minutes', title: '', date: '', participants: '', storeId: null, projectId: null,
      rawText: '', summary: '', decisions: [], shared: [], undecided: [], tasks: [], possibleDuplicates: [],
      extractedAt: null, status: 'draft', history: [], attachments: [], createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(),
    };
  }

  function labelOf(m) {
    return (m.title || '会議名未入力') + (m.date ? '（' + m.date + '）' : '');
  }

  function list(main) {
    const st = S.get();
    const q = sessionStorage.getItem('min-q') || '';
    const rows = st.minutes.slice().sort((a, b) => b.updatedAt - a.updatedAt).filter((m) => {
      const store = S.storeById(m.storeId);
      return !q || labelOf(m).includes(q) || (store && store.name.includes(q)) || (m.participants || '').includes(q);
    });
    main.innerHTML =
      '<h1>議事録・タスク整理</h1><p class="lead">会議の文字起こしやメモから、決定事項・未決事項・共有事項・タスクを分けて整理します。担当者・期限はメモに書かれている場合だけ設定し、無ければ「未設定」にします。</p>' +
      '<div class="row" style="margin-bottom:12px"><div class="field" style="flex:2 1 220px"><label>会議名・店舗名・参加者で検索</label><input type="search" id="q" value="' + esc(q) + '"></div><div class="field" style="flex:0 0 auto"><button class="btn primary" id="new">＋ 新しい議事録を作る</button></div></div>' +
      (rows.length
        ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>会議</th><th>店舗・案件</th><th class="num">タスク</th><th class="num">未決</th><th>ステータス</th><th>更新</th></tr></thead><tbody>' +
          rows.map((m) => {
            const store = S.storeById(m.storeId);
            return '<tr class="clickable" data-id="' + m.id + '"><td>' + esc(labelOf(m)) + '</td><td>' + (store ? U.kindBadge(store.kind) + ' ' + esc(store.name) : '<span class="muted small">指定なし</span>') + '</td><td class="num">' + m.tasks.length + '</td><td class="num">' + m.undecided.length + '</td><td>' + U.statusBadge(m.status) + '</td><td class="small muted nowrap">' + F.fmtDateTime(m.updatedAt) + '</td></tr>';
          }).join('') + '</tbody></table></div>'
        : '<div class="empty">議事録はまだありません。「新しい議事録を作る」から始めてください。</div>');
    U.$('#q', main).addEventListener('input', (e) => { sessionStorage.setItem('min-q', e.target.value); list(main); const v = U.$('#q', main); v.focus(); v.setSelectionRange(v.value.length, v.value.length); });
    U.$('#new', main).addEventListener('click', () => {
      const m = newMinutes();
      st.minutes.push(m);
      S.log('議事録を作成しました', { type: 'minutes', id: m.id, label: '新規議事録' }, '', m);
      S.save(true);
      location.hash = '#/minutes/' + m.id;
    });
    U.$$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/minutes/' + tr.dataset.id; }));
  }

  function edit(main, id) {
    const st = S.get();
    const doc = st.minutes.find((m) => m.id === id);
    if (!doc) { main.innerHTML = '<div class="empty">議事録が見つかりません。<a href="#/minutes">一覧へ戻る</a></div>'; return; }
    const locked = U.isLocked(doc);
    const target = () => ({ type: 'minutes', id: doc.id, label: labelOf(doc) });
    const save = (detail) => { doc.updatedAt = Date.now(); S.save(); if (detail) S.log(detail, target(), '', doc); refreshOutput(); };

    main.innerHTML =
      '<div class="sticky-actions"><a class="btn small" href="#/minutes">← 一覧</a><div class="grow"><b id="ttl"></b>' + U.statusSteps(doc.status) + '</div><div id="wf" class="btns"></div></div>' +
      '<div id="banner"></div>' +
      (locked ? '<div class="alert info">この議事録は' + S.STATUS[doc.status].label + 'のため編集できません。修正する場合は「修正する（下書きへ戻す）」を押してください。</div>' : '') +
      '<div class="panel" id="inp"><h2><span class="num">1</span>会議の情報と内容</h2>' +
      '<div class="row"><div class="field"><label>会議名</label><input type="text" id="title" value="' + esc(doc.title) + '" placeholder="例：10月定例ミーティング"></div><div class="field" style="flex:0 1 180px"><label>会議日</label><input type="date" id="date" value="' + esc(doc.date) + '"></div></div>' +
      '<div class="field"><label>参加者（名前(所属) をカンマ区切り）</label><input type="text" id="participants" value="' + esc(doc.participants) + '" placeholder="例：嶋野成優(Four Seasons), 田中(店舗), 佐藤(デザイナー)"><div class="hint">所属に「Four Seasons」「店舗」と書くと、タスクを「Four Seasons側」「店舗側」に分けます。それ以外は「その他の担当者」になります。</div></div>' +
      '<div class="row"><div class="field"><label>関係する店舗（任意・社内会議なら空欄）</label><div id="picker"></div></div><div class="field"><label>案件（任意）</label><select id="project"></select></div></div>' +
      '<div class="field"><label>文字起こし・メモ</label><textarea id="raw" class="tall" placeholder="会議の文字起こしやメモを貼り付けてください。\n\n書き方のコツ（任意）：\n・行の先頭に「決定：」「未決：」「共有：」「TODO：」を付けると確実に分類されます\n・「嶋野：〜やります」のように話者を書くと担当者を判定できます\n・期限は「10/15まで」のように日付で書くと確実です">' + esc(doc.rawText) + '</textarea></div>' +
      '<div class="row"><div class="field" style="flex:1 1 260px"><div class="dropzone" id="drop">テキストファイル（.txt / .md / .vtt / .srt）をドロップ、またはクリックして選択<input type="file" id="file" accept=".txt,.md,.vtt,.srt,text/plain" hidden></div><div class="hint">音声ファイルは直接読み込めません。会議ツールやスマートフォンの文字起こし機能でテキストにしてから貼り付けてください。</div></div></div>' +
      '<div class="btns"><button class="btn primary" id="extract">内容を整理する（ルールで抽出）</button>' +
      (st.settings.ai && st.settings.ai.enabled && st.settings.ai.apiKey ? '<button class="btn" id="aiExtract">AIで整理する（外部送信あり）</button>' : '') +
      '<span class="small muted" id="exInfo">' + (doc.extractedAt ? '前回の整理：' + F.fmtDateTime(doc.extractedAt) : '') + '</span></div></div>' +
      '<div class="panel" id="res"></div>' +
      '<div class="panel"><h2><span class="num">3</span>出力（共有用テキスト）と確認事項</h2><div class="grid2"><div><h3>議事録テキスト</h3><div class="pre" id="outText"></div></div><div><h3>未決事項・確認事項</h3><div id="outChecks"></div></div></div></div>' +
      '<div class="panel"><h2>操作履歴</h2>' + U.historyList(doc) + '</div>';

    const inp = U.$('#inp', main);
    const bindText = (sel, key, logLabel) => {
      const el = U.$(sel, inp);
      el.addEventListener('input', () => { doc[key] = el.value; save(); });
      if (logLabel) el.addEventListener('change', () => S.log(logLabel, target(), '', doc));
    };
    bindText('#title', 'title', '会議名を変更しました');
    bindText('#date', 'date', '会議日を変更しました');
    bindText('#participants', 'participants', '参加者を変更しました');
    bindText('#raw', 'rawText', '文字起こし・メモを編集しました');

    function renderPicker() {
      U.storePicker(U.$('#picker', inp), {
        value: doc.storeId, disabled: locked,
        onChange: (sid) => { doc.storeId = sid; doc.projectId = null; renderPicker(); renderProjects(); save('関係する店舗を「' + (sid ? S.storeById(sid).name : '指定なし') + '」に設定しました'); },
      });
    }
    function renderProjects() {
      U.$('#project', inp).innerHTML = doc.storeId ? U.projectOptions(doc.storeId, doc.projectId) : '<option value="">（店舗を選ぶと選択できます）</option>';
    }
    renderPicker();
    renderProjects();
    U.$('#project', inp).addEventListener('change', (e) => { doc.projectId = e.target.value || null; save('案件を設定しました'); });

    const drop = U.$('#drop', inp), file = U.$('#file', inp);
    drop.addEventListener('click', () => file.click());
    ['dragover', 'dragenter'].forEach((ev) => drop.addEventListener(ev, (e) => { e.preventDefault(); drop.classList.add('over'); }));
    ['dragleave', 'drop'].forEach((ev) => drop.addEventListener(ev, () => drop.classList.remove('over')));
    drop.addEventListener('drop', (e) => { e.preventDefault(); if (e.dataTransfer.files[0]) loadFile(e.dataTransfer.files[0]); });
    file.addEventListener('change', () => { if (file.files[0]) loadFile(file.files[0]); file.value = ''; });
    async function loadFile(f) {
      if (/^audio\/|^video\//.test(f.type)) { U.toast('音声・動画は読み込めません。文字起こししたテキストを貼り付けてください。', 'error'); return; }
      let text = await FILES.readText(f);
      // 字幕形式（.vtt/.srt）のタイムコードや番号行を除く
      if (/\.(vtt|srt)$/i.test(f.name)) text = text.split(/\r?\n/).filter((l) => !/^WEBVTT/.test(l) && !/-->/.test(l) && !/^\d+$/.test(l.trim())).join('\n');
      if (doc.rawText.trim()) {
        const ok = await U.modal({ title: 'テキストの読み込み', body: '<p>入力済みのメモの後ろに「' + esc(f.name) + '」の内容を追加します。</p>', confirmLabel: '追加する' });
        if (!ok) return;
        doc.rawText += '\n' + text;
      } else doc.rawText = text;
      U.$('#raw', inp).value = doc.rawText;
      save('テキストファイルを読み込みました：' + f.name);
    }

    async function confirmOverwrite() {
      const has = doc.decisions.length + doc.shared.length + doc.undecided.length + doc.tasks.length;
      if (!has) return true;
      return U.modal({ title: '整理し直す', body: '<p>現在の整理結果（編集した内容を含む）を、メモから抽出し直した結果で置き換えます。</p>', confirmLabel: '置き換える', danger: true });
    }

    U.$('#extract', inp).addEventListener('click', async () => {
      if (!doc.rawText.trim()) { U.toast('文字起こし・メモを入力してください', 'error'); return; }
      if (!(await confirmOverwrite())) return;
      const r = M.extract(doc.rawText, { date: doc.date, participants: doc.participants });
      applyExtract(r, 'ルール');
    });
    const aiBtn = U.$('#aiExtract', inp);
    if (aiBtn) aiBtn.addEventListener('click', async () => {
      if (!doc.rawText.trim()) { U.toast('文字起こし・メモを入力してください', 'error'); return; }
      const ok = await U.modal({ title: 'AIで整理する', body: '<p>会議の内容を Anthropic API（外部サービス）へ送信して整理します。個人情報・ログイン情報・決済情報が含まれていないか確認してください。結果はすべて下書きとして表示され、確認が必要です。</p>', check: '送信して問題ない内容であることを確認しました', confirmLabel: '送信して整理する' });
      if (!ok) return;
      if (!(await confirmOverwrite())) return;
      aiBtn.disabled = true;
      aiBtn.textContent = 'AIで整理中…';
      try {
        const r = await root.FS.ai.extractMinutes(doc.rawText, { date: doc.date, participants: doc.participants, title: doc.title });
        applyExtract(r, 'AI');
      } catch (e) {
        U.toast('AIでの整理に失敗しました：' + e.message, 'error');
      }
      aiBtn.disabled = false;
      aiBtn.textContent = 'AIで整理する（外部送信あり）';
    });

    function applyExtract(r, how) {
      doc.decisions = r.decisions;
      doc.shared = r.shared;
      doc.undecided = r.undecided;
      doc.tasks = r.tasks;
      doc.possibleDuplicates = r.possibleDuplicates || [];
      if (r.summary) doc.summary = r.summary;
      else doc.summary = M.draftSummary(doc);
      doc.extractedAt = Date.now();
      U.$('#exInfo', inp).textContent = '前回の整理：' + F.fmtDateTime(doc.extractedAt) + '（' + how + '）';
      S.log('メモから内容を整理しました（' + how + '）', target(), '決定' + doc.decisions.length + '件・タスク' + doc.tasks.length + '件・未決' + doc.undecided.length + '件・共有' + doc.shared.length + '件', doc);
      renderResults();
      save();
    }

    // ───── 整理結果の編集 ─────
    function renderResults() {
      const res = U.$('#res', main);
      const dis = locked ? ' disabled' : '';
      const itemList = (key, title) => '<h3 style="margin-top:14px">' + title + '（' + doc[key].length + '件）</h3>' +
        (doc[key].length ? doc[key].map((it, i) =>
          '<div class="row" style="margin-bottom:6px;align-items:center"><div class="field" style="flex:5 1 300px;margin:0"><input type="text" data-item="' + key + '" data-i="' + i + '" value="' + esc(it.text) + '"' + dis + '></div>' +
          '<select data-move="' + key + '" data-i="' + i + '" style="flex:0 0 130px"' + dis + '>' + CATS.map(([k, l]) => '<option value="' + k + '"' + (k === key ? ' selected' : '') + '>' + l + '</option>').join('') + '<option value="tasks">タスクにする</option></select>' +
          '<span class="small muted nowrap" title="' + esc(it.sourceText || '') + '">' + (it.sourceLine ? 'メモ' + it.sourceLine + '行目' : '手動追加') + '</span>' +
          '<button class="btn small danger" data-delitem="' + key + '" data-i="' + i + '"' + dis + '>削除</button></div>').join('') : '<p class="muted small">なし</p>') +
        '<button class="btn small" data-add="' + key + '"' + dis + '>＋ 追加</button>';

      const sideBlock = (side) => {
        const ts = doc.tasks.map((t, i) => [t, i]).filter(([t]) => t.side === side);
        return '<div class="side-h"><h3 style="margin:0">' + M.SIDES[side] + 'のタスク</h3><span class="count">' + ts.length + '件</span></div>' +
          (ts.length ? '<div class="table-wrap"><table class="tbl"><thead><tr><th style="min-width:240px">内容</th><th>区分</th><th>担当者</th><th>期限（メモの表記）</th><th>期限日</th><th>必要な素材・情報</th><th>状況</th><th></th></tr></thead><tbody>' +
            ts.map(([t, i]) => {
              const dup = doc.possibleDuplicates.some((d) => d.a === t.id || d.b === t.id);
              return '<tr class="' + (t.assignee === M.UNSET || t.due === M.UNSET || t.dueNeedsCheck || dup ? 'flag' : '') + '">' +
                '<td><input type="text" data-t="' + i + '" data-f="text" value="' + esc(t.text) + '"' + dis + '><div class="small muted" title="' + esc(t.sourceText || '') + '">' + (t.sourceLines && t.sourceLines.length ? 'メモ' + t.sourceLines.join('・') + '行目' : '手動追加') + (dup ? '　<span class="badge warn">重複の可能性</span>' : '') + '</div></td>' +
                '<td><select data-t="' + i + '" data-f="side"' + dis + '>' + Object.keys(M.SIDES).map((k) => '<option value="' + k + '"' + (k === t.side ? ' selected' : '') + '>' + M.SIDES[k] + '</option>').join('') + '</select></td>' +
                '<td><input type="text" data-t="' + i + '" data-f="assignee" value="' + esc(t.assignee) + '" style="min-width:90px"' + dis + '></td>' +
                '<td><input type="text" data-t="' + i + '" data-f="due" value="' + esc(t.due) + '" style="min-width:90px"' + dis + '>' + (t.dueNeedsCheck ? '<div class="small" style="color:var(--warn)">要確認' + (t.dueNote ? '：' + esc(t.dueNote) : '') + '</div>' : '') + '</td>' +
                '<td><input type="date" data-t="' + i + '" data-f="dueDate" value="' + esc(t.dueDate || '') + '"' + dis + '></td>' +
                '<td><input type="text" data-t="' + i + '" data-f="materials" value="' + esc(t.materials) + '" style="min-width:110px"' + dis + '></td>' +
                '<td><select data-t="' + i + '" data-f="status"' + dis + '>' + ['未着手', '進行中', '確認待ち', '完了'].map((s) => '<option' + (s === t.status ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></td>' +
                '<td><button class="btn small danger" data-deltask="' + i + '"' + dis + '>削除</button></td></tr>';
            }).join('') + '</tbody></table></div>' : '<p class="muted small">なし</p>');
      };

      const dupHtml = doc.possibleDuplicates.length ? '<div class="alert warn">同じ内容の可能性があるタスクがあります。' + doc.possibleDuplicates.map((d, k) => {
        const a = doc.tasks.find((t) => t.id === d.a), b = doc.tasks.find((t) => t.id === d.b);
        if (!a || !b) return '';
        return '<div style="margin-top:6px">「' + esc(a.text) + '」と「' + esc(b.text) + '」 <button class="btn small" data-merge="' + k + '"' + dis + '>1つにまとめる</button> <button class="btn small" data-keep="' + k + '"' + dis + '>別のタスクとして残す</button></div>';
      }).join('') + '</div>' : '';

      res.innerHTML = '<h2><span class="num">2</span>整理結果（確認・編集）</h2>' +
        (doc.extractedAt ? '' : '<div class="alert info">上の「内容を整理する」を押すと、ここに整理結果が表示されます。手動で追加することもできます。</div>') +
        '<h3>議事録の要約</h3><textarea id="summary"' + dis + '>' + esc(doc.summary) + '</textarea><div class="btns" style="margin-top:6px"><button class="btn small" id="sumDraft"' + dis + '>整理結果から要約の下書きを作る</button><span class="small muted">要約は件数と決定事項から機械的に作った下書きです。必要に応じて書き直してください。</span></div>' +
        itemList('decisions', '決定事項') +
        '<h3 style="margin-top:18px">タスク（' + doc.tasks.length + '件）</h3>' + dupHtml +
        sideBlock('fs') + sideBlock('store') + sideBlock('other') +
        '<button class="btn small" id="addTask"' + dis + '>＋ タスクを追加</button>' +
        itemList('undecided', '未決事項') +
        itemList('shared', '共有事項');

      U.$('#summary', res).addEventListener('input', (e) => { doc.summary = e.target.value; save(); });
      U.$('#summary', res).addEventListener('change', () => S.log('要約を編集しました', target(), '', doc));
      U.$('#sumDraft', res).addEventListener('click', () => { doc.summary = M.draftSummary(doc); renderResults(); save('要約の下書きを作成しました'); });
      U.$$('[data-item]', res).forEach((el) => {
        el.addEventListener('input', () => { doc[el.dataset.item][Number(el.dataset.i)].text = el.value; save(); });
        el.addEventListener('change', () => S.log('項目を編集しました', target(), el.value, doc));
      });
      U.$$('[data-move]', res).forEach((el) => el.addEventListener('change', () => {
        const from = el.dataset.move, i = Number(el.dataset.i), to = el.value;
        const it = doc[from].splice(i, 1)[0];
        if (to === 'tasks') {
          doc.tasks.push({ id: S.uid('t'), text: it.text, side: 'other', assignee: M.UNSET, due: M.UNSET, dueDate: null, dueNeedsCheck: false, dueNote: '', materials: M.extractMaterials(it.text), status: '未着手', sourceLines: it.sourceLine ? [it.sourceLine] : [], sourceText: it.sourceText || '' });
        } else doc[to].push(it);
        renderResults();
        save('「' + it.text.slice(0, 20) + '」の分類を変更しました');
      }));
      U.$$('[data-delitem]', res).forEach((b) => b.addEventListener('click', () => {
        const it = doc[b.dataset.delitem].splice(Number(b.dataset.i), 1)[0];
        renderResults();
        save('項目を削除しました：' + it.text.slice(0, 30));
      }));
      U.$$('[data-add]', res).forEach((b) => b.addEventListener('click', () => { doc[b.dataset.add].push({ id: S.uid('i'), text: '', sourceLine: null }); renderResults(); save(); }));
      U.$$('[data-t]', res).forEach((el) => {
        const evt = el.tagName === 'SELECT' || el.type === 'date' ? 'change' : 'input';
        el.addEventListener(evt, () => {
          const t = doc.tasks[Number(el.dataset.t)];
          const f = el.dataset.f;
          t[f] = el.value;
          if (f === 'dueDate') { t.dueDate = el.value || null; if (el.value) { t.dueNeedsCheck = false; if (t.due === M.UNSET) t.due = el.value; } }
          if (f === 'due' && !el.value.trim()) t.due = M.UNSET;
          if (f === 'assignee') { t.assigneeRule = 'manual'; if (!el.value.trim()) t.assignee = M.UNSET; }
          if (f === 'side' || f === 'dueDate' || f === 'status') { renderResults(); save('タスクを編集しました（' + t.text.slice(0, 20) + '）'); return; }
          save();
        });
        if (evt === 'input') el.addEventListener('change', () => S.log('タスクを編集しました（' + doc.tasks[Number(el.dataset.t)].text.slice(0, 20) + '）', target(), '', doc));
      });
      U.$$('[data-deltask]', res).forEach((b) => b.addEventListener('click', () => {
        const t = doc.tasks.splice(Number(b.dataset.deltask), 1)[0];
        doc.possibleDuplicates = doc.possibleDuplicates.filter((d) => d.a !== t.id && d.b !== t.id);
        renderResults();
        save('タスクを削除しました：' + t.text.slice(0, 30));
      }));
      U.$('#addTask', res).addEventListener('click', () => {
        doc.tasks.push({ id: S.uid('t'), text: '', side: 'fs', assignee: M.UNSET, due: M.UNSET, dueDate: null, dueNeedsCheck: false, dueNote: '', materials: M.UNSET, status: '未着手', sourceLines: [], sourceText: '' });
        renderResults();
        save();
      });
      U.$$('[data-merge]', res).forEach((b) => b.addEventListener('click', () => {
        const d = doc.possibleDuplicates[Number(b.dataset.merge)];
        const a = doc.tasks.find((t) => t.id === d.a), c = doc.tasks.find((t) => t.id === d.b);
        a.sourceLines = Array.from(new Set((a.sourceLines || []).concat(c.sourceLines || [])));
        if (a.assignee === M.UNSET) a.assignee = c.assignee;
        if (a.due === M.UNSET) { a.due = c.due; a.dueDate = c.dueDate; a.dueNeedsCheck = c.dueNeedsCheck; a.dueNote = c.dueNote; }
        if (a.materials === M.UNSET) a.materials = c.materials;
        doc.tasks = doc.tasks.filter((t) => t.id !== c.id);
        doc.possibleDuplicates = doc.possibleDuplicates.filter((x) => x.a !== c.id && x.b !== c.id);
        renderResults();
        save('重複の可能性があるタスクを1つにまとめました');
      }));
      U.$$('[data-keep]', res).forEach((b) => b.addEventListener('click', () => {
        doc.possibleDuplicates.splice(Number(b.dataset.keep), 1);
        renderResults();
        save('別のタスクとして残しました');
      }));
    }

    function checksFor() {
      const checks = M.collectChecks(doc);
      if (doc.storeId) {
        const hits = G.findOtherStoreMentions(doc.rawText + '\n' + doc.tasks.map((t) => t.text).join('\n'), doc.storeId, st.stores);
        hits.forEach((h) => checks.push('メモに別の店舗名「' + h.matched + '」（' + G.kindLabel(h.kind) + '）が出てきます。その店舗のタスクが混ざっていないか確認してください。'));
      }
      return checks;
    }

    function outputText() {
      const store = S.storeById(doc.storeId);
      return M.toText(doc, store ? store.name : '');
    }

    function refreshOutput() {
      const store = S.storeById(doc.storeId);
      U.$('#ttl', main).textContent = labelOf(doc);
      U.$('#banner', main).innerHTML = store ? U.targetBanner(store, S.projectById(doc.projectId)) : '<div class="target"><div class="grow"><div class="tsub">関係する店舗</div><div class="tname">指定なし（社内会議など）</div></div></div>';
      U.$('#outText', main).textContent = outputText();
      const und = doc.undecided.map((u) => u.text);
      U.$('#outChecks', main).innerHTML = (und.length ? '<h3>未決事項</h3><ul>' + und.map((u) => '<li>' + esc(u) + '</li>').join('') + '</ul>' : '') + '<h3>確認が必要な箇所</h3>' + U.checksList(checksFor());
      U.workflow(U.$('#wf', main), doc, {
        type: 'minutes',
        requireStore: false,
        getStore: () => S.storeById(doc.storeId),
        getChecks: checksFor,
        getLabel: () => labelOf(doc),
        getText: outputText,
        onChanged: () => edit(main, doc.id),
      });
    }

    renderResults();
    refreshOutput();
    if (locked) U.$$('input, select, textarea, #extract, #aiExtract', inp).forEach((el) => { el.disabled = true; });
  }

  root.FS = root.FS || {};
  root.FS.views = root.FS.views || {};
  root.FS.views.minutesList = list;
  root.FS.views.minutesEdit = edit;
  root.FS.views.minutesLabel = labelOf;
})(self);
