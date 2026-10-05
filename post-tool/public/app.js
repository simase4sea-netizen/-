// 画面処理（依存ライブラリなし）
const $ = (sel, root = document) => root.querySelector(sel);
const $$ = (sel, root = document) => [...root.querySelectorAll(sel)];
const esc = (s) => String(s ?? '').replace(/[&<>"']/g, (c) => ({ '&': '&amp;', '<': '&lt;', '>': '&gt;', '"': '&quot;', "'": '&#39;' }[c]));
const chars = (s) => [...String(s ?? '')].length;

let META = null;
const state = { stores: [], selected: new Set(), master: { clients: [], brands: [], stores: [] } };

// ---------- 共通 ----------
const userInput = $('#userName');
try { userInput.value = localStorage.getItem('userName') || ''; } catch { /* ignore */ }
userInput.addEventListener('change', () => { try { localStorage.setItem('userName', userInput.value.trim()); } catch { /* ignore */ } });

async function api(path, opts = {}) {
  const headers = { 'x-user': encodeURIComponent(userInput.value.trim()), ...(opts.headers || {}) };
  let body = opts.body;
  if (body && typeof body !== 'string') { body = JSON.stringify(body); headers['content-type'] = 'application/json'; }
  const res = await fetch(path, { ...opts, headers, body });
  const type = res.headers.get('content-type') || '';
  const data = type.includes('json') ? await res.json() : await res.text();
  if (!res.ok) {
    const err = new Error(data?.error || (data?.errors ? data.errors.join('\n') : `エラー (${res.status})`));
    err.status = res.status; err.data = data;
    throw err;
  }
  return data;
}

function notify(msg, kind = 'ok') {
  const n = $('#notice');
  n.textContent = msg;
  n.className = `notice ${kind}`;
  n.hidden = false;
  clearTimeout(notify.t);
  notify.t = setTimeout(() => { n.hidden = true; }, kind === 'error' ? 8000 : 3000);
}

async function copyText(text) {
  try {
    await navigator.clipboard.writeText(text);
  } catch {
    const ta = document.createElement('textarea');
    ta.value = text; document.body.append(ta); ta.select(); document.execCommand('copy'); ta.remove();
  }
  notify('コピーしました');
}

$$('.tabs button').forEach((b) => b.addEventListener('click', () => {
  $$('.tabs button').forEach((x) => x.classList.toggle('active', x === b));
  $$('.tab').forEach((t) => t.classList.toggle('active', t.id === `tab-${b.dataset.tab}`));
  if (b.dataset.tab === 'posts') loadPosts();
  if (b.dataset.tab === 'master') loadMaster();
  if (b.dataset.tab === 'spec') renderSpec();
}));

// ---------- 投稿作成 ----------
async function loadStores() {
  state.stores = await api('/api/stores');
  renderPicker();
  const sel = $('#postStoreFilter');
  sel.innerHTML = '<option value="">すべての店舗</option>' + state.stores.map((s) => `<option value="${s.id}">${esc(s.name)}（${esc(s.store_code)}）</option>`).join('');
}

function renderPicker() {
  const q = $('#storeSearch').value.trim().toLowerCase();
  const list = state.stores.filter((s) => !q || [s.name, s.store_code, s.area, s.brand_name, s.client_name, s.address].join(' ').toLowerCase().includes(q));
  const groups = {};
  for (const s of list) (groups[`${s.client_name}／${s.brand_name}`] ||= []).push(s);
  $('#storePicker').innerHTML = Object.entries(groups).map(([g, ss]) => `
    <div class="pgroup"><div class="pg-title">${esc(g)}</div>
    ${ss.map((s) => `<label class="pitem"><input type="checkbox" value="${s.id}" data-client="${s.client_id}" ${state.selected.has(s.id) ? 'checked' : ''}>
      <span>${esc(s.name)} <small>${esc(s.store_code)}${s.verified_at ? ` ・確認日 ${esc(s.verified_at)}` : ' ・確認日 未登録'}</small></span></label>`).join('')}
    </div>`).join('') || '<p class="hint">店舗が登録されていません。「顧客・店舗情報」から登録してください。</p>';
}

$('#storeSearch').addEventListener('input', renderPicker);
$('#storePicker').addEventListener('change', (e) => {
  const cb = e.target;
  const id = Number(cb.value);
  if (cb.checked) {
    const client = cb.dataset.client;
    const other = [...state.selected].map((x) => state.stores.find((s) => s.id === x)).find((s) => s && String(s.client_id) !== client);
    if (other) { cb.checked = false; notify('異なる顧客の店舗は同時に選べません。', 'error'); return; }
    state.selected.add(id);
  } else state.selected.delete(id);
  renderPerStore();
});

function renderPerStore() {
  const box = $('#perStore');
  if (state.selected.size < 2) { box.innerHTML = ''; return; }
  box.innerHTML = `<h3>店舗ごとの情報（入力した項目だけ共通情報を上書き）</h3>` + [...state.selected].map((id) => {
    const s = state.stores.find((x) => x.id === id);
    return `<fieldset class="perstore" data-store="${id}"><legend>${esc(s?.name)}</legend>
      <div class="row3">
        <label>主役の商品・メニュー<input name="mainItem"></label>
        <label>価格<input name="price"></label>
        <label>販売期間<input name="salesPeriod"></label>
      </div>
      <div class="row3">
        <label>伝えたい特徴<input name="features"></label>
        <label>開催日<input name="eventDate"></label>
        <label>CTAのURL<input name="ctaUrl"></label>
      </div></fieldset>`;
  }).join('');
}

function readFiles(input) {
  return Promise.all([...input.files].map((f) => new Promise((resolve, reject) => {
    const img = META.spec.image || {};
    if (img.maxBytes && f.size > img.maxBytes) { reject(new Error(`${f.name} はGoogle仕様の上限（${Math.round(img.maxBytes / 1048576)}MB）を超えています。`)); return; }
    if (img.minBytes && f.size < img.minBytes) notify(`${f.name} はGoogle仕様の最小サイズ（${Math.round(img.minBytes / 1024)}KB）未満です。投稿時に使えない可能性があります。`, 'warn');
    const r = new FileReader();
    r.onload = () => resolve({ name: f.name, dataUrl: r.result });
    r.onerror = reject;
    r.readAsDataURL(f);
  })));
}

async function buildGenRequest() {
  const f = $('#genForm');
  const fd = new FormData(f);
  const common = {};
  for (const k of ['purpose', 'theme', 'mainItem', 'features', 'price', 'salesPeriod', 'eventDate', 'cta', 'ctaUrl', 'tone', 'postDate']) {
    const v = String(fd.get(k) || '').trim();
    if (v) common[k] = v;
  }
  common.useSeason = f.useSeason.checked;
  common.setCount = Number(fd.get('setCount'));
  common.images = await readFiles(f.images);
  const perStore = {};
  for (const fs of $$('.perstore')) {
    const o = {};
    for (const i of $$('input', fs)) if (i.value.trim()) o[i.name] = i.value.trim();
    perStore[fs.dataset.store] = o;
  }
  return { storeIds: [...state.selected], common, perStore, provider: fd.get('provider') };
}

$('#genForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  if (state.selected.size === 0) { notify('店舗を選択してください。', 'error'); return; }
  try {
    const body = await buildGenRequest();
    const pre = await api('/api/generate/preflight', { method: 'POST', body: { ...body, common: { ...body.common, images: [] } } });
    renderPreflight(pre, body);
  } catch (err) { notify(err.message, 'error'); }
});

function renderPreflight(pre, body) {
  const box = $('#preflight');
  box.innerHTML = `<div class="panel"><h2>3. 生成前の確認</h2>
    ${pre.map((p) => `<div class="pf" data-store="${p.storeId}"><h3>${esc(p.storeName)} <small>${esc(p.storeCode)}</small></h3>
      ${p.conflicts.length ? `<p class="warn">投稿入力と店舗登録情報が異なります。使う方を選んでください。</p>
        ${p.conflicts.map((c) => `<div class="conflict"><b>${esc(c.label)}</b>
          <label class="check"><input type="radio" name="r-${p.storeId}-${c.field}" value="input" required> 投稿入力：${esc(c.input)}</label>
          <label class="check"><input type="radio" name="r-${p.storeId}-${c.field}" value="store"> 店舗登録：${esc(c.store)}</label></div>`).join('')}` : ''}
      ${p.confirmations.length ? `<ul class="confirm">${p.confirmations.map((c) => `<li>${esc(c)}</li>`).join('')}</ul>` : '<p class="hint">確認事項はありません。</p>'}
    </div>`).join('')}
    <div class="actions"><button id="runGen" class="primary">この内容で生成する</button></div></div>`;
  $('#runGen').addEventListener('click', async () => {
    for (const p of pre) {
      const res = {};
      for (const c of p.conflicts) {
        const v = $(`input[name="r-${p.storeId}-${c.field}"]:checked`)?.value;
        if (!v) { notify(`${p.storeName}：${c.label} の使用する値を選んでください。`, 'error'); return; }
        res[c.field] = v;
      }
      body.perStore[p.storeId] = { ...(body.perStore[p.storeId] || {}), resolutions: res };
    }
    const btn = $('#runGen');
    btn.disabled = true; btn.textContent = '生成中…（AI生成は1〜2分かかることがあります）';
    try {
      const out = await api('/api/generate', { method: 'POST', body });
      renderResults(out);
      box.innerHTML = '';
      notify('生成して下書き保存しました。');
    } catch (err) {
      notify(err.message, 'error');
      btn.disabled = false; btn.textContent = 'この内容で生成する';
    }
  });
  box.scrollIntoView({ behavior: 'smooth' });
}

function renderResults(out) {
  const box = $('#genResults');
  box.innerHTML = `<div class="panel"><h2>生成結果 <small>${out.provider === 'mock' ? 'デモ生成（テンプレート）' : 'AI生成'}</small></h2></div>`;
  for (const r of out.results) {
    const wrap = document.createElement('div');
    wrap.className = 'store-results';
    wrap.innerHTML = `<h2 class="store-title">【${esc(r.storeName)}】</h2>`;
    for (const p of r.posts) wrap.append(postCard(p));
    box.append(wrap);
  }
  box.scrollIntoView({ behavior: 'smooth' });
}

// ---------- 投稿案カード ----------
function fullSetText(storeName, setNo, copy, ja, en) {
  return `【${storeName}】\n\n案${setNo}\n\n画像用キャッチコピー：\n${copy}\n\n日本語投稿文：\n${ja}\n\nーーーーーー\n\nEnglish:\n${en}`;
}

function reviewHtml(p) {
  const v = p.validation || {};
  const ctx = p.context || {};
  const gen = p.generated || {};
  const levels = { error: 'エラー', warn: '注意', info: '参考' };
  const checks = (v.checks || []).map((c) => `<li class="lv-${c.level}"><b>${levels[c.level]}</b> ${esc(c.message)}</li>`).join('');
  const facts = Object.entries(ctx.store?.facts || {}).map(([k, val]) => `<li>${esc(k)}：${esc(val)}</li>`).join('');
  const post = ctx.post || {};
  const conflicts = (ctx.conflicts || []).map((c) => `<li>${esc(c.label)}：${c.chosen === 'store' ? '店舗登録' : '投稿入力'}の値を使用（入力 ${esc(c.input)}／登録 ${esc(c.store)}）</li>`).join('');
  const spec = v.googleSpec || {};
  return `
    <h4>使用した顧客・ブランド・店舗</h4>
    <p>${esc(ctx.client?.name)} ／ ${esc(ctx.brand?.name)} ／ ${esc(ctx.store?.name)}（店舗ID ${esc(ctx.store?.code)}）<br>
    店舗情報の確認日：${esc(ctx.store?.verifiedAt || '未登録')}${ctx.store?.verifiedSource ? `（${esc(ctx.store.verifiedSource)}・${esc(ctx.store.verifiedBy || '')}）` : ''}<br>
    文章トーン：${esc(ctx.tone || '標準')}${ctx.toneSource ? `（${esc(ctx.toneSource)}）` : ''}</p>
    <h4>参照した商品・価格・販売期間・アクセス情報</h4>
    <ul>
      ${post.mainItem ? `<li>主役メニュー：${esc(post.mainItem)}${post.mainItemRegistered ? '（登録メニュー）' : '（未登録）'}</li>` : ''}
      ${post.price ? `<li>価格：${esc(post.price)}</li>` : ''}
      ${post.salesPeriod ? `<li>販売期間：${esc(post.salesPeriod)}</li>` : ''}
      ${post.eventDate ? `<li>開催日：${esc(post.eventDate)}</li>` : ''}
      ${post.cta ? `<li>CTA：${esc(post.cta.label)}${post.cta.url ? `（${esc(post.cta.url)}）` : ''}</li>` : ''}
      ${facts}
    </ul>
    ${conflicts ? `<h4>入力と登録情報の違い</h4><ul>${conflicts}</ul>` : ''}
    ${(gen.used_facts || []).length ? `<h4>生成時に使用した情報（生成器の申告）</h4><ul>${gen.used_facts.map((x) => `<li>${esc(x)}</li>`).join('')}</ul>` : ''}
    <h4>季節表現</h4>
    <p>${ctx.season?.use ? `使用（${esc(ctx.season.label)}）` : '使用しない設定'}：${(gen.season_expressions || []).map(esc).join('、') || '—'}
    ${(v.seasonHits || []).length ? `<br>本文で検出した季節語：${v.seasonHits.map((h) => esc(h.word)).join('、')}` : ''}</p>
    <h4>文字数</h4>
    <p>キャッチコピー ${v.counts?.catchcopy ?? '-'} 字 ／ 日本語 ${v.counts?.ja ?? '-'} 字 ／ 英語 ${v.counts?.en ?? '-'} 字（Google上限 ${v.counts?.maxChars ?? '-'} 字）</p>
    <h4>Google公式仕様との照合</h4>
    <p>${spec.ok ? '文字数上限内です。' : '<b class="ng">上限を超えています。</b>'} 仕様バージョン ${esc(spec.specVersion)}（確認日 ${esc(spec.verifiedAt)}）
    ${spec.needsReverification ? '<br><span class="warn">仕様値は要再確認の状態です（「Google仕様設定」参照）。</span>' : ''}</p>
    <h4>自動チェック</h4>
    ${checks ? `<ul class="checks">${checks}</ul>` : '<p>指摘はありません。</p>'}
    <h4>不足情報・公開前の確認事項</h4>
    <ul>${[...(ctx.confirmations || []), ...(gen.reviewer_notes || [])].map((x) => `<li>${esc(x)}</li>`).join('') || '<li>なし</li>'}</ul>
    ${p.duplicated_from ? `<p class="hint">投稿案 #${p.duplicated_from} から複製</p>` : ''}
    <p class="hint">作成 ${esc(p.created_at)} ${esc(p.created_by || '')} ／ 更新 ${esc(p.updated_at)} ${esc(p.updated_by || '')} ／ 生成方法 ${esc(p.provider)}${gen.model ? `（${esc(gen.model)}）` : ''}</p>`;
}

function postCard(p) {
  const el = $('#postTpl').content.firstElementChild.cloneNode(true);
  const fill = (post) => {
    $('.store', el).textContent = `【${post.store_name}】`;
    $('.setno', el).textContent = `案${post.set_no}`;
    $('.meta', el).textContent = `#${post.id} ${post.theme ? `・${post.theme}` : ''} ・${post.created_at.slice(0, 10)}`;
    $('.f-copy', el).value = post.catchcopy;
    $('.f-ja', el).value = post.body_ja;
    $('.f-en', el).value = post.body_en;
    $('.statusSel', el).innerHTML = META.statuses.map((s) => `<option value="${s.value}" ${s.value === post.status ? 'selected' : ''}>${s.label}</option>`).join('');
    $('.review-body', el).innerHTML = reviewHtml(post);
    const n = (post.validation?.checks || []).filter((c) => c.level !== 'info');
    const errs = n.filter((c) => c.level === 'error').length;
    $('.badge', el).textContent = n.length ? ` エラー${errs}・注意${n.length - errs}` : ' 問題なし';
    $('.badge', el).className = `badge ${errs ? 'ng' : n.length ? 'warn' : 'ok'}`;
    el.dataset.id = post.id;
    el.post = post;
    counts();
  };
  const counts = () => {
    const max = META.spec.postBody.maxChars;
    const set = (cls, v, limit) => {
      const c = $(cls, el);
      c.textContent = `${v} 字${limit ? ` / ${limit}` : ''}`;
      c.classList.toggle('ng', Boolean(limit && v > limit));
    };
    set('.c-copy', chars($('.f-copy', el).value), META.spec.writingGuide.catchcopyMaxChars);
    set('.c-ja', chars($('.f-ja', el).value), max);
    set('.c-en', chars($('.f-en', el).value), max);
  };
  fill(p);
  $$('textarea', el).forEach((t) => t.addEventListener('input', counts));
  $$('[data-copy]', el).forEach((b) => b.addEventListener('click', () => {
    const copy = $('.f-copy', el).value; const ja = $('.f-ja', el).value; const en = $('.f-en', el).value;
    const kind = b.dataset.copy;
    copyText(kind === 'copy' ? copy : kind === 'ja' ? ja : kind === 'en' ? en : fullSetText(el.post.store_name, el.post.set_no, copy, ja, en));
  }));
  const save = async (extra = {}) => {
    try {
      const updated = await api(`/api/posts/${el.dataset.id}`, {
        method: 'PUT',
        body: { catchcopy: $('.f-copy', el).value, body_ja: $('.f-ja', el).value, body_en: $('.f-en', el).value, status: $('.statusSel', el).value, ...extra },
      });
      fill(updated);
      notify('保存しました（自動チェックを再実行しました）');
    } catch (err) { notify(err.message, 'error'); }
  };
  $('.save', el).addEventListener('click', () => save());
  $('.statusSel', el).addEventListener('change', async (e) => {
    const errs = (el.post.validation?.checks || []).filter((c) => c.level === 'error').length;
    if (['approved', 'used'].includes(e.target.value) && errs && !confirm('自動チェックでエラーが出ています。このまま状態を変更しますか？')) {
      e.target.value = el.post.status; return;
    }
    save();
  });
  $('.dup', el).addEventListener('click', async () => {
    try {
      const copy = await api(`/api/posts/${el.dataset.id}/duplicate`, { method: 'POST' });
      el.after(postCard(copy));
      notify(`複製しました（#${copy.id}・下書き）`);
    } catch (err) { notify(err.message, 'error'); }
  });
  $('.hist', el).addEventListener('click', () => showHistory('post_sets', el.dataset.id, el));
  return el;
}

