// Claude API 連携のテスト。ローカルの疑似 API サーバーに向けて SDK を実際に動かし、
// リクエスト内容（事実シート・季節指示・構造化出力・APIキーの扱い）と応答の解析を確認する。
import { test, describe, before, after } from 'node:test';
import assert from 'node:assert/strict';
import http from 'node:http';
import { startTestServer, genBody } from './helpers.js';

function sse(res, text) {
  res.writeHead(200, { 'content-type': 'text/event-stream' });
  const ev = (type, data) => res.write(`event: ${type}\ndata: ${JSON.stringify({ type, ...data })}\n\n`);
  ev('message_start', { message: { id: 'msg_test', type: 'message', role: 'assistant', model: 'claude-opus-5-5', content: [], stop_reason: null, stop_sequence: null, usage: { input_tokens: 10, output_tokens: 0 } } });
  ev('content_block_start', { index: 0, content_block: { type: 'text', text: '' } });
  ev('content_block_delta', { index: 0, delta: { type: 'text_delta', text } });
  ev('content_block_stop', { index: 0 });
  ev('message_delta', { delta: { stop_reason: 'end_turn', stop_sequence: null }, usage: { output_tokens: 50 } });
  ev('message_stop', {});
  res.end();
}

describe('Claude API による生成', () => {
  let fake; let requests; let t; const saved = {};
  const reply = {
    sets: [{
      catchcopy: '新浦安で囲む、鉄鍋のパエリア',
      body_ja: '＼新浦安で囲む、鉄鍋のパエリア／\n\n秋の休日、テストモール新浦安 3階のバル・ソレイユ 新浦安店へ🍽️\n\nエビやムール貝をたっぷり使い、鉄鍋で炊き上げる魚介のパエリア（1,980円）を、ご家族やご友人とシェアしてお楽しみください。',
      body_en: 'Spend an autumn afternoon at Bal Soleil Shin-Urayasu. Share our seafood paella (1,980 yen) with family and friends. Reserve with the button below.',
      angle: '地域と利用体験',
      season_expressions: ['秋の休日'],
      used_facts: ['テストモール新浦安 3階', '魚介のパエリア 1,980円'],
      reviewer_notes: [],
    }],
  };

  before(async () => {
    requests = [];
    fake = http.createServer(async (req, res) => {
      let body = '';
      for await (const c of req) body += c;
      requests.push({ url: req.url, headers: req.headers, body: JSON.parse(body) });
      sse(res, JSON.stringify(reply));
    });
    await new Promise((r) => fake.listen(0, '127.0.0.1', r));
    for (const k of ['ANTHROPIC_API_KEY', 'ANTHROPIC_BASE_URL', 'ANTHROPIC_AUTH_TOKEN']) saved[k] = process.env[k];
    process.env.ANTHROPIC_API_KEY = 'test-key-not-real';
    process.env.ANTHROPIC_BASE_URL = `http://127.0.0.1:${fake.address().port}`;
    delete process.env.ANTHROPIC_AUTH_TOKEN;
    t = await startTestServer();
  });
  after(async () => {
    for (const [k, v] of Object.entries(saved)) { if (v === undefined) delete process.env[k]; else process.env[k] = v; }
    await t.close();
    await new Promise((r) => fake.close(r));
  });

  test('選択店舗の事実だけを送り、結果をセットとして保存する', async () => {
    const r = await t.call('POST', '/api/generate', { ...genBody([t.ids.s1.id], { mainItem: '魚介のパエリア', postDate: '2026-10-15', cta: 'BOOK' }), provider: 'anthropic' });
    assert.equal(r.status, 200, JSON.stringify(r.data));
    const p = r.data.results[0].posts[0];
    assert.equal(p.provider, 'anthropic');
    assert.equal(p.catchcopy, reply.sets[0].catchcopy);
    assert.equal(p.generated.model, 'claude-opus-5-5');
    assert.deepEqual(p.validation.checks.filter((c) => c.level === 'error'), []);

    assert.equal(requests.length, 1);
    const { body, headers } = requests[0];
    assert.equal(headers['x-api-key'], 'test-key-not-real');
    assert.equal(body.model, 'claude-opus-5-5');
    assert.equal(body.output_config.format.type, 'json_schema');
    assert.equal(body.fallbacks, 'default');
    const userText = body.messages[0].content.find((b) => b.type === 'text').text;
    assert.match(userText, /ST-00001/);
    assert.match(userText, /JR新浦安駅から徒歩5分/);
    assert.match(userText, /10月（秋）/);
    assert.ok(!userText.includes('海浜幕張'), '他店舗の情報を送らない');
    assert.ok(!userText.includes('テスト庵'), '他顧客の情報を送らない');
    assert.match(body.system, /<facts> に書かれた情報/);
    assert.match(body.system, /1500/);
  });

  test('季節表現を使わない設定と3案指定がプロンプトに反映される', async () => {
    requests.length = 0;
    await t.call('POST', '/api/generate', { ...genBody([t.ids.s1.id], { useSeason: false, setCount: 3 }), provider: 'anthropic' });
    const userText = requests[0].body.messages[0].content.at(-1).text;
    assert.match(userText, /季節表現を使わない/);
    assert.match(userText, /案数: 3/);
  });

  test('APIキーが未設定なら AI 生成は使えない', async () => {
    const key = process.env.ANTHROPIC_API_KEY;
    delete process.env.ANTHROPIC_API_KEY;
    try {
      const r = await t.call('POST', '/api/generate', { ...genBody([t.ids.s1.id]), provider: 'anthropic' });
      assert.equal(r.status, 400);
      assert.match(r.data.error, /ANTHROPIC_API_KEY/);
    } finally {
      process.env.ANTHROPIC_API_KEY = key;
    }
  });
});
