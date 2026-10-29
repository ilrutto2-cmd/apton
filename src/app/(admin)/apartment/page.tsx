import Link from "next/link";
import { asc, eq, sql } from "drizzle-orm";
import { db } from "@/db";
import { buildings, units } from "@/db/schema";
import { requireAdmin } from "@/lib/auth";
import { Alert } from "@/components/ui";
import { AddBuildingForm, ApartmentInfoForm, BuildingCard } from "./forms";

export const metadata = { title: "아파트·동·호수" };

export default async function ApartmentPage({ searchParams }: { searchParams: Promise<{ welcome?: string }> }) {
  const { apartment, admin } = await requireAdmin();
  const sp = await searchParams;
  const bs = await db.select().from(buildings).where(eq(buildings.apartmentId, apartment.id)).orderBy(asc(buildings.sortOrder), asc(buildings.name));
  const us = await db
    .select({
      id: units.id,
      buildingId: units.buildingId,
      unitNo: units.unitNo,
      floor: units.floor,
      contactCount: sql<number>`(select count(*)::int from contacts c where c.unit_id = "units"."id" and c.active)`,
    })
    .from(units)
    .where(eq(units.apartmentId, apartment.id))
    .orderBy(asc(units.floor), asc(units.unitNo));

  return (
    <div className="space-y-6">
      {sp.welcome && (
        <Alert kind="success">
          <b>{apartment.name}</b> 등록을 마쳤습니다. 이제 ① 동·호수를 만들고 → ② <Link className="underline" href="/residents">입주민 연락처</Link>를 등록하면 공지를 보낼 수 있어요.
        </Alert>
      )}
      <div>
        <h1 className="text-2xl font-bold">아파트·동·호수</h1>
        <p className="text-sub">문자 대상 선택에 쓰이는 동과 호수를 구성합니다. 아파트마다 구조가 달라도 자유롭게 만들 수 있어요.</p>
      </div>

      <section className="grid gap-6 lg:grid-cols-[1fr_1.2fr]">
        <div className="card p-5">
          <h2 className="section-title mb-4">아파트 정보</h2>
          <ApartmentInfoForm apt={{ name: apartment.name, address: apartment.address, officePhone: apartment.officePhone }} canEdit={admin.role === "owner"} />
        </div>
        <div className="card p-5">
          <h2 className="section-title mb-1">동 추가</h2>
          <p className="mb-4 text-sm text-sub">층수와 층당 세대 수를 넣으면 호수가 자동으로 만들어집니다. 구조가 불규칙하면 &lsquo;직접 입력&rsquo;을 쓰세요.</p>
          <AddBuildingForm />
        </div>
      </section>

      <section className="space-y-4">
        <h2 className="section-title">등록된 동 ({bs.length})</h2>
        {bs.length === 0 && <div className="card p-8 text-center text-sub">아직 등록된 동이 없습니다. 위에서 동을 추가해 주세요.</div>}
        {bs.map((b) => (
          <BuildingCard key={b.id} building={{ id: b.id, name: b.name }} units={us.filter((u) => u.buildingId === b.id)} />
        ))}
      </section>
    </div>
  );
}
