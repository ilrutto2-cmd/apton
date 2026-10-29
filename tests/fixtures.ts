import { eq } from "drizzle-orm";
import { db, sql } from "@/db";
import { apartments, buildings, dispatches, notices, units, type NoticeTarget } from "@/db/schema";
import { createApartmentWithOwner, generateUnitNumbers } from "@/lib/apartment";
import { addContact } from "@/lib/contacts";
import { buildSmsText } from "@/lib/notice-templates";

export async function reset() {
  await sql`TRUNCATE apartments, admins, sessions, buildings, units, contacts, notices, dispatches, deliveries, audit_logs CASCADE`;
}

export async function makeApartment(name: string, email: string, bNames = ["101동", "102동"]) {
  const { apt, admin } = await createApartmentWithOwner({ aptName: name, ownerName: "관리자", email, passwordHash: "x" });
  const bs: Record<string, { id: string; units: Record<string, string> }> = {};
  for (const [i, bn] of bNames.entries()) {
    const [b] = await db.insert(buildings).values({ apartmentId: apt.id, name: bn, sortOrder: i }).returning();
    const us = await db
      .insert(units)
      .values(generateUnitNumbers(1, 3, 2).map((u) => ({ apartmentId: apt.id, buildingId: b.id, unitNo: u.unitNo, floor: u.floor })))
      .returning();
    bs[bn] = { id: b.id, units: Object.fromEntries(us.map((u) => [u.unitNo, u.id])) };
  }
  return { apt, admin, bs };
}

export async function phone(aptId: string, unitId: string, p: string, consent = "agreed", isSample = false) {
  const r = await addContact(aptId, { unitId, phone: p, consentStatus: consent, consentBasis: "서면 동의서", isSample });
  if (!r.ok) throw new Error(r.error);
  return r.id;
}

export async function setMode(aptId: string, mode: "test" | "live", sender = "0212345678") {
  await db.update(apartments).set({ smsMode: mode, senderNumber: sender }).where(eq(apartments.id, aptId));
}

/** 서버 액션과 같은 방식으로 공지 + 발송 회차를 만든다 */
export async function makeNotice(
  aptId: string,
  target: NoticeTarget,
  opts: { at?: Date; mode?: "test" | "live"; key?: string; text?: string; includeLink?: boolean; visibility?: "public" | "private" } = {},
) {
  const smsText =
    opts.text ??
    buildSmsText({ apartmentName: "행복아파트", officePhone: "", isEmergency: false, title: "엘리베이터 정기 점검 안내", body: "이용이 제한됩니다.", startsAt: null, endsAt: null, targetLabel: "101동" });
  const [n] = await db
    .insert(notices)
    .values({
      apartmentId: aptId,
      category: "elevator",
      title: "엘리베이터 정기 점검 안내",
      body: "",
      target,
      targetLabel: "테스트",
      smsText,
      status: "scheduled",
      includeLink: opts.includeLink ?? false,
      visibility: opts.visibility ?? "public",
    })
    .returning();
  const [d] = await db
    .insert(dispatches)
    .values({
      apartmentId: aptId,
      noticeId: n.id,
      kind: opts.at ? "scheduled" : "immediate",
      label: opts.at ? "예약 발송" : "즉시 발송",
      scheduledAt: opts.at ?? new Date(),
      status: "scheduled",
      mode: opts.mode ?? "test",
      idempotencyKey: opts.key ?? crypto.randomUUID(),
    })
    .returning();
  return { notice: n, dispatch: d };
}
