"use server";

import { revalidatePath } from "next/cache";
import bcrypt from "bcryptjs";
import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { admins, apartments, sessions } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, hashPassword, requireAdmin, requireOwner, validatePassword } from "@/lib/auth";
import { getProvider, liveConfigured } from "@/lib/dispatch";
import { normalizeAnyPhone, normalizeMobile } from "@/lib/phone";
import { detectType } from "@/lib/sms/message";

export type R = { ok?: boolean; error?: string; message?: string } | undefined;

async function owner() {
  return requireOwner().catch(() => null);
}

export async function saveSmsSettingsAction(_: R, fd: FormData): Promise<R> {
  const ctx = await owner();
  if (!ctx) return { error: "관리 책임자만 변경할 수 있습니다." };
  const mode = fd.get("smsMode") === "live" ? "live" : "test";
  const senderRaw = String(fd.get("senderNumber") ?? "").trim();
  const sender = senderRaw ? normalizeAnyPhone(senderRaw) : "";
  if (senderRaw && !sender) return { error: "발신번호 형식이 올바르지 않습니다." };
  if (mode === "live") {
    if (!liveConfigured()) return { error: "서버에 SOLAPI API 키가 설정되어 있지 않아 실제 발송으로 바꿀 수 없습니다. (환경변수 SOLAPI_API_KEY, SOLAPI_API_SECRET)" };
    if (!sender) return { error: "실제 발송에는 SOLAPI에 등록한 발신번호가 필요합니다." };
  }
  const rateSms = Number(fd.get("rateSms"));
  const rateLms = Number(fd.get("rateLms"));
  if (!(rateSms > 0 && rateSms < 1000 && rateLms > 0 && rateLms < 1000)) return { error: "요금은 0원보다 크고 1,000원보다 작게 입력해 주세요." };
  const limit = Number(fd.get("dailySendLimit"));
  if (!(limit >= 1 && limit <= 100000)) return { error: "하루 발송 한도는 1~100,000건 사이로 입력해 주세요." };
  const prev = ctx.apartment;
  const rateChanged = Number(prev.rateSms) !== rateSms || Number(prev.rateLms) !== rateLms;
  await db
    .update(apartments)
    .set({
      smsMode: mode,
      senderNumber: sender || "",
      rateSms: String(rateSms),
      rateLms: String(rateLms),
      rateSource: String(fd.get("rateSource") ?? "").trim().slice(0, 120) || prev.rateSource,
      rateUpdatedAt: rateChanged ? new Date() : prev.rateUpdatedAt,
      dailySendLimit: limit,
      includeLinkDefault: fd.get("includeLinkDefault") === "on",
      updatedAt: new Date(),
    })
    .where(eq(apartments.id, prev.id));
  await audit(ctx, "settings.sms", {
    detail: { mode: prev.smsMode !== mode ? `${prev.smsMode}→${mode}` : mode, sender: sender ? `***${sender.slice(-4)}` : "", rateSms, rateLms, limit },
    ip: await clientIp(),
  });
  revalidatePath("/", "layout");
  return { ok: true, message: mode === "live" ? "저장했습니다. 이제 공지를 보내면 실제 문자가 발송됩니다." : "저장했습니다. (테스트 모드)" };
}

export async function checkBalanceAction(): Promise<{ ok?: boolean; error?: string; message?: string }> {
  const ctx = await owner();
  if (!ctx) return { error: "관리 책임자만 확인할 수 있습니다." };
  const p = getProvider("live");
  if (!p?.balance) return { error: "SOLAPI API 키가 설정되지 않았습니다." };
  try {
    const b = await p.balance();
    return { ok: true, message: `연결 성공 — 잔액 ${b.balance.toLocaleString()}원, 포인트 ${b.point.toLocaleString()}` };
  } catch (e) {
    return { error: `연결 실패: ${(e as Error).message}` };
  }
}

