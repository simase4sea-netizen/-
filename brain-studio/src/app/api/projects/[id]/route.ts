import { NextResponse } from "next/server";
import { updateStore } from "@/lib/server/store";
import type { Project } from "@/lib/types";

export const runtime = "nodejs";

type Ctx = { params: Promise<{ id: string }> };

export async function PUT(request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const { project } = (await request.json()) as { project: Project };
  if (!project || project.id !== id) return NextResponse.json({ error: "IDが一致しません" }, { status: 400 });
  const saved = await updateStore((s) => {
    const i = s.projects.findIndex((p) => p.id === id);
    if (i < 0) return null;
    s.projects[i] = project;
    return project;
  });
  if (!saved) return NextResponse.json({ error: "企画が見つかりません" }, { status: 404 });
  return NextResponse.json({ project: saved });
}

export async function DELETE(_request: Request, ctx: Ctx) {
  const { id } = await ctx.params;
  const ok = await updateStore((s) => {
    const before = s.projects.length;
    s.projects = s.projects.filter((p) => p.id !== id);
    return s.projects.length < before;
  });
  if (!ok) return NextResponse.json({ error: "企画が見つかりません" }, { status: 404 });
  return NextResponse.json({ ok: true });
}
