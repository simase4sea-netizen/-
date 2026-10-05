/* 店舗・案件の取り違え防止チェック（ブラウザ／Node 共用） */
(function (root) {
  'use strict';

  // 自社店舗として扱う店舗名（最新の指示で変更があれば設定画面で区分を変更する）
  const OWN_STORE_NAMES = ['77スイーツショップ高松店', '飴のち林檎', '出世魚'];

  function namesOf(store) {
    return [store.name].concat(store.aliases || []).map((s) => String(s || '').trim()).filter((s) => s.length >= 2);
  }

  // text の中に、対象店舗以外の登録店舗名が出てきたら警告を返す。
  // 対象店舗の名前に他店舗名が含まれる場合（例：「出世魚」と「出世魚 本店」）は誤検知しないよう除外する。
  function findOtherStoreMentions(text, targetStoreId, stores) {
    if (!text) return [];
    const target = stores.find((s) => s.id === targetStoreId);
    const targetNames = target ? namesOf(target) : [];
    const hits = [];
    stores.forEach((s) => {
      if (s.id === targetStoreId) return;
      namesOf(s).forEach((n) => {
        if (targetNames.some((t) => t.includes(n))) return;
        if (text.includes(n) && !hits.some((h) => h.storeId === s.id)) {
          hits.push({ storeId: s.id, storeName: s.name, matched: n, kind: s.kind });
        }
      });
    });
    return hits;
  }

  function kindLabel(kind) {
    return kind === 'own' ? '自社店舗' : '顧客案件';
  }

  const api = { OWN_STORE_NAMES, findOtherStoreMentions, kindLabel };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.guard = api; }
})(typeof self !== 'undefined' ? self : this);
