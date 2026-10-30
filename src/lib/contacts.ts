import { and, eq, ne } from "drizzle-orm";
import { db } from "@/db";
import { buildings, contacts, units } from "@/db/schema";
import { encrypt, phoneHash } from "./crypto";
import { normalizeMobile } from "./phone";
import { floorOf } from "./apartment";

export { CONSENT_LABELS, CONSENT_BASIS_OPTIONS, parseConsent } from "./contacts-shared";
import { CONSENT_LABELS, parseConsent } from "./contacts-shared";

export type ContactInput = {
  unitId: string;
  phone: string;
  name?: string;
  consentStatus: string;
  consentBasis?: string;
  isSample?: boolean;
  usesOtherApp?: boolean;
};

export type AddResult = { ok: true; id: string; warning?: string } | { ok: false; error: string };

/** 같은 아파트 다른 세대에도 같은 번호가 있는지 (발송 시 한 번만 감) */
export async function otherUnitsWithPhone(apartmentId: string, hash: string, exceptUnitId?: string) {
  const rows = await db
    .select({ b: buildings.name, u: units.unitNo, unitId: units.id })
    .from(contacts)
    .innerJoin(units, eq(contacts.unitId, units.id))
    .innerJoin(buildings, eq(units.buildingId, buildings.id))
    .where(and(eq(contacts.apartmentId, apartmentId), eq(contacts.phoneHash, hash), exceptUnitId ? ne(contacts.unitId, exceptUnitId) : undefined));
  return rows.map((r) => `${r.b} ${r.u}호`);
}

export async function addContact(apartmentId: string, i: ContactInput): Promise<AddResult> {
  const [unit] = await db.select().from(units).where(and(eq(units.id, i.unitId), eq(units.apartmentId, apartmentId)));
  if (!unit) return { ok: false, error: "세대(동·호수)를 찾을 수 없습니다." };
  const phone = normalizeMobile(i.phone);
  if (!phone) return { ok: false, error: `휴대전화 번호 형식이 올바르지 않습니다: ${i.phone}` };
  if (!CONSENT_LABELS[i.consentStatus]) return { ok: false, error: "수신 동의 상태를 선택해 주세요." };
  const hash = phoneHash(phone);
  const [dup] = await db.select({ id: contacts.id }).from(contacts).where(and(eq(contacts.unitId, unit.id), eq(contacts.phoneHash, hash)));
  if (dup) return { ok: false, error: "이 세대에 이미 등록된 번호입니다." };
  const others = await otherUnitsWithPhone(apartmentId, hash, unit.id);
  const [row] = await db
    .insert(contacts)
    .values({
      apartmentId,
      unitId: unit.id,
      name: (i.name ?? "").trim().slice(0, 40),
      phoneEnc: encrypt(phone),
      phoneHash: hash,
      phoneLast4: phone.slice(-4),
      consentStatus: i.consentStatus,
      consentBasis: i.consentStatus === "agreed" ? (i.consentBasis ?? "").trim().slice(0, 60) : "",
      consentAt: i.consentStatus === "agreed" ? new Date() : null,
      isSample: !!i.isSample,
      usesOtherApp: !!i.usesOtherApp,
    })
    .returning({ id: contacts.id });
  return {
    ok: true,
    id: row.id,
    warning: others.length ? `같은 번호가 ${others.join(", ")}에도 등록되어 있습니다. 같은 공지는 한 번만 발송됩니다.` : undefined,
  };
}

export type ImportRow = { building: string; unit: string; phone: string; name?: string; consent?: string; basis?: string; otherApp?: string };
export type ImportReport = {
  added: number;
  duplicates: number;
  createdUnits: number;
  errors: { row: number; reason: string }[];
  warnings: { row: number; reason: string }[];
};

function normBuilding(s: string) {
  const t = String(s ?? "").trim().replace(/\s+/g, "");
  if (!t) return "";
  return /^\d+$/.test(t) ? `${t}동` : t;
}
function normUnit(s: string) {
  return String(s ?? "").trim().replace(/호$/, "").replace(/\s+/g, "");
}

/**
 * 일괄 등록. 한 줄의 오류가 다른 줄 등록을 막지 않으며, 결과 보고서를 돌려준다.
 * createMissing=true 이면 없는 동·호수를 자동으로 만든다.
 */
export async function importContacts(
  apartmentId: string,
  rows: ImportRow[],
  opts: { createMissing: boolean; defaultConsent: "agreed" | "pending"; defaultBasis: string },
): Promise<ImportReport> {
  const rep: ImportReport = { added: 0, duplicates: 0, createdUnits: 0, errors: [], warnings: [] };
  const bs = await db.select().from(buildings).where(eq(buildings.apartmentId, apartmentId));
  const bMap = new Map(bs.map((b) => [b.name, b]));
  const us = await db.select().from(units).where(eq(units.apartmentId, apartmentId));
  const uMap = new Map(us.map((u) => [`${u.buildingId}|${u.unitNo}`, u]));
  let maxOrder = Math.max(0, ...bs.map((b) => b.sortOrder));

  for (let i = 0; i < rows.length; i++) {
    const r = rows[i];
    const rowNo = i + 2; // 1행은 제목
    const bName = normBuilding(r.building);
    const uNo = normUnit(r.unit);
    if (!bName || !uNo) {
      rep.errors.push({ row: rowNo, reason: "동 또는 호수가 비어 있음" });
      continue;
    }
    if (!r.phone?.trim()) {
      rep.errors.push({ row: rowNo, reason: "전화번호가 비어 있음" });
      continue;
    }
    let consent = parseConsent(r.consent);
    if (consent === null) {
      rep.errors.push({ row: rowNo, reason: `수신동의 값을 알 수 없음: "${r.consent}" (예/아니오로 입력)` });
      continue;
    }
    if (!r.consent?.trim()) consent = opts.defaultConsent;
    let b = bMap.get(bName);
    if (!b) {
      if (!opts.createMissing) {
        rep.errors.push({ row: rowNo, reason: `${bName}이(가) 등록되어 있지 않음` });
        continue;
      }
      [b] = await db.insert(buildings).values({ apartmentId, name: bName, sortOrder: ++maxOrder }).returning();
      bMap.set(bName, b);
    }
    let u = uMap.get(`${b.id}|${uNo}`);
    if (!u) {
      if (!opts.createMissing) {
        rep.errors.push({ row: rowNo, reason: `${bName} ${uNo}호가 등록되어 있지 않음` });
        continue;
      }
      [u] = await db.insert(units).values({ apartmentId, buildingId: b.id, unitNo: uNo, floor: floorOf(uNo) }).returning();
      uMap.set(`${b.id}|${uNo}`, u);
      rep.createdUnits++;
    }
    const res = await addContact(apartmentId, {
      unitId: u.id,
      phone: r.phone,
      name: r.name,
      consentStatus: consent,
      consentBasis: r.basis?.trim() || (consent === "agreed" ? opts.defaultBasis : ""),
      usesOtherApp: parseConsent(r.otherApp) === "agreed",
    });
    if (!res.ok) {
      if (res.error.includes("이미 등록된")) rep.duplicates++;
      else rep.errors.push({ row: rowNo, reason: res.error });
      continue;
    }
    rep.added++;
    if (res.warning) rep.warnings.push({ row: rowNo, reason: res.warning });
  }
  return rep;
}
