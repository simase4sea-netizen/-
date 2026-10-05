/* データ保存（ブラウザの localStorage）・操作履歴・ステータス管理 */
(function (root) {
  'use strict';
  const KEY = 'fs-automation-v1';
  const G = root.FS.guard;

  const STATUS = {
    draft: { label: '下書き', cls: 'st-draft' },
    review: { label: '確認待ち', cls: 'st-review' },
    approved: { label: '承認済み', cls: 'st-approved' },
    done: { label: '完了', cls: 'st-done' },
  };

  function uid(prefix) {
    return prefix + '_' + Date.now().toString(36) + Math.random().toString(36).slice(2, 7);
  }

  function defaultState() {
    const now = Date.now();
    return {
      version: 1,
      createdAt: now,
      settings: {
        users: ['嶋野成優'],
        currentUser: '嶋野成優',
        senderName: '嶋野',
        ai: { enabled: false, apiKey: '' },
      },
      stores: G.OWN_STORE_NAMES.map((name, i) => ({ id: 'store_own_' + (i + 1), name, kind: 'own', aliases: [], memo: '', reportTemplate: '', createdAt: now })),
      projects: [],
      reports: [],
      minutes: [],
      audit: [],
      inf: emptyInf(),
    };
  }

  // インフルエンサー候補選定のデータ（既存データに無ければ追加する）
  function emptyInf() {
    return { campaigns: [], candidates: [], links: [], searches: [], settings: root.FS.inf.defaultSettings() };
  }
  function migrate(st) {
    if (!st.inf) st.inf = emptyInf();
    ['campaigns', 'candidates', 'links', 'searches'].forEach((k) => { if (!Array.isArray(st.inf[k])) st.inf[k] = []; });
    const d = root.FS.inf.defaultSettings();
    st.inf.settings = Object.assign({}, d, st.inf.settings || {});
    st.inf.settings.weights = Object.assign({}, d.weights, (st.inf.settings || {}).weights || {});
    return st;
  }

  let state = null;
  const listeners = [];

  function load() {
    try {
      const raw = root.localStorage.getItem(KEY);
      state = migrate(raw ? JSON.parse(raw) : defaultState());
    } catch (e) {
      console.error(e);
      state = defaultState();
    }
    return state;
  }

  let saveTimer = null;
  function save(immediate) {
    const doSave = () => {
      try {
        root.localStorage.setItem(KEY, JSON.stringify(state));
      } catch (e) {
        root.FS.ui && root.FS.ui.toast('保存できませんでした（ブラウザの保存容量が不足している可能性があります）。設定画面からバックアップを書き出してください。', 'error');
      }
    };
    clearTimeout(saveTimer);
    if (immediate) doSave();
    else saveTimer = setTimeout(doSave, 300);
  }

  function get() { return state; }
  function user() { return state.settings.currentUser || '（未設定）'; }

  // 操作履歴。doc を渡すとその文書の履歴にも残す。
  function log(action, target, detail, doc) {
    const entry = { at: Date.now(), user: user(), action, targetType: target && target.type, targetId: target && target.id, targetLabel: target && target.label, detail: detail || '' };
    state.audit.push(entry);
    if (doc) { doc.history = doc.history || []; doc.history.push(entry); }
    save();
    return entry;
  }

  function storeById(id) { return state.stores.find((s) => s.id === id) || null; }
  function projectById(id) { return state.projects.find((p) => p.id === id) || null; }

  function onChange(fn) { listeners.push(fn); }
  function emit() { listeners.forEach((fn) => fn()); }

  function exportJson() {
    const copy = JSON.parse(JSON.stringify(state));
    if (copy.settings && copy.settings.ai) copy.settings.ai.apiKey = ''; // APIキーは書き出さない
    return JSON.stringify(copy, null, 2);
  }

  function importJson(text) {
    const data = JSON.parse(text);
    if (!data || !Array.isArray(data.stores) || !Array.isArray(data.reports) || !Array.isArray(data.minutes)) throw new Error('Four Seasons 業務アシストのバックアップ形式ではありません');
    const key = state && state.settings && state.settings.ai ? state.settings.ai.apiKey : '';
    state = migrate(data);
    state.settings.ai = state.settings.ai || { enabled: false, apiKey: '' };
    if (!state.settings.ai.apiKey) state.settings.ai.apiKey = key;
    save(true);
  }

  function reset() {
    state = defaultState();
    save(true);
  }

  root.FS = root.FS || {};
  root.FS.store = { KEY, STATUS, uid, load, save, get, user, log, storeById, projectById, onChange, emit, exportJson, importJson, reset, defaultState };
})(self);
