import Link from "next/link";
import { and, asc, count, eq, ilike, or, sql, type SQL } from "drizzle-orm";
import { db } from "@/db";
import { buildings, contacts, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { ContactTable, AddContactPanel, SamplePurge } from "./client";

export const metadata = { title: "입주민 연락처" };
const PAGE = 200;

export default async function ResidentsPage({
  searchParams,
}: {
  searchParams: Promise<{ b?: string; q?: string; s?: string; page?: string }>;
}) {
  const { apartment } = await requireAdmin();
  const sp = await searchParams;
  const aptId = apartment.id;
  const page = Math.max(1, Number(sp.page ?? 1) || 1);

  const bs = await db.select({ id: buildings.id, name: buildings.name }).from(buildings).where(eq(buildings.apartmentId, aptId)).orderBy(asc(buildings.sortOrder), asc(buildings.name));
  const us = await db.select({ id: units.id, buildingId: units.buildingId, unitNo: units.unitNo }).from(units).where(eq(units.apartmentId, aptId)).orderBy(asc(units.floor), asc(units.unitNo));

  const [stats] = await db
    .select({
      total: count(),
      sendable: sql<number>`count(*) filter (where ${contacts.active} and ${contacts.consentStatus} = 'agreed' and not ${contacts.isSample})::int`,
      pending: sql<number>`count(*) filter (where ${contacts.active} and ${contacts.consentStatus} <> 'agreed')::int`,
      inactive: sql<number>`count(*) filter (where not ${contacts.active})::int`,
      sample: sql<number>`count(*) filter (where ${contacts.isSample})::int`,
    })
    .from(contacts)
    .where(eq(contacts.apartmentId, aptId));

  const conds: (SQL | undefined)[] = [eq(contacts.apartmentId, aptId)];
  if (sp.b) conds.push(eq(units.buildingId, sp.b));
  if (sp.s === "sendable") conds.push(sql`${contacts.active} and ${contacts.consentStatus} = 'agreed'`);
  if (sp.s === "pending") conds.push(sql`${contacts.active} and ${contacts.consentStatus} <> 'agreed'`);
  if (sp.s === "inactive") conds.push(eq(contacts.active, false));
  const q = (sp.q ?? "").trim();
  if (q) {
    const unitQ = q.replace(/호$/, "");
    conds.push(or(eq(units.unitNo, unitQ), ilike(contacts.name, `%${q}%`), eq(contacts.phoneLast4, q.slice(-4)), ilike(buildings.name, `${q}%`)));
  }
  const where = and(...conds);
  const [{ n: filtered }] = await db.select({ n: count() }).from(contacts).innerJoin(units, eq(contacts.unitId, units.id)).innerJoin(buildings, eq(units.buildingId, buildings.id)).where(where);
  const rows = await db
    .select({
      id: contacts.id,
      name: contacts.name,
      last4: contacts.phoneLast4,
      consent: contacts.consentStatus,
      basis: contacts.consentBasis,
      active: contacts.active,
      reason: contacts.inactiveReason,
      isSample: contacts.isSample,
      building: buildings.name,
      unitNo: units.unitNo,
    })
    .from(contacts)
    .innerJoin(units, eq(contacts.unitId, units.id))
    .innerJoin(buildings, eq(units.buildingId, buildings.id))
    .where(where)
    .orderBy(asc(buildings.sortOrder), asc(buildings.name), asc(units.floor), asc(units.unitNo), asc(contacts.createdAt))
    .limit(PAGE)
    .offset((page - 1) * PAGE);

  const qs = (o: Record<string, string | undefined>) => {
    const p = new URLSearchParams();
    const merged = { b: sp.b, q: sp.q, s: sp.s, ...o };
    for (const [k, v] of Object.entries(merged)) if (v) p.set(k, v);
    const s = p.toString();
    return s ? `?${s}` : "";
  };

  return (
    <div className="space-y-6">
      <div className="flex flex-wrap items-end justify-between gap-3">
        <div>
          <h1 className="text-2xl font-bold">입주민 연락처</h1>
          <p className="text-sub">수신 동의가 확인된 연락처에만 문자가 발송됩니다. 번호는 암호화되어 저장되고 뒷자리만 표시됩니다.</p>
        </div>
        <Link href="/residents/import" className="btn-secondary">📄 엑셀·CSV로 한 번에 등록</Link>
      </div>

      <div className="grid grid-cols-2 gap-3 md:grid-cols-4">
        <Stat label="전체 연락처" value={stats.total} />
        <Stat label="문자 발송 가능" value={stats.sendable} tone="brand" hint="사용 중 + 수신 동의 확인" />
        <Stat label="동의 확인 전·거부" value={stats.pending} tone="amber" hint="발송 대상에서 제외" />
        <Stat label="비활성(전출 등)" value={stats.inactive} tone="slate" />
      </div>

      {stats.sample > 0 && <SamplePurge count={stats.sample} />}

      {bs.length === 0 ? (
        <div className="card p-8 text-center">
          <p className="text-lg font-semibold">먼저 동·호수를 등록해 주세요.</p>
          <Link href="/apartment" className="btn-primary mt-4">동·호수 등록하러 가기</Link>
        </div>
      ) : (
        <AddContactPanel buildings={bs} units={us} />
      )}

      <div className="card p-4">
        <form className="flex flex-col gap-2 md:flex-row" action="/residents">
          <select name="b" defaultValue={sp.b ?? ""} className="input md:w-44" aria-label="동 선택">
            <option value="">모든 동</option>
            {bs.map((b) => (
              <option key={b.id} value={b.id}>{b.name}</option>
            ))}
          </select>
          <select name="s" defaultValue={sp.s ?? ""} className="input md:w-52" aria-label="상태">
            <option value="">모든 상태</option>
            <option value="sendable">발송 가능</option>
            <option value="pending">동의 확인 전·거부</option>
            <option value="inactive">비활성(전출 등)</option>
          </select>
          <input name="q" defaultValue={q} className="input" placeholder="호수, 이름, 전화번호 끝 4자리로 찾기" aria-label="검색어" />
          <button className="btn-primary shrink-0" type="submit">찾기</button>
        </form>
      </div>

      <ContactTable rows={rows} />
      <div className="flex items-center justify-between text-sm text-sub">
        <span>
          {filtered.toLocaleString()}건 중 {rows.length ? (page - 1) * PAGE + 1 : 0}–{(page - 1) * PAGE + rows.length}
        </span>
        <span className="flex gap-2">
          {page > 1 && <Link className="btn-secondary btn-sm" href={`/residents${qs({ page: String(page - 1) })}`}>이전</Link>}
          {page * PAGE < filtered && <Link className="btn-secondary btn-sm" href={`/residents${qs({ page: String(page + 1) })}`}>다음</Link>}
        </span>
      </div>
    </div>
  );
}

function Stat({ label, value, tone = "ink", hint }: { label: string; value: number; tone?: "ink" | "brand" | "amber" | "slate"; hint?: string }) {
  const color = { ink: "text-ink", brand: "text-brand-600", amber: "text-amber-600", slate: "text-slate-500" }[tone];
  return (
    <div className="card p-4">
      <div className="text-sm font-semibold text-sub">{label}</div>
      <div className={`mt-1 text-2xl font-extrabold ${color}`}>{value.toLocaleString()}</div>
      {hint && <div className="text-xs text-sub">{hint}</div>}
    </div>
  );
}
