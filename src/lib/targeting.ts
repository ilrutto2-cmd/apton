import { and, asc, eq, inArray } from "drizzle-orm";
import { db } from "@/db";
import { buildings, contacts, units, type NoticeTarget } from "@/db/schema";

export type Recipient = {
  contactId: string;
  unitLabel: string;
  phoneEnc: string;
  phoneHash: string;
  phoneLast4: string;
};

export type RecipientSummary = {
  recipients: Recipient[];
  /** 대상 세대 안에 등록된 전체 연락처 수 */
  totalContacts: number;
  excludedNoConsent: number;
  excludedInactive: number;
  excludedSample: number;
  /** 같은 번호가 여러 세대에 등록돼 한 번만 보내는 건수 */
  duplicatesMerged: number;
  unitCount: number;
};

/**
 * 대상 지정이 이 아파트의 동·호수만 가리키는지 검증하고 정리한다.
 * (다른 아파트의 ID를 끼워 넣는 요청 차단)
 */
export async function sanitizeTarget(apartmentId: string, t: NoticeTarget): Promise<NoticeTarget | null> {
  if (t.type === "all") return { type: "all" };
  if (t.type === "buildings") {
    const ids = [...new Set(t.buildingIds ?? [])];
    if (!ids.length) return null;
    const rows = await db
      .select({ id: buildings.id })
      .from(buildings)
      .where(and(eq(buildings.apartmentId, apartmentId), inArray(buildings.id, ids)));
    if (rows.length !== ids.length) return null;
    return { type: "buildings", buildingIds: ids };
  }
  if (t.type === "units") {
    const ids = [...new Set(t.unitIds ?? [])];
    if (!ids.length) return null;
    const rows = await db
      .select({ id: units.id })
      .from(units)
      .where(and(eq(units.apartmentId, apartmentId), inArray(units.id, ids)));
    if (rows.length !== ids.length) return null;
    return { type: "units", unitIds: ids };
  }
  return null;
}

export async function targetLabel(apartmentId: string, t: NoticeTarget): Promise<string> {
  if (t.type === "all") return "전체 세대";
  if (t.type === "buildings") {
    const rows = await db
      .select({ name: buildings.name })
      .from(buildings)
      .where(and(eq(buildings.apartmentId, apartmentId), inArray(buildings.id, t.buildingIds)))
      .orderBy(asc(buildings.sortOrder), asc(buildings.name));
    const names = rows.map((r) => r.name);
    return names.length <= 3 ? names.join(", ") : `${names.slice(0, 3).join(", ")} 외 ${names.length - 3}개 동`;
  }
  const rows = await db
    .select({ b: buildings.name, u: units.unitNo })
    .from(units)
    .innerJoin(buildings, eq(units.buildingId, buildings.id))
    .where(and(eq(units.apartmentId, apartmentId), inArray(units.id, t.unitIds)))
    .orderBy(asc(buildings.sortOrder), asc(buildings.name), asc(units.unitNo));
  const labels = rows.map((r) => `${r.b} ${r.u}호`);
  return labels.length <= 2 ? labels.join(", ") : `${labels[0]} 외 ${labels.length - 1}세대`;
}

/**
 * 실제 문자를 받을 사람을 고른다.
 * 조건: 이 아파트 + 대상 동·호수 + 사용 중(전출 아님) + 수신 동의 확인 + (실제 발송이면 샘플 제외)
 * 같은 번호는 한 번만 보낸다.
 */
export async function resolveRecipients(
  apartmentId: string,
  target: NoticeTarget,
  opts: { includeSample: boolean; onlyPhoneHashes?: string[] | null },
): Promise<RecipientSummary> {
  const conds = [eq(contacts.apartmentId, apartmentId)];
  if (target.type === "buildings") conds.push(inArray(units.buildingId, target.buildingIds.length ? target.buildingIds : ["00000000-0000-0000-0000-000000000000"]));
  if (target.type === "units") conds.push(inArray(units.id, target.unitIds.length ? target.unitIds : ["00000000-0000-0000-0000-000000000000"]));
  // 이중 안전장치: 동·호수도 같은 아파트 소속이어야 함
  conds.push(eq(units.apartmentId, apartmentId));

  const rows = await db
    .select({
      id: contacts.id,
      unitId: units.id,
      phoneEnc: contacts.phoneEnc,
      phoneHash: contacts.phoneHash,
      phoneLast4: contacts.phoneLast4,
      active: contacts.active,
      consent: contacts.consentStatus,
      isSample: contacts.isSample,
      b: buildings.name,
      u: units.unitNo,
    })
    .from(contacts)
    .innerJoin(units, eq(contacts.unitId, units.id))
    .innerJoin(buildings, eq(units.buildingId, buildings.id))
    .where(and(...conds))
    .orderBy(asc(buildings.sortOrder), asc(buildings.name), asc(units.unitNo), asc(contacts.createdAt));

  const only = opts.onlyPhoneHashes ? new Set(opts.onlyPhoneHashes) : null;
  const seen = new Set<string>();
  const unitSet = new Set<string>();
  const s: RecipientSummary = {
    recipients: [],
    totalContacts: 0,
    excludedNoConsent: 0,
    excludedInactive: 0,
    excludedSample: 0,
    duplicatesMerged: 0,
    unitCount: 0,
  };
  for (const r of rows) {
    if (only && !only.has(r.phoneHash)) continue;
    s.totalContacts++;
    if (!r.active) {
      s.excludedInactive++;
      continue;
    }
    if (r.consent !== "agreed") {
      s.excludedNoConsent++;
      continue;
    }
    if (r.isSample && !opts.includeSample) {
      s.excludedSample++;
      continue;
    }
    if (seen.has(r.phoneHash)) {
      s.duplicatesMerged++;
      continue;
    }
    seen.add(r.phoneHash);
    unitSet.add(r.unitId);
    s.recipients.push({
      contactId: r.id,
      unitLabel: `${r.b} ${r.u}호`,
      phoneEnc: r.phoneEnc,
      phoneHash: r.phoneHash,
      phoneLast4: r.phoneLast4,
    });
  }
  s.unitCount = unitSet.size;
  return s;
}
