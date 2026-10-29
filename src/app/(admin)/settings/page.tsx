import Link from "next/link";
import { asc, eq } from "drizzle-orm";
import { db } from "@/db";
import { admins } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { appUrl, liveConfigured } from "@/lib/dispatch";
import { PUBLISHED_RATES } from "@/lib/sms/pricing";
import { TEST_FAIL_SUFFIX } from "@/lib/sms/mock";
import { fmtDateTime } from "@/lib/time";
import { AdminList, BalanceCheck, PasswordForm, SmsSettingsForm, StaffForm, LiveTestForm } from "./forms";

export const metadata = { title: "설정" };

export default async function SettingsPage() {
  const { apartment, admin } = await requireAdmin();
  const isOwner = admin.role === "owner";
  const list = await db
    .select({ id: admins.id, name: admins.name, email: admins.email, role: admins.role, active: admins.active, lastLoginAt: admins.lastLoginAt })
    .from(admins)
    .where(eq(admins.apartmentId, apartment.id))
    .orderBy(asc(admins.createdAt));
  const live = liveConfigured();

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">설정</h1>
          <p className="text-sub">문자 발송 방식, 요금, 관리자 계정을 관리합니다.</p>
        </div>
        <Link href="/settings/history" className="btn-secondary">📜 변경·발송 이력 보기</Link>
      </div>

      <section className="card p-5" id="sms">
        <h2 className="section-title">문자 발송 설정</h2>
        <div className="mt-3 grid gap-3 rounded-xl bg-slate-50 p-4 text-[0.95rem] md:grid-cols-2">
          <div>
            <div className="font-semibold">문자 서비스 연결 (SOLAPI)</div>
            {live ? <span className="badge mt-1 bg-emerald-50 text-emerald-700">● API 키 설정됨</span> : <span className="badge mt-1 bg-slate-200 text-slate-700">API 키 없음 — 테스트 모드만 가능</span>}
          </div>
          <div className="text-sub">
            {live ? (
              <BalanceCheck disabled={!isOwner} />
            ) : (
              <>
                실제 발송을 하려면 서버 관리자가 SOLAPI 가입 → API 키 발급 → 발신번호 등록 후 서버 환경변수 <code className="rounded bg-white px-1">SOLAPI_API_KEY</code>, <code className="rounded bg-white px-1">SOLAPI_API_SECRET</code>를 설정해야 합니다. 자세한 방법은 사용 설명서를 참고하세요.
              </>
            )}
          </div>
        </div>
        <div className="mt-4">
          <SmsSettingsForm
            canEdit={isOwner}
            liveAvailable={live}
            initial={{
              smsMode: apartment.smsMode,
              senderNumber: apartment.senderNumber,
              rateSms: Number(apartment.rateSms),
              rateLms: Number(apartment.rateLms),
              rateSource: apartment.rateSource,
              dailySendLimit: apartment.dailySendLimit,
              includeLinkDefault: apartment.includeLinkDefault,
            }}
            published={PUBLISHED_RATES}
            rateUpdatedAt={fmtDateTime(apartment.rateUpdatedAt)}
          />
        </div>
        <div className="mt-4 rounded-xl border border-amber-200 bg-amber-50 p-4 text-[0.95rem] text-amber-900">
          <b>테스트 모드 안내</b> — 실제로는 아무 문자도 나가지 않고, 실제 서비스와 같은 순서(접수 → 처리 중 → 수신 완료)로 결과가 기록됩니다. 실패 처리 화면을 확인할 수 있도록 끝자리가 <b>{TEST_FAIL_SUFFIX}</b>인 번호는 &lsquo;발송 실패&rsquo;로 처리됩니다.
        </div>
        {live && isOwner && apartment.senderNumber && (
          <div className="mt-4">
            <LiveTestForm />
          </div>
        )}
      </section>

      <section className="card p-5">
        <h2 className="section-title mb-3">관리자 계정</h2>
        <AdminList list={list.map((a) => ({ ...a, lastLoginAt: a.lastLoginAt ? fmtDateTime(a.lastLoginAt) : null }))} me={admin.id} isOwner={isOwner} />
        {isOwner && (
          <details className="mt-4 rounded-xl bg-slate-50 p-4">
            <summary className="cursor-pointer font-semibold">＋ 직원 계정 추가</summary>
            <div className="mt-3"><StaffForm /></div>
          </details>
        )}
        <details className="mt-3 rounded-xl bg-slate-50 p-4">
          <summary className="cursor-pointer font-semibold">내 비밀번호 바꾸기</summary>
          <div className="mt-3"><PasswordForm /></div>
        </details>
      </section>

      <section className="card space-y-2 p-5 text-[0.95rem]">
        <h2 className="section-title">개인정보·법령 안내</h2>
        <ul className="list-disc space-y-1 pl-5 text-sub">
          <li>입주민 전화번호는 암호화(AES-256-GCM)해 저장하고, 화면에는 뒷자리만 표시합니다. 전체 번호 열람·수정·삭제는 모두 이력에 남습니다.</li>
          <li>아파트별로 데이터가 분리되어 다른 아파트 관리자는 이 아파트의 연락처와 공지를 볼 수 없습니다.</li>
          <li>관리사무소(관리주체)가 개인정보 처리자입니다. 연락처 수집·이용 동의 등 개인정보 보호법상 근거를 갖추고, 처리방침을 입주민에게 공개해야 합니다.</li>
          <li>아파트온은 관리 목적의 <b>정보성 안내</b>만 보냅니다. 광고성 문자는 정보통신망법상 사전 동의, (광고) 표기, 무료 수신거부 등이 필요하므로 보내지 마세요.</li>
          <li>전출 세대 연락처는 &lsquo;전출 처리&rsquo;로 발송을 막고, 보관 필요가 없어지면 삭제하세요.</li>
        </ul>
        <Link href="/privacy" className="btn-ghost btn-sm" target="_blank">개인정보 처리방침 예시 보기 ↗</Link>
        <p className="text-xs text-sub">입주민 공지 페이지 주소: {appUrl()}/n/{apartment.publicSlug}</p>
      </section>
    </div>
  );
}
