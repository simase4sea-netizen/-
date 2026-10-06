/* CSV・表データの読み込みと広告数値への対応付け（ブラウザ／Node 共用） */
(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' && module.exports ? require('./format.js') : root.FS.format;

  // 区切り文字（カンマ／タブ）を自動判定して2次元配列にする。
  function parse(text) {
    if (!text) return [];
    text = String(text).replace(/^﻿/, '');
    const firstLine = text.split(/\r?\n/)[0] || '';
    const delim = (firstLine.match(/\t/g) || []).length > (firstLine.match(/,/g) || []).length ? '\t' : ',';
    const rows = [];
    let row = [];
    let cell = '';
    let inQuotes = false;
    for (let i = 0; i < text.length; i++) {
      const ch = text[i];
      if (inQuotes) {
        if (ch === '"') {
          if (text[i + 1] === '"') { cell += '"'; i++; }
          else inQuotes = false;
        } else cell += ch;
        continue;
      }
      if (ch === '"') inQuotes = true;
      else if (ch === delim) { row.push(cell); cell = ''; }
      else if (ch === '\n' || ch === '\r') {
        if (ch === '\r' && text[i + 1] === '\n') i++;
        row.push(cell); cell = '';
        if (row.some((c) => c.trim() !== '')) rows.push(row);
        row = [];
      } else cell += ch;
    }
    row.push(cell);
    if (row.some((c) => c.trim() !== '')) rows.push(row);
    return rows.map((r) => r.map((c) => c.trim()));
  }

  // 列名の候補（Meta広告マネージャ等の日本語／英語エクスポートを想定）。完全一致を優先し、次に部分一致。
  const COLUMN_SYNONYMS = {
    spend: ['消化金額 (JPY)', '消化金額(JPY)', '消化金額', '広告費', '費用', '利用金額', 'Amount spent (JPY)', 'Amount spent', 'Cost', 'Spend'],
    reach: ['リーチ', 'Reach'],
    impressions: ['インプレッション', '表示回数', 'Impressions'],
    clicks: ['リンクのクリック', 'リンククリック', 'クリック数', 'クリック(すべて)', 'クリック（すべて）', 'Link clicks', 'Clicks (all)', 'Clicks'],
    profileVisits: ['Instagramプロフィールへのアクセス', 'プロフィールへのアクセス', 'プロフィール閲覧数', 'プロフィールアクセス', 'Instagram profile visits', 'Profile visits'],
    follows: ['Instagramのフォロー', 'フォロー数', 'フォロー', 'Instagram follows', 'Follows'],
    results: ['結果', '成果数', 'Results'],
    name: ['キャンペーン名', '広告セット名', '広告名', 'Campaign name', 'Ad set name', 'Ad name'],
    start: ['レポート開始日', '開始日', '配信開始日', 'Reporting starts', 'Starts'],
    end: ['レポート終了日', '終了日', '配信終了日', 'Reporting ends', 'Ends'],
  };

  // 「結果の単価」「クリック単価」などを誤って数値列に当てないための除外語
  const EXCLUDE = /単価|あたり|率|CPC|CPM|CTR|per|cost per|頻度|インジケーター|indicator|タイプ|type/i;

  function norm(s) {
    return String(s || '').replace(/\s+/g, '').toLowerCase();
  }

  function autoMap(headers) {
    const map = {};
    const used = new Set();
    Object.keys(COLUMN_SYNONYMS).forEach((field) => {
      const cands = COLUMN_SYNONYMS[field];
      let idx = -1;
      for (const c of cands) {
        idx = headers.findIndex((h, i) => !used.has(i) && norm(h) === norm(c));
        if (idx >= 0) break;
      }
      if (idx < 0) {
        for (const c of cands) {
          idx = headers.findIndex((h, i) => !used.has(i) && norm(h).includes(norm(c)) && (field === 'name' || field === 'start' || field === 'end' || !EXCLUDE.test(h)));
          if (idx >= 0) break;
        }
      }
      if (idx >= 0) { map[field] = idx; used.add(idx); }
    });
    return map;
  }

  // 合計行らしい行（「合計」「Total」など）を判定
  function isTotalRow(row, map) {
    const nameCell = map.name !== undefined ? row[map.name] : row[0];
    return /^(合計|総計|total|全体)/i.test(String(nameCell || '').trim());
  }

  // 選択した行の数値を集計する。
  // 戻り値：{ metrics: {key:{value,source,needsCheck,note}}, period:{start,end}, warnings:[] }
  function aggregate(rows, headers, map, selectedIdx, fileName, metricDefs) {
    const warnings = [];
    const metrics = {};
    const picked = selectedIdx.map((i) => rows[i]).filter(Boolean);
    if (!picked.length) return { metrics, period: {}, warnings: ['集計する行が選択されていません。'] };

    metricDefs.forEach((m) => {
      const col = map[m.key];
      if (col === undefined || col === null || col === '') return;
      const header = headers[col];
      const values = [];
      const unreadable = [];
      picked.forEach((r, j) => {
        const raw = r[col];
        const v = F.parseNumber(raw);
        if (v === null) { if (raw && raw.trim() !== '' && raw.trim() !== '-') unreadable.push('「' + raw + '」(' + (selectedIdx[j] + 1) + '行目)'); }
        else values.push(v);
      });
      if (!values.length) {
        if (unreadable.length) warnings.push(m.label + '：数値として読めない値があります ' + unreadable.join('、'));
        return;
      }
      const sum = values.reduce((a, b) => a + b, 0);
      const entry = {
        value: Math.round(sum * 1e6) / 1e6,
        source: (fileName || 'CSV') + '／列「' + header + '」' + (picked.length > 1 ? '／' + picked.length + '行を合算' : ''),
        needsCheck: false,
        note: '',
      };
      if (unreadable.length) {
        entry.needsCheck = true;
        entry.note = '読めない値を除外して集計：' + unreadable.join('、');
      }
      if (!m.additive && picked.length > 1) {
        entry.needsCheck = true;
        entry.note = (entry.note ? entry.note + '／' : '') + '複数行のリーチを足しているため、同じ人が重複して数えられている可能性があります。全体のリーチは広告管理画面の合計値で確認してください';
      }
      metrics[m.key] = entry;
    });

    // 期間：選択行の最小開始日〜最大終了日
    const period = {};
    const toIso = (s) => {
      const m = /(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})/.exec(String(s || ''));
      return m ? m[1] + '-' + m[2].padStart(2, '0') + '-' + m[3].padStart(2, '0') : null;
    };
    if (map.start !== undefined) {
      const starts = picked.map((r) => toIso(r[map.start])).filter(Boolean).sort();
      if (starts.length) period.start = starts[0];
    }
    if (map.end !== undefined) {
      const ends = picked.map((r) => toIso(r[map.end])).filter(Boolean).sort();
      if (ends.length) period.end = ends[ends.length - 1];
    }
    if (map.start !== undefined) {
      const distinct = new Set(picked.map((r) => toIso(r[map.start])).filter(Boolean));
      if (distinct.size > 1) warnings.push('選択した行の開始日がそろっていません（' + Array.from(distinct).join('、') + '）。期間の異なるデータを合算していないか確認してください。');
    }
    return { metrics, period, warnings };
  }

  // 2次元配列をCSV文字列にする（Excelで開けるよう UTF-8 BOM・CRLF）
  function cell(v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }
  function stringify(head, rows) { return '\ufeff' + [head].concat(rows).map((r) => r.map(cell).join(',')).join('\r\n') + '\r\n'; }

  const api = { parse, stringify, autoMap, aggregate, isTotalRow, COLUMN_SYNONYMS };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.csv = api; }
})(typeof self !== 'undefined' ? self : this);
