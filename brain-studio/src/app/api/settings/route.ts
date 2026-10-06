import { NextResponse } from "next/server";
import { updateStore } from "@/lib/server/store";
import type { Settings } from "@/lib/types";

export const runtime = "nodejs";

export async function PUT(request: Request) {
  const { settings } = (await request.json()) as { settings: Settings };
  const saved = await updateStore((s) => {
    s.settings = {
      ...s.settings,
      ...settings,
      ideasPerRequest: Math.max(1, Math.min(10, Math.floor(settings.ideasPerRequest || 5))),
      maxIdeas: Math.max(1, Math.min(30, Math.floor(settings.maxIdeas || 30))),
      chapterLength: Math.max(500, Math.min(8000, Math.floor(settings.chapterLength || 2500))),
    };
    return s.settings;
  });
  return NextResponse.json({ settings: saved });
}
