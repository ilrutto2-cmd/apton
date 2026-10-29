import { NextResponse } from "next/server";
import { getAdminContext } from "@/lib/auth";
import { draftNotice } from "@/lib/ai";
import { categoryOf } from "@/lib/notice-templates";

export const dynamic = "force-dynamic";

const recent = new Map<string, number[]>();

export async function POST(req: Request) {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (!process.env.ANTHROPIC_API_KEY) return NextResponse.json({ error: "AI 기능이 설정되지 않았습니다. 직접 작성해 주세요." }, { status: 503 });
  // 관리자당 1분에 10회 제한
  const now = Date.now();
  const list = (recent.get(ctx.admin.id) ?? []).filter((t) => now - t < 60000);
  if (list.length >= 10) return NextResponse.json({ error: "잠시 후 다시 시도해 주세요." }, { status: 429 });
  recent.set(ctx.admin.id, [...list, now]);

  const { input, category } = (await req.json().catch(() => ({}))) as { input?: string; category?: string };
  const text = String(input ?? "").trim();
  if (text.length < 4 || text.length > 500) return NextResponse.json({ error: "메모를 4~500자로 입력해 주세요." }, { status: 400 });
  try {
    const r = await draftNotice(text, categoryOf(String(category ?? "etc")).label);
    return NextResponse.json(r);
  } catch (e) {
    return NextResponse.json({ error: `${(e as Error).message} 직접 작성해 주세요.` }, { status: 502 });
  }
}
