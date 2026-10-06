/* 任意機能：Claude（Anthropic API）による画像の数値読み取り・議事録整理。
 * 設定で有効にした場合のみ使う。結果はすべて「要確認」の下書きとして扱い、入力に無い情報は採用しない。 */
(function (root) {
  'use strict';
  const S = root.FS.store;
  const C = root.FS.calc;
  const M = root.FS.minutes;
  const FILES = root.FS.files;

  const MODEL = 'claude-opus-5-5';
  const SDK_URL = 'https://cdn.jsdelivr.net/npm/@anthropic-ai/sdk@0.131.0/+esm';
  let sdkPromise = null;

  async function client(apiKey) {
    const key = apiKey || (S.get().settings.ai || {}).apiKey;
    if (!key) throw new Error('APIキーが設定されていません');
    if (!sdkPromise) sdkPromise = import(SDK_URL);
    const mod = await sdkPromise;
    const Anthropic = mod.default || mod.Anthropic;
    // ブラウザから直接呼び出す（キーはこの端末のブラウザ内にのみ保存）
    return new Anthropic({ apiKey: key, dangerouslyAllowBrowser: true });
  }

  async function call(params, apiKey) {
    const c = await client(apiKey);
    const res = await c.beta.messages.create(Object.assign({
      model: MODEL,
      max_tokens: 16000,
      betas: ['server-side-fallback-2026-07-01'],
      fallbacks: 'default',
    }, params));
    if (res.stop_reason === 'refusal') throw new Error('AIが処理を断りました。手入力で進めてください。');
    if (res.stop_reason === 'max_tokens') throw new Error('出力が途中で切れました。入力を分けて試してください。');
    const text = res.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
    return text;
  }

  async function ping(apiKey) {
    const text = await call({ max_tokens: 64, output_config: { effort: 'low' }, messages: [{ role: 'user', content: '「接続OK」とだけ返してください。' }] }, apiKey);
    return text.trim();
  }

  // 画像から広告の数値を読み取る
  async function readAdMetricsFromImage(blob, ctx) {
    const dataUrl = await FILES.toDataUrl(blob);
    const m = /^data:(image\/[a-z+]+);base64,(.*)$/.exec(dataUrl);
    if (!m) throw new Error('画像を読み込めませんでした');
    const mediaType = /^image\/(png|jpeg|gif|webp)$/.test(m[1]) ? m[1] : 'image/png';
    const metricProps = {};
    C.BASE_METRICS.forEach((b) => {
      metricProps[b.key] = {
        type: 'object',
        additionalProperties: false,
        required: ['found', 'value', 'evidence', 'confident'],
        properties: {
          found: { type: 'boolean', description: '画像にこの項目の数値がはっきり写っていれば true' },
          value: { type: 'number', description: '写っている数値（カンマ・通貨記号を除く）。found=false なら 0' },
          evidence: { type: 'string', description: '画像上の表記をそのまま（例：「消化金額 ¥30,000」）。無ければ空文字' },
          confident: { type: 'boolean', description: '桁や数字の読み取りに自信があれば true' },
        },
      };
    });
    const schema = {
      type: 'object', additionalProperties: false, required: ['metrics', 'notes'],
      properties: {
        metrics: { type: 'object', additionalProperties: false, required: C.BASE_METRICS.map((b) => b.key), properties: metricProps },
        notes: { type: 'string', description: '期間・キャンペーン名など、画像から読み取れた補足。推測は書かない' },
      },
    };
    const guide = C.BASE_METRICS.map((b) => b.key + '：' + b.label).join('、');
    const text = await call({
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system: 'あなたは広告管理画面のスクリーンショットから数値を正確に転記する担当です。画像に写っている数値だけを転記し、写っていない値・読めない値を推測で埋めてはいけません。計算もしないでください。',
      messages: [{
        role: 'user',
        content: [
          { type: 'image', source: { type: 'base64', media_type: mediaType, data: m[2] } },
          { type: 'text', text: '対象店舗：' + (ctx.storeName || '未選択') + '\n次の項目の数値を画像から転記してください。' + guide + '\n「クリック数」はリンクのクリックを優先し、無ければクリック（すべて）。「成果数」は「結果」列。単価や率の列は転記しないでください。画像に別の店舗名が写っていれば notes に書いてください。' },
        ],
      }],
    });
    const parsed = JSON.parse(text);
    const out = { metrics: {}, notes: parsed.notes || '' };
    Object.keys(parsed.metrics || {}).forEach((k) => {
      const v = parsed.metrics[k];
      if (v && v.found && isFinite(v.value)) out.metrics[k] = { value: v.value, evidence: v.evidence, confident: v.confident };
    });
    return out;
  }

  // 議事録の整理。担当者・期限はメモ本文に根拠がある場合のみ採用する。
  async function extractMinutes(rawText, meta) {
    const numbered = rawText.split(/\r?\n/).map((l, i) => (i + 1) + ': ' + l).join('\n');
    const item = { type: 'object', additionalProperties: false, required: ['text', 'sourceLine'], properties: { text: { type: 'string' }, sourceLine: { type: 'integer', description: '根拠となるメモの行番号' } } };
    const schema = {
      type: 'object', additionalProperties: false, required: ['summary', 'decisions', 'undecided', 'shared', 'tasks'],
      properties: {
        summary: { type: 'string', description: '3〜5文の要約。メモに無いことは書かない' },
        decisions: { type: 'array', items: item },
        undecided: { type: 'array', items: item },
        shared: { type: 'array', items: item },
        tasks: {
          type: 'array',
          items: {
            type: 'object', additionalProperties: false,
            required: ['text', 'side', 'assignee', 'due', 'dueDate', 'materials', 'sourceLine'],
            properties: {
              text: { type: 'string', description: '何をするか（具体的な行動）' },
              side: { type: 'string', enum: ['fs', 'store', 'other'], description: 'fs=Four Seasons側、store=店舗側、other=その他・不明' },
              assignee: { type: 'string', description: 'メモに書かれた担当者名。書かれていなければ「未設定」' },
              due: { type: 'string', description: 'メモに書かれた期限の表記そのまま。無ければ「未設定」' },
              dueDate: { type: 'string', description: '期限が日付で明記されていれば YYYY-MM-DD。相対表現や記載なしは空文字' },
              materials: { type: 'string', description: '必要な素材・情報。メモに無ければ「未設定」' },
              sourceLine: { type: 'integer' },
            },
          },
        },
      },
    };
    const text = await call({
      output_config: { effort: 'medium', format: { type: 'json_schema', schema } },
      system: 'あなたは合同会社Four Seasonsの議事録整理担当です。会議メモを、決定事項・未決事項・共有事項・タスクに分けます。ルール：メモに無い担当者・期限・数値・事実を補わない。不明は「未設定」。同じ内容のタスクは1つにまとめる。Four Seasons側（嶋野など）と店舗側とその他を区別する。すべて日本語。',
      messages: [{ role: 'user', content: '会議名：' + (meta.title || '未入力') + '\n会議日：' + (meta.date || '未入力') + '\n参加者（名前(所属)）：' + (meta.participants || '未入力') + '\n\n--- メモ（行番号付き）---\n' + numbered }],
    });
    const p = JSON.parse(text);
    const participants = M.parseParticipants(meta.participants || '');
    const lines = rawText.split(/\r?\n/);
    const src = (n) => (n >= 1 && n <= lines.length ? lines[n - 1].trim() : '');
    const toItem = (x) => ({ id: S.uid('i'), text: x.text, sourceLine: x.sourceLine || null, sourceText: src(x.sourceLine) });
    const tasks = (p.tasks || []).map((t) => {
      // 根拠チェック：担当者名・期限表記がメモ本文に無ければ採用しない
      let assignee = t.assignee && t.assignee !== M.UNSET && rawText.includes(t.assignee.replace(/(さん|様)$/, '')) ? t.assignee.replace(/(さん|様)$/, '') : M.UNSET;
      const pp = participants.find((x) => x.name === assignee || x.name.startsWith(assignee));
      if (pp) assignee = pp.name;
      const dueOk = t.due && t.due !== M.UNSET && rawText.includes(t.due);
      const due = dueOk ? t.due : M.UNSET;
      let dueDate = dueOk && /^\d{4}-\d{2}-\d{2}$/.test(t.dueDate) ? t.dueDate : null;
      // 日付はルール側でも解析して一致するか確認する
      const ruleDue = dueOk ? M.extractDue(t.due, meta.date) : null;
      const dueNeedsCheck = !!(dueOk && (!dueDate || (ruleDue && ruleDue.date !== dueDate)));
      if (ruleDue && ruleDue.date && ruleDue.date !== dueDate) dueDate = ruleDue.date;
      return {
        id: S.uid('t'), text: t.text, side: ['fs', 'store', 'other'].includes(t.side) ? t.side : 'other',
        assignee, assigneeRule: assignee === M.UNSET ? null : pp ? 'ai' : 'unknownName',
        due, dueDate, dueNeedsCheck, dueNote: dueNeedsCheck ? 'AIが読み取った期限です。日付を確認してください' : '',
        materials: t.materials || M.UNSET, status: '未着手', sourceLines: t.sourceLine ? [t.sourceLine] : [], sourceText: src(t.sourceLine),
      };
    });
    const possibleDuplicates = [];
    for (let i = 0; i < tasks.length; i++) for (let j = i + 1; j < tasks.length; j++) {
      const s = M.similarity(M.normalize(tasks[i].text), M.normalize(tasks[j].text));
      if (s >= 0.6) possibleDuplicates.push({ a: tasks[i].id, b: tasks[j].id, score: s });
    }
    return {
      summary: (p.summary || '') + '\n（AIによる要約の下書きです。内容を確認してください）',
      decisions: (p.decisions || []).map(toItem),
      undecided: (p.undecided || []).map(toItem),
      shared: (p.shared || []).map(toItem),
      tasks,
      possibleDuplicates,
    };
  }

  // Google投稿：1店舗分の事実シート（ctx）だけを送り、キャッチコピー・日本語・英語のセットを構造化出力で受け取る。
  // 画像は送信時だけ使い、保存しない。呼び出し側で送信前の確認画面を必ず通す。
  async function generateGooglePosts(ctx, images) {
    const GP = root.FS.gpost;
    const blocks = [];
    (images || []).forEach((img) => {
      const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img.dataUrl || '');
      if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
    });
    const text = await call({
      thinking: { type: 'adaptive' },
      output_config: { effort: 'high', format: { type: 'json_schema', schema: GP.OUTPUT_SCHEMA } },
      system: GP.buildSystemPrompt(ctx),
      messages: [{ role: 'user', content: blocks.concat([{ type: 'text', text: GP.buildUserPrompt(ctx) }]) }],
    });
    return GP.normalizeSets(JSON.parse(text), ctx.setCount);
  }

  root.FS = root.FS || {};
  root.FS.ai = { ping, readAdMetricsFromImage, extractMinutes, generateGooglePosts, MODEL };
})(self);