async function showHistory(entity, id, anchor) {
  const rows = await api(`/api/history/${entity}/${id}`);
  const old = $('.history', anchor); if (old) { old.remove(); return; }
  const div = document.createElement('div');
  div.className = 'history';
  const label = { create: '作成', update: '更新', delete: '削除', duplicate: '複製' };
  div.innerHTML = `<h4>変更履歴</h4><ul>${rows.map((h) => {
    const before = h.before_json ? JSON.parse(h.before_json) : {};
    const after = h.after_json ? JSON.parse(h.after_json) : {};
    const changed = Object.keys(after).filter((k) => !['updated_at', 'updated_by', 'checks_json'].includes(k) && before[k] !== undefined && before[k] !== after[k]);
    return `<li>${esc(h.at.replace('T', ' ').slice(0, 19))} ${esc(h.user_name || '—')}：${label[h.action] || h.action}${changed.length ? `（${changed.map(esc).join('、')}）` : ''}</li>`;
  }).join('')}</ul>`;
  anchor.append(div);
}

// ---------- 投稿案一覧 ----------
async function loadPosts() {
  const params = new URLSearchParams([...new FormData($('#postFilter'))].filter(([, v]) => v));
  $('#exportPosts').href = `/api/export/post_sets.csv?${params}`;
  const posts = await api(`/api/posts?${params}`);
  const box = $('#postList');
  box.innerHTML = posts.length ? '' : '<p class="hint panel">該当する投稿案はありません。</p>';
  for (const p of posts) box.append(postCard(p));
}
$('#postFilter').addEventListener('submit', (e) => { e.preventDefault(); loadPosts(); });

