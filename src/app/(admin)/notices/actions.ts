"use server";

import { revalidatePath } from "next/cache";
import { and, eq, inArray, ne } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, dispatches, notices } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, requireAdmin, type AdminContext } from "@/lib/auth";
import { finalText, liveConfigured, pollResults, recomputeNoticeStatus, runDispatchNow } from "@/lib/dispatch";
import { categoryOf } from "@/lib/notice-templates";
import { noticeInputSchema, parseSchedule, planSends, prefixFor, type NoticeInput } from "@/lib/notice-plan";
import { adWordsIn, detectType, LMS_MAX_BYTES, smsBytes } from "@/lib/sms/message";
import { rateFor } from "@/lib/sms/pricing";
import { resolveRecipients, sanitizeTarget, targetLabel } from "@/lib/targeting";

export type Preview = {
  error?: string;
  targetLabel: string;
  recipients: number;
  units: number;
  totalContacts: number;
  excludedNoConsent: number;
  excludedInactive: number;
  excludedSample: number;
  duplicatesMerged: number;
  bytes: number;
  type: "SMS" | "LMS";
  overLimit: boolean;
  sampleText: string;
  rate: number;
  sends: { at: string; label: string }[];
  skipped: string[];
  perSendCost: number;
  totalCost: number;
  adWords: string[];
  mode: "test" | "live";
  liveReady: boolean;
  senderNumber: string;
};

/** 화면 미리보기: 받는 사람 수, 문자 종류, 예상 비용 (실제 발송과 같은 규칙으로 계산) */
export async function previewAction(raw: unknown): Promise<Preview | { error: string }> {
  const ctx = await requireAdmin();
  const parsed = noticeInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  const i = parsed.data;
  const apt = ctx.apartment;
  const target = await sanitizeTarget(apt.id, i.target);
  const mode = apt.smsMode === "live" ? "live" : "test";
  const label = target ? await targetLabel(apt.id, target) : "";
  const summary = target
    ? await resolveRecipients(apt.id, target, { includeSample: mode === "test" })
    : { recipients: [], totalContacts: 0, excludedNoConsent: 0, excludedInactive: 0, excludedSample: 0, duplicatesMerged: 0, unitCount: 0 };
  const { startsAt } = parseSchedule(i);
  const plan = planSends({ ...i, method: i.method === "draft" ? "now" : i.method }, startsAt);
  const sampleText = finalText({ prefix: "", smsText: i.smsText, includeLink: i.includeLink, visibility: i.visibility, slug: apt.publicSlug, noticeId: i.noticeId ?? "00000000-0000-0000-0000-000000000000" });
  // 재안내는 '(재안내)' 한 줄이 붙어 더 길어질 수 있으므로 가장 긴 문자로 판단
  const longest = plan.sends.length > 1 ? prefixFor(1) + "\n" + sampleText : sampleText;
  const type = detectType(longest);
  const rate = rateFor(apt, type);
  const sends = plan.sends.length;
  return {
    error: plan.error,
    targetLabel: label,
    recipients: summary.recipients.length,
    units: summary.unitCount,
    totalContacts: summary.totalContacts,
    excludedNoConsent: summary.excludedNoConsent,
    excludedInactive: summary.excludedInactive,
    excludedSample: summary.excludedSample,
    duplicatesMerged: summary.duplicatesMerged,
    bytes: smsBytes(sampleText),
    type,
    overLimit: smsBytes(longest) > LMS_MAX_BYTES,
    sampleText,
    rate,
    sends: plan.sends.map((s) => ({ at: s.at.toISOString(), label: s.label })),
    skipped: plan.skipped,
    perSendCost: rate * summary.recipients.length,
    totalCost: rate * summary.recipients.length * Math.max(1, sends),
    adWords: adWordsIn(i.title + "\n" + i.smsText),
    mode,
    liveReady: liveConfigured() && !!apt.senderNumber,
    senderNumber: apt.senderNumber,
  };
}

export type SubmitResult = { ok?: boolean; error?: string; noticeId?: string; method?: string };

