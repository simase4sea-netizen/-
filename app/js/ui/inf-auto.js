/* インフルエンサー自動選定の実行：公式APIで探す → 取り込む → 3条件で判定 → 起用状況を自動で更新 → 連絡文の下書きを自動作成
 * 送信（DM・メール）は自動では行わない。担当者の承認後に手動で送る。 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const I = root.FS.inf;
  const A = root.FS.infauto;
  const X = root.FS.infui;
  const esc = U.esc;

  const YT = 'https://www.googleapis.com/youtube/v3/';
  const AUTO_STATUSES = ['未確認', '候補', '優先候補'];

  function defaults() {
    return { enabled: true, youtubeKey: '', igToken: '', igUserId: '', graphVersion: 'v26.0', intervalDays: 7, maxQueries: 4, resultsPerQuery: 25, videosPerChannel: 6, priorityCount: 3, autoDraft: true };
  }
  function cfg() {
    const st = X.inf();
    st.auto = Object.assign(defaults(), st.auto || {});
    st.runs = st.runs || [];
    return st.auto;
  }

  async function getJson(url, label) {
    let res;
    try { res = await fetch(url); } catch (e) { throw new Error(label + '：通信できませんでした（' + e.message + '）'); }
    let body = null;
    try { body = await res.json(); } catch (e) { body = null; }
    if (!res.ok || (body && body.error)) {
      const er = (body && body.error) || {};
      const reason = (er.errors && er.errors[0] && er.errors[0].reason) || er.type || '';
      const hint = reason === 'quotaExceeded' ? '（1日の利用上限に達しました。翌日に再実行されます）' : reason === 'keyInvalid' || res.status === 400 && /key/i.test(er.message || '') ? '（APIキーを確認してください）' : er.code === 190 ? '（アクセストークンの期限切れ・無効。設定で更新してください）' : '';
      throw new Error(label + '：' + (er.message || 'HTTP ' + res.status) + hint);
    }
    return body;
  }

  // ───── YouTube Data API v3 ─────
  async function youtubeDiscover(camp, c, log) {
    const key = encodeURIComponent(c.youtubeKey);
    const queries = A.buildQueries(camp, c.maxQueries);
    const channelIds = [];
    const st = X.inf();
    for (const q of queries) {
      let url = YT + 'search?part=snippet&type=video&regionCode=JP&relevanceLanguage=ja&maxResults=' + Math.min(50, c.resultsPerQuery) + '&q=' + encodeURIComponent(q) + '&key=' + key;
      if (camp.lat && camp.lng && camp.radiusKm) url += '&location=' + encodeURIComponent(camp.lat + ',' + camp.lng) + '&locationRadius=' + encodeURIComponent(Math.min(1000, Number(camp.radiusKm)) + 'km');
      const r = await getJson(url, 'YouTube検索「' + q + '」');
      log.apiCalls.push('YouTube search.list「' + q + '」（100ユニット）');
      const found = [];
      (r.items || []).forEach((it) => { const id = it.snippet && it.snippet.channelId; if (id && !channelIds.includes(id)) channelIds.push(id); if (id && !found.includes(id)) found.push(id); });
      st.searches.push({ id: S.uid('srch'), campaignId: camp.id, place: 'YouTube Data API（自動）', query: q, searchedAt: X.today(), by: '自動選定', resultUrls: found.map((id) => 'https://www.youtube.com/channel/' + id), addedIds: [], existingIds: [], at: Date.now() });
    }
    const channels = [];
    for (let i = 0; i < channelIds.length; i += 50) {
      const r = await getJson(YT + 'channels?part=snippet,statistics,contentDetails&id=' + channelIds.slice(i, i + 50).join(',') + '&key=' + key, 'YouTubeチャンネル情報');
      log.apiCalls.push('YouTube channels.list（1ユニット）');
      channels.push(...(r.items || []));
    }
    return channelsData(channels, camp, c, log);
  }

  // チャンネルの直近動画（再生数・反応）を取り、候補者データにする
  async function channelsData(channels, camp, c, log) {
    const key = encodeURIComponent(c.youtubeKey);
    const uploads = {};
    for (const ch of channels) {
      const pl = ch.contentDetails && ch.contentDetails.relatedPlaylists && ch.contentDetails.relatedPlaylists.uploads;
      if (!pl) { uploads[ch.id] = []; continue; }
      try {
        const r = await getJson(YT + 'playlistItems?part=contentDetails&maxResults=' + c.videosPerChannel + '&playlistId=' + encodeURIComponent(pl) + '&key=' + key, 'YouTube動画一覧');
        log.apiCalls.push('YouTube playlistItems.list（1ユニット）');
        uploads[ch.id] = (r.items || []).map((x) => x.contentDetails && x.contentDetails.videoId).filter(Boolean);
      } catch (e) { uploads[ch.id] = []; log.errors.push(e.message); }
    }
    const allIds = Object.values(uploads).flat();
    const videos = {};
    for (let i = 0; i < allIds.length; i += 50) {
      const r = await getJson(YT + 'videos?part=snippet,statistics&id=' + allIds.slice(i, i + 50).join(',') + '&key=' + key, 'YouTube動画の再生数');
      log.apiCalls.push('YouTube videos.list（1ユニット）');
      (r.items || []).forEach((v) => { videos[v.id] = v; });
    }
    return channels.map((ch) => A.fromYouTube(ch, (uploads[ch.id] || []).map((id) => videos[id]).filter(Boolean), camp, { today: X.today() }));
  }

  // URLで登録した YouTube チャンネル（@ハンドル または チャンネルID）の情報を取る
  async function youtubeByRefs(refs, camp, c, log) {
    const key = encodeURIComponent(c.youtubeKey);
    const channels = [];
    for (const ref of refs) {
      const q = /^UC[\w-]{10,}$/.test(ref) ? 'id=' + encodeURIComponent(ref) : 'forHandle=' + encodeURIComponent('@' + ref.replace(/^@/, ''));
      try {
        const r = await getJson(YT + 'channels?part=snippet,statistics,contentDetails&' + q + '&key=' + key, 'YouTube「' + ref + '」');
        log.apiCalls.push('YouTube channels.list（1ユニット）');
        if (r.items && r.items[0]) channels.push(r.items[0]); else log.errors.push('YouTube「' + ref + '」：チャンネルが見つかりません');
      } catch (e) { log.errors.push(e.message); }
    }
    return channelsData(channels, camp, c, log);
  }

  // URL一括登録した候補の情報を、設定済みの公式APIで自動取得する（TikTok は公式APIが無いため取得しない）
  async function enrich(cands, camp) {
    const c = cfg();
    const log = { apiCalls: [], errors: [], notes: [], added: 0, updated: 0, igFetched: 0, ytFetched: 0 };
    const cp = camp || {};
    const ig = cands.filter((x) => x.platform === 'instagram');
    const yt = cands.filter((x) => x.platform === 'youtube');
    if (ig.length) {
      if (c.igToken && c.igUserId) {
        for (const x of ig) {
          try { upsert(await instagramFetch(x.handle, cp, c), log); log.igFetched++; log.apiCalls.push('Instagram business_discovery @' + x.handle); }
          catch (e) { log.errors.push(e.message); x.auto = Object.assign({ regionEvidence: [], genreEvidence: [], linked: [] }, x.auto || {}, { lastTried: X.today(), lastError: e.message }); }
        }
      } else log.notes.push('Instagram の取得設定が未設定のため、' + ig.length + '件のフォロワー数などは「未確認」のままです（評価の設定 → 自動選定の設定）');
    }
    if (yt.length) {
      if (c.youtubeKey) {
        const before = log.updated;
        (await youtubeByRefs(yt.map((x) => x.youtubeChannelId || x.handle), cp, c, log)).forEach((d) => upsert(d, log));
        log.ytFetched = log.updated - before;
      } else log.notes.push('YouTube Data API キーが未設定のため、' + yt.length + '件の登録者数などは「未確認」のままです');
    }
    const tt = cands.filter((x) => x.platform === 'tiktok' || x.platform === 'x').length;
    if (tt) log.notes.push('TikTok・Xは商用で使える公式APIが無いため、' + tt + '件はURLのみ登録しました（数値は未確認）');
    S.save(true);
    return log;
  }

  // ───── Instagram Graph API（Business Discovery）─────
  async function instagramFetch(handle, camp, c) {
    const fields = 'business_discovery.username(' + handle + '){username,name,biography,followers_count,media_count,media.limit(12){caption,like_count,comments_count,media_type,media_product_type,timestamp,permalink}}';
    const url = 'https://graph.facebook.com/' + encodeURIComponent(c.graphVersion) + '/' + encodeURIComponent(c.igUserId) + '?fields=' + encodeURIComponent(fields) + '&access_token=' + encodeURIComponent(c.igToken);
    const r = await getJson(url, 'Instagram「@' + handle + '」');
    if (!r.business_discovery) throw new Error('Instagram「@' + handle + '」：プロアカウントではないため取得できません');
    return A.fromInstagram(r.business_discovery, camp, { today: X.today() });
  }

  // ───── 取り込み（同じアカウントは更新、担当者が入力した品質・料金・連絡先・メモは変えない）─────
  function upsert(data, log) {
    const st = X.inf();
    const key = I.parseProfileUrl(data.profileUrl).key;
    let cand = st.candidates.find((c) => (data.youtubeChannelId && c.youtubeChannelId === data.youtubeChannelId) || I.parseProfileUrl(c.profileUrl).key === key);
    const changes = [];
    if (!cand) {
      cand = Object.assign(X.newCandidate(), { displayName: data.displayName, handle: data.handle, platform: data.platform, profileUrl: data.profileUrl, youtubeChannelId: data.youtubeChannelId || null });
      cand.source = { type: data.auto ? data.auto.platformSource : '自動選定', detail: '自動選定で取得', obtainedAt: X.today(), by: '自動取得' };
      cand.createdBy = '自動取得';
      st.candidates.push(cand);
      changes.push('自動選定で新規登録（' + cand.source.type + '）');
      log.added++;
    } else log.updated++;
    ['followers', 'recentViews', 'recentReactions', 'postFrequency'].forEach((k) => {
      if (!data[k] || !I.isKnown(data[k])) return;
      if (JSON.stringify(cand[k] && cand[k].value) !== JSON.stringify(data[k].value)) changes.push(k + '：' + X.describeFact(cand[k]) + ' → ' + X.describeFact(data[k]));
      cand[k] = data[k];
    });
    if (!cand.areasManual) { const u = Array.from(new Set(I.toList(cand.areas).concat(data.areas || []))); if (u.join() !== I.toList(cand.areas).join()) changes.push('活動地域（自動判定）：' + u.join('、')); cand.areas = u; }
    if (!cand.genresManual) { const u = Array.from(new Set(I.toList(cand.genres).concat(data.genres || []))); if (u.join() !== I.toList(cand.genres).join()) changes.push('発信ジャンル（自動判定）：' + u.join('、')); cand.genres = u; }
    cand.hashtags = Array.from(new Set(I.toList(cand.hashtags).concat(data.hashtags || []))).slice(0, 15);
    cand.formats = Array.from(new Set(I.toList(cand.formats).concat(data.formats || [])));
    if (data.displayName && !cand.displayName) cand.displayName = data.displayName;
    cand.auto = data.auto || cand.auto;
    cand.updatedAt = Date.now();
    if (changes.length) { cand.history = cand.history || []; cand.history.push({ at: Date.now(), user: '自動取得', action: '自動選定で情報を更新しました', changes }); }
    return cand;
  }

  function linkPerson(a, b) {
    if (!a || !b || a === b) return;
    const pid = a.personId || b.personId || S.uid('person');
    a.personId = pid; b.personId = pid;
  }

  // ───── 自動選定（APIで探したあと、またはAPI未設定でも登録済み候補から）─────
  async function selectFor(camp, log) {
    const st = X.inf();
    const c = cfg();
    const rows = st.candidates.map((cand) => { const link = X.linkFor(camp.id, cand.id); const ev = I.evaluate(camp, cand, link, st.settings); return { cand, link, ev, j: A.judge(camp, cand, ev, st.settings) }; });
    const plan = A.autoSelect(rows, camp, st.settings, { priorityCount: c.priorityCount });
    for (const p of plan) {
      const { cand, link } = p.row;
      if (link && link.autoManaged === false) continue; // 担当者が手動で変えた候補はそのまま
      if (link && !AUTO_STATUSES.includes(link.status)) continue;
      const cur = link ? link.status : '未確認';
      const l = X.ensureLink(camp.id, cand.id);
      l.autoJudge = { at: Date.now(), pass: p.row.j.pass, reasons: p.row.j.reasons };
      if (cur !== p.to) {
        await X.changeStatus(camp, cand, p.to, '自動選定：' + p.row.j.reasons.join('／'), { auto: true });
        if (p.to === '優先候補') log.priority++; else if (p.to === '候補') log.candidate++;
      }
      if (p.to === '優先候補' && c.autoDraft && !l.contact) {
        l.contact = { id: S.uid('ct'), status: 'draft', text: I.contactDraft(camp, cand, S.storeById(camp.storeId), S.get().settings.senderName), history: [{ at: Date.now(), user: '自動作成', action: '連絡文の下書きを自動作成しました', detail: '送信には担当者の承認が必要です' }], auto: true };
        log.drafts++;
      }
    }
    log.passed = rows.filter((r) => r.j.pass).length;
  }

  let running = false;
  async function run(camp, reason) {
    if (running) { U.toast('自動選定を実行中です'); return null; }
    running = true;
    const st = X.inf();
    const c = cfg();
    const log = { id: S.uid('run'), campaignId: camp.id, at: Date.now(), reason: reason || '手動実行', apiCalls: [], errors: [], notes: [], added: 0, updated: 0, igFetched: 0, priority: 0, candidate: 0, drafts: 0, passed: 0 };
    const platforms = I.toList(camp.platforms).length ? I.toList(camp.platforms) : ['youtube', 'instagram', 'tiktok'];
    try {
      const found = [];
      if (platforms.includes('youtube') || platforms.includes('instagram') || platforms.includes('tiktok')) {
        if (c.youtubeKey) {
          try {
            const ys = await youtubeDiscover(camp, c, log);
            ys.forEach((d) => found.push({ data: d, cand: upsert(d, log) }));
          } catch (e) { log.errors.push(e.message); }
        } else log.notes.push('YouTube Data API キーが未設定のため、YouTubeからの自動検索は行っていません（設定画面）');
      }
      // チャンネル説明に書かれた Instagram・TikTok を同一人物の別アカウントとして登録し、Instagram は公式APIで情報を取得
      const igHandles = [];
      found.forEach(({ data, cand }) => (data.auto.linked || []).forEach((lk) => {
        if (lk.platform === 'instagram') igHandles.push({ handle: lk.handle, from: cand });
        if (lk.platform === 'tiktok' && platforms.includes('tiktok')) {
          const t = upsert({ displayName: cand.displayName, handle: lk.handle, platform: 'tiktok', profileUrl: lk.url, areas: [], genres: [], auto: { platformSource: 'YouTubeチャンネル説明に記載', analyzedAt: X.today(), regionEvidence: [], genreEvidence: [], linked: [] } }, log);
          linkPerson(cand, t);
        }
      }));
      if (platforms.includes('instagram')) {
        // 既に登録済みの Instagram 候補も、更新間隔を過ぎていれば取り直す
        st.candidates.filter((x) => x.platform === 'instagram' && !(x.auto && (x.auto.analyzedAt || x.auto.lastTried) && daysSince(x.auto.lastTried || x.auto.analyzedAt) < c.intervalDays)).forEach((x) => igHandles.push({ handle: x.handle, from: null }));
        const uniq = [];
        igHandles.forEach((h) => { if (h.handle && !uniq.some((u) => u.handle.toLowerCase() === h.handle.toLowerCase())) uniq.push(h); });
        if (uniq.length && !(c.igToken && c.igUserId)) log.notes.push('Instagram の取得設定（アクセストークン・自社のInstagramビジネスアカウントID）が未設定のため、' + uniq.length + '件のInstagramアカウントは情報を取得していません');
        for (const h of (c.igToken && c.igUserId ? uniq.slice(0, 30) : [])) {
          try {
            const d = await instagramFetch(h.handle, camp, c);
            log.apiCalls.push('Instagram business_discovery @' + h.handle);
            const cand = upsert(d, log);
            log.igFetched++;
            if (h.from) linkPerson(h.from, cand);
          } catch (e) {
            log.errors.push(e.message);
            // 取得できなかったアカウントは、次の更新間隔まで取り直さない
            const ex = st.candidates.find((x) => x.platform === 'instagram' && String(x.handle).toLowerCase() === h.handle.toLowerCase());
            if (ex) { ex.auto = Object.assign({ regionEvidence: [], genreEvidence: [], linked: [] }, ex.auto || {}, { lastTried: X.today(), lastError: e.message }); }
            if (h.from) { const cand = upsert({ displayName: h.from.displayName, handle: h.handle, platform: 'instagram', profileUrl: 'https://www.instagram.com/' + h.handle + '/', areas: [], genres: [], auto: { platformSource: 'YouTubeチャンネル説明に記載', analyzedAt: X.today(), regionEvidence: [], genreEvidence: [], linked: [] } }, log); linkPerson(h.from, cand); }
          }
        }
      }
      if (platforms.includes('tiktok')) log.notes.push('TikTokは商用で使える公式の検索APIがないため、自動検索していません（YouTube・Instagramの説明に書かれたTikTokアカウントのみ登録）');
      await selectFor(camp, log);
    } finally {
      running = false;
    }
    st.runs.push(log);
    if (st.runs.length > 200) st.runs = st.runs.slice(-200);
    camp.lastAutoRunAt = log.at;
    S.log('インフルエンサーの自動選定を実行しました', { type: 'campaign', id: camp.id, label: camp.title }, (log.reason) + '：新規' + log.added + '件・更新' + log.updated + '件・条件合致' + log.passed + '件（優先候補へ' + log.priority + '・候補へ' + log.candidate + '）' + (log.errors.length ? '・エラー' + log.errors.length + '件' : ''));
    S.save(true);
    return log;
  }

  function daysSince(iso) { return Math.floor((Date.now() - new Date(iso + 'T00:00:00').getTime()) / 86400000); }

  function isStale(camp) {
    const c = cfg();
    if (!camp.lastAutoRunAt) return true;
    return (Date.now() - camp.lastAutoRunAt) / 86400000 >= c.intervalDays;
  }

  // 自動実行：キャンペーンを開いたとき・アプリを開いたとき、更新間隔を過ぎていれば実行
  async function autoRunIfDue(camp, onDone) {
    const c = cfg();
    if (!c.enabled || camp.autoSearch === false || !isStale(camp)) return null;
    const log = await run(camp, '自動実行（更新間隔' + c.intervalDays + '日）');
    if (log) { U.toast('自動選定を実行しました：「' + camp.title + '」条件合致 ' + log.passed + '件', log.errors.length ? 'error' : 'ok'); if (onDone) onDone(log); }
    return log;
  }
  async function autoRunAll() {
    const st = X.inf();
    for (const camp of st.campaigns) { if (camp.autoSearch !== false && !camp.closed) await autoRunIfDue(camp); }
  }

  function lastRun(camp) { return (X.inf().runs || []).filter((r) => r.campaignId === camp.id).slice(-1)[0] || null; }

  function runSummaryHtml(camp) {
    const c = cfg();
    const r = lastRun(camp);
    const keys = [c.youtubeKey ? 'YouTube：設定済み' : 'YouTube：未設定', c.igToken && c.igUserId ? 'Instagram：設定済み' : 'Instagram：未設定'];
    return '<div class="panel"><div class="row" style="align-items:center"><div style="flex:1"><h2 style="margin:0">自動選定</h2><div class="small muted">条件（地域・フォロワー数・ジャンル）に合う候補を公式APIで探し、評価順に「優先候補」「候補」へ自動で振り分けます。' + (c.enabled && camp.autoSearch !== false ? c.intervalDays + '日ごとに自動で再実行します。' : '自動実行はオフです。') + '</div>' +
      '<div class="small">' + keys.map(esc).join('　') + '　<a href="#/inf/settings">設定</a></div>' +
      (r ? '<div class="small" style="margin-top:4px">前回：' + root.FS.format.fmtDateTime(r.at) + '（' + esc(r.reason) + '）新規 ' + r.added + '件・更新 ' + r.updated + '件・条件合致 ' + r.passed + '件・優先候補へ ' + r.priority + '件' + (r.drafts ? '・連絡文の下書き ' + r.drafts + '件' : '') + '</div>' + (r.errors.length ? '<div class="small" style="color:var(--danger)">' + r.errors.slice(0, 3).map(esc).join('<br>') + '</div>' : '') + (r.notes.length ? '<div class="small" style="color:var(--warn)">' + r.notes.map(esc).join('<br>') + '</div>' : '') : '<div class="small muted">まだ実行していません。</div>') +
      '</div><div><button class="btn primary" id="runAuto">今すぐ自動選定</button></div></div></div>';
  }

  // ───── 設定画面の「自動選定の設定」─────
  function renderSettings(el) {
    const c = cfg();
    el.innerHTML = '<div class="panel"><h2>自動選定の設定</h2>' +
      '<div class="alert warn small">APIキー・アクセストークンはこのブラウザ内にだけ保存し、ソースコードやバックアップには含めません。共用パソコンでは使わないでください。各サービスの利用規約・利用上限の範囲で使います（スクレイピング・自動フォロー・自動いいね・自動DMは行いません）。</div>' +
      '<label style="display:flex;gap:8px;align-items:center;font-weight:600"><input type="checkbox" id="aEn"' + (c.enabled ? ' checked' : '') + '> 自動選定を自動で実行する（アプリやキャンペーンを開いたとき、更新間隔を過ぎていれば実行）</label>' +
      '<div class="grid2" style="margin-top:10px"><div><h3>YouTube Data API v3</h3><div class="field"><label>APIキー（Google Cloud で発行）</label><input type="password" id="aYt" value="' + esc(c.youtubeKey) + '" autocomplete="off"></div><button class="btn small" id="tYt">接続テスト</button><p class="small muted">1日10,000ユニットまで無料。検索1回100ユニット、チャンネル・動画の取得は1ユニットです。</p></div>' +
      '<div><h3>Instagram Graph API（Business Discovery）</h3><div class="field"><label>アクセストークン（Metaアプリで発行）</label><input type="password" id="aIg" value="' + esc(c.igToken) + '" autocomplete="off"></div><div class="row"><div class="field"><label>自社のInstagramビジネスアカウントID</label><input type="text" id="aIgId" value="' + esc(c.igUserId) + '"></div><div class="field" style="flex:0 1 110px"><label>APIバージョン</label><input type="text" id="aVer" value="' + esc(c.graphVersion) + '"></div></div><button class="btn small" id="tIg">接続テスト</button><p class="small muted">取得できるのはビジネス・クリエイターアカウントのみです。アクセストークンには有効期限があります。</p></div></div>' +
      '<h3>実行の設定</h3><div class="row"><div class="field"><label>更新間隔（日）</label><input type="text" id="aInt" value="' + c.intervalDays + '"></div><div class="field"><label>1回の検索語の数</label><input type="text" id="aQ" value="' + c.maxQueries + '"></div><div class="field"><label>検索1回の取得件数（最大50）</label><input type="text" id="aR" value="' + c.resultsPerQuery + '"></div><div class="field"><label>チャンネルごとの動画数</label><input type="text" id="aV" value="' + c.videosPerChannel + '"></div><div class="field"><label>優先候補にする人数</label><input type="text" id="aP" value="' + c.priorityCount + '"></div></div>' +
      '<label class="small"><input type="checkbox" id="aDr"' + (c.autoDraft ? ' checked' : '') + '> 優先候補には連絡文の下書きを自動で作る（送信は承認後に担当者が手動で行います）</label>' +
      '<div class="btns" style="margin-top:10px"><button class="btn primary" id="aSave">自動選定の設定を保存</button></div></div>';
    const $ = (s) => U.$(s, el);
    $('#aSave').addEventListener('click', () => {
      const n = (s, min, max) => { const v = Number($(s).value); return isFinite(v) && v >= min && v <= max ? Math.round(v) : null; };
      const vals = { intervalDays: n('#aInt', 1, 365), maxQueries: n('#aQ', 1, 20), resultsPerQuery: n('#aR', 1, 50), videosPerChannel: n('#aV', 3, 20), priorityCount: n('#aP', 0, 50) };
      if (Object.values(vals).some((v) => v === null)) { U.toast('数値の範囲を確認してください（更新間隔1〜365、検索語1〜20、取得件数1〜50、動画数3〜20、優先候補0〜50）', 'error'); return; }
      const ver = $('#aVer').value.trim();
      if (!/^v\d+\.\d+$/.test(ver)) { U.toast('APIバージョンは「v26.0」のような形式で入力してください', 'error'); return; }
      Object.assign(c, vals, { enabled: $('#aEn').checked, youtubeKey: $('#aYt').value.trim(), igToken: $('#aIg').value.trim(), igUserId: $('#aIgId').value.trim(), graphVersion: ver, autoDraft: $('#aDr').checked });
      S.log('自動選定の設定を変更しました', { type: 'settings', id: '', label: 'インフルエンサー自動選定' }, 'YouTube：' + (c.youtubeKey ? '設定あり' : 'なし') + '・Instagram：' + (c.igToken ? '設定あり' : 'なし') + '・更新間隔' + c.intervalDays + '日・優先候補' + c.priorityCount + '人');
      S.save(true);
      U.toast('保存しました', 'ok');
    });
    $('#tYt').addEventListener('click', async () => {
      try { await getJson(YT + 'i18nRegions?part=snippet&hl=ja&key=' + encodeURIComponent($('#aYt').value.trim()), 'YouTube'); U.toast('YouTube Data API に接続できました', 'ok'); } catch (e) { U.toast(e.message, 'error'); }
    });
    $('#tIg').addEventListener('click', async () => {
      try { const r = await getJson('https://graph.facebook.com/' + encodeURIComponent($('#aVer').value.trim()) + '/' + encodeURIComponent($('#aIgId').value.trim()) + '?fields=username&access_token=' + encodeURIComponent($('#aIg').value.trim()), 'Instagram'); U.toast('Instagram に接続できました（@' + (r.username || '') + '）', 'ok'); } catch (e) { U.toast(e.message, 'error'); }
    });
  }

  root.FS.infautoui = { enrich, cfg, run, autoRunIfDue, autoRunAll, runSummaryHtml, renderSettings, selectFor, lastRun };
})(self);