// ---------- 顧客・店舗情報 ----------
const FORMS = {
  clients: { title: '顧客', fields: [['name', '顧客名*'], ['contact_person', '担当者'], ['notes', '顧客固有の注意事項', 'textarea']] },
  brands: { title: 'ブランド・屋号', fields: [
    ['name', 'ブランド名*'], ['industry', '業種'], ['features', 'ブランドの特徴', 'textarea'], ['tone', 'ブランド共通の文章トーン'],
    ['preferred_phrases', 'よく使う表現', 'textarea'], ['avoid_phrases', '避けたい表現（改行・読点区切り）', 'textarea'],
    ['logo_url', 'ロゴ（URL）'], ['design_guide', 'デザインガイド', 'textarea'], ['reference_posts', '参考投稿', 'textarea'], ['notes', 'ブランド固有の注意事項', 'textarea'],
  ] },
  stores: { title: '店舗', fields: [
    ['name', '店舗名*'], ['area', '地域名（コピーで使う地名。例：新浦安）'], ['address', '住所'], ['google_maps_url', 'GoogleマップURL'],
    ['access', 'アクセス（駅からの距離など、確認済みの内容のみ）', 'textarea'], ['floor_info', '施設名・階数'], ['parking', '駐車場'],
    ['business_hours', '営業時間'], ['regular_holidays', '定休日'], ['temporary_closures', '臨時休業日'],
    ['reservation_method', '予約方法'], ['reservation_url', '予約URL'],
    ['atmosphere', '店舗の雰囲気', 'textarea'], ['use_scenes', '主な利用シーン', 'textarea'], ['target', 'ターゲット'],
    ['features', '店舗独自の特徴', 'textarea'], ['services', 'サービス', 'textarea'], ['facilities', '設備', 'textarea'],
    ['cta_options', '投稿で使用できるCTA・URL', 'cta'], ['tone', '店舗固有の文章トーン'], ['notes', '店舗固有の注意事項', 'textarea'],
    ['verified_at', '情報の確認日', 'date'], ['verified_source', '確認元'], ['verified_by', '確認者'],
  ] },
};