function validateForSend(i: NoticeInput, ctx: AdminContext): string | null {
  if (i.method === "draft") return null;
  if (!i.smsText.trim()) return "보낼 문자 내용이 비어 있습니다.";
  if (ctx.apartment.smsMode === "live") {
    if (!liveConfigured()) return "실제 발송 설정(SOLAPI API 키)이 없습니다. 설정에서 테스트 모드로 바꾸거나 키를 등록하세요.";
    if (!ctx.apartment.senderNumber) return "발신번호가 설정되지 않았습니다. 설정 화면에서 등록하세요.";
  }
  return null;
}

/** 공지 저장 + 발송(즉시/예약/임시저장). 같은 requestKey로 두 번 와도 한 번만 처리된다. */
export async function submitNoticeAction(raw: unknown): Promise<SubmitResult> {
  const ctx = await requireAdmin();
  const parsed = noticeInputSchema.safeParse(raw);
  if (!parsed.success) return { error: parsed.error.issues[0]?.message ?? "입력값 오류" };
  const i = parsed.data;
  const apt = ctx.apartment;

  const target = await sanitizeTarget(apt.id, i.target);
  if (!target) return { error: "발송 대상을 선택해 주세요." };
  const err = validateForSend(i, ctx);
  if (err) return { error: err };
  const { startsAt, endsAt } = parseSchedule(i);
  if (i.startDate && !startsAt) return { error: "공지 일정의 날짜·시간 형식이 올바르지 않습니다." };
  if (startsAt && endsAt && endsAt < startsAt) return { error: "종료 시각이 시작 시각보다 빠릅니다." };
  const plan = planSends(i, startsAt);
  if (plan.error) return { error: plan.error };
  if (i.method !== "draft" && !plan.sends.length) return { error: "발송할 시각이 없습니다." };
  const longest = (plan.sends.length > 1 ? "(재안내)\n" : "") + finalText({ prefix: "", smsText: i.smsText, includeLink: i.includeLink, visibility: i.visibility, slug: apt.publicSlug, noticeId: i.noticeId ?? "00000000-0000-0000-0000-000000000000" });
  if (smsBytes(longest) > LMS_MAX_BYTES) return { error: `문자가 너무 깁니다(${smsBytes(longest)}바이트). ${LMS_MAX_BYTES}바이트 이내로 줄여 주세요.` };
  if (i.method !== "draft") {
    const s = await resolveRecipients(apt.id, target, { includeSample: apt.smsMode !== "live" });
    if (!s.recipients.length) return { error: "문자를 받을 수 있는 수신자가 없습니다. 연락처와 수신 동의 상태를 확인하세요." };
  }

  const label = await targetLabel(apt.id, target);
  const isEmergency = i.isEmergency || i.category === "emergency";
  const values = {
    category: categoryOf(i.category).id,
    title: i.title.trim(),
    body: i.body,
    startsAt,
    endsAt,
    target,
    targetLabel: label,
    visibility: i.visibility,
    isEmergency,
    includeLink: i.includeLink,
    smsText: i.smsText.trim(),
    smsTextEdited: i.smsTextEdited,
    updatedAt: new Date(),
  };
  const mode = apt.smsMode === "live" ? "live" : "test";

  type TxResult = { ok?: boolean; error?: string; noticeId?: string; duplicate?: boolean; created?: string[] };
  let result: TxResult;
  try {
    result = await db.transaction(async (tx): Promise<TxResult> => {
    // ① 같은 요청이 이미 처리됐으면 그 결과를 그대로 돌려줌
    const [dup] = await tx.select().from(notices).where(eq(notices.requestKey, i.requestKey));
    if (dup && dup.apartmentId !== apt.id) return { error: "잘못된 요청입니다." };
    let noticeId: string;
    const existingId = i.noticeId ?? (dup?.status === "draft" ? dup.id : undefined);
    if (dup && dup.status !== "draft" && !i.noticeId) return { ok: true, noticeId: dup.id, duplicate: true };

    if (existingId) {
      // ② 임시저장·예약 공지 수정: 행 잠금 후 상태 확인
      const [n] = await tx.select().from(notices).where(and(eq(notices.id, existingId), eq(notices.apartmentId, apt.id))).for("update");
      if (!n) return { error: "공지를 찾을 수 없습니다." };
      const ds = await tx.select().from(dispatches).where(eq(dispatches.noticeId, n.id));
      // 같은 화면에서 이미 처리된 요청(버튼 두 번 클릭 등)이면 아무것도 바꾸지 않음
      if (ds.some((d) => d.idempotencyKey.startsWith(`${i.requestKey}:`))) return { ok: true, noticeId: n.id, duplicate: true };
      if (ds.some((d) => d.status !== "scheduled" && d.status !== "canceled")) return { error: "이미 발송이 시작된 공지는 수정할 수 없습니다. '다시 보내기'를 이용하세요." };
      await tx
        .update(dispatches)
        .set({ status: "canceled", finishedAt: new Date(), error: "공지 수정으로 다시 예약됨" })
        .where(and(eq(dispatches.noticeId, n.id), eq(dispatches.status, "scheduled")));
      await tx.update(notices).set({ ...values, status: i.method === "draft" ? "draft" : "scheduled", requestKey: n.requestKey ?? i.requestKey }).where(eq(notices.id, n.id));
      noticeId = n.id;
    } else {
      const [n] = await tx
        .insert(notices)
        .values({ ...values, apartmentId: apt.id, status: i.method === "draft" ? "draft" : "scheduled", requestKey: i.requestKey, createdBy: ctx.admin.id })
        .returning({ id: notices.id });
      noticeId = n.id;
    }

    const created: string[] = [];
    for (const [idx, s] of plan.sends.entries()) {
      const [d] = await tx
        .insert(dispatches)
        .values({
          apartmentId: apt.id,
          noticeId,
          kind: s.kind,
          label: s.label,
          scheduledAt: s.at,
          status: "scheduled",
          mode,
          idempotencyKey: `${i.requestKey}:${noticeId}:${idx}:${s.at.getTime()}`,
          textPrefix: prefixFor(idx),
          createdBy: ctx.admin.id,
        })
        .onConflictDoNothing()
        .returning({ id: dispatches.id, kind: dispatches.kind });
      if (d) created.push(d.id);
    }
    return { ok: true, noticeId, created };
    });
  } catch (e) {
    // 동시에 두 번 제출되어 고유키 충돌 → 먼저 처리된 공지를 돌려줌
    if ((e as { code?: string }).code === "23505") {
      const [dup] = await db.select({ id: notices.id }).from(notices).where(and(eq(notices.requestKey, i.requestKey), eq(notices.apartmentId, apt.id)));
      if (dup) return { ok: true, noticeId: dup.id, method: i.method };
    }
    throw e;
  }

  if (result.error) return { error: result.error };
  const noticeId = result.noticeId!;
  if (!result.duplicate) {
    const action = i.method === "draft" ? "notice.draft" : i.method === "now" ? "notice.send" : "notice.schedule";
    await audit(ctx, i.noticeId ? (i.method === "draft" ? "notice.draft" : "notice.update") : action, {
      targetType: "notice",
      targetId: noticeId,
      detail: { title: values.title, target: label, mode, sends: plan.sends.map((s) => s.at.toISOString()) },
      ip: await clientIp(),
    });
    // 즉시 발송 회차는 바로 처리(예약 회차는 스케줄러가 처리)
    if (i.method === "now") {
      const [first] = await db.select().from(dispatches).where(and(eq(dispatches.noticeId, noticeId), eq(dispatches.kind, "immediate"), eq(dispatches.status, "scheduled")));
      if (first) await runDispatchNow(first.id);
    }
    await recomputeNoticeStatus(noticeId);
  }
  revalidatePath("/dashboard");
  revalidatePath("/notices");
  return { ok: true, noticeId, method: i.method };
}

