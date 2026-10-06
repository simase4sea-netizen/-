import { NextResponse } from "next/server";
import { demoChapter, demoIdeas, demoReview, demoSection, demoToc } from "@/lib/demo";
import { newId } from "@/lib/defaults";
import { GenerateError, type ChapterPlan, type GenerateRequest, type GenerateResponse } from "@/lib/generation";
import { hasApiKey, modelName, runClaude } from "@/lib/server/anthropic";
import { chapterPrompt, IDEAS_SCHEMA, ideasPrompt, reviewPrompt, sectionPrompt, systemPrompt, TOC_SCHEMA } from "@/lib/server/prompts";
import { readStore } from "@/lib/server/store";
import type { IdeaDraft } from "@/lib/types";

export const runtime = "nodejs";
export const maxDuration = 600;

const MAX_PER_REQUEST = 10;

function fail(code: GenerateError["code"], message: string, status: number) {
  return NextResponse.json<GenerateResponse>({ ok: false, code, message }, { status });
}

function parseJson<T>(text: string): T {
  const start = text.indexOf("{");
  const end = text.lastIndexOf("}");
  return JSON.parse(start >= 0 ? text.slice(start, end + 1) : text) as T;
}

export async function POST(request: Request) {
  let req: GenerateRequest;
  try {
    req = (await request.json()) as GenerateRequest;
  } catch {
    return fail("BAD_REQUEST", "リクエストの形式が正しくありません", 400);
  }

  const store = await readStore();
  const demo = Boolean(store.settings.forceDemo) || !hasApiKey();
  const model = demo ? "demo" : modelName();
  const system = systemPrompt(store.settings);

  try {
    if (req.task === "ideas") {
      const count = Math.max(1, Math.min(MAX_PER_REQUEST, Math.floor(req.count || 1)));
      const avoid = (req.avoidTitles ?? []).slice(0, 200);
      if (demo) {
        await new Promise((r) => setTimeout(r, 400));
        return NextResponse.json<GenerateResponse>({ ok: true, demo, model, ideas: demoIdeas(req.brief, count, avoid) });
      }
      const cases = store.cases.filter((c) => req.brief.caseIds.includes(c.id));
      const { text, truncated } = await runClaude({
        system,
        user: ideasPrompt(req.brief, cases, count, avoid),
        schema: IDEAS_SCHEMA as unknown as Record<string, unknown>,
        maxTokens: 16000,
        signal: request.signal,
      });
      const parsed = parseJson<{ ideas: Omit<IdeaDraft, "tempId">[] }>(text);
      const ideas = (parsed.ideas ?? []).slice(0, count).map((i) => ({ ...i, tempId: newId("idea") }));
      return NextResponse.json<GenerateResponse>({ ok: true, demo, model, ideas, truncated });
    }

    const project = req.project;
    if (!project?.id) return fail("BAD_REQUEST", "企画が指定されていません", 400);
    const cases = store.cases.filter((c) => project.brief.caseIds.includes(c.id));
    const others = store.projects.filter((p) => p.id !== project.id);

    if (req.task === "section") {
      if (req.section === "toc") {
        if (demo) {
          const chapters = demoToc(project);
          return NextResponse.json<GenerateResponse>({ ok: true, demo, model, chapters, text: tocMarkdown(chapters, "") });
        }
        const { text, truncated } = await runClaude({
          system,
          user: sectionPrompt(project, "toc", cases, others, store.settings),
          schema: TOC_SCHEMA as unknown as Record<string, unknown>,
          maxTokens: 16000,
          signal: request.signal,
        });
        const parsed = parseJson<{ chapters: ChapterPlan[]; notes: string }>(text);
        return NextResponse.json<GenerateResponse>({
          ok: true,
          demo,
          model,
          chapters: parsed.chapters,
          text: tocMarkdown(parsed.chapters, parsed.notes),
          truncated,
        });
      }
      if (demo) return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text: demoSection(project, req.section) });
      const { text, truncated } = await runClaude({
        system,
        user: sectionPrompt(project, req.section, cases, others, store.settings),
        maxTokens: 32000,
        signal: request.signal,
      });
      return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text, truncated });
    }

    if (req.task === "chapter") {
      const idx = project.chapters.findIndex((c) => c.id === req.chapterId);
      if (idx < 0) return fail("BAD_REQUEST", "章が見つかりません", 400);
      if (demo) return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text: demoChapter(project, idx) });
      const { text, truncated } = await runClaude({
        system,
        user: chapterPrompt(project, idx, cases, others, store.settings),
        maxTokens: 32000,
        signal: request.signal,
      });
      return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text, truncated });
    }

    if (req.task === "review") {
      if (demo) return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text: demoReview(project) });
      const { text, truncated } = await runClaude({
        system,
        user: reviewPrompt(project, others),
        maxTokens: 16000,
        signal: request.signal,
      });
      return NextResponse.json<GenerateResponse>({ ok: true, demo, model, text, truncated });
    }

    return fail("BAD_REQUEST", "不明な生成タスクです", 400);
  } catch (e) {
    if (e instanceof GenerateError) {
      const status = e.code === "NO_API_KEY" ? 503 : e.code === "RATE_LIMIT" ? 429 : e.code === "ABORTED" ? 499 : 502;
      return fail(e.code, e.message, status);
    }
    if (e instanceof SyntaxError) return fail("API_ERROR", "生成結果を読み取れませんでした。再試行してください", 502);
    console.error("generate route error:", (e as Error).message);
    return fail("API_ERROR", "生成中にエラーが発生しました", 500);
  }
}

function tocMarkdown(chapters: ChapterPlan[], notes: string): string {
  const body = chapters
    .map((c, i) => `## 第${i + 1}章 ${c.title}\n- 目的：${c.purpose}\n- 読者の作業：${c.readerTask}\n- 必要な具体例・テンプレート：${c.materials}`)
    .join("\n\n");
  return notes ? `${body}\n\n## 構成上の配慮・要確認\n${notes}` : body;
}
