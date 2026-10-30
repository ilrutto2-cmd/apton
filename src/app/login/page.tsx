import Link from "next/link";
import { redirect } from "next/navigation";
import { getAdminContext } from "@/lib/auth";
import { isFirstSetup } from "@/lib/apartment";
import { Logo } from "@/components/ui";
import { LoginForm } from "./login-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "로그인" };

export default async function LoginPage() {
  if (await getAdminContext()) redirect("/dashboard");
  const first = await isFirstSetup();
  return (
    <main className="mx-auto flex min-h-dvh max-w-md flex-col justify-center px-5 py-10">
      <div className="mb-8 text-center">
        <Logo size="lg" />
        <p className="mt-3 text-sub">관리사무소는 한 번 알리고, 주민은 어디서든 확인합니다.</p>
      </div>
      {first ? (
        <div className="card p-6 text-center">
          <p className="text-lg font-bold">처음 오셨네요!</p>
          <p className="mt-2 text-sub">아파트와 관리자 계정을 먼저 등록해 주세요.</p>
          <Link href="/signup" className="btn-primary mt-5 w-full">
            시작하기
          </Link>
        </div>
      ) : (
        <div className="card p-6">
          <h1 className="mb-5 text-xl font-bold">관리자 로그인</h1>
          <LoginForm />
          <p className="mt-5 text-center text-sm text-sub">
            새 아파트를 등록하려면 <Link href="/signup" className="font-semibold text-brand-600 underline">관리자 가입</Link>
          </p>
        </div>
      )}
      <p className="mt-6 text-center text-sm text-sub">
        입주민이신가요? 문자에 있는 링크로 공지를 확인하세요. 별도 가입이 필요 없습니다.
      </p>
      <p className="mt-3 text-center text-sm text-sub">
        <Link href="/terms" className="underline">이용약관</Link> · <Link href="/privacy" className="underline">개인정보 처리방침</Link> · 비상업 서비스(이용료 없음)
      </p>
    </main>
  );
}
