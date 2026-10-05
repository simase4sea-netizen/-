/* 数値・日付の表記ユーティリティ（ブラウザ／Node 共用） */
(function (root) {
  'use strict';

  function isNum(v) {
    return typeof v === 'number' && isFinite(v);
  }

  // "12,345" "¥12,345" "12345円" "1.2%" などを数値に変換。読めなければ null。
  function parseNumber(input) {
    if (input === null || input === undefined) return null;
    if (isNum(input)) return input;
    let s = String(input).trim();
    if (s === '' || s === '-' || s === '—' || s === '–' || s === 'N/A' || s === '--') return null;
    // 全角数字・記号を半角へ
    s = s.replace(/[０-９．，－]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0));
    s = s.replace(/[¥￥円,\s%件回人]/g, '');
    if (!/^-?\d+(\.\d+)?$/.test(s)) return null;
    return Number(s);
  }

  function round(n, digits) {
    const p = Math.pow(10, digits);
    return Math.round(n * p) / p;
  }

  function fmtInt(n) {
    if (!isNum(n)) return '—';
    return Math.round(n).toLocaleString('ja-JP');
  }

  // 元データ表記用：小数があればそのまま残す
  function fmtRaw(n) {
    if (!isNum(n)) return '—';
    if (Number.isInteger(n)) return n.toLocaleString('ja-JP');
    return n.toLocaleString('ja-JP', { maximumFractionDigits: 6 });
  }

  function fmtDec(n, digits) {
    if (!isNum(n)) return '—';
    return round(n, digits).toLocaleString('ja-JP', {
      minimumFractionDigits: digits,
      maximumFractionDigits: digits,
    });
  }

  function fmtYen(n, digits) {
    if (!isNum(n)) return '—';
    return (digits ? fmtDec(n, digits) : fmtRaw(n)) + '円';
  }

  function fmtPct(n, digits) {
    if (!isNum(n)) return '—';
    return fmtDec(n, digits === undefined ? 2 : digits) + '%';
  }

  function fmtSignedPct(n, digits) {
    if (!isNum(n)) return '—';
    const sign = n > 0 ? '+' : n < 0 ? '−' : '±';
    return sign + fmtDec(Math.abs(n), digits === undefined ? 1 : digits) + '%';
  }

  // YYYY-MM-DD → 2026年10月5日
  function fmtDateJa(iso) {
    if (!iso) return '';
    const m = /^(\d{4})-(\d{2})-(\d{2})/.exec(iso);
    if (!m) return iso;
    return Number(m[1]) + '年' + Number(m[2]) + '月' + Number(m[3]) + '日';
  }

  function fmtPeriod(start, end) {
    if (!start && !end) return '';
    if (start && end) return fmtDateJa(start) + '〜' + fmtDateJa(end);
    return start ? fmtDateJa(start) + '〜（終了日未入力）' : '（開始日未入力）〜' + fmtDateJa(end);
  }

  function fmtDateTime(ts) {
    const d = new Date(ts);
    const pad = (x) => String(x).padStart(2, '0');
    return d.getFullYear() + '/' + pad(d.getMonth() + 1) + '/' + pad(d.getDate()) + ' ' + pad(d.getHours()) + ':' + pad(d.getMinutes());
  }

  const api = { isNum, parseNumber, round, fmtInt, fmtRaw, fmtDec, fmtYen, fmtPct, fmtSignedPct, fmtDateJa, fmtPeriod, fmtDateTime };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.format = api; }
})(typeof self !== 'undefined' ? self : this);
