import { NextResponse } from "next/server";
import { updateStore } from "@/lib/server/store";
import type { CaseRecord } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const { cases } = (await request.json()) as { cases: CaseRecord[] };
  if (!Array.isArray(cases)) return NextResponse.json({ error: "cases が不正です" }, { status: 400 });
  const saved = await updateStore((s) => {
    s.cases = cases;
    return s.cases;
  });
  return NextResponse.json({ cases: saved });
}
