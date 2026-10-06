import "server-only";
import Anthropic from "@anthropic-ai/sdk";
import { GenerateError } from "../generation";

// APIキーはサーバー側の環境変数からのみ読む。ブラウザ・ログには出さない。
export function hasApiKey(): boolean {
  return Boolean(process.env.ANTHROPIC_API_KEY?.trim());
}

export function modelName(): string {
  return process.env.ANTHROPIC_MODEL?.trim() || "claude-opus-5-5";
}

type Effort = "low" | "medium" | "high";
function effort(): Effort {
  const e = process.env.ANTHROPIC_EFFORT?.trim();
  return e === "low" || e === "high" ? e : "medium";
}

let client: Anthropic | null = null;
function getClient(): Anthropic {
  if (!client) client = new Anthropic({ apiKey: process.env.ANTHROPIC_API_KEY, maxRetries: 2 });
  return client;
}

export interface RunOptions {
  system: string;
  user: string;
  schema?: Record<string, unknown>;
  maxTokens: number;
  signal?: AbortSignal;
}

export async function runClaude(opts: RunOptions): Promise<{ text: string; truncated: boolean }> {
  if (!hasApiKey()) throw new GenerateError("NO_API_KEY", "ANTHROPIC_API_KEY が設定されていません");
  try {
    // 長文になりうるためストリーミングで受け取り、最終メッセージだけ使う。
    // 安全分類器による拒否時は、サーバー側フォールバック（"default"）で別モデルが再試行する。
    const stream = getClient().beta.messages.stream(
      {
        model: modelName(),
        max_tokens: opts.maxTokens,
        system: opts.system,
        messages: [{ role: "user", content: opts.user }],
        thinking: { type: "adaptive" },
        output_config: {
          effort: effort(),
          ...(opts.schema ? { format: { type: "json_schema" as const, schema: opts.schema } } : {}),
        },
        betas: ["server-side-fallback-2026-07-01"],
        fallbacks: "default",
      },
      { signal: opts.signal },
    );
    const msg = await stream.finalMessage();
    if (msg.stop_reason === "refusal") {
      throw new GenerateError("REFUSAL", "この依頼は生成できませんでした。入力内容を見直してください。");
    }
    const text = msg.content
      .map((b) => (b.type === "text" ? b.text : ""))
      .join("")
      .trim();
    return { text, truncated: msg.stop_reason === "max_tokens" };
  } catch (e) {
    if (e instanceof GenerateError) throw e;
    if (e instanceof Anthropic.APIUserAbortError) throw new GenerateError("ABORTED", "停止しました");
    if (e instanceof Anthropic.AuthenticationError) {
      throw new GenerateError("NO_API_KEY", "APIキーが無効です。ANTHROPIC_API_KEY を確認してください");
    }
    if (e instanceof Anthropic.RateLimitError) {
      throw new GenerateError("RATE_LIMIT", "APIの利用上限に達しました。しばらく待ってから再試行してください");
    }
    if (e instanceof Anthropic.APIConnectionError) {
      throw new GenerateError("API_ERROR", "Anthropic APIに接続できませんでした");
    }
    if (e instanceof Anthropic.APIError) {
      // キーを含まないステータスと種別のみ記録する
      console.error(`Anthropic API error: status=${e.status} type=${(e.error as { error?: { type?: string } })?.error?.type ?? "unknown"}`);
      throw new GenerateError("API_ERROR", `APIエラー（${e.status ?? "不明"}）が発生しました。時間をおいて再試行してください`);
    }
    console.error("Unexpected generation error:", (e as Error).message);
    throw new GenerateError("API_ERROR", "生成中に予期しないエラーが発生しました");
  }
}