/** 예약 회차 취소 — 아직 발송이 시작되지 않은 경우에만 가능(원자적 확인) */
export async function cancelDispatchAction(dispatchId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAdmin();
  const rows = await db
    .update(dispatches)
    .set({ status: "canceled", finishedAt: new Date(), error: `관리자 취소 (${ctx.admin.name})` })
    .where(and(eq(dispatches.id, dispatchId), eq(dispatches.apartmentId, ctx.apartment.id), eq(dispatches.status, "scheduled")))
    .returning();
  if (!rows.length) {
    const [d] = await db.select().from(dispatches).where(and(eq(dispatches.id, dispatchId), eq(dispatches.apartmentId, ctx.apartment.id)));
    if (!d) return { error: "발송 회차를 찾을 수 없습니다." };
    return { error: "이미 발송이 시작되었거나 끝나 취소할 수 없습니다. 문자 서비스에 접수된 문자는 되돌릴 수 없습니다." };
  }
  await recomputeNoticeStatus(rows[0].noticeId);
  await audit(ctx, "notice.cancel", { targetType: "dispatch", targetId: dispatchId, detail: { label: rows[0].label }, ip: await clientIp() });
  revalidatePath(`/notices/${rows[0].noticeId}`);
  revalidatePath("/dashboard");
  return { ok: true };
}

