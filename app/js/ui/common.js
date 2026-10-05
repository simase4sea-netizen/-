/* 画面共通部品：エスケープ、トースト、確認画面、店舗ピッカー、ステータス操作、履歴表示 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const G = root.FS.guard;
  const F = root.FS.format;

  function esc(s) {
    return String(s === null || s === undefined ? '' : s).replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
  }

  function $(sel, el) { return (el || document).querySelector(sel); }
  function $$(sel, el) { return Array.from((el || document).querySelectorAll(sel)); }

  function toast(msg, type) {
    let box = document.getElementById('toast');
    if (!box) { box = document.createElement('div'); box.id = 'toast'; document.body.appendChild(box); }
    const t = document.createElement('div');
    t.className = 'toast ' + (type || '');
    t.textContent = msg;
    box.appendChild(t);
    setTimeout(() => t.remove(), type === 'error' ? 6000 : 3000);
  }

  // 確認画面。opts.check に文言を入れると、チェックを入れるまで確定ボタンを押せない。
  function modal(opts) {
    return new Promise((resolve) => {
      const bg = document.createElement('div');
      bg.className = 'modal-bg';
      bg.innerHTML =
        '<div class="modal" role="dialog" aria-modal="true">' +
        '<h2>' + esc(opts.title || '確認') + '</h2>' +
        '<div class="modal-body">' + (opts.body || '') + '</div>' +
        (opts.check ? '<label style="display:flex;gap:8px;align-items:flex-start;margin-top:12px;font-weight:600"><input type="checkbox" id="mdl-check" style="margin-top:5px"> <span>' + esc(opts.check) + '</span></label>' : '') +
        '<div class="foot">' +
        (opts.hideCancel ? '' : '<button class="btn" data-act="cancel">' + esc(opts.cancelLabel || 'キャンセル') + '</button>') +
        (opts.confirmLabel === null ? '' : '<button class="btn ' + (opts.danger ? 'danger' : 'primary') + '" data-act="ok">' + esc(opts.confirmLabel || 'OK') + '</button>') +
        '</div></div>';
      document.body.appendChild(bg);
      const ok = bg.querySelector('[data-act=ok]');
      const chk = bg.querySelector('#mdl-check');
      if (chk && ok) { ok.disabled = true; chk.addEventListener('change', () => { ok.disabled = !chk.checked; }); }
      const close = (val) => { bg.remove(); document.removeEventListener('keydown', onKey); resolve(val); };
      const onKey = (e) => { if (e.key === 'Escape') close(false); };
      document.addEventListener('keydown', onKey);
      bg.addEventListener('click', (e) => {
        if (e.target === bg) return close(false);
        const act = e.target.closest('[data-act]');
        if (!act) return;
        if (act.dataset.act === 'cancel') return close(false);
        if (act.dataset.act === 'ok') {
          if (opts.collect) return close(opts.collect(bg) || true);
          return close(true);
        }
      });
      if (opts.onOpen) opts.onOpen(bg);
      setTimeout(() => { if (bg.contains(document.activeElement)) return; const f = bg.querySelector('input:not([type=checkbox]),textarea,select'); if (f) f.focus(); }, 30);
    });
  }

  function kindBadge(kind) {
    return '<span class="badge ' + (kind === 'own' ? 'own' : 'client') + '">' + G.kindLabel(kind) + '</span>';
  }

  function statusBadge(status) {
    const s = S.STATUS[status] || S.STATUS.draft;
    return '<span class="badge ' + s.cls + '">' + s.label + '</span>';
  }

  function statusSteps(status) {
    const order = ['draft', 'review', 'approved', 'done'];
    const cur = order.indexOf(status);
    return '<div class="steps">' + order.map((k, i) => '<span class="' + (i === cur ? 'on' : i < cur ? 'past' : '') + '">' + S.STATUS[k].label + '</span>').join('') + '</div>';
  }

  function isLocked(doc) { return doc.status === 'approved' || doc.status === 'done'; }

  // 対象店舗バナー：作業中の店舗・区分を常に大きく表示する
  function targetBanner(store, project, extra) {
    if (!store) {
      return '<div class="target none"><div class="grow"><div class="tname">店舗・案件が未選択です</div><div class="tsub">下の「対象の店舗・案件」で選んでください。選ぶまで承認できません。</div></div></div>';
    }
    return '<div class="target ' + (store.kind === 'own' ? 'own' : 'client') + '">' +
      '<div class="grow"><div class="tsub">作業中の対象</div><div class="tname">' + esc(store.name) + ' ' + kindBadge(store.kind) + '</div>' +
      '<div class="tsub">案件：' + (project ? esc(project.name) : '（未選択）') + (extra ? '　' + extra : '') + '</div></div></div>';
  }

  // 検索して選べる店舗ピッカー
  function storePicker(el, opts) {
    const st = S.get();
    const current = S.storeById(opts.value);
    el.innerHTML =
      '<div class="picker"><input type="search" placeholder="店舗名で検索（例：出世魚）" value="' + esc(current ? current.name : '') + '" ' + (opts.disabled ? 'disabled' : '') + ' autocomplete="off"><div class="picker-list" hidden></div></div>';
    const input = el.querySelector('input');
    const list = el.querySelector('.picker-list');
    let items = [];
    let hl = -1;
    const render = () => {
      const q = input.value.trim();
      items = st.stores.filter((s) => !q || s.name.includes(q) || (s.aliases || []).some((a) => a.includes(q)))
        .sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'own' ? -1 : 1));
      list.innerHTML = items.length
        ? items.map((s, i) => '<div class="picker-item' + (i === hl ? ' hl' : '') + '" data-i="' + i + '">' + kindBadge(s.kind) + ' ' + esc(s.name) + '</div>').join('')
        : '<div class="picker-item muted">該当する店舗がありません（「店舗・案件」画面で登録できます）</div>';
      list.hidden = false;
    };
    const choose = (s) => {
      list.hidden = true;
      input.value = s ? s.name : '';
      opts.onChange(s ? s.id : null);
    };
    input.addEventListener('focus', () => { input.select(); hl = -1; render(); });
    input.addEventListener('input', () => { hl = 0; render(); });
    input.addEventListener('keydown', (e) => {
      if (list.hidden) return;
      if (e.key === 'ArrowDown') { hl = Math.min(items.length - 1, hl + 1); render(); e.preventDefault(); }
      else if (e.key === 'ArrowUp') { hl = Math.max(0, hl - 1); render(); e.preventDefault(); }
      else if (e.key === 'Enter') { if (items[hl]) choose(items[hl]); e.preventDefault(); }
      else if (e.key === 'Escape') { list.hidden = true; }
    });
    list.addEventListener('mousedown', (e) => {
      const it = e.target.closest('[data-i]');
      if (it) { e.preventDefault(); choose(items[Number(it.dataset.i)]); }
    });
    input.addEventListener('blur', () => {
      setTimeout(() => {
        list.hidden = true;
        const cur = S.storeById(opts.value);
        // 入力途中のまま離れた場合は、選択済みの店舗名に戻す（曖昧な入力で別店舗にならないように）
        input.value = cur ? cur.name : '';
      }, 150);
    });
  }

  function projectOptions(storeId, selected) {
    const ps = S.get().projects.filter((p) => p.storeId === storeId);
    return '<option value="">（案件を選択）</option>' + ps.map((p) => '<option value="' + esc(p.id) + '"' + (p.id === selected ? ' selected' : '') + '>' + esc(p.name) + '</option>').join('');
  }

  async function copyText(text) {
    try {
      await navigator.clipboard.writeText(text);
      return true;
    } catch (e) {
      const ta = document.createElement('textarea');
      ta.value = text;
      document.body.appendChild(ta);
      ta.select();
      let ok = false;
      try { ok = document.execCommand('copy'); } catch (e2) { ok = false; }
      ta.remove();
      return ok;
    }
  }

  function download(name, text, type) {
    const blob = new Blob([text], { type: type || 'text/plain;charset=utf-8' });
    const a = document.createElement('a');
    a.href = URL.createObjectURL(blob);
    a.download = name;
    document.body.appendChild(a);
    a.click();
    setTimeout(() => { URL.revokeObjectURL(a.href); a.remove(); }, 500);
  }

  function historyList(doc) {
    const h = (doc.history || []).slice().reverse();
    if (!h.length) return '<p class="muted small">まだ履歴はありません。</p>';
    return '<ul class="history">' + h.map((e) => '<li><span class="muted">' + F.fmtDateTime(e.at) + '</span>　<span class="who">' + esc(e.user) + '</span>　' + esc(e.action) + (e.detail ? '<div class="muted">' + esc(e.detail) + '</div>' : '') + '</li>').join('') + '</ul>';
  }

  function checksList(checks) {
    if (!checks.length) return '<ul class="checks ok"><li>現時点で確認が必要な箇所は見つかっていません（最終確認は必ず目視で行ってください）。</li></ul>';
    return '<ul class="checks">' + checks.map((c) => '<li>' + esc(c) + '</li>').join('') + '</ul>';
  }

  // ステータス操作（下書き→確認待ち→承認済み→完了）。外部送信はアプリから行わず、承認後に「送信用にコピー」する。
  function workflow(el, doc, opts) {
    const st = doc.status || 'draft';
    const b = [];
    if (st === 'draft') b.push('<button class="btn primary" data-wf="review">確認待ちにする</button>');
    if (st === 'review') {
      b.push('<button class="btn ok" data-wf="approve">承認する</button>');
      b.push('<button class="btn" data-wf="back">差し戻す（下書きへ）</button>');
    }
    if (st === 'approved' || st === 'done') {
      b.push('<button class="btn primary" data-wf="copy">送信用にコピー</button>');
      if (st === 'approved') b.push('<button class="btn ok" data-wf="done">送信済み・完了にする</button>');
      b.push('<button class="btn" data-wf="reopen">修正する（下書きへ戻す）</button>');
    }
    el.innerHTML = statusBadge(st) + ' ' + b.join(' ');
    el.querySelectorAll('[data-wf]').forEach((btn) => btn.addEventListener('click', () => act(btn.dataset.wf)));

    async function act(kind) {
      const store = opts.getStore();
      const checks = opts.getChecks();
      const target = { type: opts.type, id: doc.id, label: opts.getLabel() };
      const storeLine = opts.targetHtml ? opts.targetHtml() : store
        ? '<div class="confirm-target ' + (store.kind === 'own' ? 'badge own' : 'badge client') + '" style="display:block">' + esc(store.name) + '（' + G.kindLabel(store.kind) + '）</div>'
        : '<div class="alert danger">店舗・案件が選択されていません。</div>';

      if (kind === 'review') {
        if (opts.requireStore && !store) { toast('店舗・案件を選択してください', 'error'); return; }
        doc.status = 'review';
        S.log('確認待ちにしました', target, '', doc);
      } else if (kind === 'approve') {
        if (opts.requireStore && !store) { toast('店舗・案件が未選択のため承認できません', 'error'); return; }
        const ok = await modal({
          title: '承認の確認',
          body: '<p>次の対象の内容を承認します。承認後は編集できなくなり、「送信用にコピー」が使えるようになります。</p>' + storeLine +
            '<p class="small">件名：' + esc(opts.getLabel()) + '<br>承認者：' + esc(S.user()) + '</p>' +
            '<h3>確認が必要な箇所（' + checks.length + '件）</h3>' + checksList(checks),
          check: checks.length ? '上記の確認が必要な箇所をすべて確認し、店舗名・数値・日付に誤りがないことを確認しました' : '店舗名・数値・日付に誤りがないことを確認しました',
          confirmLabel: '承認する',
        });
        if (!ok) return;
        doc.status = 'approved';
        doc.approvedBy = S.user();
        doc.approvedAt = Date.now();
        S.log('承認しました', target, '確認が必要な箇所：' + checks.length + '件（確認済みとして承認）', doc);
      } else if (kind === 'back') {
        doc.status = 'draft';
        S.log('差し戻しました（下書きへ）', target, '', doc);
      } else if (kind === 'reopen') {
        const ok = await modal({ title: '下書きに戻す', body: '<p>承認を取り消して下書きに戻します。修正後は、もう一度「確認待ち」→「承認」が必要です。</p>', confirmLabel: '下書きに戻す' });
        if (!ok) return;
        doc.status = 'draft';
        doc.approvedBy = null;
        doc.approvedAt = null;
        S.log('承認を取り消し、下書きに戻しました', target, '', doc);
      } else if (kind === 'copy') {
        const text = opts.getText();
        const ok = await modal({
          title: '送信用にコピー',
          body: '<p>次の宛先に送る文面をクリップボードにコピーします。このアプリから外部へは送信しません。' + (opts.copyHint || 'LINE・メール等に貼り付けて、宛先を確認してから送信してください。') + '</p>' + storeLine +
            '<div class="pre" style="max-height:240px;overflow:auto">' + esc(text) + '</div>',
          check: opts.copyCheck || '宛先の店舗と文面の店舗名が一致していることを確認しました',
          confirmLabel: 'コピーする',
        });
        if (!ok) return;
        const copied = await copyText(text);
        toast(copied ? 'コピーしました。貼り付け先の宛先を確認してから送信してください。' : 'コピーできませんでした。文面を選択してコピーしてください。', copied ? 'ok' : 'error');
        S.log('送信用にコピーしました', target, '', doc);
      } else if (kind === 'done') {
        const res = await modal({
          title: '送信済み・完了にする',
          body: '<p>' + esc(opts.doneText || '店舗への送信が済んだことを記録します（このアプリからは送信しません）。') + '</p>' + storeLine +
            '<div class="field"><label>送信方法・メモ（任意）</label><input type="text" id="mdl-memo" placeholder="例：LINEで店長へ送信"></div>',
          check: '承認済みの内容を、正しい宛先へ送信したことを確認しました',
          confirmLabel: '完了にする',
          collect: (bg) => ({ memo: bg.querySelector('#mdl-memo').value }),
        });
        if (!res) return;
        doc.status = 'done';
        doc.doneAt = Date.now();
        S.log('完了にしました（送信済み）', target, res.memo || '', doc);
      }
      doc.updatedAt = Date.now();
      S.save(true);
      opts.onChanged();
    }
  }

  root.FS = root.FS || {};
  root.FS.ui = { esc, $, $$, toast, modal, kindBadge, statusBadge, statusSteps, isLocked, targetBanner, storePicker, projectOptions, copyText, download, historyList, checksList, workflow };
})(self);
