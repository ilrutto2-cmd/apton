import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { admins, deliveries, dispatches, notices } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { deliveryCounts, publicNoticeUrl } from "@/lib/dispatch";
import { categoryOf } from "@/lib/notice-templates";
import { won, withVat } from "@/lib/sms/pricing";
import { DELIVERY_STATUS, DISPATCH_STATUS, NOTICE_STATUS } from "@/lib/status";
import { fmtDateTime, fmtSchedule } from "@/lib/time";
import { Alert } from "@/components/ui";
import { AutoRefresh, CancelButton, DeleteDraftButton, RefreshButton, ResendButtons } from "./client";

export const metadata = { title: "공지 상세" };

export default async function NoticeDetail({ params, searchParams }: { params: Promise<{ id: string }>; searchParams: Promise<{ created?: string; saved?: string; d?: string; st?: string }> }) {
  const { apartment } = await requireAdmin();
  const { id } = await params;
  const sp = await searchParams;
  if (!/^[0-9a-f-]{36}$/.test(id)) notFound();
  const [n] = await db.select().from(notices).where(and(eq(notices.id, id), eq(notices.apartmentId, apartment.id)));
  if (!n) notFound();
  const [author] = n.createdBy ? await db.select({ name: admins.name }).from(admins).where(eq(admins.id, n.createdBy)) : [];
  const ds = await db.select().from(dispatches).where(eq(dispatches.noticeId, n.id)).orderBy(asc(dispatches.scheduledAt), asc(dispatches.createdAt));
  const counts = await deliveryCounts(ds.map((d) => d.id));
  const selected = ds.find((d) => d.id === sp.d) ?? ds.find((d) => d.status !== "scheduled" && d.status !== "canceled") ?? null;
  const delRows = selected
    ? await db
        .select()
        .from(deliveries)
        .where(and(eq(deliveries.dispatchId, selected.id), sp.st ? eq(deliveries.status, sp.st) : undefined))
        .orderBy(desc(deliveries.status), asc(deliveries.unitLabel))
        .limit(1000)
    : [];
  const inFlight = ds.some((d) => d.status === "sending") || [...counts.values()].some((c) => (c.requested ?? 0) + (c.processing ?? 0) + (c.sending ?? 0) + (c.pending ?? 0) > 0);
  const editable = (n.status === "draft" || n.status === "scheduled") && ds.every((d) => d.status === "scheduled" || d.status === "canceled");
  const sch = fmtSchedule(n.startsAt, n.endsAt);
  const st = NOTICE_STATUS[n.status];
  const cat = categoryOf(n.category);

  return (
    <div className="space-y-6">
      <AutoRefresh active={inFlight} />
      <div>
        <Link href="/notices" className="text-sm font-semibold text-brand-600">← 공지 내역</Link>
        <div className="mt-1 flex flex-wrap items-center gap-2">
          <h1 className="text-2xl font-bold">{n.title}</h1>
          <span className={`badge ${st?.cls}`}>{st?.label}</span>
          {n.isEmergency && <span className="badge bg-red-600 text-white">긴급</span>}
        </div>
        <p className="text-sub">
          {cat.icon} {cat.label} · 대상 {n.targetLabel} · {n.visibility === "private" ? "🔒 세대별 안내" : "🏢 단지 공지"} · 작성 {author?.name ?? "-"} {fmtDateTime(n.createdAt)}
        </p>
      </div>

      {sp.created === "now" && n.status !== "draft" && (
        <Alert kind="success">발송 요청을 처리했습니다. 아래에서 수신자별 결과를 확인하세요. 통신사 결과는 보통 수 초~수 분 안에 들어옵니다.</Alert>
      )}
      {sp.created === "schedule" && <Alert kind="success">예약했습니다. 브라우저를 닫아도 예약 시각에 서버가 자동으로 발송합니다.</Alert>}
      {sp.saved === "draft" && <Alert kind="info">임시 저장했습니다. 아직 발송되지 않았습니다.</Alert>}

      <div className="flex flex-wrap gap-2">
        {editable && <Link href={`/notices/new?edit=${n.id}`} className="btn-primary">{n.status === "draft" ? "이어서 작성·발송" : "예약 내용 수정"}</Link>}
        <Link href={`/notices/new?from=${n.id}`} className="btn-secondary">이 공지 다시 보내기</Link>
        {n.visibility === "public" && n.status !== "draft" && (
          <a href={publicNoticeUrl(apartment.publicSlug, n.id)} target="_blank" className="btn-secondary">입주민 화면 보기 ↗</a>
        )}
        {n.status === "draft" && <DeleteDraftButton id={n.id} />}
        {n.status !== "draft" && <RefreshButton id={n.id} />}
      </div>

      <div className="grid gap-6 lg:grid-cols-[1fr_1.3fr]">
        <section className="card p-5">
          <h2 className="section-title mb-3">보낸 문자</h2>
          {sch && (
            <p className="mb-2 text-sm text-sub">
              일정: {sch.date} {sch.time ?? ""}
            </p>
          )}
          <pre className="rounded-xl bg-slate-50 p-4 font-[inherit] text-[0.95rem] whitespace-pre-wrap">{n.smsText}</pre>
          {n.includeLink && <p className="hint">문자 끝에 {n.visibility === "private" ? "받는 사람별 개인 확인 링크" : "공지 확인 링크"}가 붙었습니다.</p>}
        </section>

        <section className="space-y-3">
          <h2 className="section-title">발송 회차</h2>
          {ds.length === 0 && <div className="card p-6 text-sub">아직 발송 계획이 없습니다(임시 저장).</div>}
          {ds.map((d) => {
            const c = counts.get(d.id) ?? {};
            const total = Object.values(c).reduce((a, b) => a + (b ?? 0), 0);
            const ok = c.success ?? 0;
            const inprog = (c.requested ?? 0) + (c.processing ?? 0) + (c.sending ?? 0) + (c.pending ?? 0);
            const bad = c.failed ?? 0;
            const unk = c.unknown ?? 0;
            const rate = Number(d.rateSnapshot ?? 0);
            const settledCost = d.mode === "live" ? rate * (ok + inprog + unk) : 0;
            const ds_ = DISPATCH_STATUS[d.status];
            const isSel = selected?.id === d.id;
            return (
              <div key={d.id} className={`card p-4 ${isSel ? "ring-2 ring-brand-200" : ""}`}>
                <div className="flex flex-wrap items-center justify-between gap-2">
                  <div className="flex flex-wrap items-center gap-2">
                    <span className="font-bold">{d.label}</span>
                    <span className={`badge ${ds_?.cls}`}>{ds_?.label}</span>
                    <span className={`badge ${d.mode === "live" ? "bg-emerald-600 text-white" : "bg-amber-400 text-amber-950"}`}>{d.mode === "live" ? "실제 발송" : "테스트"}</span>
                  </div>
                  <span className="text-sm text-sub">{d.status === "scheduled" ? `예정 ${fmtDateTime(d.scheduledAt)}` : fmtDateTime(d.startedAt ?? d.scheduledAt)}</span>
                </div>
                {total > 0 && (
                  <>
                    <div className="mt-3 flex h-3 overflow-hidden rounded-full bg-slate-100" aria-hidden>
                      <div className="bg-emerald-500" style={{ width: `${(ok / total) * 100}%` }} />
                      <div className="bg-sky-400" style={{ width: `${(inprog / total) * 100}%` }} />
                      <div className="bg-amber-400" style={{ width: `${(unk / total) * 100}%` }} />
                      <div className="bg-red-500" style={{ width: `${(bad / total) * 100}%` }} />
                    </div>
                    <div className="mt-2 grid grid-cols-2 gap-x-4 gap-y-1 text-sm sm:grid-cols-4">
                      <span>✅ 성공 확인 <b>{ok}</b></span>
                      <span>⏳ 처리 중 <b>{inprog}</b></span>
                      <span>❌ 실패 <b>{bad}</b></span>
                      <span>❔ 확인 불가 <b>{unk}</b></span>
                    </div>
                    <div className="mt-1 text-sm text-sub">
                      총 {total}명 · {d.messageType} ·{" "}
                      {d.mode === "live" ? `비용 약 ${won(settledCost)} (VAT 별도, 포함 ${won(withVat(settledCost))}) · 실패 건 제외` : "테스트 0원"}
                    </div>
                  </>
                )}
                {d.error && <p className="mt-2 text-sm text-red-600">⚠ {d.error}</p>}
                <div className="mt-3 flex flex-wrap gap-2">
                  {total > 0 && !isSel && <Link href={`/notices/${n.id}?d=${d.id}`} className="btn-ghost btn-sm">수신자별 결과 보기</Link>}
                  {d.status === "scheduled" && <CancelButton id={d.id} label={d.label} />}
                  {(bad > 0 || unk > 0) && d.status !== "sending" && <ResendButtons dispatchId={d.id} failed={bad} unknown={unk} />}
                </div>
              </div>
            );
          })}
        </section>
      </div>

      {selected && (
        <section className="card overflow-hidden">
          <div className="flex flex-wrap items-center justify-between gap-2 p-4">
            <h2 className="section-title">수신자별 결과 · {selected.label}</h2>
            <div className="flex flex-wrap gap-1 text-sm">
              <Link className={`btn-ghost btn-sm ${!sp.st ? "bg-slate-100" : ""}`} href={`/notices/${n.id}?d=${selected.id}`}>전체</Link>
              {["success", "processing", "requested", "failed", "unknown"].map((s) => (
                <Link key={s} className={`btn-ghost btn-sm ${sp.st === s ? "bg-slate-100" : ""}`} href={`/notices/${n.id}?d=${selected.id}&st=${s}`}>
                  {DELIVERY_STATUS[s].label}
                </Link>
              ))}
            </div>
          </div>
          <div className="overflow-x-auto">
            <table className="table-base">
              <thead>
                <tr>
                  <th>동·호수</th>
                  <th>번호</th>
                  <th>상태</th>
                  <th>상세</th>
                  <th>시각</th>
                </tr>
              </thead>
              <tbody>
                {delRows.map((r) => {
                  const s = DELIVERY_STATUS[r.status];
                  return (
                    <tr key={r.id}>
                      <td className="whitespace-nowrap font-semibold">{r.unitLabel}</td>
                      <td className="font-mono whitespace-nowrap">***-****-{r.phoneLast4}</td>
                      <td><span className={`badge ${s?.cls}`} title={s?.desc}>{s?.label}</span></td>
                      <td className="text-sm text-sub">{r.statusCode ? `[${r.statusCode}] ` : ""}{r.statusMessage ?? ""}</td>
                      <td className="text-sm whitespace-nowrap text-sub">{fmtDateTime(r.updatedAt)}</td>
                    </tr>
                  );
                })}
                {!delRows.length && (
                  <tr>
                    <td colSpan={5} className="py-6 text-center text-sub">해당하는 수신자가 없습니다.</td>
                  </tr>
                )}
              </tbody>
            </table>
          </div>
          <p className="p-4 text-sm text-sub">
            &lsquo;발송 성공 확인&rsquo;은 통신사가 수신 완료를 알려 온 건입니다. 문자 서비스가 요청을 접수한 것만으로는 성공으로 표시하지 않습니다.
          </p>
        </section>
      )}
    </div>
  );
}
