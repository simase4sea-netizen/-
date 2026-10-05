/* 広告レポートの出力（7項目）と店舗向け報告文の生成（ブラウザ／Node 共用） */
(function (root) {
  'use strict';
  const isNode = typeof module !== 'undefined' && module.exports;
  const F = isNode ? require('./format.js') : root.FS.format;
  const C = isNode ? require('./calc.js') : root.FS.calc;
  const G = isNode ? require('./guard.js') : root.FS.guard;

  const DEFAULT_TEMPLATE = [
    '{店舗名}',
    'ご担当者様',
    '',
    'いつもお世話になっております。',
    '合同会社Four Seasonsの{差出人}です。',
    '{期間}の広告配信結果をご報告いたします。',
    '',
    '■配信期間：{期間}',
    '■広告費：{広告費}',
    '',
    '【主な数値】',
    '{数値一覧}',
    '',
    '【指標】',
    '{指標一覧}',
    '{前回比ブロック}',
    '【所見】',
    '{所見}',
    '',
    '【次回に向けて】',
    '{改善案}',
    '',
    'ご不明な点がございましたら、お気軽にお知らせください。',
    '引き続きよろしくお願いいたします。',
  ].join('\n');

  const PLACEHOLDERS = [
    ['{店舗名}', '店舗名'], ['{案件名}', '案件名'], ['{期間}', '配信期間'], ['{差出人}', '差出人名（設定画面）'],
    ['{広告費}', '広告費'], ['{リーチ}', 'リーチ'], ['{表示回数}', '表示回数'], ['{クリック数}', 'クリック数'],
    ['{プロフィール閲覧数}', 'プロフィール閲覧数'], ['{フォロー数}', 'フォロー数'], ['{成果数}', '成果数'],
    ['{クリック単価}', 'クリック単価'], ['{フォロー単価}', 'フォロー単価'], ['{プロフィール閲覧単価}', 'プロフィール閲覧単価'],
    ['{成果単価}', '成果単価'], ['{CPM}', '1,000回表示あたりの費用'], ['{CTR}', 'クリック率'], ['{フリークエンシー}', 'フリークエンシー'],
    ['{数値一覧}', '入力済みの主要数値（箇条書き）'], ['{指標一覧}', '算出できた指標（箇条書き）'],
    ['{前回比}', '前回比（前回値がある場合のみ）'], ['{前回比ブロック}', '見出し付きの前回比（前回値が無ければ空）'],
    ['{所見}', '所見（画面で編集した内容）'], ['{改善案}', '改善案（画面で編集した内容）'],
  ];

  const BASE_TO_PH = { spend: '広告費', reach: 'リーチ', impressions: '表示回数', clicks: 'クリック数', profileVisits: 'プロフィール閲覧数', follows: 'フォロー数', results: '成果数' };
  const DERIVED_TO_PH = { cpc: 'クリック単価', cpf: 'フォロー単価', cpv: 'プロフィール閲覧単価', cpr: '成果単価', cpm: 'CPM', ctr: 'CTR', frequency: 'フリークエンシー' };

  function missing(label) {
    return '【要確認：' + label + '未入力】';
  }

  // すべての出力（7項目）をまとめて作る
  function build(report, store, project, settings) {
    const opts = { resultLabel: report.resultLabel };
    const analysis = C.buildFindings(report);
    const checks = C.collectChecks(report, store);

    const baseRows = C.BASE_METRICS.filter((m) => report.metrics && report.metrics[m.key] && F.isNum(report.metrics[m.key].value)).map((m) => {
      const v = report.metrics[m.key];
      return { key: m.key, label: C.labelOf(m.key, opts), value: v.value, display: C.fmtBase(m.key, v.value), source: v.source || '手入力', needsCheck: !!v.needsCheck, note: v.note || '' };
    });
    (report.customMetrics || []).forEach((cm) => {
      if (!cm.label) return;
      baseRows.push({ key: 'custom', label: cm.label, value: cm.value, display: String(cm.value || ''), source: cm.source || '手入力', needsCheck: !!cm.needsCheck, note: '' });
    });

    const findingsText = report.findingsText !== undefined && report.findingsText !== null && report.findingsText !== ''
      ? report.findingsText
      : analysis.findings.map((f) => '・' + f.text).join('\n');
    const ideasText = report.ideasText !== undefined && report.ideasText !== null && report.ideasText !== ''
      ? report.ideasText
      : analysis.ideas.map((t) => '・' + t).join('\n');

    const text = renderTemplate(report.template || (store && store.reportTemplate) || DEFAULT_TEMPLATE, {
      report, store, project, settings, baseRows, analysis, findingsText, ideasText,
    });

    // 報告文に他店舗名が含まれていないか
    const stores = (settings && settings.stores) || [];
    const mentions = store ? G.findOtherStoreMentions(text, store.id, stores) : [];
    mentions.forEach((m) => checks.push('報告文に別の店舗名「' + m.matched + '」（' + G.kindLabel(m.kind) + '）が含まれています。取り違えがないか確認してください。'));
    if (/【要確認/.test(text)) checks.push('報告文に【要確認】の箇所が残っています。');
    const finalText = report.textOverride ? report.textOverride : text;
    if (report.textOverride) {
      const m2 = store ? G.findOtherStoreMentions(finalText, store.id, stores) : [];
      m2.forEach((m) => { if (!mentions.some((x) => x.storeId === m.storeId)) checks.push('報告文に別の店舗名「' + m.matched + '」（' + G.kindLabel(m.kind) + '）が含まれています。'); });
      if (/【要確認/.test(finalText) && !/【要確認/.test(text)) checks.push('報告文に【要確認】の箇所が残っています。');
      if (finalText !== text) checks.push('報告文は手動で編集されています。数値を変更した場合は「自動生成に戻す」で作り直すか、文面の数値を確認してください。');
    }
    const unknownNums = verifyNumbers(finalText, report, analysis, [report.template || (store && store.reportTemplate) || DEFAULT_TEMPLATE, findingsText, ideasText]);
    unknownNums.forEach((n) => checks.push('報告文の数値「' + n + '」は入力値・計算結果と一致しません。転記ミスがないか確認してください。'));

    return {
      header: { storeName: store ? store.name : '', storeKind: store ? G.kindLabel(store.kind) : '', projectName: project ? project.name : '', period: F.fmtPeriod(report.periodStart, report.periodEnd), objective: report.objective || '' },
      baseRows,
      derived: analysis.derived,
      compare: analysis.compare,
      findings: analysis.findings,
      ideas: analysis.ideas,
      findingsText,
      ideasText,
      text,
      generatedText: text,
      finalText,
      checks,
    };
  }

  // 報告文に出てくる数値が、入力値・計算結果・テンプレート・編集済みの所見のどれかと一致するか照合する
  function numTokens(text) {
    return (String(text || '').match(/\d[\d,]*(\.\d+)?/g) || []).map((t) => t.replace(/,/g, ''));
  }

  function verifyNumbers(text, report, analysis, extraTexts) {
    const allowed = new Set();
    const add = (n) => { if (n === null || n === undefined || !isFinite(n)) return; allowed.add(String(Number(n))); };
    const metrics = report.metrics || {};
    // 指標名に含まれる数字（「1,000回表示あたり」「1人あたり」）
    C.DERIVED_METRICS.concat(C.BASE_METRICS).forEach((m) => numTokens(m.label).forEach((x) => allowed.add(String(Number(x)))));
    analysis.derived.forEach((d) => numTokens(d.label).forEach((x) => allowed.add(String(Number(x)))));
    Object.keys(metrics).forEach((k) => metrics[k] && add(metrics[k].value));
    if (report.hasPrevious) Object.keys(report.previous || {}).forEach((k) => report.previous[k] && add(report.previous[k].value));
    analysis.derived.forEach((d) => { if (d.value !== null) { add(F.round(d.value, d.digits)); add(d.value); } });
    analysis.compare.forEach((r) => { add(r.current); add(r.previous); add(Math.abs(r.diff)); if (r.changePct !== null) add(F.round(Math.abs(r.changePct), 1)); });
    [report.periodStart, report.periodEnd].forEach((d) => { if (d) d.split('-').forEach((x) => add(Number(x))); });
    (report.customMetrics || []).forEach((cm) => numTokens(cm.value).forEach((t) => allowed.add(String(Number(t)))));
    (extraTexts || []).forEach((t) => numTokens(t).forEach((x) => allowed.add(String(Number(x)))));
    numTokens(report.resultLabel).forEach((x) => allowed.add(String(Number(x))));
    numTokens(report.previousLabel).forEach((x) => allowed.add(String(Number(x))));
    const unknown = [];
    (String(text || '').match(/\d[\d,]*(\.\d+)?/g) || []).forEach((raw) => {
      const key = String(Number(raw.replace(/,/g, '')));
      if (!allowed.has(key) && !unknown.includes(raw)) unknown.push(raw);
    });
    return unknown;
  }

  function renderTemplate(tpl, ctx) {
    const { report, store, project, settings, baseRows, analysis, findingsText, ideasText } = ctx;
    const metrics = report.metrics || {};
    const map = {};
    map['店舗名'] = store ? store.name : missing('店舗名');
    map['案件名'] = project ? project.name : missing('案件名');
    map['期間'] = report.periodStart && report.periodEnd ? F.fmtPeriod(report.periodStart, report.periodEnd) : missing('配信期間');
    map['差出人'] = (settings && settings.senderName) || missing('差出人名');
    Object.keys(BASE_TO_PH).forEach((k) => {
      const v = metrics[k];
      map[BASE_TO_PH[k]] = v && F.isNum(v.value) ? C.fmtBase(k, v.value) : missing(C.labelOf(k, report));
    });
    analysis.derived.forEach((d) => {
      if (DERIVED_TO_PH[d.key]) map[DERIVED_TO_PH[d.key]] = d.value !== null ? d.display : '【要確認：' + d.label + 'は算出不可（' + d.reason + '）】';
    });
    map['数値一覧'] = baseRows.length ? baseRows.map((r) => '・' + r.label + '：' + r.display).join('\n') : missing('主要数値');
    const okDerived = analysis.derived.filter((d) => d.value !== null);
    map['指標一覧'] = okDerived.length ? okDerived.map((d) => '・' + d.label + '：' + d.display).join('\n') : '・算出できる指標はありません';
    const cmpLines = analysis.compare.filter((r) => r.changePct !== null).map((r) => '・' + r.label + '：' + r.previousDisplay + '→' + r.currentDisplay + '（' + r.changeDisplay + '）');
    map['前回比'] = cmpLines.join('\n');
    map['前回比ブロック'] = cmpLines.length ? '\n【前回' + (report.previousLabel ? '（' + report.previousLabel + '）' : '') + 'との比較】\n' + cmpLines.join('\n') + '\n' : '';
    map['所見'] = findingsText || missing('所見');
    map['改善案'] = ideasText || missing('改善案');

    let out = tpl.replace(/\{([^{}\n]+)\}/g, (all, key) => (Object.prototype.hasOwnProperty.call(map, key) ? map[key] : all));
    // 連続する空行を1つにまとめる
    out = out.replace(/\n{3,}/g, '\n\n');
    return out;
  }

  const api = { DEFAULT_TEMPLATE, PLACEHOLDERS, build, renderTemplate, verifyNumbers };
  if (isNode) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.report = api; }
})(typeof self !== 'undefined' ? self : this);
