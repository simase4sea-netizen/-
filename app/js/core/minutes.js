/* 議事録・メモから決定事項／未決事項／共有事項／タスクを抽出（ブラウザ／Node 共用）
 * ルールベースの下書き。担当者・期限はメモに書かれている場合のみ設定し、無ければ「未設定」。 */
(function (root) {
  'use strict';

  const SIDES = { fs: 'Four Seasons側', store: '店舗側', other: 'その他の担当者' };
  const UNSET = '未設定';

  const TAG_RULES = [
    { re: /^[【\[(（]?\s*(決定事項|決定|決まったこと)\s*[】\])）]?\s*[:：]?\s*/, cat: 'decision' },
    { re: /^[【\[(（]?\s*(未決事項|未決|保留|要確認|確認事項|検討事項)\s*[】\])）]?\s*[:：]?\s*/, cat: 'undecided' },
    { re: /^[【\[(（]?\s*(共有事項|共有|報告|連絡)\s*[】\])）]?\s*[:：]?\s*/, cat: 'shared' },
    { re: /^[【\[(（]?\s*(TODO|ToDo|todo|タスク|依頼事項|依頼|宿題)\s*[】\])）]?\s*[:：]?\s*/, cat: 'task' },
  ];
  const HEADING_RULES = [
    { re: /^[#■□◆◇●○【\[]*\s*(決定事項|決定|決まったこと)\s*[】\]]*\s*[:：]?\s*$/, cat: 'decision' },
    { re: /^[#■□◆◇●○【\[]*\s*(未決事項|未決|保留|確認事項|検討事項|要確認)\s*[】\]]*\s*[:：]?\s*$/, cat: 'undecided' },
    { re: /^[#■□◆◇●○【\[]*\s*(共有事項|共有|報告事項|連絡事項)\s*[】\]]*\s*[:：]?\s*$/, cat: 'shared' },
    { re: /^[#■□◆◇●○【\[]*\s*(TODO|ToDo|タスク|依頼事項|宿題|アクション)\s*[】\]]*\s*[:：]?\s*$/, cat: 'task' },
  ];

  const RE_UNDECIDED = /未定|検討(する|します|中|したい)?|保留|要確認|確認中|決まっていない|決まってない|未決|[?？]|かどうか|次回(決める|相談)|相談して/;
  const RE_DECISION = /決定|決まり|決めた|に決め|ことに(する|した|なった|なりました)|で確定|確定(した|しました)|で進める|で進めます|で合意|合意した|承認/;
  const RE_TASK = /お願いします|お願い|依頼|対応する|対応します|対応してもらう|やります|やる|作成する|作成します|作る|用意する|用意します|準備する|準備します|送る|送ります|送付|提出|手配|共有する|共有します|連絡する|連絡します|確認する|確認します|撮影する|撮影します|投稿する|入稿|までに|してもらう|してください|ください|TODO/;
  const RE_FS = /Four\s*Seasons|フォーシーズンズ|弊社|当社|FS側|こちら側|FSで|FSが/i;
  const RE_STORE = /店舗側|店舗で|店舗が|お店側|お店で|店長|オーナー/;

  // 参加者文字列 "嶋野成優(FS), 田中(店舗), 佐藤(デザイナー)" を解析
  function parseParticipants(text) {
    if (!text) return [];
    return String(text).split(/[,、，\n]/).map((s) => s.trim()).filter(Boolean).map((s) => {
      const m = /^(.+?)\s*[(（](.+?)[)）]\s*$/.exec(s);
      const name = (m ? m[1] : s).replace(/(さん|様|氏)$/, '').trim();
      const aff = m ? m[2].trim() : '';
      let side = 'other';
      if (/four\s*seasons|フォーシーズンズ|^fs$|弊社|自社/i.test(aff)) side = 'fs';
      else if (/店舗|店長|オーナー|お店|スタッフ/.test(aff)) side = 'store';
      return { name, affiliation: aff, side };
    });
  }

  // 呼び方の揺れに対応するため、フルネームと姓（先頭2文字）を照合キーにする
  function nameKeys(p) {
    const keys = [p.name];
    if (p.name.length >= 3 && /^[一-龯]/.test(p.name)) keys.push(p.name.slice(0, 2));
    const space = p.name.split(/\s+/);
    if (space.length > 1) keys.push(space[0]);
    return Array.from(new Set(keys));
  }

  function stripBullet(line) {
    return line.replace(/^\s*([-*・•●○◦▪■□◆◇→>]+|\d+[.)．）]|[①-⑳])\s*/, '').trim();
  }

  // 話者表記「嶋野：〜」「[田中] 〜」を分離
  function splitSpeaker(line, participants) {
    const m = /^[\[［【]?([^\s:：\]］】]{1,12})[\]］】]?\s*[:：]\s*(.+)$/.exec(line);
    if (!m) return { speaker: null, body: line };
    const cand = m[1].replace(/(さん|様)$/, '');
    if (TAG_RULES.some((t) => t.re.test(m[1] + '：'))) return { speaker: null, body: line };
    const p = participants.find((pp) => nameKeys(pp).includes(cand));
    return { speaker: p ? p.name : cand, body: m[2].trim() };
  }

  const DUE_PATTERNS = [
    /(\d{4})[\/\-年.](\d{1,2})[\/\-月.](\d{1,2})日?/,
    /(\d{1,2})[\/月](\d{1,2})日?/,
  ];
  const RELATIVE_DUE = /(今日中|本日中|明日|明後日|あさって|今週中|今週末|来週(中|末)?(の)?([月火水木金土日]曜(日)?)?|再来週|月内|今月中|今月末|来月(中|末|初旬|上旬|中旬|下旬)?|月末|週明け|次回(の)?(打ち合わせ|打合せ|会議|ミーティング|MTG)(まで)?|年内|オープン前|撮影前|撮影日)/;

  function pad(n) { return String(n).padStart(2, '0'); }

  function extractDue(text, meetingDate) {
    for (let i = 0; i < DUE_PATTERNS.length; i++) {
      const m = DUE_PATTERNS[i].exec(text);
      if (!m) continue;
      let y, mo, d;
      if (i === 0) { y = Number(m[1]); mo = Number(m[2]); d = Number(m[3]); }
      else {
        mo = Number(m[1]); d = Number(m[2]);
        if (mo < 1 || mo > 12 || d < 1 || d > 31) continue;
        if (!meetingDate) return { text: m[0], date: null, needsCheck: true, note: '年が不明（会議日が未入力）' };
        const md = new Date(meetingDate + 'T00:00:00');
        y = md.getFullYear();
        // 会議日より2か月以上前になる場合は翌年とみなし、要確認にする
        const cand = new Date(y + '-' + pad(mo) + '-' + pad(d) + 'T00:00:00');
        if ((md - cand) / 86400000 > 60) {
          return { text: m[0], date: (y + 1) + '-' + pad(mo) + '-' + pad(d), needsCheck: true, note: '会議日より前の日付のため翌年と判断' };
        }
      }
      return { text: m[0], date: y + '-' + pad(mo) + '-' + pad(d), needsCheck: false, note: '' };
    }
    const r = RELATIVE_DUE.exec(text);
    if (r) return { text: r[0], date: null, needsCheck: true, note: '相対的な期限のため日付を確定していません' };
    return { text: UNSET, date: null, needsCheck: false, note: '' };
  }

  const MATERIAL_WORDS = ['写真', '画像', '素材', '動画', 'メニュー表', 'メニュー', '価格表', '料金表', '資料', 'データ', 'ロゴ', '原稿', 'CSV', 'スクショ', 'スクリーンショット', '見積書', '請求書', '契約書', 'アカウント情報', '営業時間', 'キャンペーン内容', 'レポート'];

  function extractMaterials(text) {
    const found = MATERIAL_WORDS.filter((w) => text.includes(w));
    // 「メニュー表」があるときは「メニュー」を重ねない
    const filtered = found.filter((w) => !found.some((o) => o !== w && o.includes(w)));
    return filtered.length ? filtered.join('、') : UNSET;
  }

  function extractAssignee(body, speaker, participants) {
    const keyed = [];
    participants.forEach((p) => nameKeys(p).forEach((k) => keyed.push({ p, k })));
    // 優先度順：「〇〇が」→「〇〇に／へ（お願い・依頼）」→「〇〇で／担当」
    const rules = [
      (k) => new RegExp(escapeRe(k) + '(さん|様)?(が|は|側で)'),
      (k) => new RegExp(escapeRe(k) + '(さん|様)?(に|へ)[^。]*?(お願い|依頼|頼む|任せ)'),
      (k) => new RegExp(escapeRe(k) + '(さん|様)?(で|の担当|担当)'),
    ];
    for (const rule of rules) {
      const hit = keyed.find(({ k }) => rule(k).test(body));
      if (hit) return { name: hit.p.name, side: hit.p.side, byRule: 'name' };
    }
    // 参加者に無い「〇〇さんが」「〇〇さんにお願い」
    const m = /([一-龯ァ-ヶーA-Za-z]{1,8})(さん|様)(が|は)/.exec(body) || /([一-龯ァ-ヶーA-Za-z]{1,8})(さん|様)(に|へ)[^。]*?(お願い|依頼)/.exec(body);
    if (m) return { name: m[1], side: 'other', byRule: 'unknownName' };
    // 話者の一人称の宣言（「やります」「対応します」など）
    if (speaker && /(やります|対応します|作成します|用意します|準備します|送ります|確認します|撮影します|投稿します|手配します|進めます)/.test(body) && !/(お願いします|お願い)/.test(body)) {
      const p = participants.find((pp) => pp.name === speaker);
      return { name: speaker, side: p ? p.side : 'other', byRule: 'speaker' };
    }
    return null;
  }

  function sideFromKeywords(body) {
    if (RE_FS.test(body)) return 'fs';
    if (RE_STORE.test(body)) return 'store';
    return null;
  }

  function escapeRe(s) {
    return s.replace(/[.*+?^${}()|[\]\\]/g, '\\$&');
  }

  // 重複判定用の正規化
  function normalize(s) {
    return String(s)
      .replace(/[\s、。，．,.!！・「」『』（）()【】\[\]]/g, '')
      .replace(/(を)?(お願いします|お願い|します|する|しておく|しておきます|やります|やる)$/, '')
      .toLowerCase();
  }

  function bigrams(s) {
    const out = new Set();
    for (let i = 0; i < s.length - 1; i++) out.add(s.slice(i, i + 2));
    return out;
  }

  function similarity(a, b) {
    const A = bigrams(a), B = bigrams(b);
    if (!A.size || !B.size) return a === b ? 1 : 0;
    let inter = 0;
    A.forEach((x) => { if (B.has(x)) inter++; });
    return inter / (A.size + B.size - inter);
  }

  let seq = 0;
  function uid(prefix) {
    seq += 1;
    return prefix + Date.now().toString(36) + seq.toString(36);
  }

  // メイン：テキストを解析して下書きを返す
  function extract(rawText, meta) {
    meta = meta || {};
    const participants = parseParticipants(meta.participants || '');
    const lines = String(rawText || '').split(/\r?\n/);
    const result = { decisions: [], undecided: [], shared: [], tasks: [], possibleDuplicates: [], participantList: participants };
    let section = null;

    lines.forEach((rawLine, idx) => {
      const lineNo = idx + 1;
      let line = rawLine.trim();
      if (!line) return;
      // 見出し行（「■決定事項」など）は以降の行の分類として使う
      const heading = HEADING_RULES.find((h) => h.re.test(line));
      if (heading) { section = heading.cat; return; }
      if (/^[#■□◆◇]/.test(line) && line.length <= 20 && !/[。]/.test(line)) { section = null; return; }

      line = stripBullet(line);
      if (!line) return;
      const sp = splitSpeaker(line, participants);
      let body = sp.body;

      let cat = null;
      const tag = TAG_RULES.find((t) => t.re.test(body));
      if (tag) { cat = tag.cat; body = body.replace(tag.re, '').trim(); }
      if (!body) return;

      const isUndecided = RE_UNDECIDED.test(body);
      const isDecision = RE_DECISION.test(body);
      const isTask = RE_TASK.test(body);

      if (!cat) cat = section;
      if (!cat) {
        if (isUndecided && !isDecision) cat = 'undecided';
        else if (isDecision) cat = 'decision';
        else if (isTask) cat = 'task';
        else cat = 'shared';
      }

      const item = { id: uid('i'), text: body, speaker: sp.speaker, sourceLine: lineNo, sourceText: rawLine.trim() };
      if (cat === 'decision') {
        result.decisions.push(item);
        // 決定事項の中に、担当者付きの作業が含まれていればタスクにも登録
        if (isTask && extractAssignee(body, sp.speaker, participants)) result.tasks.push(makeTask(body, sp.speaker, participants, meta, lineNo, rawLine.trim()));
      } else if (cat === 'undecided') {
        result.undecided.push(item);
      } else if (cat === 'shared') {
        result.shared.push(item);
      } else if (cat === 'task') {
        result.tasks.push(makeTask(body, sp.speaker, participants, meta, lineNo, rawLine.trim()));
      }
    });

    dedupe(result);
    return result;
  }

  function makeTask(body, speaker, participants, meta, lineNo, sourceText) {
    const a = extractAssignee(body, speaker, participants);
    const kwSide = sideFromKeywords(body);
    const due = extractDue(body, meta.date);
    let side = a ? a.side : kwSide || 'other';
    if (a && a.side === 'other' && kwSide) side = kwSide;
    return {
      id: uid('t'),
      text: body,
      side,
      assignee: a ? a.name : UNSET,
      assigneeRule: a ? a.byRule : null,
      due: due.text,
      dueDate: due.date,
      dueNeedsCheck: due.needsCheck,
      dueNote: due.note,
      materials: extractMaterials(body),
      status: '未着手',
      sourceLines: [lineNo],
      sourceText,
    };
  }

  // 同じ内容のタスク・項目を重複登録しない。似ているものは「重複の可能性」として示す。
  function dedupe(result) {
    ['decisions', 'undecided', 'shared'].forEach((k) => {
      const seen = new Map();
      result[k] = result[k].filter((it) => {
        const n = normalize(it.text);
        if (seen.has(n)) return false;
        seen.set(n, it);
        return true;
      });
    });
    const kept = [];
    result.tasks.forEach((t) => {
      const n = normalize(t.text);
      const same = kept.find((k) => normalize(k.text) === n);
      if (same) {
        same.sourceLines = Array.from(new Set(same.sourceLines.concat(t.sourceLines)));
        if (same.assignee === UNSET && t.assignee !== UNSET) { same.assignee = t.assignee; same.side = t.side; }
        if (same.due === UNSET && t.due !== UNSET) { same.due = t.due; same.dueDate = t.dueDate; same.dueNeedsCheck = t.dueNeedsCheck; same.dueNote = t.dueNote; }
        return;
      }
      kept.push(t);
    });
    result.tasks = kept;
    result.possibleDuplicates = [];
    for (let i = 0; i < kept.length; i++) {
      for (let j = i + 1; j < kept.length; j++) {
        const s = similarity(normalize(kept[i].text), normalize(kept[j].text));
        if (s >= 0.6) result.possibleDuplicates.push({ a: kept[i].id, b: kept[j].id, score: Math.round(s * 100) / 100 });
      }
    }
  }

  // 確認事項（担当・期限未設定、相対期限など）を集める
  function collectChecks(minutes) {
    const checks = [];
    if (!minutes.title) checks.push('会議名が未入力です。');
    if (!minutes.date) checks.push('会議日が未入力です（期限の年を判断できません）。');
    if (!minutes.participants) checks.push('参加者が未入力です（担当者の判定ができません）。');
    (minutes.tasks || []).forEach((t) => {
      const head = '「' + truncate(t.text, 30) + '」';
      if (t.assignee === UNSET || !t.assignee) checks.push(head + 'の担当者が未設定です。');
      if (t.due === UNSET || !t.due) checks.push(head + 'の期限が未設定です。');
      else if (t.dueNeedsCheck) checks.push(head + 'の期限「' + t.due + '」は要確認です' + (t.dueNote ? '（' + t.dueNote + '）' : '') + '。');
      if (t.assigneeRule === 'unknownName') checks.push(head + 'の担当者「' + t.assignee + '」は参加者一覧にないため、所属（Four Seasons側／店舗側／その他）を確認してください。');
    });
    (minutes.possibleDuplicates || []).forEach((d) => {
      const a = (minutes.tasks || []).find((t) => t.id === d.a);
      const b = (minutes.tasks || []).find((t) => t.id === d.b);
      if (a && b) checks.push('タスク「' + truncate(a.text, 20) + '」と「' + truncate(b.text, 20) + '」は同じ内容の可能性があります。');
    });
    return checks;
  }

  function truncate(s, n) {
    s = String(s || '');
    return s.length > n ? s.slice(0, n) + '…' : s;
  }

  // 出力テキスト（6項目）
  function toText(m, storeName) {
    const L = [];
    const line = (s) => L.push(s);
    line('■ 議事録：' + (m.title || '（会議名未入力）'));
    line('日付：' + (m.date || UNSET) + '　参加者：' + (m.participants || UNSET) + (storeName ? '　対象：' + storeName : ''));
    line('');
    line('1. 議事録の要約');
    line(m.summary || '（要約未作成）');
    line('');
    line('2. 決定事項');
    (m.decisions || []).length ? m.decisions.forEach((d) => line('・' + d.text)) : line('・なし');
    if ((m.shared || []).length) {
      line('');
      line('（共有事項）');
      m.shared.forEach((d) => line('・' + d.text));
    }
    [['fs', '3. Four Seasons側のタスク'], ['store', '4. 店舗側のタスク'], ['other', '5. その他の担当者のタスク']].forEach(([side, title]) => {
      line('');
      line(title);
      const ts = (m.tasks || []).filter((t) => t.side === side);
      if (!ts.length) line('・なし');
      ts.forEach((t) => line('・' + t.text + '／担当：' + (t.assignee || UNSET) + '／期限：' + (t.dueDate ? t.dueDate + (t.due && t.due !== t.dueDate ? '（' + t.due + '）' : '') : t.due || UNSET) + '／必要な素材・情報：' + (t.materials || UNSET)));
    });
    line('');
    line('6. 未決事項・確認事項');
    const und = (m.undecided || []).map((d) => '・' + d.text);
    const chk = collectChecks(m).map((c) => '・' + c);
    if (!und.length && !chk.length) line('・なし');
    und.forEach(line);
    if (chk.length) { if (und.length) line('（確認事項）'); chk.forEach(line); }
    return L.join('\n');
  }

  // 要約の下書き：抽出結果の件数と主な決定事項から機械的に作る（創作しない）
  function draftSummary(m) {
    const parts = [];
    parts.push((m.title || '会議') + (m.date ? '（' + m.date + '）' : '') + 'では、決定事項' + (m.decisions || []).length + '件、タスク' + (m.tasks || []).length + '件、未決事項' + (m.undecided || []).length + '件が挙がりました。');
    if ((m.decisions || []).length) parts.push('主な決定事項：' + m.decisions.slice(0, 3).map((d) => d.text).join('／'));
    return parts.join('\n');
  }

  const api = { SIDES, UNSET, parseParticipants, extract, extractDue, extractMaterials, extractAssignee, normalize, similarity, collectChecks, toText, draftSummary };
  if (typeof module !== 'undefined' && module.exports) module.exports = api;
  else { root.FS = root.FS || {}; root.FS.minutes = api; }
})(typeof self !== 'undefined' ? self : this);
