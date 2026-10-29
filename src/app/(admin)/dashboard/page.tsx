import Link from "next/link";
import { and, count, desc, eq, gte, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildings, contacts, deliveries, dispatches, notices } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { categoryOf } from "@/lib/notice-templates";
import { NOTICE_STATUS } from "@/lib/status";
import { fmtDateTime, startOfKstMonth } from "@/lib/time";

export const metadata = { title: "홈" };

export default async function Dashboard() {
  const { apartment, admin } = await requireAdmin();
  const aptId = apartment.id;
  const month = startOfKstMonth();

  const [[b], [c], [m], [sch], recent] = await Promise.all([
    db.select({ n: count() }).from(buildings).where(eq(buildings.apartmentId, aptId)),
    db
      .select({
        sendable: sql<number>`count(*) filter (where ${contacts.active} and ${contacts.consentStatus} = 'agreed' and not ${contacts.isSample})::int`,
        sample: sql<number>`count(*) filter (where ${contacts.active} and ${contacts.consentStatus} = 'agreed' and ${contacts.isSample})::int`,
        total: count(),
      })
      .from(contacts)
      .where(eq(contacts.apartmentId, aptId)),
    db
      .select({
        live: sql<number>`count(*) filter (where ${dispatches.mode} = 'live')::int`,
        test: sql<number>`count(*) filter (where ${dispatches.mode} = 'test')::int`,
        failed: sql<number>`count(*) filter (where ${deliveries.status} in ('failed','unknown') and ${dispatches.mode} = ${apartment.smsMode})::int`,
      })
      .from(deliveries)
      .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
      .where(and(eq(deliveries.apartmentId, aptId), gte(deliveries.createdAt, month))),
    db
      .select({ n: sql<number>`count(distinct ${dispatches.noticeId})::int`, next: sql<Date | null>`min(${dispatches.scheduledAt})` })
      .from(dispatches)
      .where(and(eq(dispatches.apartmentId, aptId), eq(dispatches.status, "scheduled"))),
    db.select().from(notices).where(eq(notices.apartmentId, aptId)).orderBy(desc(notices.createdAt)).limit(6),
  ]);
  const live = apartment.smsMode === "live";
  const needsSetup = b.n === 0 || c.total === 0;

  return (
    <div className="space-y-6">
      <div>
        <p className="text-sub">안녕하세요, {admin.name}님</p>
        <h1 className="text-2xl font-bold">{apartment.name} 공지 보내기</h1>
      </div>

      <div className="grid gap-3 sm:grid-cols-[2fr_1fr]">
        <Link href="/notices/new" className="group flex min-h-28 items-center justify-between gap-4 rounded-2xl bg-brand-500 p-6 text-white shadow-sm transition hover:bg-brand-600">
          <span>
            <span className="block text-2xl font-extrabold sm:text-3xl">＋ 새 공지 작성</span>
            <span className="mt-1 block text-brand-100">점검·단수·정전 안내를 문자로 보내요</span>
          </span>
          <span className="text-4xl transition group-hover:translate-x-1" aria-hidden>→</span>
        </Link>
        <Link href="/notices/new?emergency=1" className="flex min-h-28 flex-col justify-center rounded-2xl border-2 border-red-200 bg-white p-5 text-red-600 transition hover:bg-red-50">
          <span className="text-xl font-extrabold">🚨 긴급 공지 발송</span>
          <span className="mt-1 text-sm text-red-500">단수·정전 등 바로 알려야 할 때</span>
        </Link>
      </div>

      {needsSetup && (
        <div className="card border-brand-200 bg-brand-50/50 p-5">
          <h2 className="section-title">처음 시작하기</h2>
          <ol className="mt-3 space-y-2">
            <SetupStep done={b.n > 0} href="/apartment" text="동·호수 만들기" />
            <SetupStep done={c.total > 0} href="/residents" text="입주민 연락처 등록 (한 명씩 또는 엑셀로 한 번에)" />
            <SetupStep done={false} href="/notices/new" text="테스트 모드로 첫 공지 보내 보기" />
            <SetupStep done={live} href="/settings" text="실제 발송 설정 (문자 서비스 키·발신번호)" />
          </ol>
        </div>
      )}

      <section aria-label="핵심 현황" className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <StatCard label="문자 받는 입주민" value={c.sendable} unit="명" href="/residents?s=sendable" hint={!live && c.sample ? `+ 샘플 ${c.sample}명(테스트 전용)` : "수신 동의 확인된 번호"} />
        <StatCard
          label="이번 달 발송"
          value={live ? m.live : m.test}
          unit="건"
          href="/costs"
          hint={live ? (m.test ? `테스트 ${m.test}건 별도` : "실제 발송") : `테스트 발송 · 실제 ${m.live}건`}
        />
        <StatCard label="예약된 공지" value={sch.n} unit="건" href="/notices?s=scheduled" hint={sch.next ? `다음 ${fmtDateTime(sch.next)}` : "예약 없음"} />
        <StatCard label="이번 달 발송 실패" value={m.failed} unit="건" href="/notices?s=partial" hint="실패·결과 확인 불가" tone={m.failed ? "red" : undefined} />
      </section>

      <section className="card overflow-hidden">
        <div className="flex items-center justify-between p-5 pb-3">
          <h2 className="section-title">최근 공지</h2>
          <Link href="/notices" className="text-sm font-semibold text-brand-600">전체 보기 →</Link>
        </div>
        {recent.length === 0 ? (
          <p className="px-5 pb-6 text-sub">아직 보낸 공지가 없습니다.</p>
        ) : (
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>공지 제목</th>
                  <th>대상</th>
                  <th>작성일</th>
                  <th>상태</th>
                </tr>
              </thead>
              <tbody>
                {recent.map((r) => (
                  <tr key={r.id} className="hover:bg-slate-50">
                    <td>
                      <Link href={`/notices/${r.id}`} className="font-semibold text-ink hover:text-brand-600">
                        <span aria-hidden>{categoryOf(r.category).icon} </span>
                        {r.title}
                      </Link>
                    </td>
                    <td className="text-sub">{r.targetLabel}</td>
                    <td className="whitespace-nowrap text-sm text-sub">{fmtDateTime(r.createdAt)}</td>
                    <td><span className={`badge ${NOTICE_STATUS[r.status]?.cls}`}>{NOTICE_STATUS[r.status]?.label}</span></td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )}
      </section>

      <p className="text-center text-sm text-sub">
        입주민 공지 페이지:{" "}
        <a className="font-semibold text-brand-600 underline" href={`/n/${apartment.publicSlug}`} target="_blank">
          /n/{apartment.publicSlug}
        </a>{" "}
        (단지 공지만 공개)
      </p>
    </div>
  );
}

function SetupStep({ done, href, text }: { done: boolean; href: string; text: string }) {
  return (
    <li>
      <Link href={href} className="flex items-center gap-3 rounded-xl bg-white px-4 py-3 hover:bg-brand-50">
        <span className={`grid h-7 w-7 place-items-center rounded-full text-sm font-bold ${done ? "bg-emerald-500 text-white" : "border-2 border-brand-200 text-brand-600"}`}>{done ? "✓" : ""}</span>
        <span className={done ? "text-sub line-through" : "font-semibold"}>{text}</span>
      </Link>
    </li>
  );
}

function StatCard({ label, value, unit, hint, href, tone }: { label: string; value: number; unit: string; hint?: string; href: string; tone?: "red" }) {
  return (
    <Link href={href} className="card block p-4 transition hover:border-brand-200">
      <div className="text-sm font-semibold text-sub">{label}</div>
      <div className={`mt-1 text-3xl font-extrabold ${tone === "red" ? "text-red-600" : "text-ink"}`}>
        {value.toLocaleString()}
        <span className="ml-0.5 text-base font-semibold text-sub">{unit}</span>
      </div>
      {hint && <div className="mt-0.5 text-xs text-sub">{hint}</div>}
    </Link>
  );
}
