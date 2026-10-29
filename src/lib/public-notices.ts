import { and, desc, eq, exists, inArray, sql } from "drizzle-orm";
import { db } from "@/db";
import { apartments, dispatches, notices, type Apartment } from "@/db/schema";

/** 입주민 공개 페이지에 보일 공지: 단지 공지 + 실제로 발송이 시작된 것(실제 발송 모드면 실제 발송분만) */
function visibleCond(apt: Apartment) {
  const modes = apt.smsMode === "live" ? ["live"] : ["live", "test"];
  return and(
    eq(notices.apartmentId, apt.id),
    eq(notices.visibility, "public"),
    inArray(notices.status, ["sent", "partial", "sending"]),
    exists(
      db
        .select({ x: sql`1` })
        .from(dispatches)
        .where(and(eq(dispatches.noticeId, notices.id), inArray(dispatches.status, ["done", "sending"]), inArray(dispatches.mode, modes))),
    ),
  );
}

export async function aptBySlug(slug: string) {
  if (!/^[a-z0-9]{6,20}$/.test(slug)) return null;
  const [a] = await db.select().from(apartments).where(eq(apartments.publicSlug, slug));
  return a ?? null;
}

export async function publicNotices(apt: Apartment, limit = 50) {
  return db
    .select({
      id: notices.id,
      title: notices.title,
      category: notices.category,
      startsAt: notices.startsAt,
      endsAt: notices.endsAt,
      targetLabel: notices.targetLabel,
      isEmergency: notices.isEmergency,
      createdAt: notices.createdAt,
      sentAt: sql<Date>`(select min(started_at) from dispatches d where d.notice_id = "notices"."id" and d.started_at is not null)`,
    })
    .from(notices)
    .where(visibleCond(apt))
    .orderBy(desc(notices.createdAt))
    .limit(limit);
}

export async function publicNotice(apt: Apartment, id: string) {
  if (!/^[0-9a-f-]{36}$/.test(id)) return null;
  const [n] = await db.select().from(notices).where(and(eq(notices.id, id), visibleCond(apt)));
  return n ?? null;
}
