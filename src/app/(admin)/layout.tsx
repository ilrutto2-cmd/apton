import Link from "next/link";
import { requireAdmin } from "@/lib/auth";
import { liveConfigured } from "@/lib/dispatch";
import { Logo } from "@/components/ui";
import { logoutAction } from "../login/actions";
import { Nav } from "./nav";

export const dynamic = "force-dynamic";

export default async function AdminLayout({ children }: { children: React.ReactNode }) {
  const { admin, apartment } = await requireAdmin();
  const testMode = apartment.smsMode !== "live";
  return (
    <div className="min-h-dvh">
      {testMode ? (
        <div className="bg-amber-400 px-4 py-2 text-center text-[0.95rem] font-semibold text-amber-950">
          🧪 테스트 모드 — 실제 문자가 발송되지 않고 요금도 들지 않습니다.{" "}
          <Link href="/settings" className="underline">
            {liveConfigured() ? "실제 발송으로 전환" : "실제 발송 설정 방법"}
          </Link>
        </div>
      ) : (
        <div className="bg-emerald-600 px-4 py-1.5 text-center text-sm font-semibold text-white">
          ● 실제 발송 모드 — 발송 시 입주민에게 문자가 전송되고 요금이 발생합니다.
        </div>
      )}
      <header className="sticky top-0 z-30 border-b border-line bg-white/95 backdrop-blur">
        <div className="mx-auto max-w-6xl px-4 pt-3">
          <div className="flex items-center justify-between gap-3">
            <Link href="/dashboard" className="flex min-w-0 items-center gap-3">
              <Logo />
              <span className="hidden h-5 w-px bg-line sm:block" />
              <span className="truncate text-[1.05rem] font-bold text-brand-700">{apartment.name}</span>
            </Link>
            <div className="flex items-center gap-1">
              <span className="hidden text-sm text-sub md:inline">
                {admin.name}님 {admin.role === "owner" ? "(관리 책임자)" : ""}
              </span>
              <form action={logoutAction}>
                <button className="btn-ghost btn-sm" type="submit">로그아웃</button>
              </form>
            </div>
          </div>
          <div className="mt-2">
            <Nav />
          </div>
        </div>
      </header>
      <main className="mx-auto max-w-6xl px-4 py-6 pb-24">{children}</main>
    </div>
  );
}