async function loadMaster() {
  const [clients, brands, stores] = await Promise.all([api('/api/clients'), api('/api/brands'), api('/api/stores')]);
  state.master = { clients, brands, stores };
  renderTree();
}

function renderTree() {
  const q = $('#masterSearch').value.trim().toLowerCase();
  const { clients, brands, stores } = state.master;
  const match = (...xs) => !q || xs.join(' ').toLowerCase().includes(q);
  $('#tree').innerHTML = clients.map((c) => {
    const bs = brands.filter((b) => b.client_id === c.id);
    const html = bs.map((b) => {
      const ss = stores.filter((s) => s.brand_id === b.id && match(c.name, b.name, s.name, s.store_code, s.area));
      if (!ss.length && !match(c.name, b.name)) return '';
      return `<li><a data-e="brands" data-id="${b.id}">${esc(b.name)}</a> <button class="mini" data-new="stores" data-parent="${b.id}">＋店舗</button>
        <ul>${ss.map((s) => `<li><a data-e="stores" data-id="${s.id}">${esc(s.name)}</a> <small>${esc(s.store_code)}</small></li>`).join('')}</ul></li>`;
    }).join('');
    if (!html && !match(c.name)) return '';
    return `<div class="tnode"><a data-e="clients" data-id="${c.id}"><b>${esc(c.name)}</b></a> <button class="mini" data-new="brands" data-parent="${c.id}">＋ブランド</button><ul>${html}</ul></div>`;
  }).join('') || '<p class="hint">まだ登録がありません。</p>';
}
$('#masterSearch').addEventListener('input', renderTree);
$('#tree').addEventListener('click', (e) => {
  const a = e.target.closest('a[data-e]');
  if (a) openEditor(a.dataset.e, Number(a.dataset.id));
  const n = e.target.closest('[data-new]');
  if (n) openEditor(n.dataset.new, null, Number(n.dataset.parent));
});
$('#newClient').addEventListener('click', () => openEditor('clients', null));

