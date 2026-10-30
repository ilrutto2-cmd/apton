import { afterEach, beforeEach, describe, expect, it, vi } from "vitest";
import { and, eq } from "drizzle-orm";
import { db } from "@/db";
import { contacts, deliveries, dispatches, notices } from "@/db/schema";
import { decrypt } from "@/lib/crypto";
import { pollResults, processDueDispatches, recoverStuck, runDispatchNow, setProviderOverride, tick } from "@/lib/dispatch";
import { MockProvider } from "@/lib/sms/mock";
import type { OutMessage, SendResult, SmsProvider } from "@/lib/sms/provider";
import { resolveRecipients, sanitizeTarget } from "@/lib/targeting";
import { makeApartment, makeNotice, phone, reset, setMode } from "./fixtures";

/** 보낸 내용을 기록하는 가짜 문자 서비스 */
class RecordingProvider implements SmsProvider {
  name = "rec";
  live = true;
  batchSize = 1000;
  sent: OutMessage[] = [];
  calls = 0;
  constructor(private behavior: (m: OutMessage[], call: number) => SendResult = (m) => ({ kind: "ok", results: m.map((x, i) => ({ ref: x.ref, accepted: true, messageId: `M${this.sent.length + i}`, statusCode: "2000", statusMessage: "ok" })) })) {}
  async send(m: OutMessage[]) {
    this.calls++;
    const r = this.behavior(m, this.calls);
    this.sent.push(...m);
    return r;
  }
  async status(ids: string[]) {
    return new Map(ids.map((id) => [id, { statusCode: "4000", statusMessage: "수신 완료" }]));
  }
}

async function deliveriesOf(dispatchId: string) {
  return db.select().from(deliveries).where(eq(deliveries.dispatchId, dispatchId));
}

let A: Awaited<ReturnType<typeof makeApartment>>;
let B: Awaited<ReturnType<typeof makeApartment>>;

beforeEach(async () => {
  await reset();
  setProviderOverride({ test: new MockProvider(0) });
  A = await makeApartment("행복아파트", "a@test.kr");
  B = await makeApartment("푸른마을", "b@test.kr", ["101동", "201동"]);
  // A: 101동 3명(301호 2명), 102동 2명
  await phone(A.apt.id, A.bs["101동"].units["301"], "010-1111-0001");
  await phone(A.apt.id, A.bs["101동"].units["301"], "010-1111-0002");
  await phone(A.apt.id, A.bs["101동"].units["101"], "010-1111-0003");
  await phone(A.apt.id, A.bs["102동"].units["101"], "010-2222-0001");
  await phone(A.apt.id, A.bs["102동"].units["201"], "010-2222-0002");
  // B: 같은 이름의 101동이 있지만 다른 아파트
  await phone(B.apt.id, B.bs["101동"].units["101"], "010-9999-0001");
});
afterEach(() => setProviderOverride({}));

describe("발송 대상 선택 (테스트 4·5)", () => {
  it("특정 동만 선택하면 그 동 주민에게만 발송되고 다른 동·다른 아파트에는 가지 않는다", async () => {
    const { dispatch } = await makeNotice(A.apt.id, { type: "buildings", buildingIds: [A.bs["101동"].id] });
    expect(await runDispatchNow(dispatch.id)).toBe(true);
    const rows = await deliveriesOf(dispatch.id);
    const phones = rows.map((r) => decrypt(r.phoneEnc)).sort();
    expect(phones).toEqual(["01011110001", "01011110002", "01011110003"]);
    expect(rows.every((r) => r.unitLabel.startsWith("101동"))).toBe(true);
    expect(phones).not.toContain("01022220001");
    expect(phones).not.toContain("01099990001");
  });

  it("특정 호수만 선택할 수 있다", async () => {
    const { dispatch } = await makeNotice(A.apt.id, { type: "units", unitIds: [A.bs["102동"].units["201"]] });
    await runDispatchNow(dispatch.id);
    const rows = await deliveriesOf(dispatch.id);
    expect(rows.map((r) => r.unitLabel)).toEqual(["102동 201호"]);
  });

  it("전체 세대는 이 아파트의 모든 적격 수신자", async () => {
    const s = await resolveRecipients(A.apt.id, { type: "all" }, { includeSample: false });
    expect(s.recipients.length).toBe(5);
  });
});