/** 관리자 본인 번호로 실제 문자 1건 보내 연결 확인 (요금 발생) */
export async function liveTestSendAction(_: R, fd: FormData): Promise<R> {
  const ctx = await owner();
  if (!ctx) return { error: "관리 책임자만 할 수 있습니다." };
  if (fd.get("confirm") !== "on") return { error: "요금 발생에 동의해 주세요." };
  const to = normalizeMobile(String(fd.get("to") ?? ""));
  if (!to) return { error: "받을 휴대전화 번호를 확인해 주세요." };
  const p = getProvider("live");
  if (!p) return { error: "SOLAPI API 키가 설정되지 않았습니다." };
  if (!ctx.apartment.senderNumber) return { error: "먼저 발신번호를 저장해 주세요." };
  const text = `[${ctx.apartment.name}] 아파트온 실제 발송 연결 확인 문자입니다.`;
  const r = await p.send([{ ref: "live-test", to, from: ctx.apartment.senderNumber, text, type: detectType(text) }]);
  await audit(ctx, "settings.live_test", { detail: { to: `***${to.slice(-4)}`, result: r.kind === "ok" ? r.results[0] : r }, ip: await clientIp() });
  if (r.kind !== "ok") return { error: `발송 실패: ${r.error}` };
  const x = r.results[0];
  if (!x.accepted) return { error: `문자 서비스가 접수하지 않음: [${x.statusCode}] ${x.statusMessage}` };
  return { ok: true, message: `문자 서비스가 접수했습니다(메시지 ID ${x.messageId}). 휴대전화로 수신되는지 확인하세요.` };
}

export async function addStaffAction(_: R, fd: FormData): Promise<R> {
  const ctx = await owner();
  if (!ctx) return { error: "관리 책임자만 계정을 추가할 수 있습니다." };
  const name = String(fd.get("name") ?? "").trim();
  const email = String(fd.get("email") ?? "").trim().toLowerCase();
  const pw = String(fd.get("password") ?? "");
  if (!name) return { error: "이름을 입력해 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 형식이 올바르지 않습니다." };
  const e = validatePassword(pw);
  if (e) return { error: e };
  const [dup] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email));
  if (dup) return { error: "이미 사용 중인 이메일입니다." };
  const [a] = await db.insert(admins).values({ apartmentId: ctx.apartment.id, name, email, passwordHash: await hashPassword(pw), role: "staff" }).returning({ id: admins.id });
  await audit(ctx, "admin.create", { targetType: "admin", targetId: a.id, detail: { name, email }, ip: await clientIp() });
  revalidatePath("/settings");
  return { ok: true, message: `${name} 계정을 만들었습니다. 첫 로그인 후 비밀번호를 바꾸도록 안내하세요.` };
}

export async function setAdminActiveAction(adminId: string, active: boolean): Promise<R> {
  const ctx = await owner();
  if (!ctx) return { error: "관리 책임자만 할 수 있습니다." };
  if (adminId === ctx.admin.id) return { error: "본인 계정은 비활성화할 수 없습니다." };
  const rows = await db
    .update(admins)
    .set({ active })
    .where(and(eq(admins.id, adminId), eq(admins.apartmentId, ctx.apartment.id), ne(admins.role, "owner")))
    .returning({ id: admins.id, name: admins.name });
  if (!rows.length) return { error: "계정을 찾을 수 없습니다." };
  if (!active) await db.delete(sessions).where(eq(sessions.adminId, adminId));
  await audit(ctx, "admin.deactivate", { targetType: "admin", targetId: adminId, detail: { name: rows[0].name, active }, ip: await clientIp() });
  revalidatePath("/settings");
  return { ok: true };
}

export async function changePasswordAction(_: R, fd: FormData): Promise<R> {
  const ctx = await requireAdmin();
  const cur = String(fd.get("current") ?? "");
  const next = String(fd.get("next") ?? "");
  if (!(await bcrypt.compare(cur, ctx.admin.passwordHash))) return { error: "현재 비밀번호가 올바르지 않습니다." };
  const e = validatePassword(next);
  if (e) return { error: e };
  if (next !== String(fd.get("next2") ?? "")) return { error: "새 비밀번호 확인이 일치하지 않습니다." };
  await db.update(admins).set({ passwordHash: await hashPassword(next) }).where(eq(admins.id, ctx.admin.id));
  return { ok: true, message: "비밀번호를 바꿨습니다." };
}
