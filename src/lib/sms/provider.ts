import type { MessageType } from "./message";

export type OutMessage = {
  /** 우리 시스템의 발송 기록(delivery) ID — 응답과 매칭하는 데 사용 */
  ref: string;
  to: string;
  from: string;
  text: string;
  type: MessageType;
  subject?: string;
};

export type AcceptResult = {
  ref: string;
  /** 문자 서비스가 접수했는가 */
  accepted: boolean;
  messageId?: string;
  statusCode: string;
  statusMessage: string;
};

export type SendResult =
  /** 응답을 정상 수신 — 건별 접수 여부 확인 가능 */
  | { kind: "ok"; results: AcceptResult[] }
  /** 문자 서비스가 요청 자체를 거부 — 발송되지 않은 것이 확실함 */
  | { kind: "rejected"; error: string }
  /** 네트워크 오류·시간 초과·서버 오류 — 접수 여부를 알 수 없음(자동 재시도 금지) */
  | { kind: "ambiguous"; error: string };

export type MessageStatus = { statusCode: string; statusMessage: string };

export interface SmsProvider {
  readonly name: string;
  readonly live: boolean;
  /** 한 번 요청에 보낼 최대 건수 */
  readonly batchSize: number;
  send(messages: OutMessage[]): Promise<SendResult>;
  /** 메시지 ID별 최신 상태 */
  status(messageIds: string[]): Promise<Map<string, MessageStatus>>;
  balance?(): Promise<{ balance: number; point: number }>;
}

/**
 * 상태 코드 해석 (SOLAPI 기준)
 * 2000: 접수 완료(이통사 전달 대기) / 3000: 이통사 전달, 결과 대기 / 4000: 수신 완료
 * 그 외 1xxx·2xxx·3xxx: 실패
 */
export type DeliveryStatus = "pending" | "sending" | "requested" | "processing" | "success" | "failed" | "unknown";

export function mapStatusCode(code: string | null | undefined): DeliveryStatus {
  if (!code) return "unknown";
  if (code === "2000") return "requested";
  if (code === "3000") return "processing";
  if (code === "4000") return "success";
  return "failed";
}
