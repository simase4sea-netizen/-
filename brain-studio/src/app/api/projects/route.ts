import { NextResponse } from "next/server";
import { updateStore } from "@/lib/server/store";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

/** 企画をまとめて追加（企画案の保存・複製・JSON読み込み） */
export async function POST(request: Request) {
  const { projects } = (await request.json()) as { projects: Project[] };
  if (!Array.isArray(projects)) return NextResponse.json({ error: "projects が不正です" }, { status: 400 });
  const added = await updateStore((s) => {
    const ids = new Set(s.projects.map((p) => p.id));
    const fresh = projects.filter((p) => p?.id && !ids.has(p.id));
    s.projects.unshift(...fresh);
    return fresh;
  });
  return NextResponse.json({ projects: added });
}