/** 실패한 건(선택 시 결과 확인 불가 건 포함)만 다시 보내기 */
export async function resendFailedAction(dispatchId: string, includeUnknown: boolean, requestKey: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAdmin();
  const [d] = await db.select().from(dispatches).where(and(eq(dispatches.id, dispatchId), eq(dispatches.apartmentId, ctx.apartment.id)));
  if (!d) return { error: "발송 회차를 찾을 수 없습니다." };
  const statuses = includeUnknown ? ["failed", "unknown"] : ["failed"];
  const rows = await db.select({ h: deliveries.phoneHash }).from(deliveries).where(and(eq(deliveries.dispatchId, d.id), inArray(deliveries.status, statuses)));
  if (!rows.length) return { error: "다시 보낼 건이 없습니다." };
  const mode = ctx.apartment.smsMode === "live" ? "live" : "test";
  if (mode === "live" && (!liveConfigured() || !ctx.apartment.senderNumber)) return { error: "실제 발송 설정이 완료되지 않았습니다." };
  const [nd] = await db
    .insert(dispatches)
    .values({
      apartmentId: ctx.apartment.id,
      noticeId: d.noticeId,
      kind: "resend",
      label: includeUnknown ? "실패·확인불가 건 재발송" : "실패 건 재발송",
      scheduledAt: new Date(),
      status: "scheduled",
      mode,
      idempotencyKey: `resend:${requestKey}`,
      onlyPhoneHashes: rows.map((r) => r.h),
      textPrefix: d.textPrefix,
      createdBy: ctx.admin.id,
    })
    .onConflictDoNothing()
    .returning();
  if (!nd) return { ok: true };
  await audit(ctx, "notice.resend", { targetType: "notice", targetId: d.noticeId, detail: { count: rows.length, includeUnknown }, ip: await clientIp() });
  await runDispatchNow(nd.id);
  revalidatePath(`/notices/${d.noticeId}`);
  return { ok: true };
}

export async function deleteDraftAction(noticeId: string): Promise<{ ok?: boolean; error?: string }> {
  const ctx = await requireAdmin();
  const del = await db
    .delete(notices)
    .where(and(eq(notices.id, noticeId), eq(notices.apartmentId, ctx.apartment.id), eq(notices.status, "draft")))
    .returning({ id: notices.id, title: notices.title });
  if (!del.length) return { error: "임시 저장된 공지만 삭제할 수 있습니다." };
  await audit(ctx, "notice.delete", { targetType: "notice", targetId: noticeId, detail: { title: del[0].title }, ip: await clientIp() });
  revalidatePath("/notices");
  return { ok: true };
}

/** 발송 결과 새로 확인 */
export async function refreshResultsAction(noticeId: string) {
  const ctx = await requireAdmin();
  const [n] = await db.select({ id: notices.id }).from(notices).where(and(eq(notices.id, noticeId), eq(notices.apartmentId, ctx.apartment.id), ne(notices.status, "draft")));
  if (!n) return { error: "공지를 찾을 수 없습니다." };
  const r = await pollResults();
  revalidatePath(`/notices/${noticeId}`);
  return { ok: true, ...r };
}
