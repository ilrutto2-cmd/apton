import Link from "next/link";
import { PolicySection } from "@/components/policy";

export const metadata = { title: "이용약관" };

export default function TermsPage() {
  return (
    <main className="mx-auto max-w-2xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-brand-600">← 아파트온</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">아파트온 이용약관 (관리사무소용)</h1>
      <article className="space-y-6 leading-relaxed">
        <PolicySection t="1. 서비스">
          <p>아파트온은 아파트 관리사무소가 관리 공지를 입주민에게 문자메시지로 보내고, 입주민이 공지를 다시 확인할 수 있게 하는 비상업 서비스입니다. 이용료·구독료·광고는 없습니다.</p>
        </PolicySection>
        <PolicySection t="2. 비용">
          <p>실제 문자를 보낼 때 문자 발송 사업자(SOLAPI)에 통신 요금이 발생하며, 이 요금은 관리사무소가 SOLAPI에 직접 충전·결제합니다. 아파트온은 결제를 받지 않으므로 별도의 환불 정책이 없고, 문자 요금의 환불은 SOLAPI 정책을 따릅니다. 발송 전 화면에 예상 건수와 비용(VAT 별도)이 표시되며, 실제 청구액은 SOLAPI 기준입니다.</p>
        </PolicySection>
        <PolicySection t="3. 관리사무소의 책임">
          <ul className="list-disc pl-5">
            <li>입주민 연락처의 개인정보 처리자로서 수집·이용 동의 등 법적 근거를 갖추고, 처리방침을 입주민에게 알립니다.</li>
            <li>관리 목적의 정보성 안내만 보냅니다. 광고·홍보 문자는 보내지 않습니다(정보통신망법상 별도 동의·표기 의무).</li>
            <li>발신번호는 관리사무소 명의로 사전 등록된 번호만 사용합니다.</li>
            <li>관리자 계정의 비밀번호를 안전하게 관리하고, 퇴사자의 계정은 즉시 비활성화합니다.</li>
            <li>입주민의 수신 중단·삭제 요청을 받으면 지체 없이 처리합니다.</li>
          </ul>
        </PolicySection>
        <PolicySection t="4. 서비스의 한계">
          <p>문자는 통신사 사정이나 수신 기기 상태에 따라 늦거나 전달되지 않을 수 있습니다. 화재·재난 등 생명·안전에 관한 긴급 상황은 문자에만 의존하지 말고 방송·직접 안내 등을 함께 사용해야 합니다.</p>
        </PolicySection>
        <PolicySection t="5. 이용 제한">
          <p>광고성 문자 발송, 동의 없는 연락처 등록, 다른 아파트 정보 접근 시도 등 부정한 이용이 확인되면 계정 이용이 제한될 수 있습니다.</p>
        </PolicySection>
        <p className="text-sm text-sub">시행일: 2026년 10월 30일</p>
      </article>
    </main>
  );
}
