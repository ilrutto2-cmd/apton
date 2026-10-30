import Link from "next/link";

export function PolicySection({ t, children }: { t: string; children: React.ReactNode }) {
  return (
    <section>
      <h2 className="text-lg font-bold">{t}</h2>
      <div className="mt-1 space-y-1 text-sub">{children}</div>
    </section>
  );
}

/** 개인정보 처리방침 본문. apt가 있으면 해당 아파트(관리주체)를 처리자로 표시한다. */
export function PrivacyBody({ apt }: { apt?: { name: string; officePhone: string; address: string } }) {
  const who = apt ? `${apt.name} 관리사무소` : "각 아파트 관리사무소(관리주체)";
  const contact = apt?.officePhone ? `${who} (${apt.officePhone})` : who;
  return (
    <article className="space-y-6 text-[1rem] leading-relaxed">
      <PolicySection t="1. 개인정보 처리자">
        <p>
          입주민 연락처의 개인정보 처리자는 <b>{who}</b>입니다{apt?.address ? ` (${apt.address})` : ""}. 아파트온은 관리사무소가 공지를 보내기 위해 쓰는 도구이며, 관리사무소의 위탁을 받아 정보를 처리합니다.
        </p>
      </PolicySection>
      <PolicySection t="2. 처리 목적">
        <p>엘리베이터 점검, 물탱크 청소, 단수·정전, 소방 점검 등 공동주택 관리에 관한 안내를 문자메시지로 알리기 위해서만 처리합니다. 광고·홍보 목적으로 이용하지 않습니다.</p>
      </PolicySection>
      <PolicySection t="3. 처리하는 항목">
        <p>동·호수, 휴대전화번호, 이름 또는 별칭(선택), 문자 수신 동의 여부와 동의 방법, 발송 기록(발송 일시·결과).</p>
        <p>이 밖의 정보(주민등록번호, 생년월일, 주소 상세 등)는 수집하지 않습니다. 만 14세 미만 아동의 연락처는 등록하지 않으며, 필요한 경우 법정대리인의 연락처로 등록합니다.</p>
      </PolicySection>
      <PolicySection t="4. 수집 근거와 방법">
        <p>입주민의 동의(서면 동의서, 온라인·문자 회신, 전화 확인 등)를 받아 수집합니다. 동의를 거부할 수 있으며, 거부하면 문자 안내 대신 방송·게시판으로 안내를 받습니다. 동의가 확인되지 않은 연락처에는 문자가 발송되지 않습니다.</p>
      </PolicySection>
      <PolicySection t="5. 보유 기간">
        <p>전출하거나 동의를 철회하면 발송을 즉시 중단하고, 연락처는 지체 없이 삭제합니다. 발송 기록의 전화번호는 발송 후 1년이 지나면 자동으로 지워지고 뒷자리 4자리만 남습니다.</p>
      </PolicySection>
      <PolicySection t="6. 처리 위탁">
        <ul className="list-disc pl-5">
          <li>문자 발송: 주식회사 누리고(SOLAPI) — 문자 발송 시 전화번호와 문자 내용 전달</li>
          <li>서비스 운영: Vercel Inc.(웹 서버), Supabase Inc.(데이터베이스, 호주 시드니 리전) — 국외에 저장·처리될 수 있음</li>
        </ul>
      </PolicySection>
      <PolicySection t="7. 안전성 확보 조치">
        <p>휴대전화번호 암호화 저장(AES-256-GCM), 관리자 계정별 접근 권한 관리, 전화번호 열람·변경·삭제 기록 보관, 아파트별 데이터 분리, 암호화 통신(HTTPS)을 적용합니다.</p>
      </PolicySection>
      <PolicySection t="8. 쿠키">
        <p>관리자 로그인 유지를 위한 필수 쿠키 1개만 사용합니다. 입주민 공지 페이지에는 쿠키를 쓰지 않으며, 광고·분석용 쿠키나 외부 추적 도구를 사용하지 않습니다.</p>
      </PolicySection>
      <PolicySection t="9. 정보주체의 권리 — 수신 중단·삭제 요청">
        <p>
          입주민은 언제든지 자신의 연락처 열람·정정·삭제와 문자 수신 중단(동의 철회)을 <b>{contact}</b>에 요청할 수 있습니다. 요청을 받은 관리사무소는 본인 확인 후 지체 없이 처리합니다.
        </p>
      </PolicySection>
      <PolicySection t="10. 개인정보 보호책임자">
        <p>{contact}</p>
      </PolicySection>
      <p className="text-sm text-sub">시행일: 2026년 10월 30일</p>
    </article>
  );
}

export function ResidentFooter({ apt }: { apt: { name: string; officePhone: string; address: string; publicSlug: string } }) {
  const tel = apt.officePhone.replace(/[^0-9]/g, "");
  return (
    <footer className="mt-10 space-y-2 border-t border-line pt-5 text-sm text-sub">
      <p>
        <b className="text-ink">{apt.name} 관리사무소</b>
        {apt.address ? ` · ${apt.address}` : ""}
        {apt.officePhone && (
          <>
            {" · "}
            <a className="underline" href={`tel:${tel}`}>{apt.officePhone}</a>
          </>
        )}
      </p>
      <p>문자 수신을 그만 받거나 등록된 연락처 삭제를 원하시면 관리사무소로 연락해 주세요.</p>
      <p>
        <Link className="underline" href={`/n/${apt.publicSlug}/privacy`}>개인정보 처리방침</Link>
        {" · "}이 페이지는 쿠키·추적 도구를 사용하지 않습니다.
      </p>
    </footer>
  );
}
