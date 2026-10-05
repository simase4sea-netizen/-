/* 添付ファイル（画像・CSV・テキスト）の保存。容量の大きい画像は IndexedDB に置く。 */
(function (root) {
  'use strict';
  const DB = 'fs-automation-files';
  const STORE = 'files';
  let dbp = null;

  function db() {
    if (dbp) return dbp;
    dbp = new Promise((resolve, reject) => {
      const req = root.indexedDB.open(DB, 1);
      req.onupgradeneeded = () => req.result.createObjectStore(STORE);
      req.onsuccess = () => resolve(req.result);
      req.onerror = () => reject(req.error);
    });
    return dbp;
  }

  async function put(id, blob) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).put(blob, id);
      tx.oncomplete = () => resolve(id);
      tx.onerror = () => reject(tx.error);
    });
  }

  async function get(id) {
    const d = await db();
    return new Promise((resolve, reject) => {
      const tx = d.transaction(STORE, 'readonly');
      const req = tx.objectStore(STORE).get(id);
      req.onsuccess = () => resolve(req.result || null);
      req.onerror = () => reject(req.error);
    });
  }

  async function remove(id) {
    const d = await db();
    return new Promise((resolve) => {
      const tx = d.transaction(STORE, 'readwrite');
      tx.objectStore(STORE).delete(id);
      tx.oncomplete = () => resolve();
      tx.onerror = () => resolve();
    });
  }

  function readText(file) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => {
        const buf = new Uint8Array(fr.result);
        // UTF-8 で読めなければ Shift_JIS（Excel 保存の CSV に多い）として読む
        let text = new TextDecoder('utf-8').decode(buf);
        if (text.includes('�')) {
          try { text = new TextDecoder('shift_jis').decode(buf); } catch (e) { /* そのまま */ }
        }
        resolve(text);
      };
      fr.onerror = () => reject(fr.error);
      fr.readAsArrayBuffer(file);
    });
  }

  function toDataUrl(blob) {
    return new Promise((resolve, reject) => {
      const fr = new FileReader();
      fr.onload = () => resolve(fr.result);
      fr.onerror = () => reject(fr.error);
      fr.readAsDataURL(blob);
    });
  }

  root.FS = root.FS || {};
  root.FS.files = { put, get, remove, readText, toDataUrl };
})(self);
