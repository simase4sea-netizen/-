/* 画面：店舗情報の収集・整理（URLの一括登録／貼り付け・スクリーンショット・過去投稿・Instagramからの整理／候補の採用）
 * グルメ媒体・Googleマップのページは自動で読み取らない。抜き出した情報は候補として表示し、担当者が採用したものだけを店舗情報に反映する。 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const F = root.FS.format;
  const GP = root.FS.gpost;
  const GC = root.FS.gcollect;
  const V = root.FS.views;
  const esc = U.esc;

  function aiReady() { const a = S.get().settings.ai || {}; return !!(a.enabled && a.apiKey); }
  function igCfg() { const A = root.FS.infautoui; const c = A ? A.cfg() : {}; return c.igToken && c.igUserId ? c : null; }
  function today() { const d = new Date(); return d.getFullYear() + '-' + String(d.getMonth() + 1).padStart(2, '0') + '-' + String(d.getDate()).padStart(2, '0'); }
  function infoOf(store) { store.gpost = GP.storeInfo(store); return store.gpost; }
  function mediaBadge(src) { const cls = { gourmet: 'warn', reserve: 'warn', sns: 'client', map: 'own', official: 'gray' }[src.kind] || 'gray'; return '<span class="badge ' + cls + '">' + esc(src.mediaLabel || src.label) + '</span>'; }
  function storeBanner(s, extra) {
    return '<div class="target ' + (s.kind === 'own' ? 'own' : 'client') + '" id="gpTarget"><div class="grow"><div class="tsub">作業中の店舗</div><div class="tname">' + esc(s.name) + ' ' + U.kindBadge(s.kind) + '</div>' + (extra ? '<div class="tsub">' + extra + '</div>' : '') + '</div></div>';
  }

  // URLを店舗の「参照URL」に登録する。GoogleマップURL・予約サイトURLは候補にも入れる。
  function registerUrls(store, items) {
    const info = infoOf(store);
    let added = 0;
    const now = Date.now();
    items.forEach((c) => {
      if (info.sources.some((x) => x.url === c.url)) return;
      const src = { id: S.uid('src'), type: 'url', media: c.media, mediaLabel: c.label, kind: c.kind, label: c.label, url: c.url, handle: c.handle || '', addedAt: now, addedBy: S.user() };
      info.sources.push(src);
      added++;
      if (c.media === 'gmap') GC.addCandidates(info, [{ field: 'mapsUrl', value: c.url, evidence: c.url }], src, S.uid, now, S.user());
      if (c.kind === 'reserve') GC.addCandidates(info, [{ field: 'reserveUrl', value: c.url, evidence: c.url }], src, S.uid, now, S.user());
    });
    return added;
  }

  // ───────── URLの一括登録 ─────────
  function collect(main) {
    const st = S.get();
    const stores = st.stores.slice().sort((a, b) => (a.kind === b.kind ? a.name.localeCompare(b.name, 'ja') : a.kind === 'own' ? -1 : 1));
    main.innerHTML = '<h1>URL・過去投稿から店舗情報を整理</h1><p class="lead">店舗のグルメ媒体・SNS・GoogleマップのURLをまとめて貼り付けると、店舗ごと・媒体ごとに振り分けて登録します。登録後、店舗ごとの「情報の整理」画面で、ページの本文・スクリーンショット・過去投稿から情報を抜き出し、確認して店舗情報に反映します。</p>' +
      '<div class="alert small"><b>自動で取得するのは Instagram（公式API・設定済みの場合）だけです。</b>食べログなどのグルメ媒体・Googleマップのページは、利用規約で自動収集が禁止・制限されているため自動では読み取りません。ページを開き、本文をコピーして貼り付けるか、スクリーンショットで整理します。</div>' +
      '<div class="panel"><h2>URLをまとめて登録</h2>' +
      '<div class="field"><label for="cStore">店舗（「【店舗名】」の見出しが無いURLの登録先）</label><select id="cStore"><option value="">（見出しで指定する）</option>' + stores.map((s) => '<option value="' + s.id + '">' + esc(s.name) + '（' + (s.kind === 'own' ? '自社店舗' : '顧客案件') + '）</option>').join('') + '</select></div>' +
      '<div class="field"><label for="cUrls">URL（1行に1つ。複数店舗は「【店舗名】」の行で区切る）</label><textarea id="cUrls" style="min-height:180px" placeholder="【出世魚】&#10;https://tabelog.com/...&#10;https://www.instagram.com/...&#10;https://maps.app.goo.gl/...&#10;【飴のち林檎】&#10;https://..."></textarea></div>' +
      '<div class="btns"><button class="btn primary" id="cGo">振り分けて登録</button></div></div>' +
      '<div class="panel"><h2>店舗ごとの整理状況</h2><table class="tbl" id="cList"><thead><tr><th>店舗</th><th>参照URL</th><th>過去投稿</th><th>未確認の候補</th><th></th></tr></thead><tbody>' +
      stores.map((s) => { const i = GP.storeInfo(s); const pend = i.candidates.filter((c) => c.status === 'pending').length; return '<tr><td>' + U.kindBadge(s.kind) + ' ' + esc(s.name) + '</td><td>' + i.sources.length + '件</td><td>' + i.pastPosts.length + '件</td><td>' + (pend ? '<span class="badge warn">' + pend + '件</span>' : '0件') + '</td><td class="right"><a class="btn small" href="#/gpost/info/' + s.id + '">情報の整理</a></td></tr>'; }).join('') +
      '</tbody></table></div>';

    U.$('#cGo', main).addEventListener('click', async () => {
      const r = GC.parseUrlBlock(U.$('#cUrls', main).value, st.stores, U.$('#cStore', main).value || null);
      if (!r.groups.length && !r.errors.length) { U.toast('URLが見つかりません', 'error'); return; }
      const ig = igCfg();
      const igCount = r.groups.reduce((n, g) => n + g.items.filter((x) => x.handle).length, 0);
      const ok = await U.modal({
        title: 'URLの振り分け（' + r.groups.length + '店舗）',
        body: (r.errors.length ? '<div class="alert danger small"><b>登録しない行があります：</b><br>' + r.errors.map(esc).join('<br>') + '</div>' : '') +
          r.groups.map((g) => { const s = S.storeById(g.storeId); return '<div class="panel" style="padding:10px" data-cg="' + g.storeId + '"><b>【' + esc(s.name) + '】</b> ' + U.kindBadge(s.kind) + '<ul class="small">' + g.items.map((x) => '<li>' + mediaBadge({ kind: x.kind, label: x.label }) + ' ' + esc(x.url) + (x.post ? ' <span class="muted">（投稿のURL。アカウントのURLだと自動取得できます）</span>' : '') + '</li>').join('') + '</ul></div>'; }).join('') +
          (igCount ? (ig ? '<label style="display:flex;gap:8px"><input type="checkbox" id="cIg" checked> Instagramアカウント（' + igCount + '件）のプロフィール文と最近の投稿を公式APIで取得し、過去投稿として登録する</label>' : '<div class="alert warn small">Instagramの取得設定が未設定のため、Instagramは自動取得しません（「評価の設定」→「自動選定の設定」で設定できます）。</div>') : ''),
        check: r.groups.length ? '登録先の店舗とURLの組み合わせが正しいことを確認しました' : null,
        confirmLabel: r.groups.length ? '登録する' : null,
        collect: (bg) => ({ ig: !!(bg.querySelector('#cIg') && bg.querySelector('#cIg').checked) }),
      });
      if (!ok || !r.groups.length) return;
      const lines = [];
      for (const g of r.groups) {
        const s = S.storeById(g.storeId);
        const n = registerUrls(s, g.items);
        S.log('参照URLを登録しました', { type: 'gstore', id: s.id, label: s.name }, n + '件（' + Array.from(new Set(g.items.map((x) => x.label))).join('・') + '）');
        lines.push(s.name + '：' + n + '件登録');
        if (ok.ig) {
          for (const x of g.items.filter((y) => y.handle)) {
            try { const res = await fetchInstagram(s, x.handle, 'rule'); lines.push(s.name + '：Instagram @' + x.handle + ' から過去投稿' + res.posts + '件・候補' + res.cands + '件'); }
            catch (e) { lines.push(s.name + '：' + e.message); }
          }
        }
      }
      S.save(true);
      await U.modal({ title: '登録しました', body: '<ul class="small">' + lines.map((l) => '<li>' + esc(l) + '</li>').join('') + '</ul><p class="small">続けて、店舗ごとの「情報の整理」で本文の貼り付け・過去投稿の追加・候補の確認を行ってください。</p>', confirmLabel: 'OK', hideCancel: true });
      collect(main);
    });
  }

  // ───── 抜き出し（AI：外部送信あり／ルール：外部送信なし） ─────
  async function chooseMode(store, what, opts) {
    opts = opts || {};
    const ai = aiReady();
    if (opts.imageOnly && !ai) {
      await U.modal({ title: 'スクリーンショットの整理', body: '<p>画像から文字を読み取るには、AI（「設定」でAPIキーを登録して有効化）が必要です。AIを使わない場合は、ページの本文をコピーして貼り付けてください。</p>', confirmLabel: 'OK', hideCancel: true });
      return null;
    }
    const res = await U.modal({
      title: '情報を整理する：' + what,
      body: '<div class="confirm-target badge ' + (store.kind === 'own' ? 'own' : 'client') + '" style="display:block">' + esc(store.name) + '</div>' +
        (opts.imageOnly ? '' : '<label style="display:flex;gap:8px;margin-top:8px"><input type="radio" name="cm" value="rule"' + (ai ? '' : ' checked') + '> <span><b>ルールで整理</b>（外部送信なし）：営業時間・定休日・住所・アクセス・駐車場・メニューと価格など、決まった形の情報だけを抜き出します。</span></label>') +
        (ai ? '<label style="display:flex;gap:8px;margin-top:6px"><input type="radio" name="cm" value="ai" checked> <span><b>AIで整理</b>（外部送信あり）：雰囲気・利用シーン・特徴なども含めて、根拠の文つきで抜き出します。内容を Anthropic API（Claude）へ送信します。個人情報・ログイン情報が含まれていないか確認してください。</span></label>' : '<p class="small muted">AIで整理するには「設定」でAPIキーを登録し、AIを有効にしてください。</p>') +
        '<p class="small">抜き出した情報は<b>候補</b>として表示されます。確認して「採用」したものだけが店舗情報に入ります。</p>',
      check: '送る内容と、対象の店舗が正しいことを確認しました',
      confirmLabel: '整理する',
      collect: (bg) => ({ mode: (bg.querySelector('input[name=cm]:checked') || {}).value || 'ai' }),
    });
    return res ? res.mode : null;
  }

  // 1件の資料（本文・画像）から候補を作って店舗に追加する
  async function extract(store, source, mode, images) {
    const info = infoOf(store);
    let result;
    if (mode === 'ai') result = await root.FS.ai.extractStoreInfo(store.name, source, images || []);
    else result = { candidates: GC.ruleExtract(source.text || '').map((c) => Object.assign(c, { checkNotes: [] })), notes: [] };
    const n = GC.addCandidates(info, result.candidates, source, S.uid, Date.now(), S.user());
    S.log('資料から店舗情報の候補を作りました', { type: 'gstore', id: store.id, label: store.name }, source.label + '：候補' + n + '件（' + (mode === 'ai' ? 'AI' : 'ルール') + '）');
    S.save(true);
    return { added: n, notes: result.notes || [] };
  }

  // Instagram（公式API Business Discovery）：プロフィール文と最近の投稿文を取得し、投稿は過去投稿として登録する
  async function fetchInstagram(store, handle, mode) {
    const c = igCfg();
    if (!c) throw new Error('Instagramの取得設定が未設定です');
    const fields = 'business_discovery.username(' + handle + '){username,name,biography,website,media.limit(25){caption,timestamp,permalink}}';
    const url = 'https://graph.facebook.com/' + encodeURIComponent(c.graphVersion) + '/' + encodeURIComponent(c.igUserId) + '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(c.igToken);
    const r = await root.FS.infautoui.getJson(url, 'Instagram「@' + handle + '」');
    const bd = r.business_discovery;
    if (!bd) throw new Error('Instagram「@' + handle + '」：プロアカウントではないため取得できません');
    const info = infoOf(store);
    const now = Date.now();
    let src = info.sources.find((x) => x.media === 'instagram' && x.handle === handle);
    if (!src) { src = { id: S.uid('src'), type: 'url', media: 'instagram', mediaLabel: 'Instagram', kind: 'sns', label: 'Instagram', url: 'https://www.instagram.com/' + handle + '/', handle, addedAt: now, addedBy: S.user() }; info.sources.push(src); }
    src.fetchedAt = now;
    const added = [];
    ((bd.media && bd.media.data) || []).forEach((m) => {
      if (!m.caption || info.pastPosts.some((p) => p.url && p.url === m.permalink)) return;
      const pp = { id: S.uid('pp'), platform: 'Instagram', date: String(m.timestamp || '').slice(0, 10), text: m.caption, url: m.permalink || '', source: 'Instagram公式API（@' + handle + '）', addedAt: now, addedBy: S.user() };
      info.pastPosts.push(pp);
      added.push(pp);
    });
    const posts = added.length;
    const bio = [bd.name, bd.biography, bd.website].filter(Boolean).join('\n');
    let cands = 0;
    if (bio) cands += (await extract(store, { id: src.id, type: 'instagram', label: 'Instagramプロフィール（@' + handle + '）', url: src.url, text: bio }, mode)).added;
    // 新しく取り込んだ投稿文からも整理する（過去投稿の情報として扱う）
    cands += (await extractPosts(store, added, mode)).added;
    S.log('Instagramから店舗の情報を取得しました', { type: 'gstore', id: store.id, label: store.name }, '@' + handle + '：過去投稿' + posts + '件');
    S.save(true);
    return { posts, cands };
  }

  // ───────── 店舗ごとの「情報の整理」 ─────────
  function infoPage(main, id) {
    const s = S.storeById(id);
    if (!s) { main.innerHTML = '<div class="empty">店舗が見つかりません。</div>'; return; }
    const info = infoOf(s);
    const rows = GC.reviewRows(info);
    const tags = GC.hashtags(info.pastPosts.map((p) => p.text)).slice(0, 15);
    const rerender = () => infoPage(main, id);
    const posts = info.pastPosts.slice().sort((a, b) => String(b.date || '').localeCompare(String(a.date || '')));
    main.innerHTML = '<div class="btns" style="margin-bottom:8px"><a class="btn small" href="#/gpost/collect">← URL・過去投稿から整理</a><a class="btn small" href="#/gpost/store/' + s.id + '">店舗情報を編集</a><a class="btn small primary" href="#/gpost?store=' + s.id + '">この店舗の投稿を作成</a></div>' +
      storeBanner(s, '情報の整理：資料から抜き出した候補を確認し、採用したものだけを店舗情報に反映します') +

      '<div class="panel"><h2>1. 参照URL・資料</h2>' +
      (info.sources.length ? '<table class="tbl" id="srcList"><thead><tr><th>媒体</th><th>URL</th><th>登録日</th><th>整理の方法</th></tr></thead><tbody>' + info.sources.map((x) => {
        const h = GC.howTo(x.media);
        return '<tr data-src="' + x.id + '"><td>' + mediaBadge(x) + '</td><td class="small"><a href="' + esc(x.url) + '" target="_blank" rel="noopener">' + esc(x.url) + '</a>' + (x.fetchedAt ? '<div class="muted">取得：' + F.fmtDateTime(x.fetchedAt) + '</div>' : '') + (x.extractedAt ? '<div class="muted">整理：' + F.fmtDateTime(x.extractedAt) + '</div>' : '') + '</td><td class="small nowrap">' + F.fmtDateTime(x.addedAt) + '</td><td class="small">' +
          '<div class="muted">' + esc(h.note) + '</div><div class="btns" style="margin-top:4px">' + (x.media === 'instagram' && x.handle ? '<button class="btn small" data-ig="' + x.id + '">Instagramから取得</button>' : '') + '<button class="btn small" data-paste="' + x.id + '">本文を貼り付けて整理</button><button class="btn small" data-img="' + x.id + '">スクリーンショットで整理</button><button class="btn small danger" data-sdel="' + x.id + '">削除</button></div></td></tr>';
      }).join('') + '</tbody></table>' : '<div class="empty">参照URLは未登録です。</div>') +
      '<div class="row" style="margin-top:10px"><div class="field" style="flex:1 1 360px"><label for="addUrl">URLを追加</label><input type="text" id="addUrl" placeholder="https://"></div><div class="field" style="flex:0 0 auto"><button class="btn" id="addUrlBtn">追加</button></div></div>' +
      '<div class="btns"><button class="btn" data-paste="">URLなしで本文を貼り付けて整理</button></div></div>' +

      '<div class="panel"><h2>2. 過去投稿</h2><p class="small muted">この店舗の過去のGoogle投稿・Instagram投稿などを貼り付けます。情報（メニュー・価格・特徴など）の候補を抜き出すほか、投稿文を作るときに<b>文章の雰囲気・よく使う言い回しの参考</b>にします（この店舗の過去投稿だけを使います。価格など古い可能性がある情報は事実として使いません）。</p>' +
      '<div class="row"><div class="field" style="flex:0 1 180px"><label for="ppPf">媒体</label><select id="ppPf"><option>Google投稿</option><option>Instagram</option><option>LINE</option><option>X</option><option>その他</option></select></div><div class="field" style="flex:0 1 180px"><label for="ppDate">投稿日（分かれば）</label><input type="date" id="ppDate"></div></div>' +
      '<div class="field"><label for="ppText">過去投稿（複数の場合は「---」だけの行で区切る）</label><textarea id="ppText" style="min-height:160px" placeholder="1件目の投稿文&#10;---&#10;2件目の投稿文"></textarea></div>' +
      '<label style="display:flex;gap:8px;margin-bottom:8px"><input type="checkbox" id="ppExtract" checked> 追加した過去投稿から情報を整理する</label>' +
      '<div class="btns"><button class="btn primary" id="ppAdd">過去投稿を追加</button>' + (posts.length ? '<button class="btn" id="ppAll">登録済みの過去投稿すべてから整理</button>' : '') + '</div>' +
      (posts.length ? '<table class="tbl small" id="ppList" style="margin-top:10px"><thead><tr><th>投稿日</th><th>媒体</th><th>内容</th><th></th></tr></thead><tbody>' + posts.map((p) => '<tr><td class="nowrap">' + esc(p.date || '不明') + '</td><td class="nowrap">' + esc(p.platform) + '</td><td>' + esc(Array.from(p.text).slice(0, 90).join('')) + (p.text.length > 90 ? '…' : '') + (p.url ? ' <a href="' + esc(p.url) + '" target="_blank" rel="noopener">元の投稿</a>' : '') + '</td><td class="right"><button class="btn small danger" data-pdel="' + p.id + '">削除</button></td></tr>').join('') + '</tbody></table>' : '') +
      (tags.length ? '<p class="small" style="margin-top:8px"><b>よく使うハッシュタグ</b>：' + tags.map((t) => esc(t.tag) + '（' + t.count + '）').join('　') + '</p>' : '') + '</div>' +

      '<div class="panel"><h2>3. 整理された情報（候補）</h2><p class="small muted">資料から抜き出した情報です。<b>採用するまで店舗情報・投稿文には使いません。</b>媒体どうし・登録済みの値と食い違うものには印が付きます。どれが正しいか店舗に確認してから採用してください。</p>' +
      (rows.length ? '<div class="btns" style="margin-bottom:8px"><button class="btn" id="applySafe">食い違い・要確認のない候補をまとめて採用</button></div><table class="tbl" id="candList"><thead><tr><th>項目</th><th>登録済みの値</th><th>候補（出典・根拠）</th></tr></thead><tbody>' + rows.map((r) =>
        '<tr><td><b>' + esc(r.label) + '</b>' + (r.conflict ? '<div><span class="badge danger">食い違い</span></div>' : '') + '</td><td class="small">' + (r.current ? esc(r.current) : '<span class="muted">未登録</span>') + '</td><td>' +
        r.candidates.map((c) => '<div class="gc-cand" data-cand="' + c.id + '"><div>' + esc(c.field === 'menu' ? [c.value.name, c.value.price, c.value.period].filter(Boolean).join('　') + (c.value.description ? '：' + c.value.description : '') : c.value) + '</div>' +
          (c.field !== 'menu' && r.current && String(r.current).replace(/\s+/g, '') === String(c.value).replace(/\s+/g, '') ? ' <span class="badge ok">登録済みと同じ</span>' : '') + '<div class="small muted">出典：' + esc(c.sourceLabel) + (c.sourceDate ? '（' + esc(c.sourceDate) + '）' : '') + (c.fromPastPost ? ' <span class="badge warn">過去投稿の情報：現在も同じか確認</span>' : '') + (c.checkNotes && c.checkNotes.length ? ' <span class="badge warn">要確認：' + esc(c.checkNotes.join('・')) + '</span>' : '') + '<br>根拠：「' + esc(c.evidence) + '」</div>' +
          '<div class="btns"><button class="btn small ok" data-apply="' + c.id + '">採用</button><button class="btn small" data-reject="' + c.id + '">不採用</button></div></div>').join('') + '</td></tr>').join('') + '</tbody></table>' : '<div class="empty">確認待ちの候補はありません。</div>') +
      '</div>';

    // URLの追加・削除
    U.$('#addUrlBtn', main).addEventListener('click', () => {
      const c = GC.classifyUrl(U.$('#addUrl', main).value);
      if (!c) { U.toast('URLを読み取れません（https:// から入力してください）', 'error'); return; }
      const n = registerUrls(s, [c]);
      if (!n) { U.toast('登録済みのURLです', 'error'); return; }
      S.log('参照URLを登録しました', { type: 'gstore', id: s.id, label: s.name }, c.label);
      S.save(true);
      rerender();
    });
    U.$$('[data-sdel]', main).forEach((b) => b.addEventListener('click', async () => {
      const x = info.sources.find((y) => y.id === b.dataset.sdel);
      if (!(await U.modal({ title: '参照URLの削除', body: '<p>' + esc(x.url) + ' を削除します。抜き出し済みの候補は残ります。</p>', confirmLabel: '削除する', danger: true }))) return;
      info.sources = info.sources.filter((y) => y !== x);
      S.log('参照URLを削除しました', { type: 'gstore', id: s.id, label: s.name }, x.url);
      S.save(true);
      rerender();
    }));
    // 本文の貼り付け
    U.$$('[data-paste]', main).forEach((b) => b.addEventListener('click', async () => {
      const x = info.sources.find((y) => y.id === b.dataset.paste) || { id: '', label: '貼り付けた本文', url: '' };
      const r = await U.modal({
        title: '本文を貼り付けて整理：' + (x.mediaLabel || x.label),
        body: (x.url ? '<p class="small"><a href="' + esc(x.url) + '" target="_blank" rel="noopener">ページを開く</a> → 店舗情報・メニューの部分を選択してコピーし、下に貼り付けてください。口コミの文章は貼り付けないでください。</p>' : '') +
          '<div class="field"><label for="gcText">本文</label><textarea id="gcText" style="min-height:220px"></textarea></div><p class="small muted">貼り付けた本文は保存しません（抜き出した候補と根拠の文だけを保存します）。</p>',
        confirmLabel: '次へ',
        collect: (bg) => ({ text: bg.querySelector('#gcText').value.trim() }),
      });
      if (!r || !r.text) return;
      const mode = await chooseMode(s, x.mediaLabel || x.label);
      if (!mode) return;
      try {
        const out = await extract(s, { id: x.id, type: 'text', label: (x.mediaLabel || x.label) + 'の本文', url: x.url, text: r.text }, mode);
        if (x.id) x.extractedAt = Date.now();
        S.save(true);
        await resultModal(out);
      } catch (e) { U.toast('整理できませんでした：' + e.message, 'error'); }
      rerender();
    }));
    // スクリーンショット（AIのみ）
    U.$$('[data-img]', main).forEach((b) => b.addEventListener('click', async () => {
      const x = info.sources.find((y) => y.id === b.dataset.img);
      const r = await U.modal({ title: 'スクリーンショットで整理：' + (x.mediaLabel || x.label), body: '<div class="field"><label for="gcImg">画像（PNG・JPEG・WebP。複数可）</label><input type="file" id="gcImg" accept="image/png,image/jpeg,image/webp" multiple></div><p class="small muted">画像は整理のときだけ使い、保存しません。</p>', confirmLabel: '次へ', collect: (bg) => ({ files: Array.from(bg.querySelector('#gcImg').files) }) });
      if (!r || !r.files.length) return;
      const mode = await chooseMode(s, (x.mediaLabel || x.label) + 'のスクリーンショット', { imageOnly: true });
      if (!mode) return;
      const images = await Promise.all(r.files.map((f) => new Promise((res) => { const fr = new FileReader(); fr.onload = () => res({ name: f.name, dataUrl: fr.result }); fr.readAsDataURL(f); })));
      try {
        const out = await extract(s, { id: x.id, type: 'image', label: (x.mediaLabel || x.label) + 'のスクリーンショット', url: x.url, text: '' }, 'ai', images);
        x.extractedAt = Date.now();
        S.save(true);
        await resultModal(out);
      } catch (e) { U.toast('整理できませんでした：' + e.message, 'error'); }
      rerender();
    }));
    // Instagram
    U.$$('[data-ig]', main).forEach((b) => b.addEventListener('click', async () => {
      const x = info.sources.find((y) => y.id === b.dataset.ig);
      if (!igCfg()) { U.toast('Instagramの取得設定が未設定です（「評価の設定」→「自動選定の設定」）', 'error'); return; }
      const mode = await chooseMode(s, 'Instagram @' + x.handle + ' のプロフィール文');
      if (!mode) return;
      try {
        const r = await fetchInstagram(s, x.handle, mode);
        U.toast('過去投稿 ' + r.posts + '件・候補 ' + r.cands + '件を追加しました', 'ok');
      } catch (e) { U.toast(e.message, 'error'); }
      rerender();
    }));
    // 過去投稿
    U.$('#ppAdd', main).addEventListener('click', async () => {
      const parts = GC.splitPastPosts(U.$('#ppText', main).value);
      if (!parts.length) { U.toast('過去投稿を貼り付けてください', 'error'); return; }
      const now = Date.now();
      const pf = U.$('#ppPf', main).value;
      const date = U.$('#ppDate', main).value;
      const added = parts.filter((t) => !info.pastPosts.some((p) => p.text === t)).map((t) => ({ id: S.uid('pp'), platform: pf, date, text: t, url: '', source: '貼り付け', addedAt: now, addedBy: S.user() }));
      info.pastPosts.push.apply(info.pastPosts, added);
      S.log('過去投稿を追加しました', { type: 'gstore', id: s.id, label: s.name }, added.length + '件（' + pf + '）');
      S.save(true);
      if (added.length && U.$('#ppExtract', main).checked) await extractPast(s, added);
      else U.toast(added.length + '件追加しました', 'ok');
      rerender();
    });
    const all = U.$('#ppAll', main);
    if (all) all.addEventListener('click', async () => { await extractPast(s, info.pastPosts); rerender(); });
    U.$$('[data-pdel]', main).forEach((b) => b.addEventListener('click', async () => {
      if (!(await U.modal({ title: '過去投稿の削除', body: '<p>この過去投稿を削除します。</p>', confirmLabel: '削除する', danger: true }))) return;
      info.pastPosts = info.pastPosts.filter((p) => p.id !== b.dataset.pdel);
      S.log('過去投稿を削除しました', { type: 'gstore', id: s.id, label: s.name }, '');
      S.save(true);
      rerender();
    }));
    // 候補の採用・不採用
    const apply = (cand) => {
      const desc = GC.applyCandidate(info, cand, S.uid, Date.now(), S.user());
      S.log('店舗情報の候補を採用しました', { type: 'gstore', id: s.id, label: s.name }, desc + '（出典：' + cand.sourceLabel + '）');
      return desc;
    };
    U.$$('[data-apply]', main).forEach((b) => b.addEventListener('click', async () => {
      const cand = info.candidates.find((c) => c.id === b.dataset.apply);
      const row = rows.find((r) => r.candidates.includes(cand));
      const warn = (row && row.conflict) || cand.fromPastPost || (cand.checkNotes || []).length;
      if (warn) {
        const ok = await U.modal({ title: '候補の採用', body: '<p>「' + esc(cand.field === 'menu' ? cand.value.name + ' ' + cand.value.price : cand.value) + '」を店舗情報に反映します。</p>' + (row && row.conflict ? '<div class="alert danger small">ほかの資料・登録済みの値と食い違っています。</div>' : '') + (cand.fromPastPost ? '<div class="alert warn small">過去投稿の情報です。現在も同じとは限りません。</div>' : ''), check: '店舗に確認するなどして、現在の正しい情報であることを確認しました', confirmLabel: '採用する' });
        if (!ok) return;
      }
      U.toast(apply(cand), 'ok');
      S.save(true);
      rerender();
    }));
    U.$$('[data-reject]', main).forEach((b) => b.addEventListener('click', () => {
      const cand = info.candidates.find((c) => c.id === b.dataset.reject);
      Object.assign(cand, { status: 'rejected', decidedAt: Date.now(), decidedBy: S.user() });
      S.log('店舗情報の候補を不採用にしました', { type: 'gstore', id: s.id, label: s.name }, (cand.field === 'menu' ? cand.value.name : GC.FIELD_LABEL[cand.field] + '：' + cand.value));
      S.save(true);
      rerender();
    }));
    const safe = U.$('#applySafe', main);
    if (safe) safe.addEventListener('click', async () => {
      const targets = rows.filter((r) => !r.conflict && r.candidates.length === 1 && !r.candidates[0].fromPastPost && !(r.candidates[0].checkNotes || []).length).map((r) => r.candidates[0]);
      if (!targets.length) { U.toast('まとめて採用できる候補はありません（食い違い・過去投稿・要確認の候補は1件ずつ確認してください）', 'error'); return; }
      const ok = await U.modal({ title: '候補をまとめて採用（' + targets.length + '件）', body: '<ul class="small">' + targets.map((c) => '<li>' + esc(GC.FIELD_LABEL[c.field]) + '：' + esc(c.field === 'menu' ? c.value.name + ' ' + c.value.price : c.value) + '</li>').join('') + '</ul>', check: '内容を確認しました', confirmLabel: '採用する' });
      if (!ok) return;
      targets.forEach(apply);
      S.save(true);
      U.toast(targets.length + '件を採用しました', 'ok');
      rerender();
    });
  }

  // 過去投稿から候補を作る（AIはまとめて1回、ルールは1件ずつ。どちらも「過去投稿の情報」として印を付ける）
  async function extractPosts(store, posts, mode) {
    let added = 0;
    const notes = [];
    if (!posts.length) return { added, notes };
    if (mode === 'ai') {
      const text = posts.map((p, i) => '### 過去投稿' + (i + 1) + '（' + p.platform + (p.date ? '・' + p.date : '') + '）\n' + p.text).join('\n\n');
      const out = await extract(store, { id: '', type: 'pastpost', label: '過去投稿' + posts.length + '件', date: posts.length === 1 ? posts[0].date : '', text }, 'ai');
      added += out.added;
      notes.push.apply(notes, out.notes);
    } else {
      for (const p of posts) added += (await extract(store, { id: p.id, type: 'pastpost', label: '過去投稿（' + p.platform + '）', date: p.date, text: p.text }, 'rule')).added;
    }
    return { added, notes };
  }

  async function extractPast(store, posts) {
    const mode = await chooseMode(store, '過去投稿' + posts.length + '件');
    if (!mode) return;
    try { await resultModal(await extractPosts(store, posts, mode)); } catch (e) { U.toast('整理できませんでした：' + e.message, 'error'); }
  }

  async function resultModal(out) {
    await U.modal({ title: '整理しました', body: '<p>候補を <b>' + out.added + '件</b> 追加しました。「整理された情報（候補）」で確認して採用してください。</p>' + (out.notes && out.notes.length ? '<div class="alert warn small"><b>確認事項：</b><br>' + out.notes.map(esc).join('<br>') + '</div>' : ''), confirmLabel: 'OK', hideCancel: true });
  }

  V.gpostCollect = collect;
  V.gpostInfo = infoPage;
  root.FS.gcollectui = { registerUrls, extract, fetchInstagram };
})(self);
