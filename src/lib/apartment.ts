import { randomBytes } from "node:crypto";
import { count } from "drizzle-orm";
import { db } from "@/db";
import { admins, apartments } from "@/db/schema";
import { PUBLISHED_RATES } from "./sms/pricing";

export function newSlug(): string {
  const alphabet = "abcdefghijkmnpqrstuvwxyz23456789";
  const bytes = randomBytes(10);
  return Array.from(bytes, (b) => alphabet[b % alphabet.length]).join("");
}

export async function createApartmentWithOwner(i: {
  aptName: string;
  address?: string;
  officePhone?: string;
  ownerName: string;
  email: string;
  passwordHash: string;
}) {
  return db.transaction(async (tx) => {
    const [apt] = await tx
      .insert(apartments)
      .values({
        name: i.aptName.trim(),
        publicSlug: newSlug(),
        address: i.address?.trim() ?? "",
        officePhone: i.officePhone?.trim() ?? "",
        rateSms: String(PUBLISHED_RATES.SMS),
        rateLms: String(PUBLISHED_RATES.LMS),
        rateSource: PUBLISHED_RATES.note,
      })
      .returning();
    const [admin] = await tx
      .insert(admins)
      .values({
        apartmentId: apt.id,
        email: i.email.trim().toLowerCase(),
        name: i.ownerName.trim(),
        passwordHash: i.passwordHash,
        role: "owner",
      })
      .returning();
    return { apt, admin };
  });
}

/** 층·호 규칙으로 호수 목록 생성: 3층 1호 → "301", 12층 2호 → "1202" */
export function generateUnitNumbers(floorFrom: number, floorTo: number, perFloor: number): { unitNo: string; floor: number }[] {
  const out: { unitNo: string; floor: number }[] = [];
  for (let f = floorFrom; f <= floorTo; f++) {
    for (let u = 1; u <= perFloor; u++) out.push({ unitNo: `${f}${String(u).padStart(2, "0")}`, floor: f });
  }
  return out;
}

/** "101, 102, 201~204" 같은 직접 입력을 호수 목록으로 */
export function parseUnitList(input: string): string[] {
  const out: string[] = [];
  for (const part of input.split(/[,\s\n]+/).map((s) => s.trim()).filter(Boolean)) {
    const m = part.match(/^(\d+)\s*[~\-]\s*(\d+)$/);
    if (m) {
      const a = Number(m[1]);
      const b = Number(m[2]);
      if (b >= a && b - a <= 200) for (let n = a; n <= b; n++) out.push(String(n));
    } else {
      const clean = part.replace(/호$/, "");
      if (/^[0-9A-Za-z가-힣-]{1,10}$/.test(clean)) out.push(clean);
    }
  }
  return [...new Set(out)];
}

export function floorOf(unitNo: string): number | null {
  const n = unitNo.match(/^(\d+)$/);
  if (!n) return null;
  const v = Number(n[1]);
  return v >= 100 ? Math.floor(v / 100) : null;
}

export async function isFirstSetup(): Promise<boolean> {
  const [r] = await db.select({ n: count() }).from(admins);
  return r.n === 0;
}
