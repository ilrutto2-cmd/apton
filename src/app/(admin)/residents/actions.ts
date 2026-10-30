"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deliveries } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, requireAdmin } from "@/lib/auth";
import { addContact, CONSENT_LABELS, importContacts, otherUnitsWithPhone, type ImportReport } from "@/lib/contacts";
import { decrypt, encrypt, phoneHash } from "@/lib/crypto";
import { PURGED } from "@/lib/retention";
import { parseImportFile } from "@/lib/import-parse";
import { formatPhone, normalizeMobile } from "@/lib/phone";

export type ActionResult = { ok?: boolean; error?: string; message?: string; warning?: string } | undefined;

export async function addContactAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const r = await addContact(ctx.apartment.id, {
    unitId: String(fd.get("unitId") ?? ""),
    phone: String(fd.get("phone") ?? ""),
    name: String(fd.get("name") ?? ""),
    consentStatus: String(fd.get("consentStatus") ?? ""),
    consentBasis: String(fd.get("consentBasis") ?? ""),
    usesOtherApp: fd.get("usesOtherApp") === "on",
  });
  if (!r.ok) return { error: r.error };
  await audit(ctx, "contact.create", { targetType: "contact", targetId: r.id, ip: await clientIp() });
  revalidatePath("/residents");
  return { ok: true, message: "연락처를 등록했습니다.", warning: r.warning };
}

async function ownContact(aptId: string, id: string) {
  const [c] = await db.select().from(contacts).where(and(eq(contacts.id, id), eq(contacts.apartmentId, aptId)));
  return c;
}

export async function updateContactAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const c = await ownContact(ctx.apartment.id, String(fd.get("id") ?? ""));
  if (!c) return { error: "연락처를 찾을 수 없습니다." };
  const consent = String(fd.get("consentStatus") ?? c.consentStatus);
  if (!CONSENT_LABELS[consent]) return { error: "수신 동의 상태가 올바르지 않습니다." };
  const set: Partial<typeof contacts.$inferInsert> = {
    name: String(fd.get("name") ?? "").trim().slice(0, 40),
    consentStatus: consent,
    consentBasis: consent === "agreed" ? String(fd.get("consentBasis") ?? "").trim().slice(0, 60) : "",
    usesOtherApp: fd.get("usesOtherApp") === "on",
    updatedAt: new Date(),
  };
  if (consent === "agreed" && c.consentStatus !== "agreed") set.consentAt = new Date();
  let warning: string | undefined;
  const newPhone = String(fd.get("phone") ?? "").trim();
  if (newPhone) {
    const p = normalizeMobile(newPhone);
    if (!p) return { error: "휴대전화 번호 형식이 올바르지 않습니다." };
    const h = phoneHash(p);
    if (h !== c.phoneHash) {
      const [dup] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.unitId, c.unitId), eq(contacts.phoneHash, h)));
      if (dup) return { error: "이 세대에 이미 등록된 번호입니다." };
      const others = await otherUnitsWithPhone(ctx.apartment.id, h, c.unitId);
      if (others.length) warning = `같은 번호가 ${others.join(", ")}에도 등록되어 있습니다.`;
      Object.assign(set, { phoneEnc: encrypt(p), phoneHash: h, phoneLast4: p.slice(-4) });
    }
  }
  await db.update(contacts).set(set).where(eq(contacts.id, c.id));
  await audit(ctx, "contact.update", {
    targetType: "contact",
    targetId: c.id,
    detail: { phoneChanged: !!set.phoneHash, consent: consent !== c.consentStatus ? `${c.consentStatus}→${consent}` : undefined },
    ip: await clientIp(),
  });
  revalidatePath("/residents");
  return { ok: true, message: "수정했습니다.", warning };
}

export async function setActiveAction(id: string, active: boolean, reason?: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const c = await ownContact(ctx.apartment.id, id);
  if (!c) return { error: "연락처를 찾을 수 없습니다." };
  await db
    .update(contacts)
    .set({ active, inactiveReason: active ? null : reason || "전출", updatedAt: new Date() })
    .where(eq(contacts.id, c.id));
  await audit(ctx, active ? "contact.activate" : "contact.deactivate", { targetType: "contact", targetId: c.id, detail: { reason }, ip: await clientIp() });
  revalidatePath("/residents");
  return { ok: true };
}

