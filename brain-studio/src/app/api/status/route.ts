import { NextResponse } from "next/server";
import { hasApiKey, modelName } from "@/lib/server/anthropic";
import { storePath } from "@/lib/server/store";

export const runtime = "nodejs";
export const dynamic = "force-dynamic";

// APIキーの有無だけを返す（キーそのものは返さない）
export async function GET() {
  return NextResponse.json({ hasApiKey: hasApiKey(), model: modelName(), dataPath: storePath() });
}
