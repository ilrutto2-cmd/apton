import Link from "next/link";
import { isFirstSetup } from "@/lib/apartment";
import { Logo } from "@/components/ui";
import { SignupForm } from "./signup-form";

export const dynamic = "force-dynamic";
export const metadata = { title: "아파트 등록" };

export default async function SignupPage() {
  const first = await isFirstSetup();
  return (
    <main className="mx-auto max-w-lg px-5 py-10">
      <div className="mb-6">
        <Link href="/login"><Logo /></Link>
      </div>
      <div className="card p-6">
        <h1 className="text-xl font-bold">아파트와 관리자 등록</h1>
        <p className="mt-1 text-sub">등록 후 동·호수와 입주민 연락처를 입력하면 바로 공지를 보낼 수 있습니다.</p>
        <div className="mt-6">
          <SignupForm needCode={!first} />
        </div>
      </div>
    </main>
  );
}