export async function deleteContactAction(id: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const c = await ownContact(ctx.apartment.id, id);
  if (!c) return { error: "연락처를 찾을 수 없습니다." };
  // 삭제 요청: 과거 발송 기록의 전화번호도 지운다(뒷자리 4자리와 발송 결과만 남김)
  await db
    .update(deliveries)
    .set({ phoneEnc: PURGED, viewToken: null })
    .where(and(eq(deliveries.apartmentId, ctx.apartment.id), eq(deliveries.phoneHash, c.phoneHash), ne(deliveries.status, "pending")));
  await db.delete(contacts).where(eq(contacts.id, c.id));
  await audit(ctx, "contact.delete", { targetType: "contact", targetId: c.id, detail: { last4: c.phoneLast4 }, ip: await clientIp() });
  revalidatePath("/residents");
  return { ok: true };
}

/** 전화번호 전체 보기 — 열람 이력이 남는다 */
export async function revealPhoneAction(id: string): Promise<{ phone?: string; error?: string }> {
  const ctx = await requireAdmin();
  const c = await ownContact(ctx.apartment.id, id);
  if (!c) return { error: "연락처를 찾을 수 없습니다." };
  await audit(ctx, "contact.reveal", { targetType: "contact", targetId: c.id, ip: await clientIp() });
  return { phone: formatPhone(decrypt(c.phoneEnc)) };
}

export async function purgeSampleAction(): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const del = await db
    .delete(contacts)
    .where(and(eq(contacts.apartmentId, ctx.apartment.id), eq(contacts.isSample, true)))
    .returning({ id: contacts.id });
  await audit(ctx, "contact.sample_purge", { detail: { count: del.length }, ip: await clientIp() });
  revalidatePath("/residents");
  revalidatePath("/dashboard");
  return { ok: true, message: `샘플 연락처 ${del.length}건을 삭제했습니다.` };
}

export async function bulkSetConsentAction(ids: string[], consent: "agreed" | "pending" | "refused" | "withdrawn", basis: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!ids.length) return { error: "선택한 연락처가 없습니다." };
  if (!CONSENT_LABELS[consent]) return { error: "잘못된 상태" };
  const updated = await db
    .update(contacts)
    .set({ consentStatus: consent, consentBasis: consent === "agreed" ? basis : "", consentAt: consent === "agreed" ? new Date() : null, updatedAt: new Date() })
    .where(and(eq(contacts.apartmentId, ctx.apartment.id), inArray(contacts.id, ids)))
    .returning({ id: contacts.id });
  await audit(ctx, "contact.update", { detail: { bulk: updated.length, consent }, ip: await clientIp() });
  revalidatePath("/residents");
  return { ok: true, message: `${updated.length}건의 수신 동의 상태를 변경했습니다.` };
}

export type ImportState = { error?: string; report?: ImportReport } | undefined;

export async function importAction(_: ImportState, fd: FormData): Promise<ImportState> {
  const ctx = await requireAdmin();
  const file = fd.get("file");
  if (!(file instanceof File) || file.size === 0) return { error: "파일을 선택해 주세요." };
  if (file.size > 5 * 1024 * 1024) return { error: "파일은 5MB 이하만 올릴 수 있습니다." };
  const rows = await parseImportFile(file.name, Buffer.from(await file.arrayBuffer()));
  if (typeof rows === "string") return { error: rows };
  if (rows.length > 5000) return { error: "한 번에 5,000줄까지 등록할 수 있습니다." };
  const defaultConsent = fd.get("defaultConsent") === "agreed" ? "agreed" : "pending";
  const report = await importContacts(ctx.apartment.id, rows, {
    createMissing: fd.get("createMissing") === "on",
    defaultConsent,
    defaultBasis: String(fd.get("defaultBasis") ?? "").trim(),
  });
  await audit(ctx, "contact.import", { detail: { file: file.name, added: report.added, duplicates: report.duplicates, errors: report.errors.length }, ip: await clientIp() });
  revalidatePath("/residents");
  return { report };
}
