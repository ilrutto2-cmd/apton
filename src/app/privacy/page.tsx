import Link from "next/link";

export const metadata = { title: "개인정보 처리 안내(예시)" };

export default function PrivacyPage() {
  return (
    <main className="mx-auto max-w-3xl px-5 py-10">
      <Link href="/" className="text-sm font-semibold text-brand-600">← 아파트온</Link>
      <h1 className="mt-2 text-2xl font-bold">입주민 연락처 개인정보 처리 안내 (예시)</h1>
      <div className="mt-3 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[0.95rem] text-amber-900">
        이 문서는 관리사무소가 자체 처리방침을 만들 때 참고할 <b>예시</b>입니다. 법률 자문이 아니며, 단지 사정에 맞게 고치고 필요하면 전문가 검토를 받으세요.
        개인정보 처리자는 아파트온 운영자가 아니라 각 아파트 관리주체(관리사무소)입니다.
      </div>
      <article className="prose mt-6 space-y-5 text-[1rem] leading-relaxed">
        <Sec t="1. 처리 목적">
          엘리베이터 점검, 물탱크 청소, 단수·정전, 소방 점검 등 공동주택 관리에 관한 안내를 문자메시지로 알리기 위해 처리합니다. 광고·홍보 목적으로 이용하지 않습니다.
        </Sec>
        <Sec t="2. 처리 항목">동·호수, 휴대전화번호, 이름 또는 별칭(선택), 문자 수신 동의 여부와 동의 방법, 발송 기록(발송 일시·결과).</Sec>
        <Sec t="3. 수집 근거와 방법">
          입주민의 동의(서면 동의서, 온라인·문자 회신, 전화 확인 등)를 받아 수집합니다. 동의를 거부할 수 있으며, 거부하면 문자 안내 대신 방송·게시판으로 안내를 받습니다.
        </Sec>
        <Sec t="4. 보유 기간">전출하거나 동의를 철회할 때까지 보유하며, 이후 지체 없이 삭제합니다. 발송 기록은 분쟁 대응을 위해 최대 1년 보관 후 삭제합니다(단지 사정에 맞게 정하세요).</Sec>
        <Sec t="5. 처리 위탁">
          문자 발송을 위해 문자 발송 서비스 사업자(예: 주식회사 누리고 &lsquo;SOLAPI&rsquo;)와 서비스 운영(서버·데이터베이스) 사업자에게 처리를 위탁합니다. 실제 이용 업체명을 적으세요.
        </Sec>
        <Sec t="6. 안전성 확보 조치">휴대전화번호 암호화 저장, 관리자 계정별 접근 권한 관리, 접속·열람·변경 기록 보관, 단지별 데이터 분리, 암호화 통신(HTTPS)을 적용합니다.</Sec>
        <Sec t="7. 정보주체의 권리">입주민은 언제든지 자신의 연락처 열람·정정·삭제와 문자 수신 동의 철회를 관리사무소에 요청할 수 있습니다.</Sec>
        <Sec t="8. 개인정보 보호책임자">관리사무소장 ○○○ / 연락처 ○○○-○○○○</Sec>
      </article>
    </main>
  );
}

function Sec({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{t}</h2>
      <p className="mt-1 text-sub">{children}</p>
    </section>
  );
}