describe("중복 발송 방지 (테스트 6)", () => {
  it("같은 번호가 여러 세대에 있어도 한 회차에 한 번만 보낸다", async () => {
    await phone(A.apt.id, A.bs["102동"].units["101"], "010-1111-0001"); // 101동 301호와 같은 번호
    const s = await resolveRecipients(A.apt.id, { type: "all" }, { includeSample: false });
    expect(s.recipients.length).toBe(5);
    expect(s.duplicatesMerged).toBe(1);
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    expect((await deliveriesOf(dispatch.id)).length).toBe(5);
  });

  it("같은 회차를 두 번 실행하거나 동시에 처리해도 문자는 한 번만 나간다", async () => {
    const rec = new RecordingProvider();
    setProviderOverride({ test: rec });
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    const results = await Promise.all([runDispatchNow(dispatch.id), runDispatchNow(dispatch.id), processDueDispatches(), processDueDispatches()]);
    expect(results.filter((r) => r === true).length + results.filter((r) => typeof r === "object" && r.claimed > 0).length).toBe(1);
    expect(rec.sent.length).toBe(5);
    expect(new Set(rec.sent.map((m) => m.to)).size).toBe(5);
    // 한 번 더 실행해도 그대로
    await runDispatchNow(dispatch.id);
    await tick();
    expect(rec.sent.length).toBe(5);
  });

  it("같은 요청 키로 회차가 두 번 생기지 않는다", async () => {
    await makeNotice(A.apt.id, { type: "all" }, { key: "same-key" });
    await expect(makeNotice(A.apt.id, { type: "all" }, { key: "same-key" })).rejects.toThrow();
  });

  it("응답을 못 받은 묶음(네트워크 오류)은 자동 재시도하지 않고 '결과 확인 불가'로 둔다", async () => {
    const rec = new RecordingProvider(() => ({ kind: "ambiguous", error: "timeout" }));
    setProviderOverride({ test: rec });
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    const rows = await deliveriesOf(dispatch.id);
    expect(rows.every((r) => r.status === "unknown")).toBe(true);
    await tick();
    await tick();
    expect(rec.calls).toBe(1); // 다시 보내지 않음
  });

  it("서버가 발송 도중 멈춘 건은 다시 보내지 않고 '결과 확인 불가'로 정리한다", async () => {
    const rec = new RecordingProvider();
    setProviderOverride({ test: rec });
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    // 한 건을 '요청 중' 상태로 11분 전에 멈춘 것처럼 만든다
    const [one] = await deliveriesOf(dispatch.id);
    await db.update(deliveries).set({ status: "sending", updatedAt: new Date(Date.now() - 11 * 60000) }).where(eq(deliveries.id, one.id));
    const before = rec.sent.length;
    expect(await recoverStuck()).toBe(1);
    const [after] = await db.select().from(deliveries).where(eq(deliveries.id, one.id));
    expect(after.status).toBe("unknown");
    expect(rec.sent.length).toBe(before);
  });
});

describe("예약 발송 (테스트 7)", () => {
  it("시각이 되기 전에는 보내지 않고, 시각이 지나면 서버 주기 작업만으로 발송된다(브라우저 불필요)", async () => {
    const rec = new RecordingProvider();
    setProviderOverride({ test: rec });
    const future = await makeNotice(A.apt.id, { type: "all" }, { at: new Date(Date.now() + 3600000) });
    const due = await makeNotice(A.apt.id, { type: "buildings", buildingIds: [A.bs["102동"].id] }, { at: new Date(Date.now() - 1000) });
    const r = await tick();
    expect(r.claimed).toBe(1);
    expect(rec.sent.length).toBe(2);
    const [f] = await db.select().from(dispatches).where(eq(dispatches.id, future.dispatch.id));
    expect(f.status).toBe("scheduled");
    const [d] = await db.select().from(dispatches).where(eq(dispatches.id, due.dispatch.id));
    expect(d.status).toBe("done");
  });

  it("취소된 예약은 발송되지 않는다", async () => {
    const rec = new RecordingProvider();
    setProviderOverride({ test: rec });
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" }, { at: new Date(Date.now() - 1000) });
    await db.update(dispatches).set({ status: "canceled" }).where(eq(dispatches.id, dispatch.id));
    await tick();
    expect(rec.sent.length).toBe(0);
  });

  it("발송 시점에 전출·동의 철회된 연락처는 빠진다", async () => {
    const { dispatch } = await makeNotice(A.apt.id, { type: "buildings", buildingIds: [A.bs["101동"].id] }, { at: new Date(Date.now() - 1000) });
    const [c] = await db.select().from(contacts).where(and(eq(contacts.apartmentId, A.apt.id), eq(contacts.phoneLast4, "0003")));
    await db.update(contacts).set({ active: false }).where(eq(contacts.id, c.id));
    await tick();
    expect((await deliveriesOf(dispatch.id)).length).toBe(2);
  });
});

