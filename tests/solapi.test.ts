import { afterEach, beforeEach, describe, expect, it } from "vitest";
import { createHmac } from "node:crypto";
import { eq } from "drizzle-orm";
import { db } from "@/db";
import { deliveries } from "@/db/schema";
import { pollResults, runDispatchNow, setProviderOverride } from "@/lib/dispatch";
import { SolapiProvider } from "@/lib/sms/solapi";
import { makeApartment, makeNotice, phone, reset, setMode } from "./fixtures";

type Call = { url: string; init: RequestInit };

function fakeFetch(handler: (url: string, body: unknown) => { status: number; json: unknown } | Error) {
  const calls: Call[] = [];
  const f = (async (url: string, init: RequestInit) => {
    calls.push({ url, init });
    const r = handler(url, init.body ? JSON.parse(String(init.body)) : undefined);
    if (r instanceof Error) throw r;
    return new Response(JSON.stringify(r.json), { status: r.status });
  }) as unknown as typeof fetch;
  return { f, calls };
}

describe("SOLAPI 연동 코드 (테스트 11 — 실제 키 없이 요청 형식 검증)", () => {
  it("HMAC-SHA256 인증 헤더를 문서 규격대로 만든다", () => {
    const p = new SolapiProvider("KEY123", "SECRET456");
    const h = p.authHeader();
    const m = h.match(/^HMAC-SHA256 apiKey=KEY123, date=(\S+), salt=([0-9a-f]{32}), signature=([0-9a-f]{64})$/);
    expect(m).not.toBeNull();
    const [, date, salt, sig] = m!;
    expect(date).toMatch(/^\d{4}-\d{2}-\d{2}T\d{2}:\d{2}:\d{2}Z$/);
    expect(sig).toBe(createHmac("sha256", "SECRET456").update(date + salt).digest("hex"));
  });

  it("send-many/detail 요청 본문과 응답(접수·접수 실패)을 올바르게 해석한다", async () => {
    const { f, calls } = fakeFetch((_url, body) => {
      const b = body as { messages: { to: string; customFields: { ref: string } }[] };
      return {
        status: 200,
        json: {
          groupInfo: { count: { total: 2 } },
          failedMessageList: [{ to: b.messages[1].to, from: "0212345678", type: "LMS", statusCode: "1062", statusMessage: "발신번호 미등록", country: "82", messageId: "", accountId: "a", customFields: { ref: b.messages[1].customFields.ref } }],
          messageList: [{ messageId: "M-1", statusCode: "2000", statusMessage: "정상 접수", customFields: { ref: b.messages[0].customFields.ref } }],
        },
      };
    });
    const p = new SolapiProvider("K", "S", f);
    const r = await p.send([
      { ref: "r1", to: "01011112222", from: "0212345678", text: "가".repeat(60), type: "LMS", subject: "제목" },
      { ref: "r2", to: "01033334444", from: "0212345678", text: "가".repeat(60), type: "LMS", subject: "제목" },
    ]);
    expect(calls[0].url).toBe("https://api.solapi.com/messages/v4/send-many/detail");
    expect(calls[0].init.method).toBe("POST");
    const sent = JSON.parse(String(calls[0].init.body));
    expect(sent.allowDuplicates).toBe(false);
    expect(sent.showMessageList).toBe(true);
    expect(sent.messages[0]).toMatchObject({ to: "01011112222", from: "0212345678", type: "LMS", subject: "제목", customFields: { ref: "r1" } });
    expect(r.kind).toBe("ok");
    if (r.kind === "ok") {
      expect(r.results[0]).toMatchObject({ ref: "r1", accepted: true, messageId: "M-1", statusCode: "2000" });
      expect(r.results[1]).toMatchObject({ ref: "r2", accepted: false, statusCode: "1062" });
    }
  });

  it("4xx는 '거부', 5xx·네트워크 오류는 '알 수 없음'으로 구분한다", async () => {
    const p400 = new SolapiProvider("K", "S", fakeFetch(() => ({ status: 400, json: { errorCode: "ValidationError", errorMessage: "잘못된 요청" } })).f);
    expect(await p400.send([{ ref: "x", to: "01011112222", from: "021", text: "t", type: "SMS" }])).toEqual({ kind: "rejected", error: "ValidationError: 잘못된 요청" });
    const p500 = new SolapiProvider("K", "S", fakeFetch(() => ({ status: 503, json: {} })).f);
    expect((await p500.send([{ ref: "x", to: "01011112222", from: "021", text: "t", type: "SMS" }])).kind).toBe("ambiguous");
    const pNet = new SolapiProvider("K", "S", fakeFetch(() => new Error("ECONNRESET")).f);
    expect((await pNet.send([{ ref: "x", to: "01011112222", from: "021", text: "t", type: "SMS" }])).kind).toBe("ambiguous");
  });

  it("결과 조회는 messageIds 쿼리로 요청하고 상태 코드를 읽는다", async () => {
    const { f, calls } = fakeFetch(() => ({ status: 200, json: { messageList: { "M-1": { messageId: "M-1", statusCode: "4000", reason: "수신 완료" }, "M-2": { messageId: "M-2", statusCode: "3043" } } } }));
    const p = new SolapiProvider("K", "S", f);
    const m = await p.status(["M-1", "M-2"]);
    expect(calls[0].url).toBe("https://api.solapi.com/messages/v4/list?messageIds=M-1&messageIds=M-2&limit=2");
    expect(m.get("M-1")?.statusCode).toBe("4000");
    expect(m.get("M-2")?.statusCode).toBe("3043");
  });

  describe("실제 발송 모드 전체 흐름(가짜 SOLAPI 서버)", () => {
    beforeEach(async () => {
      await reset();
    });
    afterEach(() => setProviderOverride({}));

    it("발신번호·LMS 제목과 함께 요청하고, 결과 조회로 성공/실패를 반영한다", async () => {
      const A = await makeApartment("행복아파트", "live@test.kr");
      await setMode(A.apt.id, "live", "0212345678");
      await phone(A.apt.id, A.bs["101동"].units["101"], "010-5555-0001");
      await phone(A.apt.id, A.bs["101동"].units["102"], "010-5555-0002");
      let n = 0;
      const { f, calls } = fakeFetch((url, body) => {
        if (url.includes("send-many")) {
          const b = body as { messages: { customFields: { ref: string } }[] };
          return { status: 200, json: { failedMessageList: [], groupInfo: {}, messageList: b.messages.map((m) => ({ messageId: `LIVE-${++n}`, statusCode: "2000", statusMessage: "접수", customFields: m.customFields })) } };
        }
        return { status: 200, json: { messageList: { "LIVE-1": { messageId: "LIVE-1", statusCode: "4000" }, "LIVE-2": { messageId: "LIVE-2", statusCode: "3040", reason: "전송시간 초과" } } } };
      });
      setProviderOverride({ live: new SolapiProvider("K", "S", f) });
      const { dispatch } = await makeNotice(A.apt.id, { type: "buildings", buildingIds: [A.bs["101동"].id] }, { mode: "live" });
      await runDispatchNow(dispatch.id);
      const body = JSON.parse(String(calls[0].init.body));
      expect(body.messages.map((m: { from: string }) => m.from)).toEqual(["0212345678", "0212345678"]);
      expect(body.messages[0].type).toBe("LMS");
      expect(body.messages[0].subject).toBeTruthy();
      let rows = await db.select().from(deliveries).where(eq(deliveries.dispatchId, dispatch.id));
      expect(rows.every((r) => r.status === "requested")).toBe(true);
      await pollResults();
      rows = await db.select().from(deliveries).where(eq(deliveries.dispatchId, dispatch.id));
      const byId = Object.fromEntries(rows.map((r) => [r.providerMessageId, r]));
      expect(byId["LIVE-1"].status).toBe("success");
      expect(byId["LIVE-2"].status).toBe("failed");
      expect(byId["LIVE-2"].statusMessage).toBe("전송시간 초과");
    });
  });
});