function ctaEditor(value) {
  let opts = [];
  try { opts = JSON.parse(value || '[]'); } catch { opts = []; }
  return `<div class="cta-edit">${META.spec.ctaTypes.map((t) => {
    const o = opts.find((x) => x.type === t.code);
    return `<div class="cta-row"><label class="check"><input type="checkbox" data-cta="${t.code}" ${o ? 'checked' : ''}> ${esc(t.ja)}</label>
      ${t.needsUrl ? `<input data-cta-url="${t.code}" value="${esc(o?.url || '')}" placeholder="リンク先URL">` : ''}</div>`;
  }).join('')}</div>`;
}

async function openEditor(entity, id, parentId) {
  const def = FORMS[entity];
  const row = id ? await api(`/api/${entity}/${id}`) : {};
  const parentKey = { brands: 'client_id', stores: 'brand_id' }[entity];
  const ed = $('#editor');
  const parentName = entity === 'stores' ? (row.brand?.name || state.master.brands.find((b) => b.id === parentId)?.name)
    : entity === 'brands' ? state.master.clients.find((c) => c.id === (row.client_id || parentId))?.name : null;
  ed.innerHTML = `<h2>${def.title}${id ? 'の編集' : 'の新規登録'} ${row.store_code ? `<small>店舗ID ${esc(row.store_code)}</small>` : ''}</h2>
    ${parentName ? `<p class="hint">所属：${esc(parentName)}${row.client ? `（顧客：${esc(row.client.name)}）` : ''}</p>` : ''}
    <form class="form" id="entityForm">${def.fields.map(([k, label, type]) => {
      const v = row[k] ?? '';
      if (type === 'textarea') return `<label>${esc(label)}<textarea name="${k}" rows="2">${esc(v)}</textarea></label>`;
      if (type === 'cta') return `<div class="lbl">${esc(label)}${ctaEditor(v)}</div>`;
      return `<label>${esc(label)}<input name="${k}" type="${type || 'text'}" value="${esc(v)}"></label>`;
    }).join('')}
    <div class="actions"><button class="primary" type="submit">保存</button>
    ${id ? '<button type="button" id="delEntity" class="danger">削除</button><button type="button" id="histEntity">履歴</button>' : ''}</div>
    ${row.updated_at ? `<p class="hint">最終更新 ${esc(row.updated_at)} ${esc(row.updated_by || '')}</p>` : ''}
    </form>
    ${entity === 'stores' && id ? '<div id="menuBox"></div>' : ''}`;
  $('#entityForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    const data = {};
    for (const [k, , type] of def.fields) {
      if (type === 'cta') {
        data.cta_options = JSON.stringify($$('[data-cta]', ed).filter((c) => c.checked).map((c) => {
          const url = $(`[data-cta-url="${c.dataset.cta}"]`, ed)?.value.trim();
          return url ? { type: c.dataset.cta, url } : { type: c.dataset.cta };
        }));
      } else data[k] = e.target.elements[k].value.trim() || null;
    }
    if (!id && parentKey) data[parentKey] = parentId;
    try {
      const saved = await api(id ? `/api/${entity}/${id}` : `/api/${entity}`, { method: id ? 'PUT' : 'POST', body: data });
      notify('保存しました');
      await loadMaster(); await loadStores();
      openEditor(entity, saved.id);
    } catch (err) { notify(err.message, 'error'); }
  });
  if (id) {
    $('#delEntity').addEventListener('click', async () => {
      if (!confirm('削除しますか？（配下のデータがある場合は削除できません）')) return;
      try { await api(`/api/${entity}/${id}`, { method: 'DELETE' }); notify('削除しました'); ed.innerHTML = ''; await loadMaster(); await loadStores(); } catch (err) { notify(err.message, 'error'); }
    });
    $('#histEntity').addEventListener('click', () => showHistory(entity, id, ed));
  }
  if (entity === 'stores' && id) renderMenu(id, row.menu || []);
}