describe("실패 기록 (테스트 8)", () => {
  it("테스트 모드에서 끝자리 0000 번호는 실패 코드와 함께 기록된다", async () => {
    await phone(A.apt.id, A.bs["102동"].units["301"], "010-3333-0000");
    const { dispatch, notice } = await makeNotice(A.apt.id, { type: "buildings", buildingIds: [A.bs["102동"].id] });
    await runDispatchNow(dispatch.id);
    await pollResults();
    const rows = await deliveriesOf(dispatch.id);
    const failed = rows.find((r) => r.phoneLast4 === "0000")!;
    expect(failed.status).toBe("failed");
    expect(failed.statusCode).toBe("3043");
    expect(failed.statusMessage).toContain("전원");
    expect(Number(failed.cost)).toBe(0);
    expect(rows.filter((r) => r.status === "success").length).toBe(2);
    const [n] = await db.select().from(notices).where(eq(notices.id, notice.id));
    expect(n.status).toBe("partial");
  });

  it("문자 서비스가 요청을 거부하면 모두 실패로 기록하고 사유를 남긴다", async () => {
    setProviderOverride({ test: new RecordingProvider(() => ({ kind: "rejected", error: "NotEnoughBalance: 잔액 부족" })) });
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    const rows = await deliveriesOf(dispatch.id);
    expect(rows.every((r) => r.status === "failed" && r.statusMessage?.includes("잔액 부족"))).toBe(true);
    const [d] = await db.select().from(dispatches).where(eq(dispatches.id, dispatch.id));
    expect(d.status).toBe("failed");
  });

  it("접수(2000)만으로는 성공으로 표시하지 않고, 수신 완료(4000)를 받아야 성공", async () => {
    setProviderOverride({ test: new MockProvider(60_000) });
    const { dispatch } = await makeNotice(A.apt.id, { type: "units", unitIds: [A.bs["101동"].units["101"]] });
    await runDispatchNow(dispatch.id);
    let [r] = await deliveriesOf(dispatch.id);
    expect(r.status).toBe("requested");
    await pollResults();
    [r] = await deliveriesOf(dispatch.id);
    expect(r.status).toBe("processing");
  });
});

describe("아파트 간 데이터 분리 (테스트 9)", () => {
  it("다른 아파트의 동·호수 ID로는 대상 지정이 거부된다", async () => {
    expect(await sanitizeTarget(A.apt.id, { type: "buildings", buildingIds: [B.bs["101동"].id] })).toBeNull();
    expect(await sanitizeTarget(A.apt.id, { type: "units", unitIds: [B.bs["101동"].units["101"]] })).toBeNull();
  });
  it("다른 아파트의 동 ID가 섞여 들어와도 수신자 계산에 그 아파트 주민은 포함되지 않는다", async () => {
    const s = await resolveRecipients(A.apt.id, { type: "buildings", buildingIds: [B.bs["101동"].id, A.bs["101동"].id] }, { includeSample: false });
    expect(s.recipients.map((r) => r.phoneLast4).sort()).toEqual(["0001", "0002", "0003"]);
    expect(s.recipients.some((r) => r.phoneLast4 === "0001" && r.unitLabel.startsWith("101동 101"))).toBe(false);
  });
});

describe("테스트 모드 (테스트 10)", () => {
  it("테스트 모드는 외부 네트워크를 전혀 호출하지 않는다", async () => {
    setProviderOverride({});
    const spy = vi.spyOn(globalThis, "fetch");
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    await pollResults();
    expect(spy).not.toHaveBeenCalled();
    spy.mockRestore();
    expect((await deliveriesOf(dispatch.id)).every((r) => r.providerMessageId?.startsWith("TEST-"))).toBe(true);
  });

  it("실제 발송 모드인데 API 키가 없으면 보내지 않고 이유를 남긴다", async () => {
    setProviderOverride({ test: new MockProvider(0) });
    await setMode(A.apt.id, "live");
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" }, { mode: "live" });
    await runDispatchNow(dispatch.id);
    const [d] = await db.select().from(dispatches).where(eq(dispatches.id, dispatch.id));
    expect(d.status).toBe("failed");
    expect(d.error).toContain("API 키");
  });
});

