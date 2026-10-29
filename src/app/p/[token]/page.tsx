import { notFound } from "next/navigation";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { apartments, deliveries, dispatches, notices } from "@/db/schema";
import { NoticeView } from "@/components/notice-view";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false }, referrer: "no-referrer" };

const VALID_DAYS = 90;

/** 세대별(비공개) 안내 — 문자를 받은 사람의 개인 링크로만 열람 */
export default async function PrivateNotice({ params }: { params: Promise<{ token: string }> }) {
  const { token } = await params;
  if (!/^[A-Za-z0-9_-]{20,64}$/.test(token)) notFound();
  const [row] = await db
    .select({ n: notices, apt: apartments, d: deliveries, dispatchStartedAt: dispatches.startedAt })
    .from(deliveries)
    .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
    .innerJoin(notices, eq(dispatches.noticeId, notices.id))
    .innerJoin(apartments, eq(notices.apartmentId, apartments.id))
    .where(eq(deliveries.viewToken, token));
  if (!row) notFound();
  const expired = Date.now() - row.d.createdAt.getTime() > VALID_DAYS * 86400000;
  return (
    <main className="mx-auto max-w-xl px-4 pt-5 pb-16">
      <p className="mb-3 text-sm text-sub">🔒 {row.d.unitLabel} 세대에 보낸 개별 안내입니다. 이 링크를 다른 사람에게 공유하지 마세요.</p>
      {expired ? (
        <div className="card p-6 text-center">
          <p className="font-bold">열람 기간({VALID_DAYS}일)이 지난 안내입니다.</p>
          <p className="mt-1 text-sub">내용이 필요하면 관리사무소{row.apt.officePhone ? `(${row.apt.officePhone})` : ""}로 문의해 주세요.</p>
        </div>
      ) : (
        <NoticeView aptName={row.apt.name} officePhone={row.apt.officePhone} n={row.n} sentAt={row.dispatchStartedAt} />
      )}
    </main>
  );
}
