import { createHmac, randomBytes } from "node:crypto";
import type { MessageStatus, OutMessage, SendResult, SmsProvider } from "./provider";

const BASE = "https://api.solapi.com";
const TIMEOUT_MS = 30_000;

/**
 * SOLAPI(솔라피) 문자 발송 연동
 * - 인증: HMAC-SHA256 (date + salt 를 API Secret으로 서명)
 * - 발송: POST /messages/v4/send-many/detail (요청당 최대 10,000건)
 * - 결과 조회: GET /messages/v4/list?messageIds=...
 * - 잔액: GET /cash/v1/balance
 */
export class SolapiProvider implements SmsProvider {
  readonly name = "SOLAPI";
  readonly live = true;
  readonly batchSize = 1000;

  constructor(
    private apiKey: string,
    private apiSecret: string,
    private fetchImpl: typeof fetch = fetch,
  ) {}

  static fromEnv(): SolapiProvider | null {
    const k = process.env.SOLAPI_API_KEY;
    const s = process.env.SOLAPI_API_SECRET;
    return k && s ? new SolapiProvider(k, s) : null;
  }

  authHeader(): string {
    const date = new Date().toISOString().replace(/\.\d{3}Z$/, "Z");
    const salt = randomBytes(16).toString("hex");
    const signature = createHmac("sha256", this.apiSecret).update(date + salt).digest("hex");
    return `HMAC-SHA256 apiKey=${this.apiKey}, date=${date}, salt=${salt}, signature=${signature}`;
  }

  private async call(method: string, path: string, body?: unknown) {
    const ctrl = new AbortController();
    const timer = setTimeout(() => ctrl.abort(), TIMEOUT_MS);
    try {
      const res = await this.fetchImpl(BASE + path, {
        method,
        headers: { Authorization: this.authHeader(), "Content-Type": "application/json" },
        body: body ? JSON.stringify(body) : undefined,
        signal: ctrl.signal,
      });
      const text = await res.text();
      let json: Record<string, unknown> | null = null;
      try {
        json = text ? JSON.parse(text) : null;
      } catch {
        json = null;
      }
      return { status: res.status, json, text };
    } finally {
      clearTimeout(timer);
    }
  }

  async send(messages: OutMessage[]): Promise<SendResult> {
    const payload = {
      messages: messages.map((m) => ({
        to: m.to,
        from: m.from,
        text: m.text,
        type: m.type,
        ...(m.type === "LMS" && m.subject ? { subject: m.subject } : {}),
        customFields: { ref: m.ref },
      })),
      allowDuplicates: false,
      showMessageList: true,
    };
    let r;
    try {
      r = await this.call("POST", "/messages/v4/send-many/detail", payload);
    } catch (e) {
      return { kind: "ambiguous", error: `문자 서비스 응답 없음: ${(e as Error).message}` };
    }
    if (r.status >= 500) return { kind: "ambiguous", error: `문자 서비스 서버 오류(${r.status})` };
    if (r.status >= 400) {
      const msg = (r.json?.errorMessage as string) ?? r.text.slice(0, 200);
      const code = (r.json?.errorCode as string) ?? String(r.status);
      return { kind: "rejected", error: `${code}: ${msg}` };
    }
    if (!r.json) return { kind: "ambiguous", error: "문자 서비스 응답을 해석할 수 없음" };

    type Item = { messageId?: string; statusCode?: string; statusMessage?: string; customFields?: { ref?: string } };
    const failed = (r.json.failedMessageList as Item[] | undefined) ?? [];
    const accepted = (r.json.messageList as Item[] | undefined) ?? [];
    const results = new Map<string, { accepted: boolean; messageId?: string; statusCode: string; statusMessage: string }>();
    for (const f of failed) {
      const ref = f.customFields?.ref;
      if (ref) results.set(ref, { accepted: false, messageId: f.messageId, statusCode: f.statusCode ?? "1000", statusMessage: f.statusMessage ?? "접수 실패" });
    }
    for (const a of accepted) {
      const ref = a.customFields?.ref;
      if (ref && !results.has(ref))
        results.set(ref, { accepted: true, messageId: a.messageId, statusCode: a.statusCode ?? "2000", statusMessage: a.statusMessage ?? "접수" });
    }
    return {
      kind: "ok",
      // 응답에서 찾지 못한 건은 접수 여부를 알 수 없음 → statusCode 빈 값(결과 확인 불가로 처리)
      results: messages.map((m) => {
        const x = results.get(m.ref);
        return x
          ? { ref: m.ref, ...x }
          : { ref: m.ref, accepted: false, statusCode: "", statusMessage: "응답에서 접수 결과를 찾을 수 없음" };
      }),
    };
  }

  async status(messageIds: string[]): Promise<Map<string, MessageStatus>> {
    const out = new Map<string, MessageStatus>();
    for (let i = 0; i < messageIds.length; i += 100) {
      const chunk = messageIds.slice(i, i + 100);
      const qs = chunk.map((id) => `messageIds=${encodeURIComponent(id)}`).join("&") + `&limit=${chunk.length}`;
      const r = await this.call("GET", `/messages/v4/list?${qs}`);
      if (r.status !== 200 || !r.json) throw new Error(`결과 조회 실패(${r.status}): ${r.text.slice(0, 200)}`);
      const list = (r.json.messageList as Record<string, { messageId?: string; statusCode?: string; reason?: string; statusMessage?: string }>) ?? {};
      for (const [id, m] of Object.entries(list)) {
        out.set(m.messageId ?? id, { statusCode: m.statusCode ?? "", statusMessage: m.reason ?? m.statusMessage ?? "" });
      }
    }
    return out;
  }

  async balance() {
    const r = await this.call("GET", "/cash/v1/balance");
    if (r.status !== 200 || !r.json) {
      const msg = (r.json?.errorMessage as string) ?? r.text.slice(0, 200);
      throw new Error(`잔액 조회 실패(${r.status}): ${msg}`);
    }
    return { balance: Number(r.json.balance ?? 0), point: Number(r.json.point ?? 0) };
  }
}
