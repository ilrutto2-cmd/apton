"use server";

import { revalidatePath } from "next/cache";
import { and, count, eq, inArray, max } from "drizzle-orm";
import { db } from "@/db";
import { apartments, buildings, contacts, units } from "@/db/schema";
import { audit } from "@/lib/audit";
import { clientIp, requireAdmin, requireOwner } from "@/lib/auth";
import { floorOf, generateUnitNumbers, parseUnitList } from "@/lib/apartment";

export type ActionResult = { ok?: boolean; error?: string; message?: string } | undefined;

export async function updateApartmentAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireOwner().catch(() => null);
  if (!ctx) return { error: "관리 책임자만 아파트 정보를 수정할 수 있습니다." };
  const name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "아파트 이름을 입력해 주세요." };
  const values = {
    name,
    address: String(fd.get("address") ?? "").trim(),
    officePhone: String(fd.get("officePhone") ?? "").trim(),
    updatedAt: new Date(),
  };
  await db.update(apartments).set(values).where(eq(apartments.id, ctx.apartment.id));
  await audit(ctx, "apartment.update", { detail: { name: values.name }, ip: await clientIp() });
  revalidatePath("/", "layout");
  return { ok: true, message: "저장했습니다." };
}

export async function addBuildingAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const aptId = ctx.apartment.id;
  let name = String(fd.get("name") ?? "").trim();
  if (!name) return { error: "동 이름을 입력해 주세요. 예: 101동" };
  if (/^\d+$/.test(name)) name += "동";
  const mode = String(fd.get("mode") ?? "auto");
  let list: { unitNo: string; floor: number | null }[];
  if (mode === "auto") {
    const from = Number(fd.get("floorFrom"));
    const to = Number(fd.get("floorTo"));
    const per = Number(fd.get("perFloor"));
    if (!(from >= 1 && to >= from && to <= 80 && per >= 1 && per <= 20)) return { error: "층수와 층당 세대 수를 확인해 주세요. (최고 80층, 층당 20세대까지)" };
    list = generateUnitNumbers(from, to, per);
  } else {
    const parsed = parseUnitList(String(fd.get("unitList") ?? ""));
    if (!parsed.length) return { error: "호수를 입력해 주세요. 예: 101, 102, 201~204" };
    list = parsed.map((u) => ({ unitNo: u, floor: floorOf(u) }));
  }
  if (list.length > 2000) return { error: "한 번에 2,000세대까지 추가할 수 있습니다." };

  const [exists] = await db.select({ id: buildings.id }).from(buildings).where(and(eq(buildings.apartmentId, aptId), eq(buildings.name, name)));
  if (exists) return { error: `${name}은(는) 이미 있습니다. 호수 추가는 해당 동 카드에서 하세요.` };
  const [{ m }] = await db.select({ m: max(buildings.sortOrder) }).from(buildings).where(eq(buildings.apartmentId, aptId));
  await db.transaction(async (tx) => {
    const [b] = await tx.insert(buildings).values({ apartmentId: aptId, name, sortOrder: (m ?? 0) + 1 }).returning();
    await tx.insert(units).values(list.map((u) => ({ apartmentId: aptId, buildingId: b.id, unitNo: u.unitNo, floor: u.floor })));
  });
  await audit(ctx, "building.create", { detail: { name, units: list.length }, ip: await clientIp() });
  revalidatePath("/apartment");
  return { ok: true, message: `${name} (${list.length}세대)을 추가했습니다.` };
}

export async function addUnitsAction(_: ActionResult, fd: FormData): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const buildingId = String(fd.get("buildingId") ?? "");
  const [b] = await db.select().from(buildings).where(and(eq(buildings.id, buildingId), eq(buildings.apartmentId, ctx.apartment.id)));
  if (!b) return { error: "동을 찾을 수 없습니다." };
  const parsed = parseUnitList(String(fd.get("unitList") ?? ""));
  if (!parsed.length) return { error: "추가할 호수를 입력해 주세요." };
  const inserted = await db
    .insert(units)
    .values(parsed.map((u) => ({ apartmentId: ctx.apartment.id, buildingId: b.id, unitNo: u, floor: floorOf(u) })))
    .onConflictDoNothing()
    .returning({ id: units.id });
  await audit(ctx, "unit.create", { detail: { building: b.name, added: inserted.length }, ip: await clientIp() });
  revalidatePath("/apartment");
  return { ok: true, message: `${inserted.length}개 호수를 추가했습니다.${inserted.length < parsed.length ? ` (이미 있던 ${parsed.length - inserted.length}개 제외)` : ""}` };
}

export async function deleteBuildingAction(buildingId: string): Promise<ActionResult> {
  const ctx = await requireAdmin();
  const [b] = await db.select().from(buildings).where(and(eq(buildings.id, buildingId), eq(buildings.apartmentId, ctx.apartment.id)));
  if (!b) return { error: "동을 찾을 수 없습니다." };
  const [c] = await db
    .select({ n: count() })
    .from(contacts)
    .innerJoin(units, eq(contacts.unitId, units.id))
    .where(eq(units.buildingId, b.id));
  if (c.n > 0) return { error: `${b.name}에 등록된 연락처 ${c.n}건이 있어 삭제할 수 없습니다. 연락처를 먼저 삭제하세요.` };
  await db.delete(buildings).where(eq(buildings.id, b.id));
  await audit(ctx, "building.delete", { detail: { name: b.name }, ip: await clientIp() });
  revalidatePath("/apartment");
  return { ok: true };
}

export async function deleteUnitsAction(unitIds: string[]): Promise<ActionResult> {
  const ctx = await requireAdmin();
  if (!unitIds.length) return { error: "선택한 호수가 없습니다." };
  const own = await db.select({ id: units.id, no: units.unitNo }).from(units).where(and(eq(units.apartmentId, ctx.apartment.id), inArray(units.id, unitIds)));
  if (own.length !== unitIds.length) return { error: "호수를 찾을 수 없습니다." };
  const [c] = await db.select({ n: count() }).from(contacts).where(inArray(contacts.unitId, unitIds));
  if (c.n > 0) return { error: "연락처가 등록된 호수는 삭제할 수 없습니다." };
  await db.delete(units).where(inArray(units.id, unitIds));
  await audit(ctx, "unit.delete", { detail: { units: own.map((o) => o.no) }, ip: await clientIp() });
  revalidatePath("/apartment");
  return { ok: true };
}
