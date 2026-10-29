/**
 * 체험용 샘플 데이터: npm run db:seed
 * - 행복아파트(101~103동, 1~5층, 층당 2세대) + 관리 책임자 계정
 * - 샘플 연락처(isSample=true): 테스트 모드에서만 쓰이고 실제 발송에서는 항상 제외됨
 *   번호는 실제로 개통되지 않는 010-0000-xxxx 대역만 사용
 */
import { eq } from "drizzle-orm";
import bcrypt from "bcryptjs";
import { db, sql } from "../src/db";
import { admins, buildings, contacts, units } from "../src/db/schema";
import { createApartmentWithOwner, generateUnitNumbers } from "../src/lib/apartment";
import { encrypt, phoneHash } from "../src/lib/crypto";

const EMAIL = process.env.SEED_EMAIL ?? "demo@apton.kr";
const PASSWORD = process.env.SEED_PASSWORD ?? "apton-demo-2026";

async function main() {
  const [exists] = await db.select().from(admins).where(eq(admins.email, EMAIL));
  if (exists) {
    console.log(`이미 샘플 데이터가 있습니다 (${EMAIL}).`);
    return;
  }
  const { apt } = await createApartmentWithOwner({
    aptName: "행복아파트",
    address: "서울특별시 ○○구 행복로 12",
    officePhone: "02-000-0000",
    ownerName: "김관리",
    email: EMAIL,
    passwordHash: await bcrypt.hash(PASSWORD, 12),
  });
  let serial = 1;
  for (const [i, name] of ["101동", "102동", "103동"].entries()) {
    const [b] = await db.insert(buildings).values({ apartmentId: apt.id, name, sortOrder: i + 1 }).returning();
    const us = await db
      .insert(units)
      .values(generateUnitNumbers(1, 5, 2).map((u) => ({ apartmentId: apt.id, buildingId: b.id, unitNo: u.unitNo, floor: u.floor })))
      .returning();
    for (const u of us) {
      const people = u.unitNo.endsWith("01") ? 2 : 1;
      for (let p = 0; p < people; p++) {
        const n = serial++;
        // 102동 501호 첫 번째 번호는 끝자리 0000 → 테스트 모드에서 '발송 실패' 예시
        const phone = name === "102동" && u.unitNo === "501" && p === 0 ? "01000010000" : `0100000${String(n).padStart(4, "0")}`;
        const consent = n % 13 === 0 ? "pending" : "agreed";
        await db.insert(contacts).values({
          apartmentId: apt.id,
          unitId: u.id,
          name: `[샘플] ${name} ${u.unitNo}호${people > 1 ? ` ${p + 1}` : ""}`,
          phoneEnc: encrypt(phone),
          phoneHash: phoneHash(phone),
          phoneLast4: phone.slice(-4),
          consentStatus: consent,
          consentBasis: consent === "agreed" ? "서면 동의서" : "",
          consentAt: consent === "agreed" ? new Date() : null,
          isSample: true,
        });
      }
    }
  }
  console.log("✔ 샘플 데이터 생성 완료");
  console.log(`  로그인: ${EMAIL} / ${PASSWORD}`);
  console.log("  ⚠ 실제 운영 전에는 이 계정 비밀번호를 바꾸거나 샘플 데이터를 삭제하세요.");
}

main()
  .then(() => sql.end())
  .catch(async (e) => {
    console.error(e);
    await sql.end();
    process.exit(1);
  });
