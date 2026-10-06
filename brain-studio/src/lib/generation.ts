// クライアントとサーバーで共有する生成リクエスト／レスポンスの型

import type { Brief, IdeaDraft, Project, SectionKey } from "./types";

export interface ChapterPlan {
  title: string;
  purpose: string;
  readerTask: string;
  materials: string;
}

export type GenerateRequest =
  | { task: "ideas"; brief: Brief; count: number; avoidTitles: string[] }
  | { task: "section"; project: Project; section: SectionKey }
  | { task: "chapter"; project: Project; chapterId: string }
  | { task: "review"; project: Project };

export type GenerateErrorCode = "NO_API_KEY" | "RATE_LIMIT" | "REFUSAL" | "API_ERROR" | "BAD_REQUEST" | "ABORTED";

export type GenerateResponse =
  | {
      ok: true;
      demo: boolean;
      model: string;
      text?: string;
      ideas?: IdeaDraft[];
      chapters?: ChapterPlan[];
      truncated?: boolean;
    }
  | { ok: false; code: GenerateErrorCode; message: string };

export class GenerateError extends Error {
  constructor(
    public code: GenerateErrorCode,
    message: string,
  ) {
    super(message);
  }
}

/** /api/generate を呼ぶ。中断は AbortSignal で行う。 */
export async function callGenerate(req: GenerateRequest, signal?: AbortSignal): Promise<Extract<GenerateResponse, { ok: true }>> {
  let res: Response;
  try {
    res = await fetch("/api/generate", {
      method: "POST",
      headers: { "Content-Type": "application/json" },
      body: JSON.stringify(req),
      signal,
    });
  } catch (e) {
    if ((e as Error).name === "AbortError") throw new GenerateError("ABORTED", "停止しました");
    throw new GenerateError("API_ERROR", "サーバーに接続できませんでした");
  }
  let data: GenerateResponse;
  try {
    data = (await res.json()) as GenerateResponse;
  } catch {
    throw new GenerateError("API_ERROR", `サーバーエラー（${res.status}）`);
  }
  if (!data.ok) throw new GenerateError(data.code, data.message);
  return data;
}
