import Link from "next/link";
import { and, count, desc, eq } from "drizzle-orm";
import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import { AUDIT_LABELS } from "@/lib/audit";
import { requireAdmin } from "@/lib/auth";
import { fmtDateTime } from "@/lib/time";

export const metadata = { title: "변경·발송 이력" };
const PAGE = 100;

export default async function HistoryPage({ searchParams }: { searchParams: Promise<{ a?: string; page?: string }> }) {
  const { apartment } = await requireAdmin();
  const sp = await searchParams;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);
  const where = and(eq(auditLogs.apartmentId, apartment.id), sp.a ? eq(auditLogs.action, sp.a) : undefined);
  const [{ n }] = await db.select({ n: count() }).from(auditLogs).where(where);
  const rows = await db.select().from(auditLogs).where(where).orderBy(desc(auditLogs.createdAt)).limit(PAGE).offset((page - 1) * PAGE);
  return (
    <div className="space-y-5">
      <div>
        <Link href="/settings" className="text-sm font-semibold text-brand-600">← 설정</Link>
        <h1 className="mt-1 text-2xl font-bold">변경·발송 이력</h1>
        <p className="text-sub">누가 언제 연락처를 보거나 바꾸고, 공지를 보냈는지 기록합니다(개인정보 처리 기록).</p>
      </div>
      <form className="card flex gap-2 p-4" action="/settings/history">
        <select name="a" defaultValue={sp.a ?? ""} className="input md:w-80" aria-label="작업 종류">
          <option value="">모든 작업</option>
          {Object.entries(AUDIT_LABELS).map(([k, v]) => (
            <option key={k} value={k}>{v}</option>
          ))}
        </select>
        <button className="btn-primary shrink-0" type="submit">보기</button>
      </form>
      <div className="card overflow-x-auto">
        <table className="table-base">
          <thead>
            <tr>
              <th>시각</th>
              <th>담당자</th>
              <th>작업</th>
              <th>내용</th>
              <th>IP</th>
            </tr>
          </thead>
          <tbody>
            {rows.map((r) => (
              <tr key={r.id}>
                <td className="whitespace-nowrap text-sm">{fmtDateTime(r.createdAt)}</td>
                <td className="whitespace-nowrap">{r.adminName ?? "-"}</td>
                <td className="whitespace-nowrap font-semibold">{AUDIT_LABELS[r.action] ?? r.action}</td>
                <td className="max-w-md truncate text-sm text-sub" title={r.detail ? JSON.stringify(r.detail) : ""}>{r.detail ? describe(r.detail) : ""}</td>
                <td className="text-xs text-sub">{r.ip}</td>
              </tr>
            ))}
            {!rows.length && (
              <tr>
                <td colSpan={5} className="py-8 text-center text-sub">기록이 없습니다.</td>
              </tr>
            )}
          </tbody>
        </table>
      </div>
      <div className="flex justify-between text-sm text-sub">
        <span>총 {n}건</span>
        <span className="flex gap-2">
          {page > 1 && <Link className="btn-secondary btn-sm" href={`/settings/history?page=${page - 1}${sp.a ? `&a=${sp.a}` : ""}`}>이전</Link>}
          {page * PAGE < n && <Link className="btn-secondary btn-sm" href={`/settings/history?page=${page + 1}${sp.a ? `&a=${sp.a}` : ""}`}>다음</Link>}
        </span>
      </div>
    </div>
  );
}

function describe(d: Record<string, unknown>): string {
  return Object.entries(d)
    .filter(([, v]) => v !== undefined && v !== null && v !== "")
    .map(([k, v]) => `${k}: ${typeof v === "object" ? JSON.stringify(v) : String(v)}`)
    .join(" · ");
}
