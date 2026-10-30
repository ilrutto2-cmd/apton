import Link from "next/link";
import { PrivacyBody } from "@/components/policy";

export const metadata = { title: "개인정보 처리방침" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-brand-600">← 아파트온</Link>
      <h1 className="mt-2 text-2xl font-bold">개인정보 처리방침</h1>
      <p className="mt-2 mb-6 text-sub">
        아파트온으로 문자 알림을 받는 입주민 연락처의 처리 방침입니다. 각 아파트의 입주민 공지 페이지 아래에 해당 아파트 관리사무소 이름이 들어간 처리방침이 따로 있습니다.
      </p>
      <PrivacyBody />
    </main>
  );
}
