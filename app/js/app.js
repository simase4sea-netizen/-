/* 画面の切り替え（#/home など）と利用者表示 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const U = root.FS.ui;
  const V = root.FS.views;

  const ROUTES = [
    [/^#\/(home)?$/, 'home', (m) => V.home(m)],
    [/^#\/reports$/, 'reports', (m) => V.reportList(m)],
    [/^#\/report\/([\w]+)$/, 'reports', (m, a) => V.reportEdit(m, a[1])],
    [/^#\/minutes$/, 'minutes', (m) => V.minutesList(m)],
    [/^#\/minutes\/([\w]+)$/, 'minutes', (m, a) => V.minutesEdit(m, a[1])],
    [/^#\/tasks$/, 'tasks', (m, a, p) => V.tasks(m, p)],
    [/^#\/stores$/, 'stores', (m) => V.stores(m)],
    [/^#\/log$/, 'log', (m) => V.auditLog(m)],
    [/^#\/settings$/, 'settings', (m) => V.settings(m)],
    [/^#\/guide$/, 'guide', (m) => V.guide(m)],
    [/^#\/inf$/, 'inf', (m) => V.infList(m)],
    [/^#\/inf\/c\/([\w]+)$/, 'inf', (m, a, p) => V.infCampaign(m, a[1], p)],
    [/^#\/inf\/cands$/, 'infcands', (m) => V.infCandidates(m)],
    [/^#\/inf\/cand\/([\w]+)$/, 'infcands', (m, a) => V.infCandidate(m, a[1])],
    [/^#\/inf\/link\/([\w]+)$/, 'inf', (m, a) => V.infLink(m, a[1])],
    [/^#\/inf\/settings$/, 'infsettings', (m) => V.infSettings(m)],
  ];

  function route() {
    const full = location.hash || '#/home';
    const [path, query] = full.split('?');
    const params = new URLSearchParams(query || '');
    const main = document.getElementById('main');
    for (const [re, nav, fn] of ROUTES) {
      const a = re.exec(path);
      if (a) {
        document.querySelectorAll('.nav a').forEach((el) => el.classList.toggle('active', el.dataset.nav === nav));
        main.innerHTML = '';
        fn(main, a, params);
        window.scrollTo(0, 0);
        return;
      }
    }
    location.hash = '#/home';
  }

  function renderUser() {
    const st = S.get();
    const sel = document.getElementById('userSel');
    sel.innerHTML = st.settings.users.map((u) => '<option' + (u === st.settings.currentUser ? ' selected' : '') + '>' + U.esc(u) + '</option>').join('');
  }

  function init() {
    S.load();
    renderUser();
    document.getElementById('userSel').addEventListener('change', (e) => {
      S.get().settings.currentUser = e.target.value;
      S.log('利用者を切り替えました', { type: 'settings', id: '', label: '利用者' }, e.target.value);
      S.save(true);
      U.toast('利用者：' + e.target.value, 'ok');
    });
    window.addEventListener('hashchange', route);
    // 別タブで同じデータを編集した場合の上書き事故を防ぐ
    window.addEventListener('storage', (e) => {
      if (e.key === S.KEY) { S.load(); renderUser(); route(); U.toast('別のタブでデータが更新されたため、表示を更新しました'); }
    });
    route();
  }

  root.FS.app = { route, renderUser, init };
  document.addEventListener('DOMContentLoaded', init);
})(self);
