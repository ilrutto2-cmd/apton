import { beforeEach, describe, expect, it } from "vitest";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { runDispatchNow, setProviderOverride } from "@/lib/dispatch";
import { MockProvider } from "@/lib/sms/mock";
import { PURGED, purgeOldDeliveryPhones } from "@/lib/retention";
import { makeApartment, makeNotice, phone, reset } from "./fixtures";

beforeEach(async () => {
  await reset();
  setProviderOverride({ test: new MockProvider(0) });
});

describe("개인정보 보관 기간", () => {
  it("1년이 지난 발송 기록은 전화번호를 지우고 뒷자리만 남긴다", async () => {
    const A = await makeApartment("행복아파트", "r@test.kr");
    await phone(A.apt.id, A.bs["101동"].units["101"], "010-7777-0001");
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    await db.update(deliveries).set({ createdAt: new Date(Date.now() - 366 * 86400000) }).where(eq(deliveries.dispatchId, dispatch.id));
    expect(await purgeOldDeliveryPhones()).toBe(1);
    const [d] = await db.select().from(deliveries).where(eq(deliveries.dispatchId, dispatch.id));
    expect(d.phoneEnc).toBe(PURGED);
    expect(d.phoneLast4).toBe("0001");
    expect(await purgeOldDeliveryPhones()).toBe(0);
  });
  it("최근 기록은 지우지 않는다", async () => {
    const A = await makeApartment("행복아파트", "r2@test.kr");
    await phone(A.apt.id, A.bs["101동"].units["101"], "010-7777-0002");
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    expect(await purgeOldDeliveryPhones()).toBe(0);
  });
});
