import Link from "next/link";
import { and, count, desc, eq, ilike, inArray, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { dispatches, notices } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { categoryOf } from "@/lib/notice-templates";
import { NOTICE_STATUS } from "@/lib/status";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "공지 내역" };
const PAGE = 30;

export default async function NoticesPage({ searchParams }: { searchParams: Promise<{ q?: string; s?: string; page?: string }> }) {
  const { apartment } = await requireAdmin();
  const sp = await searchParams;
  const q = (sp.q ?? "").trim();
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const conds: (SQL | undefined)[] = [eq(notices.apartmentId, apartment.id)];
  if (q) conds.push(or(ilike(notices.title, `%${q}%`), ilike(notices.smsText, `%${q}%`), ilike(notices.targetLabel, `%${q}%`)));
  if (sp.s && NOTICE_STATUS[sp.s]) conds.push(eq(notices.status, sp.s));
  const where = and(...conds);
  const [{ n: total }] = await db.select({ n: count() }).from(notices).where(where);
  const rows = await db.select().from(notices).where(where).orderBy(desc(notices.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  const ids = rows.map((r) => r.id);
  const ds = ids.length
    ? await db
        .select({
          noticeId: dispatches.noticeId,
          first: sql<Date>`min(coalesce(${dispatches.startedAt}, ${dispatches.scheduledAt}))`,
          next: sql<Date | null>`min(${dispatches.scheduledAt}) filter (where ${dispatches.status} = 'scheduled')`,
          live: sql<boolean>`bool_or(${dispatches.mode} = 'live')`,
          recipients: sql<number>`coalesce(max(${dispatches.recipientCount}), 0)::int`,
        })
        .from(dispatches)
        .where(and(inArray(dispatches.noticeId, ids), sql`${dispatches.status} <> 'canceled'`))
        .groupBy(dispatches.noticeId)
    : [];
  const dm = new Map(ds.map((d) => [d.noticeId, d]));

  return (
    <div className="space-y-5">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">공지 내역</h1>
          <p className="text-sub">보낸 공지, 예약된 공지, 임시 저장한 공지를 확인합니다.</p>
        </div>
        <Link href="/notices/new" className="btn-primary">＋ 새 공지 작성</Link>
      </div>
      <form className="card flex flex-col gap-2 p-4 md:flex-row" action="/notices">
        <input name="q" defaultValue={q} className="input" placeholder="제목·내용·대상으로 찾기 (예: 엘리베이터, 101동)" aria-label="검색어" />
        <select name="s" defaultValue={sp.s ?? ""} className="input md:w-44" aria-label="상태">
          <option value="">모든 상태</option>
          {Object.entries(NOTICE_STATUS).map(([k, v]) => (
            <option key={k} value={k}>{v.label}</option>
          ))}
        </select>
        <button type="submit" className="btn-primary shrink-0">찾기</button>
      </form>

      {rows.length === 0 ? (
        <div className="card p-10 text-center text-sub">{q || sp.s ? "조건에 맞는 공지가 없습니다." : "아직 작성한 공지가 없습니다."}</div>
      ) : (
        <ul className="space-y-2">
          {rows.map((r) => {
            const d = dm.get(r.id);
            const st = NOTICE_STATUS[r.status];
            const c = categoryOf(r.category);
            return (
              <li key={r.id}>
                <Link href={`/notices/${r.id}`} className="card flex flex-col gap-1 p-4 transition hover:border-brand-200 hover:bg-brand-50/30 sm:flex-row sm:items-center sm:justify-between">
                  <div className="min-w-0">
                    <div className="flex flex-wrap items-center gap-2">
                      <span aria-hidden>{c.icon}</span>
                      <span className="truncate font-bold">{r.title}</span>
                      {r.isEmergency && <span className="badge bg-red-600 text-white">긴급</span>}
                    </div>
                    <div className="text-sm text-sub">
                      대상 {r.targetLabel}
                      {d?.recipients ? ` · ${d.recipients}명` : ""}
                      {d ? (d.live ? " · 실제 발송" : " · 테스트") : ""}
                    </div>
                  </div>
                  <div className="flex shrink-0 items-center gap-3 text-sm">
                    <span className="text-sub">
                      {r.status === "scheduled" && d?.next ? `예약 ${fmtDateTime(d.next)}` : d?.first ? fmtDateTime(d.first) : fmtDateTime(r.createdAt)}
                    </span>
                    <span className={`badge ${st?.cls}`}>{st?.label}</span>
                  </div>
                </Link>
              </li>
            );
          })}
        </ul>
      )}
      <div className="flex items-center justify-between text-sm text-sub">
        <span>총 {total}건</span>
        <span className="flex gap-2">
          {page > 1 && <Link className="btn-secondary btn-sm" href={`/notices?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.s ? { s: sp.s } : {}), page: String(page - 1) })}`}>이전</Link>}
          {page * PAGE < total && <Link className="btn-secondary btn-sm" href={`/notices?${new URLSearchParams({ ...(q ? { q } : {}), ...(sp.s ? { s: sp.s } : {}), page: String(page + 1) })}`}>다음</Link>}
        </span>
      </div>
    </div>
  );
}
