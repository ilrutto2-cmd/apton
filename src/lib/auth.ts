import { cookies, headers } from "next/headers";
import { redirect } from "next/navigation";
import bcrypt from "bcryptjs";
import { and, eq, gt, lt } from "drizzle-orm";
import { db } from "@/db";
import { admins, apartments, sessions, type Admin, type Apartment } from "@/db/schema";
import { randomToken, sha256 } from "./crypto";

export const SESSION_COOKIE = "apton_session";
const SESSION_HOURS = 12;
const MAX_FAILED = 5;
const LOCK_MINUTES = 15;

export type AdminContext = { admin: Admin; apartment: Apartment };
let dummyHash: string | undefined;

export async function hashPassword(pw: string) {
  return bcrypt.hash(pw, 12);
}

export function validatePassword(pw: string): string | null {
  if (pw.length < 10) return "비밀번호는 10자 이상이어야 합니다.";
  if (!/[A-Za-z]/.test(pw) || !/\d/.test(pw)) return "비밀번호에 영문과 숫자를 모두 포함해 주세요.";
  return null;
}

export async function clientIp(): Promise<string> {
  const h = await headers();
  return (h.get("x-forwarded-for")?.split(",")[0] ?? h.get("x-real-ip") ?? "").trim();
}

export type LoginResult = { ok: true } | { ok: false; error: string };

export async function login(emailRaw: string, password: string): Promise<LoginResult> {
  const email = emailRaw.trim().toLowerCase();
  const [admin] = await db.select().from(admins).where(eq(admins.email, email)).limit(1);
  const generic = "이메일 또는 비밀번호가 올바르지 않습니다.";
  if (!admin || !admin.active) {
    dummyHash ??= await bcrypt.hash("timing-equalizer", 12);
    await bcrypt.compare(password, dummyHash); // 계정 존재 여부가 응답 시간으로 드러나지 않도록
    return { ok: false, error: generic };
  }
  if (admin.lockedUntil && admin.lockedUntil > new Date()) {
    return { ok: false, error: `로그인 시도가 너무 많아 잠시 잠겼습니다. ${LOCK_MINUTES}분 후 다시 시도해 주세요.` };
  }
  const ok = await bcrypt.compare(password, admin.passwordHash);
  if (!ok) {
    const failed = admin.failedLoginCount + 1;
    await db
      .update(admins)
      .set({
        failedLoginCount: failed >= MAX_FAILED ? 0 : failed,
        lockedUntil: failed >= MAX_FAILED ? new Date(Date.now() + LOCK_MINUTES * 60000) : null,
      })
      .where(eq(admins.id, admin.id));
    return { ok: false, error: generic };
  }
  await db
    .update(admins)
    .set({ failedLoginCount: 0, lockedUntil: null, lastLoginAt: new Date() })
    .where(eq(admins.id, admin.id));
  await createSession(admin.id);
  return { ok: true };
}

export async function createSession(adminId: string) {
  const token = randomToken(32);
  const h = await headers();
  await db.delete(sessions).where(lt(sessions.expiresAt, new Date()));
  await db.insert(sessions).values({
    tokenHash: sha256(token),
    adminId,
    expiresAt: new Date(Date.now() + SESSION_HOURS * 3600000),
    ip: await clientIp(),
    userAgent: h.get("user-agent")?.slice(0, 300) ?? null,
  });
  const jar = await cookies();
  jar.set(SESSION_COOKIE, token, {
    httpOnly: true,
    sameSite: "lax",
    secure: process.env.NODE_ENV === "production" && !process.env.APP_URL?.startsWith("http://"),
    path: "/",
    maxAge: SESSION_HOURS * 3600,
  });
}

export async function logout() {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (token) await db.delete(sessions).where(eq(sessions.tokenHash, sha256(token)));
  jar.delete(SESSION_COOKIE);
}

export async function getAdminContext(): Promise<AdminContext | null> {
  const jar = await cookies();
  const token = jar.get(SESSION_COOKIE)?.value;
  if (!token) return null;
  const rows = await db
    .select({ admin: admins, apartment: apartments })
    .from(sessions)
    .innerJoin(admins, eq(sessions.adminId, admins.id))
    .innerJoin(apartments, eq(admins.apartmentId, apartments.id))
    .where(and(eq(sessions.tokenHash, sha256(token)), gt(sessions.expiresAt, new Date())))
    .limit(1);
  const row = rows[0];
  if (!row || !row.admin.active) return null;
  return row;
}

/** 관리자 페이지·서버 액션 진입점. 로그인하지 않았으면 로그인 화면으로 보낸다. */
export async function requireAdmin(): Promise<AdminContext> {
  const ctx = await getAdminContext();
  if (!ctx) redirect("/login");
  return ctx;
}

export async function requireOwner(): Promise<AdminContext> {
  const ctx = await requireAdmin();
  if (ctx.admin.role !== "owner") throw new Error("관리 책임자만 할 수 있는 작업입니다.");
  return ctx;
}
