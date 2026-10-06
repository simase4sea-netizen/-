/* 画面：インフルエンサー起用キャンペーン（条件・候補の評価と絞り込み・比較・提案リスト出力・検索記録）と、候補ごとの詳細（評価内訳・起用状況・連絡文） */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const I = root.FS.inf;
  const X = root.FS.infui;
  const G = root.FS.guard;
  const F = root.FS.format;
  const esc = U.esc;

  function newCampaign() {
    return {
      id: S.uid('camp'), title: '', storeId: null, address: '', areas: [], radiusKm: '', genres: [], dishes: '', products: '',
      pricePerPerson: '', target: '', purposes: [], platforms: [], formats: [], compensation: 'undecided', budgetMax: '',
      offer: '', visitDates: '', postPeriod: '', postConditions: '', requiredTags: '', mentions: '', avoid: '', notes: '',
      followerMin: '', followerMax: '', searchKeywords: '', lat: '', lng: '', autoSearch: true, lastAutoRunAt: null,
      proposal: null, createdAt: Date.now(), createdBy: S.user(), updatedAt: Date.now(), history: [],
    };
  }

  function storeName(c) { const s = S.storeById(c.storeId); return s ? s.name : '店舗未選択'; }

  function rowsFor(camp) {
    const st = X.inf();
    return st.candidates.map((cand) => {
      const link = X.linkFor(camp.id, cand.id);
      return { cand, link, ev: I.evaluate(camp, cand, link, st.settings) };
    });
  }

  function sortRows(rows) {
    return rows.sort((a, b) => {
      // 判定材料不足は後ろ、同じなら点数順
      if (a.ev.insufficient !== b.ev.insufficient) return a.ev.insufficient ? 1 : -1;
      return (b.ev.score === null ? -1 : b.ev.score) - (a.ev.score === null ? -1 : a.ev.score);
    });
  }

  // ───────── 一覧 ─────────
  function list(main) {
    const st = X.inf();
    main.innerHTML = '<h1>インフルエンサー候補選定</h1><p class="lead">店舗・キャンペーンの条件を登録し、候補者を根拠付きで評価・比較して、提案リストと連絡状況を管理します。DM・メールの自動送信や、SNSからの自動取得は行いません。</p>' +
      '<div class="btns" style="margin-bottom:12px"><button class="btn primary" id="new">＋ キャンペーンを作る</button><a class="btn" href="#/inf/cands">候補者データベース（' + st.candidates.length + '件）</a><a class="btn" href="#/inf/settings">評価の設定</a><button class="btn" id="sample">テスト用データを追加</button></div>' +
      (st.campaigns.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>キャンペーン</th><th>店舗</th><th>目的</th><th>起用状況</th><th>更新</th></tr></thead><tbody>' +
        st.campaigns.slice().sort((a, b) => b.updatedAt - a.updatedAt).map((c) => {
          const ls = st.links.filter((l) => l.campaignId === c.id && l.status !== '未確認');
          const counts = {};
          ls.forEach((l) => { counts[l.status] = (counts[l.status] || 0) + 1; });
          const s = S.storeById(c.storeId);
          return '<tr class="clickable" data-id="' + c.id + '"><td><b>' + esc(c.title || '名称未入力') + '</b></td><td>' + (s ? U.kindBadge(s.kind) + ' ' + esc(s.name) : '<span class="badge warn">未選択</span>') + '</td><td class="small">' + esc(I.toList(c.purposes).join('・') || '未入力') + '</td><td class="small">' + (Object.keys(counts).map((k) => esc(k) + ' ' + counts[k]).join('／') || '—') + '</td><td class="small muted nowrap">' + F.fmtDateTime(c.updatedAt) + '</td></tr>';
        }).join('') + '</tbody></table></div>' : '<div class="empty">キャンペーンはまだありません。「キャンペーンを作る」から始めてください。</div>') +
      '<div class="panel" style="margin-top:16px"><h2>使い方（4ステップ）</h2><ol><li>キャンペーンを作り、店舗・エリア・ジャンル・目的・条件を入力</li><li>候補者を登録（手動／検索結果のURLをまとめて／CSV）</li><li>「候補の評価」で絞り込み・比較し、起用状況を「候補」「優先候補」に</li><li>「提案リスト」で出力し、候補ごとの連絡文を作成 → 承認 → 担当者が手動で連絡</li></ol></div>';
    U.$('#new', main).addEventListener('click', () => { location.hash = '#/inf/c/new'; });
    U.$('#sample', main).addEventListener('click', () => { loadSample(); U.toast('テスト用データを追加しました', 'ok'); list(main); });
    U.$$('tr[data-id]', main).forEach((tr) => tr.addEventListener('click', () => { location.hash = '#/inf/c/' + tr.dataset.id + '?tab=cands'; }));
  }

  // ───────── キャンペーン詳細 ─────────
  function detail(main, id, params) {
    const st = X.inf();
    const isNew = id === 'new';
    const camp = isNew ? newCampaign() : st.campaigns.find((c) => c.id === id);
    if (!camp) { main.innerHTML = '<div class="empty">キャンペーンが見つかりません。<a href="#/inf">一覧へ</a></div>'; return; }
    const tab = isNew ? 'cond' : (params && params.get('tab')) || 'cands';
    const tabs = [['cond', '1. 条件'], ['cands', '2. 候補の評価・絞り込み'], ['compare', '3. 比較'], ['output', '4. 提案リスト出力'], ['search', '検索記録']];
    const store = S.storeById(camp.storeId);
    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/inf">← キャンペーン一覧</a><div class="grow"><b>' + esc(isNew ? '新しいキャンペーン' : camp.title) + '</b></div></div>' +
      (store ? U.targetBanner(store, null, '目的：' + esc(I.toList(camp.purposes).join('・') || '未入力')) : '') +
      '<div class="tabs">' + tabs.map(([k, l]) => '<button data-tab="' + k + '" class="' + (k === tab ? 'on' : '') + '"' + (isNew && k !== 'cond' ? ' disabled' : '') + '>' + l + '</button>').join('') + '</div><div id="pane"></div>';
    U.$$('.tabs button', main).forEach((b) => b.addEventListener('click', () => { if (!b.disabled) location.hash = '#/inf/c/' + camp.id + '?tab=' + b.dataset.tab; }));
    const pane = U.$('#pane', main);
    if (tab === 'cond') condTab(pane, camp, isNew);
    else if (tab === 'cands') candsTab(pane, camp);
    else if (tab === 'compare') compareTab(pane, camp);
    else if (tab === 'output') outputTab(pane, camp, main);
    else if (tab === 'search') searchTab(pane, camp);
  }

  // 1. 条件
  function condTab(pane, camp, isNew) {
    const st = X.inf();
    const chk = (name, values, sel, labels) => '<div class="btns">' + values.map((v) => '<label class="small nowrap"><input type="checkbox" data-' + name + '="' + esc(v) + '"' + (I.toList(sel).includes(v) ? ' checked' : '') + '> ' + esc(labels ? labels[v] : v) + '</label>').join('') + '</div>';
    const t = (id, label, v, ph) => '<div class="field"><label>' + label + '</label><input type="text" id="' + id + '" value="' + esc(Array.isArray(v) ? v.join('、') : v) + '" placeholder="' + esc(ph || '') + '"></div>';
    const ta = (id, label, v, ph) => '<div class="field"><label>' + label + '</label><textarea id="' + id + '" style="min-height:60px" placeholder="' + esc(ph || '') + '">' + esc(v) + '</textarea></div>';
    pane.innerHTML = '<div class="grid2"><div>' +
      '<div class="panel"><h2>店舗と場所</h2>' + t('title', 'キャンペーン名（必須）', camp.title, '例：秋の新作スイーツ 来店促進') +
      '<div class="field"><label>店舗（必須・検索して選択）</label><div id="picker"></div></div>' +
      t('address', '店舗の所在地', camp.address, '例：香川県高松市〇〇町1-1') +
      t('areas', '来店可能エリア（市区町村・駅名。区切りは「、」）', camp.areas, '例：高松市、瓦町、栗林公園') +
      t('radius', '検索半径（km・目安）', camp.radiusKm, '例：10') + '</div>' +
      '<div class="panel"><h2>店舗の内容</h2>' + t('genres', '店舗ジャンル', camp.genres, '例：スイーツ、カフェ') + t('dishes', '料理', camp.dishes, '例：ケーキ、パフェ') + t('products', '主な商品', camp.products) +
      '<div class="row"><div class="field">' + '<label>客単価</label><input type="text" id="price" value="' + esc(camp.pricePerPerson) + '" placeholder="例：1,500円"></div><div class="field"><label>ターゲット層</label><input type="text" id="target" value="' + esc(camp.target) + '" placeholder="例：20〜30代女性"></div></div></div>' +
      '</div><div>' +
      '<div class="panel"><h2>自動選定の条件（地域・フォロワー数・ジャンル）</h2><p class="small muted">地域は「来店可能エリア」「所在地」、ジャンルは「店舗ジャンル」「料理」「商品」を使います。フォロワー数の範囲を入れると、範囲外・未確認の候補は自動選定されません。</p>' +
      '<div class="row"><div class="field"><label>フォロワー数（下限）</label><input type="text" id="fmin" value="' + esc(camp.followerMin) + '" placeholder="例：3000"></div><div class="field"><label>フォロワー数（上限）</label><input type="text" id="fmax" value="' + esc(camp.followerMax) + '" placeholder="例：100000"></div></div>' +
      t('skw', '追加の検索語（任意・区切りは「、」）', camp.searchKeywords, '例：高松 カフェ巡り、香川スイーツ') +
      '<div class="row"><div class="field"><label>店舗の緯度（任意）</label><input type="text" id="lat" value="' + esc(camp.lat) + '" placeholder="例：34.34"></div><div class="field"><label>経度（任意）</label><input type="text" id="lng" value="' + esc(camp.lng) + '" placeholder="例：134.04"></div></div><div class="hint">緯度経度と検索半径を入れると、YouTubeの位置情報付き動画も検索します。</div>' +
      '<label class="small"><input type="checkbox" id="autoS"' + (camp.autoSearch !== false ? ' checked' : '') + '> このキャンペーンで自動選定を行う</label></div>' +
      '<div class="panel"><h2>目的と投稿</h2><div class="field"><label>キャンペーンの目的</label>' + chk('purpose', I.PURPOSES, camp.purposes) + '</div>' +
      '<div class="field"><label>希望するSNS</label>' + chk('platform', ['instagram', 'tiktok', 'youtube', 'x'], camp.platforms, I.PLATFORMS) + '</div>' +
      '<div class="field"><label>希望する投稿形式</label>' + chk('format', I.FORMATS, camp.formats) + '</div></div>' +
      '<div class="panel"><h2>起用条件</h2><div class="field"><label>依頼の形</label><div class="btns">' + Object.keys(I.COMPENSATION).map((k) => '<label class="small"><input type="radio" name="comp" value="' + k + '"' + (camp.compensation === k ? ' checked' : '') + '> ' + I.COMPENSATION[k] + '</label>').join('') + '</div></div>' +
      '<div class="row"><div class="field"><label>予算上限（円・1人あたり）</label><input type="text" id="budget" value="' + esc(camp.budgetMax) + '" placeholder="未定なら空欄"></div></div>' +
      ta('offer', '提供できる商品・サービス', camp.offer, '例：ケーキセット（2名分）') +
      '<div class="row"><div class="field"><label>希望する来店日</label><input type="text" id="visit" value="' + esc(camp.visitDates) + '" placeholder="例：10/20〜10/31の平日"></div><div class="field"><label>投稿時期</label><input type="text" id="period" value="' + esc(camp.postPeriod) + '" placeholder="例：来店後1週間以内"></div></div>' +
      ta('cond', '投稿条件・撮影条件', camp.postConditions) +
      '<div class="row"><div class="field"><label>必須タグ</label><input type="text" id="tags" value="' + esc(camp.requiredTags) + '" placeholder="例：#高松スイーツ"></div><div class="field"><label>メンション</label><input type="text" id="mentions" value="' + esc(camp.mentions) + '" placeholder="例：@店舗アカウント"></div></div>' +
      ta('avoid', '避けたい条件・注意事項', camp.avoid) + ta('notes', 'その他メモ', camp.notes) + '</div>' +
      '</div></div>' + X.prNotice() +
      '<div class="btns"><button class="btn primary" id="save">' + (isNew ? 'キャンペーンを作成' : '条件を保存') + '</button></div>' +
      (isNew ? '' : '<div class="panel" style="margin-top:16px"><h2>変更履歴</h2>' + U.historyList(camp) + '</div>');
    let storeId = camp.storeId;
    const renderPicker = () => U.storePicker(U.$('#picker', pane), { value: storeId, onChange: (sid) => { storeId = sid; renderPicker(); } });
    renderPicker();
    U.$('#save', pane).addEventListener('click', () => {
      const v = (id) => U.$('#' + id, pane).value.trim();
      const checked = (name) => U.$$('[data-' + name + ']', pane).filter((x) => x.checked).map((x) => x.getAttribute('data-' + name));
      const next = {
        title: v('title'), storeId, address: v('address'), areas: I.toList(v('areas')), radiusKm: v('radius'), genres: I.toList(v('genres')), dishes: v('dishes'), products: v('products'),
        pricePerPerson: v('price'), target: v('target'), purposes: checked('purpose'), platforms: checked('platform'), formats: checked('format'),
        compensation: (U.$('[name=comp]:checked', pane) || {}).value || 'undecided', budgetMax: v('budget') ? I.parseNum(v('budget')) : '', offer: v('offer'), visitDates: v('visit'), postPeriod: v('period'),
        postConditions: v('cond'), requiredTags: v('tags'), mentions: v('mentions'), avoid: v('avoid'), notes: v('notes'),
        followerMin: v('fmin') ? I.parseNum(v('fmin')) : '', followerMax: v('fmax') ? I.parseNum(v('fmax')) : '', searchKeywords: v('skw'), lat: v('lat'), lng: v('lng'), autoSearch: U.$('#autoS', pane).checked,
      };
      const errs = [];
      if (!next.title) errs.push('キャンペーン名を入力してください');
      if (!next.storeId) errs.push('店舗を選択してください（「店舗・案件」画面で登録できます）');
      if (v('budget') && next.budgetMax === null) errs.push('予算上限は数値で入力してください');
      if ((v('fmin') && next.followerMin === null) || (v('fmax') && next.followerMax === null)) errs.push('フォロワー数は数値で入力してください');
      if (next.followerMin !== '' && next.followerMax !== '' && next.followerMin > next.followerMax) errs.push('フォロワー数の下限が上限より大きくなっています');
      if ((next.lat || next.lng) && !(isFinite(Number(next.lat)) && isFinite(Number(next.lng)) && Math.abs(Number(next.lat)) <= 90 && Math.abs(Number(next.lng)) <= 180)) errs.push('緯度・経度を正しく入力してください');
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      const changed = Object.keys(next).filter((k) => JSON.stringify(camp[k]) !== JSON.stringify(next[k]));
      Object.assign(camp, next, { updatedAt: Date.now() });
      if (isNew) { st.campaigns.push(camp); S.log('キャンペーンを作成しました', { type: 'campaign', id: camp.id, label: camp.title }, '店舗：' + storeName(camp), camp); }
      else if (changed.length) S.log('キャンペーン条件を変更しました', { type: 'campaign', id: camp.id, label: camp.title }, '変更項目数：' + changed.length, camp);
      const condChanged = isNew || changed.some((k) => ['address', 'areas', 'genres', 'dishes', 'products', 'followerMin', 'followerMax', 'searchKeywords', 'platforms', 'lat', 'lng', 'radiusKm'].includes(k));
      if (condChanged) camp.lastAutoRunAt = null; // 条件が変わったら次に開いたとき自動選定をやり直す
      S.save(true);
      U.toast('保存しました', 'ok');
      const nextHash = '#/inf/c/' + camp.id + '?tab=' + (isNew || condChanged ? 'cands' : 'cond');
      if (location.hash === nextHash) root.FS.app.route(); else location.hash = nextHash;
    });
  }

  // 2. 候補の評価・絞り込み
  function candsTab(pane, camp) {
    const st = X.inf();
    const key = 'infF-' + camp.id;
    const f = JSON.parse(sessionStorage.getItem(key) || '{}');
    const sel = new Set(JSON.parse(sessionStorage.getItem('infSel-' + camp.id) || '[]'));
    const all = rowsFor(camp);
    const rows = sortRows(I.filterForCampaign(all, Object.assign({ threshold: st.settings.fitThreshold }, f)));
    const AU = root.FS.infautoui;
    pane.innerHTML = AU.runSummaryHtml(camp) +
      '<div class="panel"><div class="row">' +
      '<div class="field" style="flex:2 1 240px"><label>キーワード（地域・駅名・料理・商品・ハッシュタグ）</label><input type="search" id="fq" value="' + esc(f.text || '') + '" placeholder="例：瓦町 スイーツ"></div>' +
      '<div class="field"><label>SNS</label><select id="fp"><option value="">すべて</option>' + Object.keys(I.PLATFORMS).map((k) => '<option value="' + k + '"' + (f.platform === k ? ' selected' : '') + '>' + I.PLATFORMS[k] + '</option>').join('') + '</select></div>' +
      '<div class="field"><label>起用状況</label><select id="fs"><option value="">すべて</option>' + I.STATUSES.map((s) => '<option' + (f.status === s ? ' selected' : '') + '>' + s + '</option>').join('') + '</select></div>' +
      '<div class="field" style="flex:0 1 120px"><label>総合点 以上</label><input type="text" id="fm" value="' + esc(f.minScore || '') + '"></div></div>' +
      '<div class="btns small"><label><input type="checkbox" id="fr"' + (f.regionFit ? ' checked' : '') + '> 地域が合う（所在地・来店エリア）</label><label><input type="checkbox" id="fg"' + (f.genreFit ? ' checked' : '') + '> ジャンルが合う</label><label><input type="checkbox" id="fpu"' + (f.purposeFit ? ' checked' : '') + '> 目的・SNS・形式が合う</label><label><input type="checkbox" id="fi"' + (f.hideInsufficient ? ' checked' : '') + '> 判定材料不足を隠す</label>' +
      '<span class="muted">「合う」＝その項目が' + st.settings.fitThreshold + '点以上（未確認は含めない）</span></div></div>' +
      '<div class="btns" style="margin-bottom:10px"><button class="btn primary" id="bulkUrl">URLを一括登録</button><button class="btn" id="addSearch">検索結果をまとめて登録</button><a class="btn" href="#/inf/cand/new">候補者を1件登録</a><button class="btn primary" id="toCompare">選んだ候補を比較（' + sel.size + '件）</button><span class="small muted">' + rows.length + '／' + all.length + '件を表示</span></div>' +
      (rows.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>比較</th><th>候補者</th><th>起用状況</th><th>活動地域・ジャンル</th><th class="num">フォロワー数</th><th>評価点</th><th style="min-width:150px">3条件（地域・フォロワー数・ジャンル）</th><th style="min-width:240px">評価理由・懸念点</th><th>費用</th><th>充足度</th></tr></thead><tbody>' +
        rows.map(({ cand, ev, link }) => '<tr><td><input type="checkbox" data-sel="' + cand.id + '"' + (sel.has(cand.id) ? ' checked' : '') + '></td>' +
          '<td><a href="#" data-open="' + cand.id + '"><b>' + esc(cand.displayName || '名称未入力') + '</b></a><div class="small">@' + esc(cand.handle) + '・' + esc(I.PLATFORMS[cand.platform]) + '</div><div class="small"><a href="' + esc(cand.profileUrl) + '" target="_blank" rel="noopener noreferrer">プロフィールを開く</a></div></td>' +
          '<td>' + X.statusSelect(link ? link.status : '未確認', 'data-status="' + cand.id + '"') + (link && link.autoManaged === false ? '<div class="small muted">手動で設定</div>' : link && link.autoJudge ? '<div class="small muted">自動選定</div>' : '') + '</td>' +
          '<td class="small">' + esc(I.toList(cand.areas).join('、') || '地域未確認') + '<div class="muted">' + esc(I.toList(cand.genres).join('、') || 'ジャンル未確認') + '</div></td>' +
          '<td class="num">' + X.factView(cand.followers, X.fmtNum) + '</td><td class="nowrap">' + X.scoreView(ev) + '</td>' +
          '<td class="small">' + root.FS.infauto.judge(camp, cand, ev, st.settings).reasons.map((r) => '<div style="color:' + (r[0] === '○' ? 'var(--ok)' : 'var(--danger)') + '">' + esc(r.length > 60 ? r.slice(0, 60) + '…' : r) + '</div>').join('') + '</td>' +
          '<td class="small">' + (ev.reasons.slice(0, 2).map((r) => '<div>✓ ' + esc(r) + '</div>').join('') || '<div class="muted">高評価の根拠はまだありません</div>') + ev.concerns.slice(0, 2).map((r) => '<div style="color:var(--warn)">! ' + esc(r) + '</div>').join('') + '</td>' +
          '<td class="nowrap">' + X.feeView(cand.fee) + '</td><td>' + ev.completeness.pct + '%</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="empty">' + (all.length ? '条件に合う候補がいません。絞り込みを緩めてください。' : '候補者が登録されていません。「URLを一括登録」でプロフィールURLを貼り付けて追加してください。') + '</div>');

    const save = () => {
      const nf = { text: U.$('#fq', pane).value, platform: U.$('#fp', pane).value, status: U.$('#fs', pane).value, minScore: U.$('#fm', pane).value, regionFit: U.$('#fr', pane).checked, genreFit: U.$('#fg', pane).checked, purposeFit: U.$('#fpu', pane).checked, hideInsufficient: U.$('#fi', pane).checked };
      sessionStorage.setItem(key, JSON.stringify(nf));
      candsTab(pane, camp);
    };
    U.$('#fq', pane).addEventListener('change', save);
    ['#fp', '#fs', '#fr', '#fg', '#fpu', '#fi'].forEach((s) => U.$(s, pane).addEventListener('change', save));
    U.$('#fm', pane).addEventListener('change', save);
    U.$$('[data-sel]', pane).forEach((c) => c.addEventListener('change', () => {
      if (c.checked) sel.add(c.dataset.sel); else sel.delete(c.dataset.sel);
      sessionStorage.setItem('infSel-' + camp.id, JSON.stringify(Array.from(sel)));
      U.$('#toCompare', pane).textContent = '選んだ候補を比較（' + sel.size + '件）';
    }));
    U.$('#toCompare', pane).addEventListener('click', () => {
      if (sel.size < 2) { U.toast('比較する候補を2件以上選んでください', 'error'); return; }
      location.hash = '#/inf/c/' + camp.id + '?tab=compare';
    });
    U.$('#addSearch', pane).addEventListener('click', () => X.registerSearch(camp, () => candsTab(pane, camp)));
    U.$('#bulkUrl', pane).addEventListener('click', () => X.bulkUrls(camp, () => candsTab(pane, camp)));
    const runBtn = U.$('#runAuto', pane);
    runBtn.addEventListener('click', async () => {
      runBtn.disabled = true; runBtn.textContent = '自動選定を実行中…';
      const log = await AU.run(camp, '手動実行');
      if (log) U.toast('自動選定を実行しました：条件合致 ' + log.passed + '件', log.errors.length ? 'error' : 'ok');
      candsTab(pane, camp);
    });
    if (!pane.dataset.autoTried) {
      pane.dataset.autoTried = '1';
      AU.autoRunIfDue(camp, () => {
        // 実行中に画面が描き直されていても、表示中の候補一覧を最新にする
        const cur = document.getElementById('pane');
        if (cur && location.hash.indexOf('#/inf/c/' + camp.id) === 0 && /tab=cands/.test(location.hash)) candsTab(cur, camp);
      });
    }
    U.$$('[data-open]', pane).forEach((a) => a.addEventListener('click', (e) => {
      e.preventDefault();
      const l = X.ensureLink(camp.id, a.dataset.open);
      S.save(true);
      location.hash = '#/inf/link/' + l.id;
    }));
    U.$$('[data-status]', pane).forEach((s) => s.addEventListener('change', async () => {
      const cand = st.candidates.find((c) => c.id === s.dataset.status);
      const ok = await X.changeStatus(camp, cand, s.value);
      if (!ok) { const l = X.linkFor(camp.id, cand.id); s.value = l ? l.status : '未確認'; return; }
      U.toast('起用状況を「' + s.value + '」にしました', 'ok');
    }));
  }

  // 3. 比較
  function compareTab(pane, camp) {
    const st = X.inf();
    const sel = JSON.parse(sessionStorage.getItem('infSel-' + camp.id) || '[]');
    const rows = rowsFor(camp).filter((r) => sel.includes(r.cand.id));
    if (rows.length < 2) { pane.innerHTML = '<div class="empty">「2. 候補の評価・絞り込み」で比較する候補を2件以上選んでください。</div>'; return; }
    const cell = (h) => '<td style="min-width:200px">' + h + '</td>';
    const critRow = (key) => '<tr><th>' + esc(I.CRITERIA.find((c) => c.key === key).label) + '<div class="small muted">重み ' + st.settings.weights[key] + '</div></th>' + rows.map(({ ev }) => {
      const it = ev.items.find((x) => x.key === key);
      return cell((it.score === null ? '<span class="badge gray">未確認</span>' : '<b>' + it.score + '</b>' + (it.manual ? ' <span class="chip">担当者評価</span>' : '')) + '<div class="small">' + it.reasons.map((r) => '<div>✓ ' + esc(r) + '</div>').join('') + it.concerns.map((r) => '<div style="color:var(--warn)">! ' + esc(r) + '</div>').join('') + it.checks.map((r) => '<div class="muted">？ ' + esc(r) + '</div>').join('') + '</div>');
    }).join('') + '</tr>';
    pane.innerHTML = '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th></th>' + rows.map(({ cand }) => '<th><a href="' + esc(cand.profileUrl) + '" target="_blank" rel="noopener noreferrer">' + esc(X.candLabel(cand)) + '</a><div class="small muted">' + esc(I.PLATFORMS[cand.platform]) + '</div></th>').join('') + '</tr></thead><tbody>' +
      '<tr><th>総合評価</th>' + rows.map(({ ev }) => cell(X.scoreView(ev))).join('') + '</tr>' +
      I.CRITERIA.map((c) => critRow(c.key)).join('') +
      '<tr><th>フォロワー数</th>' + rows.map(({ cand }) => cell(X.factView(cand.followers, X.fmtNum))).join('') + '</tr>' +
      '<tr><th>直近の反応数</th>' + rows.map(({ cand }) => cell(X.factView(cand.recentReactions))).join('') + '</tr>' +
      '<tr><th>直近の再生数</th>' + rows.map(({ cand }) => cell(X.factView(cand.recentViews))).join('') + '</tr>' +
      '<tr><th>費用</th>' + rows.map(({ cand }) => cell(X.feeView(cand.fee) + (I.isKnown(cand.fee) ? '<div class="small muted">' + esc(cand.fee.source) + '</div>' : ''))).join('') + '</tr>' +
      '<tr><th>情報の充足度</th>' + rows.map(({ ev }) => cell(ev.completeness.pct + '%<div class="small muted">未確認：' + esc(ev.completeness.missing.join('、') || 'なし') + '</div>')).join('') + '</tr>' +
      '<tr><th>起用状況</th>' + rows.map(({ link }) => cell(esc(link ? link.status : '未確認'))).join('') + '</tr>' +
      '</tbody></table></div>';
  }

  // 4. 提案リスト出力
  const DEFAULT_INCLUDE = ['候補', '優先候補', '条件確認中', '連絡文作成', '連絡済み', '返信あり', '起用決定'];
  function proposalRows(camp, ids) {
    return sortRows(rowsFor(camp).filter((r) => ids.includes(r.cand.id)));
  }
  function expectedFormats(camp, cand) {
    const want = I.toList(camp.formats), has = I.toList(cand.formats);
    const both = want.filter((f) => has.includes(f));
    if (both.length) return both.join('・');
    if (want.length && !has.length) return want.join('・') + '（本人の対応可否は未確認）';
    if (want.length) return '希望形式（' + want.join('・') + '）の実績なし／普段は' + has.join('・');
    return has.join('・') || '未確認';
  }
  function proposalText(camp, rows) {
    const L = [];
    L.push('■ インフルエンサー候補リスト' + (camp.proposal && camp.proposal.status === 'approved' ? '' : '（下書き・社内検討用）'));
    L.push('店舗：' + storeName(camp) + '　キャンペーン：' + camp.title);
    L.push('目的：' + (I.toList(camp.purposes).join('・') || '未入力') + '　希望SNS：' + (I.toList(camp.platforms).map((p) => I.PLATFORMS[p]).join('・') || '未入力') + '　依頼の形：' + I.COMPENSATION[camp.compensation]);
    L.push('作成日：' + X.today() + '　作成者：' + S.user());
    rows.forEach(({ cand, ev, link }, i) => {
      L.push('');
      L.push((i + 1) + '. ' + X.candLabel(cand) + '（' + I.PLATFORMS[cand.platform] + '）' + (link && link.status === '優先候補' ? '【優先候補】' : ''));
      L.push('　プロフィール：' + cand.profileUrl);
      L.push('　評価：' + (ev.score === null ? '判定材料不足' : ev.score + '/100' + (ev.insufficient ? '（判定材料不足・参考値）' : '')) + (ev.usesEstimated ? '・推定値を含む' : ''));
      L.push('　フォロワー数：' + X.describeFact(cand.followers, X.fmtNum));
      if (I.isKnown(cand.recentReactions)) L.push('　直近の反応数：' + X.describeFact(cand.recentReactions));
      if (I.isKnown(cand.recentViews)) L.push('　直近の再生数：' + X.describeFact(cand.recentViews));
      L.push('　想定される投稿形式：' + expectedFormats(camp, cand));
      L.push('　料金・条件：' + (I.isKnown(cand.fee) ? X.describeFact(cand.fee, (v) => (Number(v) === 0 ? '無料で可' : X.fmtNum(v) + '円')) : '未確認'));
      L.push('　選定理由：' + (ev.reasons.join('／') || '（根拠となる確認済み情報が不足）'));
      L.push('　懸念点：' + (ev.concerns.join('／') || '現時点で確認されたものなし'));
      L.push('　起用前に確認すること：' + ev.checks.join('／'));
    });
    return L.join('\n');
  }
  function proposalCsv(camp, rows) {
    const c = I.csvCell;
    const head = ['順位', '店舗名', 'キャンペーン目的', '候補者名', 'アカウント名', 'SNS', 'プロフィールURL', '活動地域', 'ジャンル', 'フォロワー数', 'フォロワー数の状態', 'フォロワー数の確認日', 'フォロワー数の取得元', '評価点', '判定材料不足', '推定値を含む', ...I.CRITERIA.map((x) => x.label), '情報の充足度', '想定される投稿形式', '費用', '費用の状態', '起用状況', '選定理由', '懸念点', '起用前に確認すること'];
    const lines = [head.map(c).join(',')];
    rows.forEach(({ cand, ev, link }, i) => {
      lines.push([i + 1, storeName(camp), I.toList(camp.purposes).join('・'), cand.displayName, cand.handle, I.PLATFORMS[cand.platform], cand.profileUrl, I.toList(cand.areas).join('、'), I.toList(cand.genres).join('、'),
        I.isKnown(cand.followers) ? cand.followers.value : '', I.FACT_STATUS[I.isKnown(cand.followers) ? cand.followers.status : 'unknown'], cand.followers.checkedAt || '', cand.followers.source || '',
        ev.score === null ? '' : ev.score, ev.insufficient ? '判定材料不足' : '', ev.usesEstimated ? '推定値を含む' : '',
        ...ev.items.map((it) => (it.score === null ? '未確認' : it.score)), ev.completeness.pct + '%', expectedFormats(camp, cand),
        I.isKnown(cand.fee) ? cand.fee.value : '未確認', I.FACT_STATUS[I.isKnown(cand.fee) ? cand.fee.status : 'unknown'], link ? link.status : '未確認',
        ev.reasons.join('／'), ev.concerns.join('／'), ev.checks.join('／')].map(c).join(','));
    });
    return '﻿' + lines.join('\r\n');
  }

  function outputTab(pane, camp, main) {
    const st = X.inf();
    const all = sortRows(rowsFor(camp));
    camp.proposal = camp.proposal || { id: S.uid('prop'), status: 'draft', history: [], include: null };
    const prop = camp.proposal;
    const inc = prop.include || all.filter((r) => r.link && DEFAULT_INCLUDE.includes(r.link.status)).map((r) => r.cand.id);
    const rows = proposalRows(camp, inc);
    const locked = U.isLocked(prop);
    pane.innerHTML = '<div class="panel"><div class="row" style="align-items:center"><div class="grow" style="flex:1"><h2 style="margin:0">提案リスト</h2><div class="small muted">起用状況が「候補」以降の候補者が初期選択されます。店舗へ出す前に承認が必要です。</div></div><div id="wf" class="btns"></div></div></div>' +
      '<div class="grid2"><div class="panel"><h3>リストに含める候補（評価順）</h3>' + (all.length ? '<table class="tbl small">' + all.map(({ cand, ev, link }) => '<tr><td><input type="checkbox" data-inc="' + cand.id + '"' + (inc.includes(cand.id) ? ' checked' : '') + (locked ? ' disabled' : '') + '></td><td>' + esc(X.candLabel(cand)) + '</td><td>' + (ev.score === null || ev.insufficient ? '判定材料不足' + (ev.score === null ? '' : '（参考値' + ev.score + '）') : ev.score) + '</td><td>' + esc(link ? link.status : '未確認') + '</td></tr>').join('') + '</table>' : '<p class="muted">候補者がいません。</p>') + '</div>' +
      '<div class="panel"><h3>出力</h3><div class="btns"><button class="btn" id="csv">CSVで出力</button><button class="btn" id="pdf">PDFで出力（印刷画面）</button></div><p class="small muted">PDFは印刷画面で「PDFに保存」を選んでください。承認前の出力には「下書き・社内検討用」と表示されます。</p>' + X.prNotice() + '</div></div>' +
      '<div class="panel"><h3>プレビュー</h3><div class="pre" id="prev"></div></div>';
    U.$('#prev', pane).textContent = proposalText(camp, rows);
    U.$$('[data-inc]', pane).forEach((c) => c.addEventListener('change', () => {
      const ids = U.$$('[data-inc]', pane).filter((x) => x.checked).map((x) => x.dataset.inc);
      prop.include = ids;
      S.save(true);
      outputTab(pane, camp, main);
    }));
    U.$('#csv', pane).addEventListener('click', () => {
      U.download('候補リスト_' + storeName(camp) + '_' + X.today() + (prop.status === 'approved' || prop.status === 'done' ? '' : '_下書き') + '.csv', proposalCsv(camp, rows), 'text/csv;charset=utf-8');
      S.log('候補リストをCSVで出力しました', { type: 'campaign', id: camp.id, label: camp.title }, rows.length + '件・' + S.STATUS[prop.status].label, prop);
    });
    U.$('#pdf', pane).addEventListener('click', () => {
      printProposal(camp, rows, prop);
      S.log('候補リストを印刷・PDF出力しました', { type: 'campaign', id: camp.id, label: camp.title }, rows.length + '件・' + S.STATUS[prop.status].label, prop);
    });
    U.workflow(U.$('#wf', pane), prop, {
      type: 'campaign', requireStore: true,
      getStore: () => S.storeById(camp.storeId),
      getChecks: () => {
        const ch = [];
        if (!rows.length) ch.push('リストに候補が含まれていません。');
        rows.forEach(({ cand, ev }) => {
          if (ev.insufficient) ch.push(X.candLabel(cand) + '：判定材料不足です。');
          if (ev.usesEstimated) ch.push(X.candLabel(cand) + '：推定値を含みます。');
          if (!I.isKnown(cand.fee)) ch.push(X.candLabel(cand) + '：費用が未確認です。');
        });
        ch.push('広告表記（PR表記）の扱いを最新の公式情報で確認してください。');
        return ch;
      },
      getLabel: () => '候補リスト：' + camp.title,
      getText: () => proposalText(camp, rows),
      onChanged: () => outputTab(pane, camp, main),
    });
  }

  function printProposal(camp, rows, prop) {
    const approved = prop.status === 'approved' || prop.status === 'done';
    const w = window.open('', '_blank');
    if (!w) { U.toast('印刷画面を開けませんでした（ポップアップを許可してください）', 'error'); return; }
    const card = ({ cand, ev, link }, i) => '<section><h2>' + (i + 1) + '. ' + esc(X.candLabel(cand)) + '（' + esc(I.PLATFORMS[cand.platform]) + '）' + (link && link.status === '優先候補' ? ' <span class="tag">優先候補</span>' : '') + '</h2>' +
      '<table><tr><th>プロフィール</th><td>' + esc(cand.profileUrl) + '</td></tr><tr><th>評価</th><td>' + (ev.score === null ? '判定材料不足' : ev.score + '/100' + (ev.insufficient ? '（判定材料不足・参考値）' : '')) + (ev.usesEstimated ? '・推定値を含む' : '') + '</td></tr>' +
      '<tr><th>確認できた数値</th><td>フォロワー数：' + esc(X.describeFact(cand.followers, X.fmtNum)) + (I.isKnown(cand.recentReactions) ? '<br>直近の反応数：' + esc(X.describeFact(cand.recentReactions)) : '') + (I.isKnown(cand.recentViews) ? '<br>直近の再生数：' + esc(X.describeFact(cand.recentViews)) : '') + '</td></tr>' +
      '<tr><th>想定される投稿形式</th><td>' + esc(expectedFormats(camp, cand)) + '</td></tr><tr><th>料金・条件</th><td>' + esc(I.isKnown(cand.fee) ? X.describeFact(cand.fee, (v) => (Number(v) === 0 ? '無料で可' : X.fmtNum(v) + '円')) : '未確認') + '</td></tr>' +
      '<tr><th>選定理由</th><td>' + (ev.reasons.map(esc).join('<br>') || '根拠となる確認済み情報が不足') + '</td></tr><tr><th>懸念点</th><td>' + (ev.concerns.map(esc).join('<br>') || '現時点で確認されたものなし') + '</td></tr><tr><th>起用前に確認すること</th><td>' + ev.checks.map(esc).join('<br>') + '</td></tr></table></section>';
    w.document.write('<!doctype html><html lang="ja"><head><meta charset="utf-8"><title>候補リスト_' + esc(storeName(camp)) + '</title><style>body{font-family:"Hiragino Sans","Yu Gothic","Meiryo",sans-serif;font-size:12px;color:#222;margin:24px}h1{font-size:18px;margin:0 0 4px}h2{font-size:14px;margin:18px 0 6px;border-left:4px solid #b5532c;padding-left:8px}table{width:100%;border-collapse:collapse}th,td{border:1px solid #ccc;padding:5px 7px;text-align:left;vertical-align:top}th{width:150px;background:#f6f5f2}.draft{color:#b42318;border:2px solid #b42318;padding:6px 10px;display:inline-block;font-weight:700;margin:8px 0}.tag{background:#fbeee7;color:#9a3a1e;padding:1px 6px;border-radius:4px;font-size:11px}section{page-break-inside:avoid}.meta td,.meta th{border:0;padding:2px 6px}</style></head><body>' +
      (approved ? '' : '<div class="draft">下書き・未承認（社内検討用）</div>') +
      '<h1>インフルエンサー候補リスト</h1><table class="meta"><tr><th>店舗</th><td>' + esc(storeName(camp)) + '</td></tr><tr><th>キャンペーン</th><td>' + esc(camp.title) + '</td></tr><tr><th>目的</th><td>' + esc(I.toList(camp.purposes).join('・') || '未入力') + '</td></tr><tr><th>作成</th><td>' + X.today() + '・' + esc(S.user()) + (approved ? '（承認：' + esc(prop.approvedBy || '') + '）' : '') + '</td></tr></table>' +
      rows.map(card).join('') +
      '<p style="margin-top:16px;font-size:11px;color:#555">※ 数値は各取得元・確認日時点のものです。未確認の項目は推測で補っていません。起用時は広告であることが分かる表記（PR表記等）をお願いします。</p>' +
      '<script>window.onload=function(){window.print()}<\/script></body></html>');
    w.document.close();
  }

  // 検索記録
  function searchTab(pane, camp) {
    const st = X.inf();
    const recs = st.searches.filter((r) => r.campaignId === camp.id).sort((a, b) => b.at - a.at);
    pane.innerHTML = '<div class="btns" style="margin-bottom:10px"><button class="btn primary" id="add">検索結果をまとめて登録</button></div>' +
      (recs.length ? '<div class="panel table-wrap" style="padding:0"><table class="tbl"><thead><tr><th>検索日</th><th>検索した場所</th><th>検索語</th><th>結果</th><th>記録者</th></tr></thead><tbody>' +
        recs.map((r) => '<tr><td class="nowrap">' + esc(r.searchedAt) + '</td><td>' + esc(r.place) + '</td><td>' + esc(r.query) + '</td><td class="small">新規 ' + r.addedIds.length + '件・登録済み ' + r.existingIds.length + '件<div class="muted">' + r.resultUrls.map(esc).join('<br>') + '</div></td><td>' + esc(r.by) + '</td></tr>').join('') + '</tbody></table></div>'
        : '<div class="empty">このキャンペーンの検索記録はまだありません。</div>');
    U.$('#add', pane).addEventListener('click', () => X.registerSearch(camp, () => searchTab(pane, camp)));
  }

  // ───────── 候補ごとの詳細（評価内訳・担当者評価・起用状況・連絡文）─────────
  function linkView(main, id) {
    const st = X.inf();
    const link = st.links.find((l) => l.id === id);
    const camp = link && st.campaigns.find((c) => c.id === link.campaignId);
    const cand = link && st.candidates.find((c) => c.id === link.candidateId);
    if (!link || !camp || !cand) { main.innerHTML = '<div class="empty">見つかりません。<a href="#/inf">一覧へ</a></div>'; return; }
    const ev = I.evaluate(camp, cand, link, st.settings);
    const store = S.storeById(camp.storeId);
    link.contact = link.contact || null;
    main.innerHTML = '<div class="sticky-actions"><a class="btn small" href="#/inf/c/' + camp.id + '?tab=cands">← 候補の評価</a><div class="grow"><b>' + esc(X.candLabel(cand)) + '</b><span class="small muted">　キャンペーン：' + esc(camp.title) + '（' + esc(storeName(camp)) + '）</span></div><a class="btn small" href="#/inf/cand/' + cand.id + '">候補者情報を編集</a></div>' +
      '<div class="grid2"><div>' +
      '<div class="panel"><h2>評価</h2><div class="row" style="align-items:center"><div>' + X.scoreView(ev) + '</div><div class="small muted" style="flex:1">評価できた項目の重みだけで加重平均しています（未確認の項目は0点にしていません）。情報の充足度 ' + ev.completeness.pct + '%' + (ev.completeness.missing.length ? '（未確認：' + esc(ev.completeness.missing.join('、')) + '）' : '') + '</div></div>' +
      '<div class="table-wrap"><table class="tbl" style="margin-top:8px"><thead><tr><th>観点</th><th>点</th><th>根拠・懸念・確認事項</th><th>担当者評価で上書き</th></tr></thead><tbody>' +
      ev.items.map((it) => {
        const m = (link.manual || {})[it.key] || {};
        return '<tr><td><b>' + esc(it.label) + '</b><div class="small muted">重み ' + it.weight + '</div></td><td class="nowrap">' + (it.score === null ? '<span class="badge gray">未確認</span>' : '<b>' + it.score + '</b>') + (it.manual ? '<div class="chip">担当者評価</div>' : '') + '</td><td class="small">' +
          it.reasons.map((r) => '<div>✓ ' + esc(r) + '</div>').join('') + it.concerns.map((r) => '<div style="color:var(--warn)">! ' + esc(r) + '</div>').join('') + it.checks.map((r) => '<div class="muted">？ ' + esc(r) + '</div>').join('') + '</td>' +
          '<td style="min-width:170px"><input type="text" data-ms="' + it.key + '" value="' + esc(m.score === undefined || m.score === null ? '' : m.score) + '" placeholder="0〜100（空欄＝自動）" style="margin-bottom:4px"><input type="text" data-mr="' + it.key + '" value="' + esc(m.reason || '') + '" placeholder="理由（必須）"></td></tr>';
      }).join('') + '</tbody></table></div><div class="btns" style="margin-top:8px"><button class="btn" id="saveManual">担当者評価を保存</button></div></div>' +
      '<div class="panel"><h2>理由・懸念点・追加確認事項</h2><h3>候補にした理由</h3>' + (ev.reasons.length ? '<ul>' + ev.reasons.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '<p class="muted">確認済みの情報からは、まだ根拠がありません。</p>') +
      '<h3>懸念点</h3>' + (ev.concerns.length ? '<ul>' + ev.concerns.map((r) => '<li>' + esc(r) + '</li>').join('') + '</ul>' : '<p class="muted">現時点で確認されたものはありません。</p>') + '<h3>追加確認事項</h3>' + U.checksList(ev.checks) + '</div>' +
      '</div><div>' +
      '<div class="panel"><h2>起用状況</h2><div class="row"><div class="field">' + X.statusSelect(link.status, 'id="status"') + '</div><div class="field"><input type="text" id="snote" placeholder="メモ（例：10/25来店、投稿URL）"></div><div class="field" style="flex:0 0 auto"><button class="btn primary" id="setStatus">変更</button></div></div>' +
      '<ul class="history">' + (link.statusHistory || []).slice().reverse().map((h) => '<li><span class="muted">' + F.fmtDateTime(h.at) + '</span>　<span class="who">' + esc(h.user) + '</span>　' + esc(h.from) + ' → <b>' + esc(h.to) + '</b>' + (h.note ? '<div class="muted">' + esc(h.note) + '</div>' : '') + '</li>').join('') + '</ul></div>' +
      '<div class="panel"><h2>連絡文の下書き</h2><p class="small muted">このツールはDM・メールを送信しません。承認後に「送信用にコピー」し、担当者が宛先（' + esc(cand.contact.method || '連絡方法未確認') + '）を確認して手動で送ってください。</p>' +
      (link.contact ? '<div id="cwf" class="btns" style="margin-bottom:8px"></div><textarea id="ctext" class="tall"' + (U.isLocked(link.contact) ? ' readonly' : '') + '>' + esc(link.contact.text) + '</textarea><div class="btns" style="margin-top:6px"><button class="btn small" id="regen"' + (U.isLocked(link.contact) ? ' disabled' : '') + '>キャンペーン条件から作り直す</button></div>' + U.historyList(link.contact)
        : '<button class="btn primary" id="mkDraft">連絡文の下書きを作る</button>') + '</div>' +
      X.prNotice() +
      '</div></div>';

    const $ = (s) => U.$(s, main);
    $('#saveManual').addEventListener('click', () => {
      link.manual = link.manual || {};
      const errs = [];
      const ch = [];
      I.CRITERIA.forEach((c) => {
        const sv = U.$('[data-ms="' + c.key + '"]', main).value.trim();
        const rv = U.$('[data-mr="' + c.key + '"]', main).value.trim();
        const prev = link.manual[c.key];
        if (!sv) { if (prev) { delete link.manual[c.key]; ch.push(c.label + '：担当者評価を解除'); } return; }
        const n = Number(sv);
        if (!isFinite(n) || n < 0 || n > 100) { errs.push(c.label + '：0〜100で入力してください'); return; }
        if (!rv) { errs.push(c.label + '：理由を入力してください'); return; }
        if (!prev || prev.score !== n || prev.reason !== rv) { link.manual[c.key] = { score: n, reason: rv, by: S.user(), at: X.today() }; ch.push(c.label + '：' + n + '点（' + rv + '）'); }
      });
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      if (ch.length) S.log('担当者評価を保存しました', { type: 'influencer', id: cand.id, label: X.candLabel(cand) }, 'キャンペーン「' + camp.title + '」：' + ch.join('／'));
      S.save(true);
      linkView(main, id);
    });
    $('#setStatus').addEventListener('click', async () => {
      const ok = await X.changeStatus(camp, cand, $('#status').value, $('#snote').value.trim());
      if (ok) linkView(main, id);
    });
    const mk = $('#mkDraft');
    if (mk) mk.addEventListener('click', async () => {
      link.contact = { id: S.uid('ct'), status: 'draft', text: I.contactDraft(camp, cand, store, S.get().settings.senderName), history: [] };
      S.log('連絡文の下書きを作成しました', { type: 'influencer', id: cand.id, label: X.candLabel(cand) }, camp.title, link.contact);
      if (['未確認', '候補', '優先候補', '条件確認中'].includes(link.status)) await X.changeStatus(camp, cand, '連絡文作成');
      S.save(true);
      linkView(main, id);
    });
    if (link.contact) {
      const ta = $('#ctext');
      ta.addEventListener('input', () => { link.contact.text = ta.value; S.save(); });
      ta.addEventListener('change', () => S.log('連絡文を編集しました', { type: 'influencer', id: cand.id, label: X.candLabel(cand) }, '', link.contact));
      $('#regen').addEventListener('click', async () => {
        const ok = await U.modal({ title: '連絡文を作り直す', body: '<p>編集した内容を破棄し、現在のキャンペーン条件から作り直します。</p>', confirmLabel: '作り直す', danger: true });
        if (!ok) return;
        link.contact.text = I.contactDraft(camp, cand, store, S.get().settings.senderName);
        S.log('連絡文を作り直しました', { type: 'influencer', id: cand.id, label: X.candLabel(cand) }, '', link.contact);
        S.save(true);
        linkView(main, id);
      });
      U.workflow($('#cwf'), link.contact, {
        type: 'influencer', requireStore: false,
        getStore: () => store,
        targetHtml: () => '<div class="confirm-target badge client" style="display:block">宛先：' + esc(X.candLabel(cand)) + '（' + esc(I.PLATFORMS[cand.platform]) + '）<div class="small" style="font-weight:400">連絡方法：' + esc(cand.contact.method || '未確認') + (cand.contact.value ? '　' + esc(cand.contact.value) : '') + '<br>プロフィール：' + esc(cand.profileUrl) + '</div></div>',
        copyHint: '宛先のプロフィール・連絡先を開き、担当者が宛先と内容を確認してから手動で送信してください。',
        copyCheck: '宛先の候補者と、文面の宛名・店舗名・条件が正しいことを確認しました',
        doneText: '担当者が手動で連絡したことを記録し、起用状況を「連絡済み」にします（このツールからは送信しません）。',
        getChecks: () => {
          const ch = [];
          if (/【要確認/.test(link.contact.text)) ch.push('連絡文に【要確認】の箇所が残っています。');
          if (!cand.contact.method) ch.push('公開されている連絡方法が未確認です。');
          if (camp.compensation === 'paid' && !I.isKnown(cand.fee)) ch.push('有償依頼ですが料金が未確認です。');
          const hits = G.findOtherStoreMentions(link.contact.text, camp.storeId, S.get().stores);
          hits.forEach((h) => ch.push('連絡文に別の店舗名「' + h.matched + '」が含まれています。'));
          ch.push('広告表記（PR表記）のお願いが文面に含まれているか確認してください。');
          return ch;
        },
        getLabel: () => '連絡文：' + X.candLabel(cand),
        getText: () => link.contact.text,
        onChanged: async () => {
          if (link.contact.status === 'done' && I.STATUSES.indexOf(link.status) < I.STATUSES.indexOf('連絡済み')) await X.changeStatus(camp, cand, '連絡済み', '連絡文（承認済み）を担当者が手動送信');
          linkView(main, id);
        },
      });
    }
  }

  // ───────── 評価の設定 ─────────
  function settingsView(main) {
    const st = X.inf();
    const s = st.settings;
    const d = I.defaultSettings();
    const bands = (name, list, unit) => '<table class="tbl small" style="max-width:360px"><thead><tr><th>' + unit + ' 以上</th><th>点</th></tr></thead>' + list.map((b, i) => '<tr><td><input type="text" data-band="' + name + '" data-i="' + i + '" data-k="min" value="' + b.min + '"></td><td><input type="text" data-band="' + name + '" data-i="' + i + '" data-k="score" value="' + b.score + '"></td></tr>').join('') + '</table>';
    main.innerHTML = '<h1>評価の設定</h1><p class="lead">評価項目の重みと基準は管理者が変更できます。変更は操作履歴に残り、すべてのキャンペーンの評価に反映されます。</p>' +
      '<div class="panel"><h2>評価項目の重み</h2><p class="small muted">合計が100でなくても、比率で計算します。0にするとその項目は使いません。</p><table class="tbl" style="max-width:520px"><thead><tr><th>観点</th><th>重み</th><th>初期値</th></tr></thead>' +
      I.CRITERIA.map((c) => '<tr><td>' + esc(c.label) + '</td><td><input type="text" data-w="' + c.key + '" value="' + s.weights[c.key] + '" style="max-width:90px"></td><td class="muted">' + d.weights[c.key] + '</td></tr>').join('') + '</table></div>' +
      '<div class="grid2"><div class="panel"><h2>投稿の反応：反応率の目安</h2><p class="small muted">反応率＝直近投稿の平均反応数（いいね＋コメント）÷フォロワー数×100。初期値は仮の目安です。実績に合わせて調整してください。</p>' + bands('engagementBands', s.engagementBands, '反応率(%)') + '</div>' +
      '<div class="panel"><h2>投稿の反応：再生率の目安</h2><p class="small muted">再生率＝直近動画の平均再生数÷フォロワー数×100。</p>' + bands('viewBands', s.viewBands, '再生率(%)') + '</div></div>' +
      '<div class="panel"><h2>判定材料不足の基準など</h2><div class="row">' +
      '<div class="field"><label>評価に使う直近投稿の最少件数</label><input type="text" id="minPosts" value="' + s.minPostsForEngagement + '"></div>' +
      '<div class="field"><label>判定材料不足：評価できた重みの割合が何%未満</label><input type="text" id="minCov" value="' + s.minCoverage + '"></div>' +
      '<div class="field"><label>判定材料不足：評価できた項目が何個未満</label><input type="text" id="minKnown" value="' + s.minKnownCriteria + '"></div>' +
      '<div class="field"><label>絞り込みで「合う」とする点数</label><input type="text" id="fit" value="' + s.fitThreshold + '"></div></div></div>' +
      '<div class="btns"><button class="btn primary" id="save">保存</button><button class="btn" id="reset">初期値に戻す</button></div>' +
      '<div class="panel" style="margin-top:16px"><h2>評価の考え方</h2><ul class="small">' +
      '<li><b>地域</b>：候補者の活動地域が、来店可能エリア（一致100）・店舗と同じ市区町村（80）・同じ都道府県（50）・それ以外（15）。フォロワーの地域分布は本人のインサイトでしか分からないため確認事項に表示。</li>' +
      '<li><b>ジャンル</b>：発信ジャンル・ハッシュタグと、店舗ジャンル・料理・商品の一致数（2つ以上100・1つ70・一般的なグルメ40・不一致15）。</li>' +
      '<li><b>反応</b>：フォロワー数と直近投稿' + s.minPostsForEngagement + '件以上の反応数・再生数から反応率を出し、上の目安で点数化。ばらつきが大きい場合は−10。<b>フォロワー数だけでは評価しません。</b></li>' +
      '<li><b>品質</b>：担当者が投稿を見て付けた5段階評価×20。</li>' +
      '<li><b>キャンペーン適合</b>：希望SNS・希望投稿形式・目的（動画素材なら動画投稿、来店促進なら地域適合70以上）との一致の平均。</li>' +
      '<li><b>費用</b>：確認済み料金と予算上限・依頼の形（無料招待／有償）との比較。料金未確認は未確認のまま。</li>' +
      '<li>未確認の項目は0点にせず、評価できた項目だけで加重平均。各項目は候補ごとに担当者評価（理由必須）で上書きできます。</li></ul></div>';
    const autoBox = document.createElement('div');
    main.appendChild(autoBox);
    root.FS.infautoui.renderSettings(autoBox);
    U.$('#save', main).addEventListener('click', () => {
      const errs = [];
      const num = (v, label) => { const n = Number(v); if (!isFinite(n) || n < 0) { errs.push(label + 'は0以上の数値で入力してください'); return null; } return n; };
      const w = {};
      U.$$('[data-w]', main).forEach((el) => { w[el.dataset.w] = num(el.value, I.CRITERIA.find((c) => c.key === el.dataset.w).label + 'の重み'); });
      if (Object.values(w).every((x) => !x)) errs.push('重みがすべて0です');
      const nb = { engagementBands: s.engagementBands.map((b) => Object.assign({}, b)), viewBands: s.viewBands.map((b) => Object.assign({}, b)) };
      U.$$('[data-band]', main).forEach((el) => { nb[el.dataset.band][Number(el.dataset.i)][el.dataset.k] = num(el.value, '目安'); });
      const minPosts = num(U.$('#minPosts', main).value, '最少件数'), minCov = num(U.$('#minCov', main).value, '割合'), minKnown = num(U.$('#minKnown', main).value, '項目数'), fit = num(U.$('#fit', main).value, '点数');
      if (errs.length) { U.toast(errs.join('／'), 'error'); return; }
      const before = JSON.stringify(s.weights);
      Object.assign(s, { weights: w, engagementBands: nb.engagementBands, viewBands: nb.viewBands, minPostsForEngagement: Math.max(1, minPosts), minCoverage: minCov, minKnownCriteria: minKnown, fitThreshold: fit });
      S.log('評価の設定を変更しました', { type: 'settings', id: '', label: 'インフルエンサー評価' }, '重み：' + before + ' → ' + JSON.stringify(w));
      S.save(true);
      U.toast('保存しました', 'ok');
      settingsView(main);
    });
    U.$('#reset', main).addEventListener('click', async () => {
      const ok = await U.modal({ title: '初期値に戻す', body: '<p>重みと基準を初期値に戻します。</p>', confirmLabel: '戻す' });
      if (!ok) return;
      st.settings = I.defaultSettings();
      S.log('評価の設定を初期値に戻しました', { type: 'settings', id: '', label: 'インフルエンサー評価' }, '');
      S.save(true);
      settingsView(main);
    });
  }

  // ───────── テスト用データ（架空・【テスト】表記）─────────
  function loadSample() {
    const st = X.inf();
    const all = S.get();
    let store = all.stores.find((s) => s.name === '【サンプル】カフェA');
    if (!store) { store = { id: S.uid('store'), name: '【サンプル】カフェA', kind: 'client', aliases: [], memo: '動作確認用のサンプル店舗です（実在しません）', reportTemplate: '', createdAt: Date.now() }; all.stores.push(store); }
    const camp = Object.assign(newCampaign(), {
      title: '【テスト】秋の新作スイーツ 来店促進', storeId: store.id, address: '香川県高松市（テスト用）', areas: ['高松市', '瓦町'], radiusKm: '10',
      genres: ['スイーツ', 'カフェ'], dishes: 'ケーキ、パフェ', products: '秋の新作ケーキ（テスト）', pricePerPerson: '1,500円', target: '20〜30代',
      purposes: ['来店促進', 'リール等の動画素材獲得'], platforms: ['instagram'], formats: ['リール'], compensation: 'free', offer: 'ケーキセット（テスト）',
    });
    st.campaigns.push(camp);
    S.log('テスト用キャンペーンを追加しました', { type: 'campaign', id: camp.id, label: camp.title }, '', camp);
    const rows = [
      ['【テスト】高松グルメ子', 'test_takamatsu_gourmet', 'instagram', ['高松市', '瓦町'], ['スイーツ', 'カフェ'], ['高松スイーツ', '香川カフェ'], ['リール', 'フィード'], 12000, [420, 380, 510, 450], null, 4, 0],
      ['【テスト】うどん動画マン', 'test_udon_movie', 'tiktok', ['香川県'], ['うどん', '食べ歩き'], ['香川うどん'], ['TikTok動画'], 85000, null, [30000, 12000, 90000], 3, null],
      ['【テスト】大阪ラーメン', 'test_osaka_ramen', 'instagram', ['大阪市'], ['ラーメン'], [], ['フィード'], 200000, null, null, null, null],
    ];
    rows.forEach(([dn, h, pf, areas, genres, tags, formats, fol, re, vi, q, fee]) => {
      const urls = { instagram: 'https://www.instagram.com/' + h + '/', tiktok: 'https://www.tiktok.com/@' + h };
      if (st.candidates.some((c) => I.parseProfileUrl(c.profileUrl).key === I.parseProfileUrl(urls[pf]).key)) return;
      const c = Object.assign(X.newCandidate(), { displayName: dn, handle: h, platform: pf, profileUrl: urls[pf], areas, genres, hashtags: tags, formats, notes: 'テスト用の架空データです' });
      const d = X.today();
      c.followers = I.fact(fol, h === 'test_osaka_ramen' ? 'estimated' : 'confirmed', h === 'test_osaka_ramen' ? '紹介者からの聞き取り（テスト）' : 'プロフィール画面（テスト）', d, S.user());
      if (re) c.recentReactions = I.fact(re, 'confirmed', '投稿画面（テスト）', d, S.user());
      if (vi) c.recentViews = I.fact(vi, 'confirmed', '動画一覧（テスト）', d, S.user());
      if (q) c.quality = { rating: q, mood: 'テスト', note: '', checkedBy: S.user(), checkedAt: d };
      if (fee !== null) c.fee = I.fact(fee, 'confirmed', '本人の公開プロフィール（テスト）', d, S.user());
      if (h === 'test_takamatsu_gourmet') c.contact = { method: 'プロフィール記載のメール', value: '（テスト用・架空）', sourceUrl: c.profileUrl };
      c.source = { type: '手動登録', detail: 'テスト用データ', obtainedAt: d, by: S.user() };
      st.candidates.push(c);
      X.pushHistory(c, ['テスト用データとして登録'], '候補者を登録しました');
    });
    S.save(true);
  }

  root.FS.views.infList = list;
  root.FS.views.infCampaign = detail;
  root.FS.views.infLink = linkView;
  root.FS.views.infSettings = settingsView;
})(self);
