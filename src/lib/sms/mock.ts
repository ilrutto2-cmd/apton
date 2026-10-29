import { randomBytes } from "node:crypto";
import type { MessageStatus, OutMessage, SendResult, SmsProvider } from "./provider";

/**
 * 테스트 모드 발송기 — 외부로 아무것도 보내지 않고 요금도 발생하지 않는다.
 * 실제 서비스와 같은 상태 흐름(접수 → 처리 중 → 수신 완료/실패)을 흉내 낸다.
 * - 전화번호 끝자리가 0000이면 '단말기 전원 꺼짐' 실패로 처리(실패 처리 확인용)
 * - 접수 후 약 3초가 지나면 수신 완료로 바뀐다
 */
export const TEST_FAIL_SUFFIX = "0000";

export class MockProvider implements SmsProvider {
  readonly name = "테스트 모드";
  readonly live = false;
  readonly batchSize = 1000;
  constructor(private settleMs = 3000) {}

  async send(messages: OutMessage[]): Promise<SendResult> {
    const now = Date.now();
    return {
      kind: "ok",
      results: messages.map((m) => {
        const fail = m.to.endsWith(TEST_FAIL_SUFFIX) ? "F" : "S";
        return {
          ref: m.ref,
          accepted: true,
          messageId: `TEST-${now}-${fail}-${randomBytes(6).toString("hex")}`,
          statusCode: "2000",
          statusMessage: "테스트 접수",
        };
      }),
    };
  }

  async status(ids: string[]): Promise<Map<string, MessageStatus>> {
    const out = new Map<string, MessageStatus>();
    for (const id of ids) {
      const [, ts, flag] = id.split("-");
      const age = Date.now() - Number(ts);
      if (age < this.settleMs) out.set(id, { statusCode: "3000", statusMessage: "테스트: 이통사 결과 대기" });
      else if (flag === "F") out.set(id, { statusCode: "3043", statusMessage: "테스트: 단말기 전원 꺼짐(가상 실패)" });
      else out.set(id, { statusCode: "4000", statusMessage: "테스트: 수신 완료(가상)" });
    }
    return out;
  }

  async balance() {
    return { balance: 0, point: 0 };
  }
}
