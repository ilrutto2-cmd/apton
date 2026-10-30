import Link from "next/link";
import { and, desc, eq, gte, lt, sql } from "drizzle-orm";
import { db } from "@/db";
import { deliveries, dispatches, notices } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { getProvider, liveConfigured } from "@/lib/dispatch";
import { won, withVat } from "@/lib/sms/pricing";
import { fmtDateTime, kstParts } from "@/lib/time";

export const metadata = { title: "문자 비용" };

function monthRange(m?: string) {
  const now = kstParts(new Date());
  let y = now.year,
    mo = now.month;
  if (m && /^\d{4}-\d{2}$/.test(m)) [y, mo] = m.split("-").map(Number);
  const start = new Date(Date.UTC(y, mo - 1, 1) - 9 * 3600000);
  const end = new Date(Date.UTC(y, mo, 1) - 9 * 3600000);
  const prev = mo === 1 ? `${y - 1}-12` : `${y}-${String(mo - 1).padStart(2, "0")}`;
  const next = mo === 12 ? `${y + 1}-01` : `${y}-${String(mo + 1).padStart(2, "0")}`;
  return { start, end, label: `${y}년 ${mo}월`, prev, next, isCurrent: y === now.year && mo === now.month };
}

export default async function CostsPage({ searchParams }: { searchParams: Promise<{ m?: string }> }) {
  const { apartment } = await requireAdmin();
  const sp = await searchParams;
  const r = monthRange(sp.m);
  const base = and(eq(deliveries.apartmentId, apartment.id), gte(deliveries.createdAt, r.start), lt(deliveries.createdAt, r.end));

  const [sum] = await db
    .select({
      live: sql<number>`count(*) filter (where ${dispatches.mode} = 'live')::int`,
      liveSms: sql<number>`count(*) filter (where ${dispatches.mode} = 'live' and ${deliveries.messageType} = 'SMS')::int`,
      liveLms: sql<number>`count(*) filter (where ${dispatches.mode} = 'live' and ${deliveries.messageType} = 'LMS')::int`,
      liveFailed: sql<number>`count(*) filter (where ${dispatches.mode} = 'live' and ${deliveries.status} = 'failed')::int`,
      liveCost: sql<string>`coalesce(sum(${deliveries.cost}) filter (where ${dispatches.mode} = 'live'), 0)`,
      test: sql<number>`count(*) filter (where ${dispatches.mode} = 'test')::int`,
      testWouldCost: sql<string>`coalesce(sum(${deliveries.cost}) filter (where ${dispatches.mode} = 'test'), 0)`,
    })
    .from(deliveries)
    .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
    .where(base);

  const perNotice = await db
    .select({
      id: notices.id,
      title: notices.title,
      mode: dispatches.mode,
      sends: sql<number>`count(distinct ${dispatches.id})::int`,
      count: sql<number>`count(*)::int`,
      sms: sql<number>`count(*) filter (where ${deliveries.messageType} = 'SMS')::int`,
      lms: sql<number>`count(*) filter (where ${deliveries.messageType} = 'LMS')::int`,
      failed: sql<number>`count(*) filter (where ${deliveries.status} = 'failed')::int`,
      cost: sql<string>`coalesce(sum(${deliveries.cost}), 0)`,
      last: sql<Date>`max(${deliveries.createdAt})`,
    })
    .from(deliveries)
    .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
    .innerJoin(notices, eq(dispatches.noticeId, notices.id))
    .where(base)
    .groupBy(notices.id, notices.title, dispatches.mode)
    .orderBy(desc(sql`max(${deliveries.createdAt})`));

  const trend = await db
    .select({
      ym: sql<string>`to_char(${deliveries.createdAt} at time zone 'Asia/Seoul', 'YYYY-MM')`,
      count: sql<number>`count(*)::int`,
      cost: sql<string>`coalesce(sum(${deliveries.cost}), 0)`,
    })
    .from(deliveries)
    .innerJoin(dispatches, eq(deliveries.dispatchId, dispatches.id))
    .where(and(eq(deliveries.apartmentId, apartment.id), eq(dispatches.mode, "live"), gte(deliveries.createdAt, new Date(Date.now() - 200 * 86400000))))
    .groupBy(sql`1`)
    .orderBy(sql`1`);

  let balance: { balance: number; point: number } | null = null;
  let balanceErr: string | null = null;
  if (liveConfigured()) {
    try {
      balance = (await getProvider("live")!.balance?.()) ?? null;
    } catch (e) {
      balanceErr = (e as Error).message;
    }
  }
  const liveCost = Number(sum.liveCost);
  const maxTrend = Math.max(1, ...trend.map((t) => Number(t.cost)));
  const smsPct = sum.live ? Math.round((sum.liveSms / sum.live) * 100) : 0;

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">문자 비용</h1>
          <p className="text-sub">아파트온 자체는 무료입니다. 실제 문자를 보낼 때 문자 서비스(SOLAPI) 통신 요금만 발생합니다.</p>
        </div>
        <div className="flex items-center gap-2">
          <Link href={`/costs?m=${r.prev}`} className="btn-secondary btn-sm" aria-label="이전 달">◀</Link>
          <span className="min-w-28 text-center font-bold">{r.label}</span>
          {!r.isCurrent && <Link href={`/costs?m=${r.next}`} className="btn-secondary btn-sm" aria-label="다음 달">▶</Link>}
        </div>
      </div>

      <div className="grid grid-cols-2 gap-3 lg:grid-cols-4">
        <div className="card p-4">
          <div className="text-sm font-semibold text-sub">실제 발송 건수</div>
          <div className="mt-1 text-3xl font-extrabold">{sum.live.toLocaleString()}<span className="text-base text-sub">건</span></div>
          <div className="text-xs text-sub">실패 {sum.liveFailed}건(요금 없음)</div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold text-sub">발송 비용(추정)</div>
          <div className="mt-1 text-3xl font-extrabold text-brand-700">{won(liveCost)}</div>
          <div className="text-xs text-sub">VAT 별도 · 포함 시 {won(withVat(liveCost))}</div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold text-sub">단문 : 장문</div>
          <div className="mt-1 text-2xl font-extrabold">{sum.liveSms} : {sum.liveLms}</div>
          <div className="mt-1.5 flex h-2.5 overflow-hidden rounded-full bg-brand-100" role="img" aria-label={`SMS ${smsPct}%`}>
            <div className="bg-emerald-500" style={{ width: `${smsPct}%` }} />
          </div>
          <div className="text-xs text-sub">SMS {smsPct}% · LMS {sum.live ? 100 - smsPct : 0}%</div>
        </div>
        <div className="card p-4">
          <div className="text-sm font-semibold text-sub">테스트 발송</div>
          <div className="mt-1 text-3xl font-extrabold text-amber-600">{sum.test.toLocaleString()}<span className="text-base text-sub">건</span></div>
          <div className="text-xs text-sub">요금 0원 (실제였다면 약 {won(Number(sum.testWouldCost))})</div>
        </div>
      </div>

      <div className="grid gap-6 lg:grid-cols-[1.6fr_1fr]">
        <section className="card overflow-hidden">
          <h2 className="section-title p-5 pb-3">공지별 발송 건수·비용</h2>
          {perNotice.length === 0 ? (
            <p className="px-5 pb-6 text-sub">이 달에 보낸 문자가 없습니다.</p>
          ) : (
            <div className="overflow-x-auto">
              <table className="table-base">
                <thead>
                  <tr>
                    <th>공지</th>
                    <th className="text-right">건수</th>
                    <th>종류</th>
                    <th className="text-right">비용(VAT 별도)</th>
                  </tr>
                </thead>
                <tbody>
                  {perNotice.map((p) => (
                    <tr key={p.id + p.mode}>
                      <td>
                        <Link href={`/notices/${p.id}`} className="font-semibold hover:text-brand-600">{p.title}</Link>
                        <div className="text-xs text-sub">
                          {fmtDateTime(p.last)} · {p.sends}회 발송 {p.mode === "test" && <span className="badge ml-1 bg-amber-100 text-amber-800">테스트</span>}
                        </div>
                      </td>
                      <td className="text-right">{p.count}{p.failed ? <div className="text-xs text-red-600">실패 {p.failed}</div> : null}</td>
                      <td className="text-sm">{p.sms ? `SMS ${p.sms}` : ""} {p.lms ? `LMS ${p.lms}` : ""}</td>
                      <td className="text-right font-semibold">{p.mode === "test" ? "0원" : won(Number(p.cost))}</td>
                    </tr>
                  ))}
                </tbody>
              </table>
            </div>
          )}
        </section>

        <div className="space-y-4">
          <section className="card p-5">
            <h2 className="section-title mb-3">적용 중인 요금</h2>
            <dl className="grid grid-cols-2 gap-y-1">
              <dt className="text-sub">단문 SMS</dt>
              <dd className="text-right font-bold">{won(apartment.rateSms)}/건</dd>
              <dt className="text-sub">장문 LMS</dt>
              <dd className="text-right font-bold">{won(apartment.rateLms)}/건</dd>
            </dl>
            <p className="hint">{apartment.rateSource || "설정에서 입력한 단가"} · VAT 별도</p>
            <p className="hint">발송량에 따라 할인 단가가 적용될 수 있습니다. 정확한 청구액은 SOLAPI 콘솔을 기준으로 하세요. 실패 건은 요금에서 제외해 계산합니다.</p>
            <Link href="/settings#rates" className="btn-ghost btn-sm mt-2">단가 변경</Link>
          </section>
          <section className="card p-5">
            <h2 className="section-title mb-2">문자 서비스 잔액</h2>
            {!liveConfigured() ? (
              <p className="text-sub">실제 발송이 설정되지 않았습니다.</p>
            ) : balanceErr ? (
              <p className="text-sm text-red-600">{balanceErr}</p>
            ) : balance ? (
              <p className="text-2xl font-extrabold">{won(balance.balance)} <span className="text-sm font-normal text-sub">+ 포인트 {balance.point.toLocaleString()}</span></p>
            ) : null}
          </section>
          {trend.length > 0 && (
            <section className="card p-5">
              <h2 className="section-title mb-3">최근 월별 실제 발송 비용</h2>
              <ul className="space-y-2">
                {trend.map((t) => (
                  <li key={t.ym} className="grid grid-cols-[4.5rem_1fr_auto] items-center gap-2 text-sm">
                    <span className="text-sub">{t.ym}</span>
                    <span className="h-3 rounded-full bg-brand-500" style={{ width: `${Math.max(2, (Number(t.cost) / maxTrend) * 100)}%` }} />
                    <span className="font-semibold">{won(Number(t.cost))}</span>
                  </li>
                ))}
              </ul>
            </section>
          )}
        </div>
      </div>
    </div>
  );
}
