"use server";

import { redirect } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, createSession, hashPassword, login, logout, validatePassword } from "@/lib/auth";
import { createApartmentWithOwner, isFirstSetup } from "@/lib/apartment";

export type FormState = { error?: string } | undefined;

export async function loginAction(_: FormState, fd: FormData): Promise<FormState> {
  const email = String(fd.get("email") ?? "");
  const password = String(fd.get("password") ?? "");
  if (!email || !password) return { error: "이메일과 비밀번호를 입력해 주세요." };
  const r = await login(email, password);
  if (!r.ok) return { error: r.error };
  const [a] = await db.select().from(admins).where(eq(admins.email, email.trim().toLowerCase()));
  if (a) await audit({ apartmentId: a.apartmentId, adminId: a.id, adminName: a.name }, "auth.login", { ip: await clientIp() });
  redirect("/dashboard");
}

export async function logoutAction() {
  await logout();
  redirect("/login");
}

export async function signupAction(_: FormState, fd: FormData): Promise<FormState> {
  const get = (k: string) => String(fd.get(k) ?? "").trim();
  const first = await isFirstSetup();
  const code = process.env.ADMIN_SIGNUP_CODE;
  if (!first) {
    if (!code) return { error: "새 관리자 가입이 닫혀 있습니다. 서버 관리자에게 가입 코드 설정을 요청하세요." };
    if (get("code") !== code) return { error: "가입 코드가 올바르지 않습니다." };
  }
  const aptName = get("aptName");
  const ownerName = get("ownerName");
  const email = get("email").toLowerCase();
  const password = String(fd.get("password") ?? "");
  if (!aptName) return { error: "아파트 이름을 입력해 주세요." };
  if (!ownerName) return { error: "관리자 이름을 입력해 주세요." };
  if (!/^[^\s@]+@[^\s@]+\.[^\s@]+$/.test(email)) return { error: "이메일 형식이 올바르지 않습니다." };
  const pwErr = validatePassword(password);
  if (pwErr) return { error: pwErr };
  if (password !== String(fd.get("password2") ?? "")) return { error: "비밀번호 확인이 일치하지 않습니다." };
  if (fd.get("agree") !== "on") return { error: "개인정보 처리 책임 안내에 동의해 주세요." };
  const [dup] = await db.select({ id: admins.id }).from(admins).where(eq(admins.email, email));
  if (dup) return { error: "이미 가입된 이메일입니다." };

  const { apt, admin } = await createApartmentWithOwner({
    aptName,
    address: get("address"),
    officePhone: get("officePhone"),
    ownerName,
    email,
    passwordHash: await hashPassword(password),
  });
  await audit({ apartmentId: apt.id, adminId: admin.id, adminName: admin.name }, "auth.signup", { ip: await clientIp() });
  await createSession(admin.id);
  redirect("/apartment?welcome=1");
}