function renderMenu(storeId, menu) {
  const box = $('#menuBox');
  box.innerHTML = `<h3>主なメニュー・商品</h3>
    <div class="table"><table><thead><tr><th>名前*</th><th>説明</th><th>価格</th><th>販売期間</th><th></th></tr></thead><tbody>
    ${menu.map((m) => `<tr data-id="${m.id}"><td><input name="name" value="${esc(m.name)}"></td><td><textarea name="description" rows="2">${esc(m.description || '')}</textarea></td>
      <td><input name="price" value="${esc(m.price || '')}"></td><td><input name="sales_period" value="${esc(m.sales_period || '')}"></td>
      <td><button class="mini save-m">保存</button><button class="mini danger del-m">削除</button></td></tr>`).join('')}
    <tr data-id=""><td><input name="name" placeholder="新しいメニュー"></td><td><textarea name="description" rows="2"></textarea></td><td><input name="price"></td><td><input name="sales_period"></td>
      <td><button class="mini primary save-m">追加</button></td></tr>
    </tbody></table></div>`;
  box.onclick = async (e) => {
    const tr = e.target.closest('tr');
    if (!tr) return;
    const mid = tr.dataset.id;
    try {
      if (e.target.classList.contains('save-m')) {
        const data = Object.fromEntries($$('input,textarea', tr).map((i) => [i.name, i.value.trim() || null]));
        if (!mid) data.store_id = storeId;
        await api(mid ? `/api/menu_items/${mid}` : '/api/menu_items', { method: mid ? 'PUT' : 'POST', body: data });
      } else if (e.target.classList.contains('del-m')) {
        if (!confirm('このメニューを削除しますか？')) return;
        await api(`/api/menu_items/${mid}`, { method: 'DELETE' });
      } else return;
      notify('メニューを保存しました');
      const s = await api(`/api/stores/${storeId}`);
      renderMenu(storeId, s.menu);
    } catch (err) { notify(err.message, 'error'); }
  };
}

