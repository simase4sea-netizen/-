/* 請求管理：税計算・端数処理・契約からの請求明細・二重請求/請求漏れ/前払い重複のチェック・発番・入金状態・集計・CSV（ブラウザ／Node 共用）
 * 方針：金額・税区分・端数処理・日割り・支払条件は推測で補わない。未設定は「未設定」としてエラーにし、確定（承認・発行）できないようにする。 */
(function (root) {
  'use strict';

  const ROUNDING = { floor: '切り捨て', round: '四捨五入', ceil: '切り上げ' };
  const PRICE_MODE = { excluded: '税抜', included: '税込' };
  const LINE_KINDS = { regular: '定期', one_time: '単発', extra: '追加料金', discount: '値引き', initial: '初期費用', proration: '日割り' };
  const INVOICE_STATUS = { draft: '下書き', review: '確認待ち', approved: '承認済み', issued: '発行済み', cancelled: '取消' };
  const PAY_STATE = { unpaid: '未入金', partial: '一部入金', paid: '入金済み', over: '過入金' };

  // 初期設定。税率・端数処理・登録番号などは「未設定／未確認」から始め、管理者が確認して設定する。
  function defaultSettings() {
    return {
      issuer: { name: '', address: '', tel: '', email: '', registrationNumber: '', registrationStatus: 'unknown', registrationCheckedAt: '', registrationCheckedBy: '' },
      invoiceMode: 'undecided', // undecided：適格請求書として発行するか未確認 / qualified：適格請求書 / normal：通常の請求書
      rounding: null, // 消費税の端数処理
      prorationRounding: null, // 日割り計算の端数処理
      taxCategories: [
        { key: 'std10', label: '課税（標準税率）', rate: 10, taxable: true, verified: false },
        { key: 'red8', label: '課税（軽減税率）', rate: 8, taxable: true, reduced: true, verified: false },
        { key: 'exempt', label: '非課税', rate: 0, taxable: false, verified: false },
        { key: 'outside', label: '不課税（対象外）', rate: 0, taxable: false, verified: false },
      ],
      numberFormat: 'INV-{YYYY}{MM}-{SEQ3}',
      bankAccounts: [],
      defaultBankId: '',
      remindTemplate: '',
    };
  }

  // ───── 日付・月 ─────
  function pad(n) { return String(n).padStart(2, '0'); }
  function ymOf(d) { return d ? String(d).slice(0, 7) : ''; }
  function ymLabel(ym) { if (!ym) return ''; const [y, m] = ym.split('-'); return Number(y) + '年' + Number(m) + '月'; }
  function addMonths(ym, n) { const [y, m] = ym.split('-').map(Number); const d = new Date(y, m - 1 + n, 1); return d.getFullYear() + '-' + pad(d.getMonth() + 1); }
  function monthDays(ym) { const [y, m] = ym.split('-').map(Number); return new Date(y, m, 0).getDate(); }
  function monthsBetween(from, to) { const out = []; if (!from || !to || from > to) return out; let c = from; while (c <= to) { out.push(c); c = addMonths(c, 1); } return out; }
  function isoDate(d) { return d.getFullYear() + '-' + pad(d.getMonth() + 1) + '-' + pad(d.getDate()); }
  function daysBetween(a, b) { return Math.round((new Date(b + 'T00:00:00') - new Date(a + 'T00:00:00')) / 86400000); }
  function endOfMonth(ym) { return ym + '-' + pad(monthDays(ym)); }

  function roundBy(n, method) {
    if (method === 'floor') return n >= 0 ? Math.floor(n + 1e-9) : -Math.floor(-n + 1e-9);
    if (method === 'ceil') return n >= 0 ? Math.ceil(n - 1e-9) : -Math.ceil(-n - 1e-9);
    if (method === 'round') return n >= 0 ? Math.round(n + 1e-9) : -Math.round(-n + 1e-9);
    return null;
  }

  function yen(n) { return n === null || n === undefined || !isFinite(n) ? '—' : (n < 0 ? '−' : '') + Math.abs(Math.round(n)).toLocaleString('ja-JP') + '円'; }

  // ───── 支払期限 ─────
  // terms: { type: 'unset'|'next_month_end'|'month_end_after'|'days_after'|'manual', months, days }
  function dueDateFor(issueDate, terms) {
    if (!issueDate || !terms || !terms.type || terms.type === 'unset' || terms.type === 'manual') return null;
    const ym = ymOf(issueDate);
    if (terms.type === 'next_month_end') return endOfMonth(addMonths(ym, 1));
    if (terms.type === 'month_end_after') { const n = Number(terms.months); if (!(n >= 0)) return null; return endOfMonth(addMonths(ym, n)); }
    if (terms.type === 'days_after') { const n = Number(terms.days); if (!(n >= 0)) return null; const d = new Date(issueDate + 'T00:00:00'); d.setDate(d.getDate() + n); return isoDate(d); }
    return null;
  }
  function termsLabel(t) {
    if (!t || !t.type || t.type === 'unset') return '未設定';
    if (t.type === 'next_month_end') return '発行日の翌月末';
    if (t.type === 'month_end_after') return '発行日の' + t.months + 'か月後の月末';
    if (t.type === 'days_after') return '発行日から' + t.days + '日後';
    if (t.type === 'manual') return '請求書ごとに手入力' + (t.text ? '（' + t.text + '）' : '');
    return '未設定';
  }

  // ───── 契約 ─────
  // 料金変更の履歴（effectiveMonth 以降に適用）。過去の請求書には影響しない（請求書は作成時に明細を複製する）。
  function amountForMonth(contract, ym) {
    const hist = (contract.priceHistory || []).filter((h) => h.effectiveMonth && h.effectiveMonth <= ym).sort((a, b) => (a.effectiveMonth < b.effectiveMonth ? -1 : 1));
    if (hist.length) return hist[hist.length - 1].amount;
    return contract.amount === '' || contract.amount === undefined ? null : contract.amount;
  }

  function inBillingPeriod(contract, ym) {
    if (!contract.billingStartMonth) return null; // 未設定
    if (ym < contract.billingStartMonth) return false;
    if (contract.billingEndMonth && ym > contract.billingEndMonth) return false;
    return true;
  }

  function prepaidCovering(contract, ym) {
    return (contract.prepaid || []).find((p) => p.from && p.to && ym >= p.from && ym <= p.to) || null;
  }

  function suspendedIn(contract, ym) {
    if (contract.status === 'ended') return true;
    return (contract.suspensions || []).some((s) => s.from && ym >= s.from && (!s.to || ym <= s.to));
  }

  // 契約の対象月の請求明細を作る。未設定の項目は issues に入れ、推測で補わない。
  function contractLinesForMonth(contract, ym, settings) {
    const lines = [];
    const issues = [];
    const lid = () => 'l' + Math.random().toString(36).slice(2, 9);
    const tax = contract.taxCategory || null;
    if (!tax) issues.push('契約「' + contract.name + '」の税区分が未設定です');
    if (!contract.priceTaxMode) issues.push('契約「' + contract.name + '」の料金が税抜か税込か未設定です');
    if (contract.billingType === 'one_time') {
      if (contract.billingStartMonth === ym) {
        const amt = contract.amount === '' || contract.amount === undefined ? null : contract.amount;
        if (amt === null) issues.push('契約「' + contract.name + '」の料金が未設定です');
        lines.push({ id: lid(), contractId: contract.id, targetMonth: ym, kind: 'one_time', description: contract.service || contract.name, qty: 1, unitPrice: amt, taxCategory: tax });
      }
    } else {
      const amt = amountForMonth(contract, ym);
      if (amt === null) issues.push('契約「' + contract.name + '」の月額料金が未設定です');
      let unit = amt;
      let note = '';
      // 日割り：契約開始日・終了日が対象月の途中の場合のみ
      const days = monthDays(ym);
      const mStart = ym + '-01', mEnd = endOfMonth(ym);
      const s = contract.startDate && contract.startDate > mStart && contract.startDate <= mEnd ? contract.startDate : null;
      const e = contract.endDate && contract.endDate < mEnd && contract.endDate >= mStart ? contract.endDate : null;
      if (s || e) {
        const from = s || mStart, to = e || mEnd;
        const used = daysBetween(from, to) + 1;
        const p = contract.proration || {};
        if (p.enabled === null || p.enabled === undefined) issues.push('契約「' + contract.name + '」は' + ymLabel(ym) + 'の途中で開始・終了しますが、日割りの有無が未設定です');
        else if (p.enabled === true) {
          if (p.method !== 'daily') issues.push('契約「' + contract.name + '」の日割り計算方法が未設定です');
          else if (!settings.prorationRounding) issues.push('日割り計算の端数処理が設定されていません（設定画面）');
          else if (amt !== null) {
            unit = roundBy((amt * used) / days, settings.prorationRounding);
            note = '（日割り ' + used + '/' + days + '日：' + yen(amt) + '×' + used + '÷' + days + '、' + ROUNDING[settings.prorationRounding] + '）';
          }
        }
      }
      lines.push({ id: lid(), contractId: contract.id, targetMonth: ym, kind: note ? 'proration' : 'regular', description: (contract.service || contract.name) + ' ' + ymLabel(ym) + '分' + note, qty: 1, unitPrice: unit, taxCategory: tax });
    }
    (contract.adjustments || []).forEach((a) => {
      if (!a.fromMonth || ym < a.fromMonth || (a.toMonth && ym > a.toMonth)) return;
      if (a.amount === null || a.amount === '' || a.amount === undefined) { issues.push('契約「' + contract.name + '」の「' + a.label + '」の金額が未設定です'); return; }
      lines.push({ id: lid(), contractId: contract.id, targetMonth: ym, kind: a.amount < 0 ? 'discount' : 'extra', description: a.label, qty: 1, unitPrice: a.amount, taxCategory: a.taxCategory || tax });
    });
    if (contract.initialFee && contract.initialFee.month === ym) {
      const amt = contract.initialFee.amount;
      if (amt === null || amt === '' || amt === undefined) issues.push('契約「' + contract.name + '」の初期費用の金額が未設定です');
      lines.push({ id: lid(), contractId: contract.id, targetMonth: ym, kind: 'initial', description: contract.initialFee.label || '初期費用', qty: 1, unitPrice: amt === '' ? null : amt, taxCategory: tax });
    }
    return { lines, issues };
  }

  // ───── 金額計算 ─────
  function lineAmount(l) {
    if (l.unitPrice === null || l.unitPrice === undefined || l.unitPrice === '' || !isFinite(l.unitPrice)) return null;
    const q = Number(l.qty);
    if (!isFinite(q)) return null;
    return q * Number(l.unitPrice);
  }

  // 税率ごとに区分して合計し、消費税額の端数処理は「1枚の請求書につき税率ごとに1回」行う。
  function calcTotals(lines, priceMode, settings) {
    const errors = [];
    const cats = Object.fromEntries((settings.taxCategories || []).map((c) => [c.key, c]));
    const groups = {};
    lines.forEach((l, i) => {
      const a = lineAmount(l);
      const n = i + 1;
      if (a === null) { errors.push(n + '行目：単価または数量が未入力です'); return; }
      if (Math.abs(a - Math.round(a)) > 1e-9) errors.push(n + '行目：金額に1円未満の端数があります（単価・数量を確認）');
      if (!l.taxCategory || !cats[l.taxCategory]) { errors.push(n + '行目：税区分が未設定です'); return; }
      const g = groups[l.taxCategory] || (groups[l.taxCategory] = { key: l.taxCategory, label: cats[l.taxCategory].label, rate: cats[l.taxCategory].rate, taxable: cats[l.taxCategory].taxable, amount: 0 });
      g.amount += Math.round(a);
    });
    const needsTax = Object.values(groups).some((g) => g.taxable && g.rate > 0);
    if (needsTax && !priceMode) errors.push('料金が税抜か税込か未設定です');
    if (needsTax && !settings.rounding) errors.push('消費税の端数処理が設定されていません（設定画面）');
    const out = Object.values(groups).sort((a, b) => b.rate - a.rate).map((g) => {
      let base = null, tax = null, total = null;
      if (!g.taxable || g.rate === 0) { base = g.amount; tax = 0; total = g.amount; }
      else if (priceMode && settings.rounding) {
        if (priceMode === 'excluded') { base = g.amount; tax = roundBy((g.amount * g.rate) / 100, settings.rounding); total = base + tax; }
        else { total = g.amount; tax = roundBy((g.amount * g.rate) / (100 + g.rate), settings.rounding); base = total - tax; }
      }
      return Object.assign({}, g, { base, tax, total });
    });
    const ok = !errors.length && out.every((g) => g.total !== null);
    return {
      groups: out,
      subtotal: ok ? out.reduce((s, g) => s + g.base, 0) : null,
      tax: ok ? out.reduce((s, g) => s + g.tax, 0) : null,
      total: ok ? out.reduce((s, g) => s + g.total, 0) : null,
      errors,
    };
  }

  // ───── チェック（未設定・二重請求・請求漏れ・期間外・前払い重複）─────
  // errors：承認・発行できない。warnings：理由を記録して確認するまで承認・一括確定できない。
  function checkInvoice(inv, ctx) {
    const { clients, contracts, invoices, settings } = ctx;
    const errors = [];
    const warnings = [];
    const client = clients.find((c) => c.id === inv.clientId);
    if (!client) errors.push({ code: 'NO_CLIENT', msg: '請求先が選択されていません' });
    if (!inv.billTo || !inv.billTo.name) errors.push({ code: 'NO_BILLTO', msg: '請求書の宛名が未設定です' });
    if (!inv.issueDate) errors.push({ code: 'NO_ISSUE', msg: '発行日が未設定です' });
    if (!inv.dueDate) errors.push({ code: 'NO_DUE', msg: '支払期限が未設定です（請求先の支払条件が未設定の場合は手入力）' });
    if (inv.issueDate && inv.dueDate && inv.dueDate < inv.issueDate) errors.push({ code: 'DUE_BEFORE', msg: '支払期限が発行日より前です' });
    if (!(inv.lines || []).length) errors.push({ code: 'NO_LINES', msg: '請求項目がありません' });
    const s = settings;
    if (!s.issuer || !s.issuer.name) errors.push({ code: 'NO_ISSUER', msg: '発行者（自社）の名称が未設定です（設定画面）' });
    if (!inv.bank || !inv.bank.bankName) errors.push({ code: 'NO_BANK', msg: '振込先が未設定です' });
    if (s.invoiceMode === 'undecided') errors.push({ code: 'MODE_UNDECIDED', msg: '適格請求書として発行するかが未確認です（設定画面・要確認）' });
    if (s.invoiceMode === 'qualified') {
      if (s.issuer.registrationStatus !== 'registered' || !/^T\d{13}$/.test(s.issuer.registrationNumber || '')) errors.push({ code: 'NO_REGNO', msg: '適格請求書として発行する設定ですが、登録番号（T＋13桁）が確認済みになっていません' });
    }
    const usedCats = new Set((inv.lines || []).map((l) => l.taxCategory).filter(Boolean));
    (s.taxCategories || []).forEach((c) => { if (usedCats.has(c.key) && !c.verified) errors.push({ code: 'TAX_UNVERIFIED', msg: '税区分「' + c.label + '（' + c.rate + '%）」の設定が未確認です（設定画面）' }); });
    const totals = calcTotals(inv.lines || [], inv.priceMode, s);
    totals.errors.forEach((m) => errors.push({ code: 'CALC', msg: m }));
    if (totals.total !== null && totals.total <= 0) warnings.push({ code: 'NON_POSITIVE', msg: '合計金額が0円以下です' });

    // 契約に紐づく明細のチェック
    const byKey = {};
    (inv.lines || []).forEach((l) => {
      if (!l.contractId) return;
      const c = contracts.find((x) => x.id === l.contractId);
      if (!c) { errors.push({ code: 'NO_CONTRACT', msg: '明細「' + l.description + '」の契約が見つかりません' }); return; }
      const ym = l.targetMonth;
      if (!ym) return;
      if (l.kind === 'regular' || l.kind === 'proration' || l.kind === 'one_time') byKey[c.id + '|' + ym] = { c, ym, l };
      const per = inBillingPeriod(c, ym);
      if (per === null) errors.push({ code: 'NO_START', msg: '契約「' + c.name + '」の請求開始月が未設定です' });
      else if (per === false) warnings.push({ code: 'OUT_OF_PERIOD', msg: '契約「' + c.name + '」の請求期間（' + ymLabel(c.billingStartMonth) + '〜' + (c.billingEndMonth ? ymLabel(c.billingEndMonth) : '') + '）外の' + ymLabel(ym) + 'を請求しています' });
      if (c.startDate && endOfMonth(ym) < c.startDate) warnings.push({ code: 'BEFORE_START', msg: '契約「' + c.name + '」の契約開始日（' + c.startDate + '）より前の月を請求しています' });
      if (c.endDate && ym + '-01' > c.endDate) warnings.push({ code: 'AFTER_END', msg: '契約「' + c.name + '」の契約終了日（' + c.endDate + '）より後の月を請求しています' });
      if (suspendedIn(c, ym)) warnings.push({ code: 'SUSPENDED', msg: '契約「' + c.name + '」は' + ymLabel(ym) + 'に請求停止中・終了です' });
      const pp = prepaidCovering(c, ym);
      if (pp && pp.invoiceId !== inv.id && l.kind !== 'initial' && l.kind !== 'extra') warnings.push({ code: 'PREPAID', msg: '契約「' + c.name + '」の' + ymLabel(ym) + 'は前払い済み期間（' + ymLabel(pp.from) + '〜' + ymLabel(pp.to) + '）に含まれます' });
    });
    if (client && client.status !== 'active') warnings.push({ code: 'CLIENT_INACTIVE', msg: '請求先「' + client.companyName + '」は' + (client.status === 'paused' ? '取引停止中' : '取引終了') + 'です' });
    // 二重請求：同じ請求先・契約・対象月の、取消以外の請求書
    Object.values(byKey).forEach(({ c, ym }) => {
      const dup = invoices.filter((o) => o.id !== inv.id && o.status !== 'cancelled' && o.id !== inv.replacesId && (o.lines || []).some((l) => l.contractId === c.id && l.targetMonth === ym && (l.kind === 'regular' || l.kind === 'proration' || l.kind === 'one_time')));
      dup.forEach((o) => warnings.push({ code: 'DUPLICATE', msg: '契約「' + c.name + '」の' + ymLabel(ym) + '分は、既に請求書（' + (o.number || '番号未発行の' + INVOICE_STATUS[o.status]) + '）があります（二重請求の可能性）' }));
    });
    // 同じ請求書内での重複
    const seen = {};
    (inv.lines || []).forEach((l) => {
      if (!l.contractId || !l.targetMonth || !(l.kind === 'regular' || l.kind === 'proration')) return;
      const k = l.contractId + '|' + l.targetMonth;
      if (seen[k]) warnings.push({ code: 'DUPLICATE_LINE', msg: '同じ契約・同じ月の明細が2行以上あります（' + l.description + '）' });
      seen[k] = true;
    });
    return { errors, warnings: uniqueBy(warnings, (w) => w.code + w.msg), totals };
  }

  function uniqueBy(arr, keyFn) { const s = new Set(); return arr.filter((x) => { const k = keyFn(x); if (s.has(k)) return false; s.add(k); return true; }); }

  // 警告がすべて理由付きで確認済みか
  function unacknowledged(inv, warnings) {
    const acks = inv.acks || [];
    return warnings.filter((w) => !acks.some((a) => a.code === w.code && a.msg === w.msg && a.reason));
  }

  // 請求漏れ：対象月に請求すべき契約で、取消以外の請求書が無いもの
  function omissions(ym, ctx) {
    const { clients, contracts, invoices } = ctx;
    const out = [];
    contracts.forEach((c) => {
      const client = clients.find((x) => x.id === c.clientId);
      if (!client || client.status !== 'active') return;
      if (c.status === 'ended' || suspendedIn(c, ym)) return;
      if (c.billingType === 'one_time' ? c.billingStartMonth !== ym : inBillingPeriod(c, ym) !== true) return;
      if (c.billingType !== 'one_time' && prepaidCovering(c, ym)) return;
      const has = invoices.some((o) => o.status !== 'cancelled' && (o.lines || []).some((l) => l.contractId === c.id && l.targetMonth === ym && (l.kind === 'regular' || l.kind === 'proration' || l.kind === 'one_time')));
      if (!has) out.push({ contract: c, client, ym });
    });
    return out;
  }

  // ───── 発番 ─────
  // 形式例 'INV-{YYYY}{MM}-{SEQ3}'。既存の番号（取消を含む）と重ならない最小の連番を使う。番号は再利用しない。
  function nextNumber(format, issueDate, existingNumbers) {
    const fmt = format || 'INV-{YYYY}{MM}-{SEQ3}';
    const y = issueDate.slice(0, 4), m = issueDate.slice(5, 7);
    const make = (n) => fmt.replace('{YYYY}', y).replace('{MM}', m).replace(/\{SEQ(\d)?\}/, (a, w) => String(n).padStart(Number(w || 1), '0'));
    const set = new Set(existingNumbers);
    if (!/\{SEQ\d?\}/.test(fmt)) {
      if (set.has(make(1))) throw new Error('番号の形式に {SEQ} が無いため、重複しない番号を作れません');
      return make(1);
    }
    let n = 1;
    while (set.has(make(n))) n++;
    return make(n);
  }

  // ───── 入金 ─────
  function paymentState(inv, payments, today) {
    const total = inv.totalsSnapshot ? inv.totalsSnapshot.total : null;
    const paid = payments.filter((p) => p.invoiceId === inv.id && !p.voided).reduce((s, p) => s + Number(p.amount || 0), 0);
    const remaining = total === null ? null : total - paid;
    let state = 'unpaid';
    if (total !== null) {
      if (paid <= 0) state = 'unpaid';
      else if (paid < total) state = 'partial';
      else if (paid === total) state = 'paid';
      else state = 'over';
    }
    const overdue = inv.status === 'issued' && (state === 'unpaid' || state === 'partial') && inv.dueDate && today > inv.dueDate;
    return { total, paid, remaining, state, overdue, daysOverdue: overdue ? daysBetween(inv.dueDate, today) : 0 };
  }

  // 一覧表示用の状態（下書き・確認待ち・承認済み・発行済み・一部入金・入金済み・期限超過・取消）
  function displayStatus(inv, ps) {
    if (inv.status === 'cancelled') return { key: 'cancelled', label: '取消' };
    if (inv.status !== 'issued') return { key: inv.status, label: INVOICE_STATUS[inv.status] };
    if (ps.overdue) return { key: 'overdue', label: '期限超過' + (ps.state === 'partial' ? '（一部入金）' : '') };
    if (ps.state === 'paid') return { key: 'paid', label: '入金済み' };
    if (ps.state === 'over') return { key: 'over', label: '過入金' };
    if (ps.state === 'partial') return { key: 'partial', label: '一部入金' };
    return { key: 'issued', label: '発行済み（未入金）' };
  }

  // ───── 集計 ─────
  function forecastForMonth(ym, ctx) {
    // 契約から見込む請求額（税込）。未設定がある契約は金額に含めず件数で示す。
    let amount = 0;
    const counted = [];
    const unknown = [];
    ctx.contracts.forEach((c) => {
      const client = ctx.clients.find((x) => x.id === c.clientId);
      if (!client || client.status !== 'active' || c.status === 'ended' || suspendedIn(c, ym)) return;
      if (c.billingType === 'one_time' ? c.billingStartMonth !== ym : inBillingPeriod(c, ym) !== true) return;
      if (c.billingType !== 'one_time' && prepaidCovering(c, ym)) return;
      const { lines, issues } = contractLinesForMonth(c, ym, ctx.settings);
      const t = calcTotals(lines, c.priceTaxMode, ctx.settings);
      if (issues.length || t.total === null) unknown.push(c);
      else { amount += t.total; counted.push(c); }
    });
    return { amount, counted, unknown };
  }

  function summarize(fromYm, toYm, ctx, today) {
    const months = monthsBetween(fromYm, toYm);
    const inRange = (d) => d && ymOf(d) >= fromYm && ymOf(d) <= toYm;
    const issued = ctx.invoices.filter((i) => i.status === 'issued' && inRange(i.issueDate));
    const states = Object.fromEntries(ctx.invoices.map((i) => [i.id, paymentState(i, ctx.payments, today)]));
    const sum = (list, f) => list.reduce((s, x) => s + (f(x) || 0), 0);
    const paymentsIn = ctx.payments.filter((p) => !p.voided && inRange(p.date) && ctx.invoices.some((i) => i.id === p.invoiceId && i.status !== 'cancelled'));
    const byMonth = months.map((ym) => {
      const f = forecastForMonth(ym, ctx);
      const iss = ctx.invoices.filter((i) => i.status === 'issued' && ymOf(i.issueDate) === ym);
      return { ym, forecast: f.amount, forecastUnknown: f.unknown.length, issued: sum(iss, (i) => i.totalsSnapshot.total), paid: sum(ctx.payments.filter((p) => !p.voided && ymOf(p.date) === ym && ctx.invoices.some((i) => i.id === p.invoiceId && i.status !== 'cancelled')), (p) => Number(p.amount)) };
    });
    const group = (keyFn, labelFn) => {
      const m = {};
      issued.forEach((i) => {
        const k = keyFn(i) || '（未設定）';
        m[k] = m[k] || { key: k, label: labelFn(k), amount: 0, count: 0 };
        m[k].amount += i.totalsSnapshot.total;
        m[k].count += 1;
      });
      return Object.values(m).sort((a, b) => b.amount - a.amount);
    };
    const overdue = ctx.invoices.filter((i) => states[i.id].overdue).map((i) => ({ inv: i, ps: states[i.id] })).sort((a, b) => b.ps.daysOverdue - a.ps.daysOverdue);
    return {
      period: { from: fromYm, to: toYm },
      plannedThisPeriod: byMonth.reduce((s, m) => s + m.forecast, 0),
      plannedUnknown: byMonth.reduce((s, m) => s + m.forecastUnknown, 0),
      issuedAmount: sum(issued, (i) => i.totalsSnapshot.total),
      issuedCount: issued.length,
      paidAmount: sum(paymentsIn, (p) => Number(p.amount)),
      unpaidAmount: sum(issued, (i) => Math.max(0, states[i.id].remaining || 0)),
      overdue,
      byClient: group((i) => i.clientId, (k) => k),
      byStore: group((i) => i.storeId, (k) => k),
      byProject: group((i) => i.projectId, (k) => k),
      byMonth,
    };
  }

  // ───── CSV ─────
  function cell(v) { return '"' + String(v === null || v === undefined ? '' : v).replace(/"/g, '""') + '"'; }
  function toCsv(head, rows) { return '﻿' + [head.map(cell).join(',')].concat(rows.map((r) => r.map(cell).join(','))).join('\r\n'); }

  function parseYen(v) {
    if (v === null || v === undefined) return null;
    let s = String(v).trim().replace(/[０-９]/g, (c) => String.fromCharCode(c.charCodeAt(0) - 0xfee0)).replace(/[,，円¥￥\s]/g, '');
    if (s === '') return null;
    if (!/^-?\d+$/.test(s)) return null; // 1円未満を含む値は受け付けない
    return Number(s);
  }
  function parseDate(v) {
    const m = /^(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})日?$/.exec(String(v || '').trim());
    if (!m) return null;
    const d = m[1] + '-' + pad(m[2]) + '-' + pad(m[3]);
    const t = new Date(d + 'T00:00:00');
    return isNaN(t) || isoDate(t) !== d ? null : d;
  }

  // 入金CSV（請求書番号・入金日・入金額・入金方法・メモ）を検証する
  function validatePaymentRows(rows, invoices, payments, today) {
    const head = rows[0].map((h) => h.trim());
    const col = (names) => head.findIndex((h) => names.includes(h));
    const ci = { num: col(['請求書番号']), date: col(['入金日']), amount: col(['入金額']), method: col(['入金方法']), memo: col(['メモ', '入金確認メモ']) };
    if (ci.num < 0 || ci.date < 0 || ci.amount < 0) return { error: '「請求書番号」「入金日」「入金額」の列が必要です', items: [] };
    const pending = {};
    const items = rows.slice(1).map((r, i) => {
      const line = i + 2;
      const number = (r[ci.num] || '').trim();
      const date = parseDate(r[ci.date]);
      const amount = parseYen(r[ci.amount]);
      const inv = invoices.find((x) => x.number === number);
      const errs = [];
      const warns = [];
      if (!inv) errs.push('請求書番号が見つかりません');
      else if (inv.status !== 'issued') errs.push('発行済みではない請求書です（' + INVOICE_STATUS[inv.status] + '）');
      if (!date) errs.push('入金日を読み取れません');
      else if (date > today) warns.push('入金日が今日より後です');
      if (amount === null) errs.push('入金額を読み取れません（1円未満・記号は不可）');
      else if (amount <= 0) errs.push('入金額が0以下です');
      if (inv && amount !== null && !errs.length) {
        const ps = paymentState(inv, payments, today);
        const already = pending[inv.id] || 0;
        if (ps.remaining !== null && amount + already > ps.remaining) warns.push('残額（' + yen(ps.remaining - already) + '）を超えています（過入金）');
        if (payments.some((p) => p.invoiceId === inv.id && !p.voided && p.date === date && Number(p.amount) === amount)) warns.push('同じ日付・金額の入金が既に登録されています（二重登録の可能性）');
        pending[inv.id] = already + amount;
      }
      return { line, number, date, amount, method: ci.method >= 0 ? (r[ci.method] || '').trim() : '', memo: ci.memo >= 0 ? (r[ci.memo] || '').trim() : '', inv, errs, warns };
    });
    return { error: '', items };
  }

  // 催促文の案（送信はしない。担当者が承認後にコピーして送る）
  function reminderText(inv, ps, issuerName, today) {
    const L = [];
    L.push((inv.billTo.name || '【要確認：宛名】') + ' ' + (inv.billTo.honorific || ''));
    if (inv.billTo.contact) L.push(inv.billTo.contact + ' 様');
    L.push('');
    L.push('いつもお世話になっております。' + (issuerName || '【要確認：発行者名】') + 'でございます。');
    L.push('');
    L.push('下記のご請求につきまして、' + today.replace(/-/g, '/') + '時点で弊社にてご入金を確認できておりません。');
    L.push('');
    L.push('・請求書番号：' + inv.number);
    L.push('・発行日：' + inv.issueDate.replace(/-/g, '/'));
    L.push('・ご請求金額：' + yen(ps.total));
    if (ps.paid > 0) L.push('・ご入金済み額：' + yen(ps.paid));
    L.push('・未入金額：' + yen(ps.remaining));
    L.push('・お支払期限：' + inv.dueDate.replace(/-/g, '/'));
    L.push('');
    L.push('お手数をおかけいたしますが、ご確認のうえお手続きをお願いいたします。');
    L.push('本状と行き違いでお支払いいただいている場合は、ご容赦ください。');
    L.push('');
    L.push('今後ともよろしくお願いいたします。');
    return L.join('\n');
  }

  const api = {
    ROUNDING, PRICE_MODE, LINE_KINDS, INVOICE_STATUS, PAY_STATE, defaultSettings,
    ymOf, ymLabel, addMonths, monthDays, monthsBetween, isoDate, daysBetween, endOfMonth, roundBy, yen,
    dueDateFor, termsLabel, amountForMonth, inBillingPeriod, prepaidCovering, suspendedIn, contractLinesForMonth,
    lineAmount, calcTotals, checkInvoice, unacknowledged, omissions, nextNumber, paymentState, displayStatus,
    forecastForMonth, summarize, cell, toCsv, parseYen, parseDate, validatePaymentRows, reminderText,
  };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.bill = api; }
})(typeof self !== 'undefined' ? self : this);
