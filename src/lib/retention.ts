import { and, lt, ne } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";

/** 지워진 전화번호 자리에 남기는 표시(복호화 불가) */
export const PURGED = "purged";
export const DELIVERY_PHONE_RETENTION_DAYS = 365;

/** 보관 기간이 지난 발송 기록의 전화번호를 지운다(뒷자리·결과는 남김) */
export async function purgeOldDeliveryPhones(): Promise<number> {
  const cutoff = new Date(Date.now() - DELIVERY_PHONE_RETENTION_DAYS * 86400000);
  const rows = await db
    .update(deliveries)
    .set({ phoneEnc: PURGED, viewToken: null })
    .where(and(lt(deliveries.createdAt, cutoff), ne(deliveries.phoneEnc, PURGED)))
    .returning({ id: deliveries.id });
  return rows.length;
}
