/* 広告レポートの数値定義・指標計算・前回比較・所見案（ブラウザ／Node 共用） */
(function (root) {
  'use strict';
  const F = typeof module !== 'undefined' && module.exports ? require('./format.js') : root.FS.format;

  // 入力する主要数値。additive=false は複数行を合算すると重複が混ざる指標。
  const BASE_METRICS = [
    { key: 'spend', label: '広告費', unit: 'yen', additive: true },
    { key: 'reach', label: 'リーチ', unit: 'count', additive: false },
    { key: 'impressions', label: '表示回数', unit: 'count', additive: true },
    { key: 'clicks', label: 'クリック数', unit: 'count', additive: true },
    { key: 'profileVisits', label: 'プロフィール閲覧数', unit: 'count', additive: true },
    { key: 'follows', label: 'フォロー数', unit: 'count', additive: true },
    { key: 'results', label: '成果数', unit: 'count', additive: true },
  ];

  // 計算する指標。num / den を割り、mult を掛ける。lowerIsBetter は表示の補足用。
  const DERIVED_METRICS = [
    { key: 'cpc', label: 'クリック単価', num: 'spend', den: 'clicks', mult: 1, unit: 'yen', digits: 1, lowerIsBetter: true },
    { key: 'cpf', label: 'フォロー単価', num: 'spend', den: 'follows', mult: 1, unit: 'yen', digits: 1, lowerIsBetter: true },
    { key: 'cpv', label: 'プロフィール閲覧単価', num: 'spend', den: 'profileVisits', mult: 1, unit: 'yen', digits: 1, lowerIsBetter: true },
    { key: 'cpr', label: '成果単価', num: 'spend', den: 'results', mult: 1, unit: 'yen', digits: 1, lowerIsBetter: true },
    { key: 'cpm', label: '1,000回表示あたりの費用（CPM）', num: 'spend', den: 'impressions', mult: 1000, unit: 'yen', digits: 1, lowerIsBetter: true },
    { key: 'ctr', label: 'クリック率（CTR）', num: 'clicks', den: 'impressions', mult: 100, unit: 'pct', digits: 2 },
    { key: 'frequency', label: 'フリークエンシー（1人あたり平均表示回数）', num: 'impressions', den: 'reach', mult: 1, unit: 'times', digits: 2 },
    { key: 'followRate', label: 'プロフィール閲覧→フォロー率', num: 'follows', den: 'profileVisits', mult: 100, unit: 'pct', digits: 2 },
  ];

  const OBJECTIVES = ['認知拡大', 'フォロワー獲得', 'プロフィール誘導', 'サイト・予約ページ誘導', '来店・予約獲得', 'その他'];

  function metaOf(key) {
    return BASE_METRICS.find((m) => m.key === key) || DERIVED_METRICS.find((m) => m.key === key);
  }

  function labelOf(key, opts) {
    if (key === 'results' && opts && opts.resultLabel) return '成果数（' + opts.resultLabel + '）';
    if (key === 'cpr' && opts && opts.resultLabel) return '成果単価（' + opts.resultLabel + '）';
    const m = metaOf(key);
    return m ? m.label : key;
  }

  function valueOf(metrics, key) {
    const m = metrics && metrics[key];
    if (!m) return null;
    return F.isNum(m.value) ? m.value : null;
  }

  function fmtByUnit(n, unit, digits) {
    if (unit === 'yen') return F.fmtYen(n, digits);
    if (unit === 'pct') return F.fmtPct(n, digits);
    if (unit === 'times') return F.fmtDec(n, digits) + '回';
    return F.fmtRaw(n);
  }

  function fmtBase(key, n) {
    const m = metaOf(key);
    return fmtByUnit(n, m ? m.unit : 'count', 0);
  }

  // 主要数値から指標を計算。根拠となる計算式の文字列を必ず添える。
  function computeDerived(metrics, opts) {
    return DERIVED_METRICS.map((d) => {
      const num = valueOf(metrics, d.num);
      const den = valueOf(metrics, d.den);
      const numLabel = labelOf(d.num, opts);
      const denLabel = labelOf(d.den, opts);
      const out = {
        key: d.key,
        label: labelOf(d.key, opts),
        unit: d.unit,
        digits: d.digits,
        lowerIsBetter: !!d.lowerIsBetter,
        inputs: [d.num, d.den],
        value: null,
        display: '算出不可',
        formula: '',
        status: 'ok',
        reason: '',
        needsCheck: !!((metrics[d.num] && metrics[d.num].needsCheck) || (metrics[d.den] && metrics[d.den].needsCheck)),
      };
      const missing = [];
      if (num === null) missing.push(numLabel);
      if (den === null) missing.push(denLabel);
      if (missing.length) {
        out.status = 'missing';
        out.reason = missing.join('・') + 'が未入力のため算出していません';
        return out;
      }
      if (den === 0) {
        out.status = 'zero';
        out.reason = denLabel + 'が0のため算出できません';
        return out;
      }
      const v = (num / den) * d.mult;
      out.value = v;
      out.display = fmtByUnit(v, d.unit, d.digits);
      const multTxt = d.mult === 1 ? '' : ' × ' + F.fmtRaw(d.mult);
      out.formula = numLabel + ' ' + fmtBase(d.num, num) + ' ÷ ' + denLabel + ' ' + fmtBase(d.den, den) + multTxt + ' = ' + out.display;
      if (d.digits > 0) out.formula += '（小数第' + (d.digits + 1) + '位を四捨五入）';
      return out;
    });
  }

  // 前回値がある項目だけ比較する。前回値が無ければ比較行を作らない。
  function compare(current, previous, opts) {
    if (!previous) return [];
    const rows = [];
    const curDerived = computeDerived(current, opts);
    const prevDerived = computeDerived(previous, opts);

    BASE_METRICS.forEach((m) => {
      const c = valueOf(current, m.key);
      const p = valueOf(previous, m.key);
      if (c === null || p === null) return;
      rows.push(makeCompareRow(m.key, labelOf(m.key, opts), m.unit, 0, c, p, false));
    });
    DERIVED_METRICS.forEach((m, i) => {
      const c = curDerived[i].value;
      const p = prevDerived[i].value;
      if (c === null || p === null) return;
      rows.push(makeCompareRow(m.key, labelOf(m.key, opts), m.unit, m.digits, F.round(c, m.digits), F.round(p, m.digits), !!m.lowerIsBetter));
    });
    return rows;
  }

  function makeCompareRow(key, label, unit, digits, cur, prev, lowerIsBetter) {
    const diff = cur - prev;
    const row = {
      key, label, unit, lowerIsBetter,
      current: cur, previous: prev, diff,
      currentDisplay: fmtByUnit(cur, unit, digits),
      previousDisplay: fmtByUnit(prev, unit, digits),
      diffDisplay: (diff > 0 ? '+' : diff < 0 ? '−' : '±') + fmtByUnit(Math.abs(diff), unit, digits),
      changePct: null,
      changeDisplay: '—',
      formula: '',
    };
    if (prev !== 0) {
      row.changePct = (diff / prev) * 100;
      row.changeDisplay = F.fmtSignedPct(row.changePct, 1);
      row.formula = '（今回 ' + row.currentDisplay + ' − 前回 ' + row.previousDisplay + '）÷ 前回 ' + row.previousDisplay + ' × 100 = ' + row.changeDisplay;
    } else {
      row.formula = '前回が0のため増減率は算出していません（差 ' + row.diffDisplay + '）';
    }
    return row;
  }

  // 所見案：数値から確実に言えることだけを書き、評価は目的と合わせて「可能性」として示す。
  function buildFindings(report) {
    const metrics = report.metrics || {};
    const opts = { resultLabel: report.resultLabel };
    const derived = computeDerived(metrics, opts);
    const d = Object.fromEntries(derived.map((x) => [x.key, x]));
    const cmp = report.hasPrevious ? compare(metrics, report.previous || {}, opts) : [];
    const c = Object.fromEntries(cmp.map((x) => [x.key, x]));
    const findings = [];
    const ideas = [];
    const objective = report.objective || '';

    if (!objective) {
      findings.push({ text: '配信目的が未入力のため、成果の良し悪しは判断していません。目的を入力すると、目的に沿った所見案になります。', basis: '配信目的：未入力' });
    }

    const reach = valueOf(metrics, 'reach');
    const spend = valueOf(metrics, 'spend');
    if (reach !== null && spend !== null) {
      findings.push({ text: '広告費' + F.fmtYen(spend) + 'で' + F.fmtRaw(reach) + '人に届きました。', basis: '広告費・リーチ（入力値）' });
    }

    if (d.frequency.value !== null) {
      const f = d.frequency.value;
      if (f >= 3) {
        findings.push({ text: '1人あたり平均' + d.frequency.display + '表示されています。同じ方に繰り返し表示されているため、広告が見慣れられている可能性があります。', basis: d.frequency.formula });
        ideas.push('同じ方への表示が重なっているため、写真・動画や見出しを差し替えた新しい広告の追加を検討する。');
      } else {
        findings.push({ text: '1人あたり平均' + d.frequency.display + '表示されています。', basis: d.frequency.formula });
      }
    }

    // 前回比（比較対象がある場合のみ）
    const compareTargets = ['reach', 'clicks', 'follows', 'profileVisits', 'results', 'cpc', 'cpf', 'cpr', 'ctr'];
    compareTargets.forEach((k) => {
      const r = c[k];
      if (!r || r.changePct === null) return;
      const dir = r.diff > 0 ? 'で増加しました。' : r.diff < 0 ? 'で減少しました。' : 'で前回と同じでした。';
      let text = r.label + 'は前回' + r.previousDisplay + '→今回' + r.currentDisplay + '（' + r.changeDisplay + '）' + dir;
      if (r.lowerIsBetter && r.diff !== 0) {
        text += r.diff < 0 ? '1件あたりの費用が下がっています。' : '1件あたりの費用が上がっています。';
      }
      findings.push({ text, basis: r.formula });
    });
    if (report.hasPrevious && (spend !== null) && valueOf(report.previous || {}, 'spend') !== null && c.spend && c.spend.changePct !== null && Math.abs(c.spend.changePct) >= 20) {
      findings.push({ text: '今回と前回で広告費が' + c.spend.changeDisplay + '変わっているため、件数の増減は広告費の違いの影響も含みます。単価で比較するのが適切です。', basis: c.spend.formula });
    }

    // 目的に沿った観点
    if (objective === 'フォロワー獲得') {
      if (d.cpf.value !== null) findings.push({ text: '目的がフォロワー獲得のため、主な評価指標はフォロー単価（' + d.cpf.display + '）です。', basis: d.cpf.formula });
      else findings.push({ text: '目的がフォロワー獲得ですが、フォロー数が未入力のためフォロー単価を算出できていません。', basis: d.cpf.reason });
      if (d.followRate.value !== null) {
        findings.push({ text: 'プロフィールを見た方のうち' + d.followRate.display + 'がフォローしています。', basis: d.followRate.formula });
        ideas.push('プロフィール閲覧からのフォローを増やすため、プロフィール文・ハイライト・直近の投稿の見え方を確認する。');
      }
      ideas.push('フォロー単価の比較のため、次回も同じ条件（期間・配信先）で計測する。');
    } else if (objective === '認知拡大') {
      if (d.cpm.value !== null) findings.push({ text: '目的が認知拡大のため、主な評価指標はリーチと1,000回表示あたりの費用（' + d.cpm.display + '）です。', basis: d.cpm.formula });
      ideas.push('届けたい地域・年齢層と実際の配信先が合っているか、配信設定を確認する。');
    } else if (objective === 'プロフィール誘導') {
      if (d.cpv.value !== null) findings.push({ text: '目的がプロフィール誘導のため、主な評価指標はプロフィール閲覧単価（' + d.cpv.display + '）です。', basis: d.cpv.formula });
      ideas.push('プロフィールに来た方が次に取る行動（フォロー・予約・来店）が分かるよう、プロフィールの導線を確認する。');
    } else if (objective === 'サイト・予約ページ誘導') {
      if (d.cpc.value !== null) findings.push({ text: '目的がサイト・予約ページ誘導のため、主な評価指標はクリック単価（' + d.cpc.display + '）とクリック率（' + d.ctr.display + '）です。', basis: d.cpc.formula });
      ideas.push('クリック後のページで予約・問い合わせまで進んでいるかは広告管理画面では分からないため、店舗側の予約数・問い合わせ数と合わせて確認する。');
    } else if (objective === '来店・予約獲得') {
      if (d.cpr.value !== null) findings.push({ text: '目的が来店・予約獲得のため、主な評価指標は成果単価（' + d.cpr.display + '）です。', basis: d.cpr.formula });
      else findings.push({ text: '目的が来店・予約獲得ですが、成果数（予約数・来店数など）が未入力のため成果単価を算出できていません。', basis: d.cpr.reason });
      ideas.push('広告経由の予約・来店数を店舗側で記録してもらい、次回の成果数として入力する。');
    }

    if (report.hasPrevious && cmp.length === 0) {
      findings.push({ text: '前回値が入力されていますが、今回と共通して入力された項目がないため比較していません。', basis: '' });
    }
    if (!report.hasPrevious) {
      ideas.push('今回の数値を次回比較の基準として保存しておく。');
    }

    return { findings, ideas, derived, compare: cmp };
  }

  // 要確認事項：入力不足・読み取り要確認・算出不可など
  function collectChecks(report, store) {
    const checks = [];
    const metrics = report.metrics || {};
    if (!store) checks.push('店舗・案件が選択されていません。');
    if (!report.periodStart || !report.periodEnd) checks.push('広告配信期間（開始日・終了日）が未入力です。');
    if (report.periodStart && report.periodEnd && report.periodStart > report.periodEnd) checks.push('配信期間の開始日が終了日より後になっています。');
    if (!report.objective) checks.push('配信目的が未入力です。');
    if (valueOf(metrics, 'spend') === null) checks.push('広告費が未入力です。');
    BASE_METRICS.forEach((m) => {
      const v = metrics[m.key];
      if (v && v.needsCheck) checks.push(labelOf(m.key, report) + '（' + (F.isNum(v.value) ? fmtBase(m.key, v.value) : '未入力') + '）は要確認です' + (v.note ? '：' + v.note : '') + (v.source ? '［出典：' + v.source + '］' : ''));
    });
    if (valueOf(metrics, 'results') !== null && !report.resultLabel) checks.push('成果数が何の件数か（予約数・来店数など）が未入力です。');
    if (report.hasPrevious) {
      const prev = report.previous || {};
      if (!report.previousLabel) checks.push('前回値の出典（いつの報告か）が未入力です。');
      BASE_METRICS.forEach((m) => {
        const v = prev[m.key];
        if (v && v.needsCheck) checks.push('前回の' + labelOf(m.key, report) + 'は要確認です' + (v.note ? '：' + v.note : ''));
      });
    }
    (report.customMetrics || []).forEach((cm) => {
      if (cm.needsCheck) checks.push('追加項目「' + cm.label + '」は要確認です。');
    });
    return checks;
  }

  const api = { BASE_METRICS, DERIVED_METRICS, OBJECTIVES, labelOf, valueOf, fmtBase, fmtByUnit, computeDerived, compare, buildFindings, collectChecks };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.calc = api; }
})(typeof self !== 'undefined' ? self : this);
