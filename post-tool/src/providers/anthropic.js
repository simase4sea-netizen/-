// Claude API による生成。APIキーは環境変数 ANTHROPIC_API_KEY から SDK が読み込む（ソースに保存しない）。
import { buildSystemPrompt, buildUserPrompt, OUTPUT_SCHEMA } from '../prompt.js';

export const name = 'anthropic';

export function isConfigured() {
  return Boolean(process.env.ANTHROPIC_API_KEY || process.env.ANTHROPIC_AUTH_TOKEN);
}

function imageBlocks(images = []) {
  const blocks = [];
  for (const img of images) {
    const m = /^data:(image\/(?:jpeg|png|webp|gif));base64,(.+)$/.exec(img.dataUrl || '');
    if (m) blocks.push({ type: 'image', source: { type: 'base64', media_type: m[1], data: m[2] } });
  }
  return blocks;
}

export async function generate(ctx, { images = [] } = {}) {
  const { default: Anthropic } = await import('@anthropic-ai/sdk');
  const client = new Anthropic();
  const stream = client.beta.messages.stream({
    model: process.env.ANTHROPIC_MODEL || 'claude-opus-5-5',
    max_tokens: 32000,
    betas: ['server-side-fallback-2026-07-01'],
    fallbacks: 'default',
    thinking: { type: 'adaptive' },
    output_config: {
      effort: process.env.ANTHROPIC_EFFORT || 'high',
      format: { type: 'json_schema', schema: OUTPUT_SCHEMA },
    },
    system: buildSystemPrompt(ctx),
    messages: [{
      role: 'user',
      content: [...imageBlocks(images), { type: 'text', text: buildUserPrompt(ctx) }],
    }],
  });
  const message = await stream.finalMessage();
  if (message.stop_reason === 'refusal') {
    throw new Error('AIが生成を辞退しました。投稿入力の内容を見直してください。');
  }
  if (message.stop_reason === 'max_tokens') {
    throw new Error('生成結果が長すぎて途中で終了しました。もう一度お試しください。');
  }
  const text = message.content.filter((b) => b.type === 'text').map((b) => b.text).join('');
  const parsed = JSON.parse(text);
  return { sets: parsed.sets, model: message.model };
}