describe("수신 자격과 안전장치", () => {
  it("동의 확인 전·거부 연락처와 샘플(실제 발송)은 제외된다", async () => {
    await phone(A.apt.id, A.bs["101동"].units["102"], "010-4444-0001", "pending");
    await phone(A.apt.id, A.bs["101동"].units["102"], "010-4444-0002", "refused");
    await phone(A.apt.id, A.bs["101동"].units["102"], "010-0000-0101", "agreed", true);
    const live = await resolveRecipients(A.apt.id, { type: "buildings", buildingIds: [A.bs["101동"].id] }, { includeSample: false });
    expect(live.recipients.length).toBe(3);
    expect(live.excludedNoConsent).toBe(2);
    expect(live.excludedSample).toBe(1);
    const test = await resolveRecipients(A.apt.id, { type: "buildings", buildingIds: [A.bs["101동"].id] }, { includeSample: true });
    expect(test.recipients.length).toBe(4);
  });

  it("하루 발송 한도를 넘으면 발송하지 않는다", async () => {
    const { apartments } = await import("@/db/schema");
    await db.update(apartments).set({ dailySendLimit: 4 }).where(eq(apartments.id, A.apt.id));
    const { dispatch } = await makeNotice(A.apt.id, { type: "all" });
    await runDispatchNow(dispatch.id);
    const [d] = await db.select().from(dispatches).where(eq(dispatches.id, dispatch.id));
    expect(d.status).toBe("failed");
    expect(d.error).toContain("한도");
    expect((await deliveriesOf(dispatch.id)).length).toBe(0);
  });

  it("세대별 안내 링크는 수신자마다 다른 토큰이고, 문자 길이는 미리보기와 같다", async () => {
    const rec = new RecordingProvider();
    setProviderOverride({ test: rec });
    const { dispatch } = await makeNotice(A.apt.id, { type: "units", unitIds: [A.bs["101동"].units["301"]] }, { includeLink: true, visibility: "private" });
    await runDispatchNow(dispatch.id);
    const rows = await deliveriesOf(dispatch.id);
    expect(rows.length).toBe(2);
    expect(rows[0].viewToken).not.toBe(rows[1].viewToken);
    expect(rec.sent[0].text).toContain("https://apton.example/p/");
    expect(rec.sent[0].text.length).toBe(rec.sent[1].text.length);
  });
});

describe("다른 앱 사용 세대 제외", () => {
  it("일반 공지에서는 빠지고, 긴급 공지와 옵션을 끈 공지에서는 받는다", async () => {
    const { contacts } = await import("@/db/schema");
    const [c] = await db.select().from(contacts).where(and(eq(contacts.apartmentId, A.apt.id), eq(contacts.phoneLast4, "0003")));
    await db.update(contacts).set({ usesOtherApp: true }).where(eq(contacts.id, c.id));
    const t = { type: "buildings" as const, buildingIds: [A.bs["101동"].id] };
    const ex = await resolveRecipients(A.apt.id, t, { includeSample: false, excludeAppUsers: true });
    expect(ex.recipients.length).toBe(2);
    expect(ex.excludedAppUsers).toBe(1);
    const all = await resolveRecipients(A.apt.id, t, { includeSample: false, excludeAppUsers: false });
    expect(all.recipients.length).toBe(3);
    // 발송 엔진: 긴급 공지면 옵션이 켜져 있어도 전체 발송
    const { notice, dispatch } = await makeNotice(A.apt.id, t);
    await db.update(notices).set({ excludeAppUsers: true, isEmergency: true }).where(eq(notices.id, notice.id));
    await runDispatchNow(dispatch.id);
    expect((await deliveriesOf(dispatch.id)).length).toBe(3);
    const second = await makeNotice(A.apt.id, t);
    await db.update(notices).set({ excludeAppUsers: true }).where(eq(notices.id, second.notice.id));
    await runDispatchNow(second.dispatch.id);
    expect((await deliveriesOf(second.dispatch.id)).length).toBe(2);
  });
});
