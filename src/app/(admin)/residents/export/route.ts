import { NextResponse } from "next/server";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buildings, contacts, units } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, getAdminContext } from "@/lib/auth";
import { CONSENT_LABELS } from "@/lib/contacts-shared";
import { decrypt } from "@/lib/crypto";
import { formatPhone } from "@/lib/phone";
import { todayKst } from "@/lib/time";

export const dynamic = "force-dynamic";

function csvCell(v: string): string {
  // 엑셀 수식 실행 방지 + 따옴표 처리
  const safe = /^[=+\-@]/.test(v) ? `'${v}` : v;
  return /[",\n]/.test(safe) ? `"${safe.replace(/"/g, '""')}"` : safe;
}

/** 연락처 백업(관리 책임자만). 일괄 등록 양식과 같은 열이라 그대로 다시 올릴 수 있다. 내려받기는 이력에 남는다. */
export async function GET() {
  const ctx = await getAdminContext();
  if (!ctx) return NextResponse.json({ error: "로그인이 필요합니다." }, { status: 401 });
  if (ctx.admin.role !== "owner") return NextResponse.json({ error: "관리 책임자만 내려받을 수 있습니다." }, { status: 403 });
  const rows = await db
    .select({ b: buildings.name, u: units.unitNo, c: contacts })
    .from(contacts)
    .innerJoin(units, eq(contacts.unitId, units.id))
    .innerJoin(buildings, eq(units.buildingId, buildings.id))
    .where(eq(contacts.apartmentId, ctx.apartment.id))
    .orderBy(asc(buildings.sortOrder), asc(buildings.name), asc(units.floor), asc(units.unitNo));
  const header = ["동", "호수", "전화번호", "이름", "수신동의", "동의근거", "앱사용", "상태"];
  const lines = rows
    .filter((r) => !r.c.isSample)
    .map((r) =>
      [
        r.b,
        r.u,
        formatPhone(decrypt(r.c.phoneEnc)),
        r.c.name,
        r.c.consentStatus === "agreed" ? "예" : r.c.consentStatus === "refused" || r.c.consentStatus === "withdrawn" ? "아니오" : "",
        r.c.consentStatus === "agreed" ? r.c.consentBasis : CONSENT_LABELS[r.c.consentStatus] ?? "",
        r.c.usesOtherApp ? "예" : "아니오",
        r.c.active ? "사용 중" : `비활성(${r.c.inactiveReason ?? ""})`,
      ]
        .map(csvCell)
        .join(","),
    );
  await audit(ctx, "contact.export", { detail: { count: lines.length }, ip: await clientIp() });
  const body = "﻿" + [header.join(","), ...lines].join("\r\n") + "\r\n";
  return new NextResponse(body, {
    headers: {
      "Content-Type": "text/csv; charset=utf-8",
      "Content-Disposition": `attachment; filename*=UTF-8''${encodeURIComponent(`아파트온_연락처_백업_${todayKst()}.csv`)}`,
      "Cache-Control": "private, no-store",
    },
  });
}