// ---------- CSV ----------
$('#importForm').addEventListener('submit', async (e) => {
  e.preventDefault();
  const f = e.target;
  const text = await f.file.files[0].text();
  const out = $('#importResult');
  try {
    const r = await api(`/api/import/${f.entity.value}`, { method: 'POST', body: text, headers: { 'content-type': 'text/csv' } });
    out.textContent = `新規 ${r.created} 件・更新 ${r.updated} 件を取り込みました。`;
    loadStores();
  } catch (err) {
    out.textContent = `取り込みを中止しました（全件取り消し）。\n${err.data?.errors?.join('\n') || err.message}`;
  }
  out.hidden = false;
});

// ---------- Google仕様 ----------
async function renderSpec() {
  const spec = await api('/api/spec');
  META.spec = spec;
  $('#specPanel').innerHTML = `<h2>Googleビジネスプロフィール投稿の仕様値</h2>
    <p>仕様バージョン <b>${esc(spec.specVersion)}</b> ／ 確認日 <b>${esc(spec.verifiedAt)}</b> ／ 確認者 ${esc(spec.verifiedBy || '')}</p>
    ${spec.needsReverification ? `<p class="warn">${esc(spec.verificationNote || '要再確認')}</p>` : ''}
    <ul>
      <li>投稿本文の上限：<b>${spec.postBody.maxChars} 文字</b>（${esc(spec.postBody.status || '')}）</li>
      <li>イベントのタイトル上限：${spec.eventTitle?.maxChars ?? '-'} 文字</li>
      <li>ボタン（CTA）：${spec.ctaTypes.map((t) => esc(t.ja)).join('、')}</li>
      <li>画像：${esc(spec.image?.formats?.join('/') || '')}、${Math.round((spec.image?.minBytes || 0) / 1024)}KB〜${Math.round((spec.image?.maxBytes || 0) / 1048576)}MB、最小 ${spec.image?.minWidth}×${spec.image?.minHeight}px（${esc(spec.image?.status || '')}）</li>
      <li>社内の目安：日本語 ${spec.writingGuide.jaRecommendedMin}〜${spec.writingGuide.jaRecommendedMax} 文字、キャッチコピー ${spec.writingGuide.catchcopyMaxChars} 文字以内</li>
    </ul>
    <h3>公式情報</h3><ul>${(spec.sources || []).map((s) => `<li><a href="${esc(s.url)}" target="_blank" rel="noopener">${esc(s.label)}</a></li>`).join('')}</ul>
    <h3>仕様値の更新</h3>
    <p class="hint">公式ページで最新の値を確認したら、下のJSONを修正し、verifiedAt（確認日）と needsReverification を更新して保存してください。保存すると変更履歴に記録され、以降のチェックに使われます。</p>
    <form id="specForm" class="form"><textarea name="json" rows="22" class="mono">${esc(JSON.stringify(spec, null, 2))}</textarea>
    <div class="actions"><button class="primary" type="submit">保存</button></div></form>`;
  $('#specForm').addEventListener('submit', async (e) => {
    e.preventDefault();
    let json;
    try { json = JSON.parse(e.target.json.value); } catch { notify('JSONの形式が正しくありません。', 'error'); return; }
    try { await api('/api/spec', { method: 'PUT', body: json }); notify('仕様値を保存しました'); renderSpec(); } catch (err) { notify(err.message, 'error'); }
  });
}

// ---------- 初期化 ----------
(async function init() {
  META = await api('/api/meta');
  $('#ctaSelect').innerHTML = '<option value="">なし</option>' + META.spec.ctaTypes.map((t) => `<option value="${t.code}">${esc(t.ja)}</option>`).join('');
  $('#providerSelect').innerHTML = (META.aiConfigured ? `<option value="anthropic">AI生成（${esc(META.model)}）</option>` : '')
    + `<option value="mock">デモ生成（テンプレート・外部通信なし）</option>`;
  if (!META.aiConfigured) notify('AI生成のAPIキーが未設定のため、デモ生成のみ利用できます。', 'warn');
  $('#statusFilter').innerHTML = '<option value="">すべての状態</option>' + META.statuses.map((s) => `<option value="${s.value}">${s.label}</option>`).join('');
  await loadStores();
})().catch((e) => notify(e.message, 'error'));
