import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { buildings, dispatches, notices, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { liveConfigured } from "@/lib/dispatch";
import { dateToKst } from "@/lib/time";
import { ComposeForm, type ComposeInitial } from "./compose";

export const metadata = { title: "새 공지 작성" };

export default async function NewNoticePage({
  searchParams,
}: {
  searchParams: Promise<{ emergency?: string; edit?: string; from?: string }>;
}) {
  const { apartment } = await requireAdmin();
  const sp = await searchParams;
  const bs = await db.select({ id: buildings.id, name: buildings.name }).from(buildings).where(eq(buildings.apartmentId, apartment.id)).orderBy(asc(buildings.sortOrder), asc(buildings.name));
  const us = await db.select({ id: units.id, buildingId: units.buildingId, unitNo: units.unitNo, floor: units.floor }).from(units).where(eq(units.apartmentId, apartment.id)).orderBy(asc(units.floor), asc(units.unitNo));

  let initial: ComposeInitial | undefined;
  let editMode: "new" | "edit" | "copy" = "new";
  const srcId = sp.edit ?? sp.from;
  if (srcId) {
    const [n] = await db.select().from(notices).where(and(eq(notices.id, srcId), eq(notices.apartmentId, apartment.id)));
    if (!n) notFound();
    editMode = sp.edit ? "edit" : "copy";
    const s = n.startsAt ? dateToKst(n.startsAt) : null;
    const e = n.endsAt ? dateToKst(n.endsAt) : null;
    let schedule: { date: string; time: string } | null = null;
    if (sp.edit) {
      if (n.status !== "draft" && n.status !== "scheduled") notFound();
      const ds = await db.select().from(dispatches).where(and(eq(dispatches.noticeId, n.id), eq(dispatches.status, "scheduled"))).orderBy(asc(dispatches.scheduledAt));
      if (ds[0]) schedule = dateToKst(ds[0].scheduledAt);
    }
    initial = {
      noticeId: sp.edit ? n.id : undefined,
      category: n.category,
      title: n.title,
      body: n.body,
      startDate: s?.date ?? "",
      startTime: s?.time ?? "",
      endDate: e?.date ?? "",
      endTime: e?.time ?? "",
      target: n.target,
      visibility: n.visibility as "public" | "private",
      includeLink: n.includeLink,
      excludeAppUsers: n.excludeAppUsers,
      isEmergency: n.isEmergency,
      smsText: n.smsText,
      smsTextEdited: n.smsTextEdited,
      method: schedule ? "schedule" : "now",
      scheduleDate: schedule?.date ?? "",
      scheduleTime: schedule?.time ?? "",
    };
  }

  const emergency = sp.emergency === "1" && !initial;
  return (
    <div className="space-y-5">
      <div>
        <Link href="/dashboard" className="text-sm font-semibold text-brand-600">← 홈</Link>
        <h1 className={`mt-1 text-2xl font-bold ${emergency ? "text-red-600" : ""}`}>
          {emergency ? "🚨 긴급 공지 발송" : editMode === "edit" ? "공지 수정" : editMode === "copy" ? "공지 다시 보내기" : "새 공지 작성"}
        </h1>
        {editMode === "edit" && <p className="text-sub">예약된 발송은 저장하면 새 내용·시각으로 다시 예약됩니다.</p>}
        {editMode === "copy" && <p className="text-sub">이전 공지 내용을 불러왔습니다. 필요한 부분을 고친 뒤 보내세요.</p>}
      </div>
      {bs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">공지를 보내려면 먼저 동·호수와 입주민 연락처를 등록해야 합니다.</p>
          <Link href="/apartment" className="btn-primary mt-4">동·호수 등록하기</Link>
        </div>
      ) : (
        <ComposeForm
          apt={{ name: apartment.name, officePhone: apartment.officePhone, mode: apartment.smsMode === "live" ? "live" : "test", includeLinkDefault: apartment.includeLinkDefault }}
          buildings={bs}
          units={us}
          initial={initial}
          emergency={emergency}
          aiEnabled={!!process.env.ANTHROPIC_API_KEY}
          liveReady={liveConfigured() && !!apartment.senderNumber}
        />
      )}
    </div>
  );
}
