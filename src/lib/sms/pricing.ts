import type { MessageType } from "./message";

/**
 * 새 아파트를 만들 때 넣는 '초기값'일 뿐이며, 실제 계산은 항상 아파트별 설정값(rateSms/rateLms)을 쓴다.
 * SOLAPI는 요금 조회 API를 제공하지 않고 월 발송량에 따라 할인 단가가 달라지므로,
 * 관리자가 SOLAPI 콘솔의 본인 단가를 설정 화면에 입력해 맞춘다.
 * 출처: https://solapi.com/pricing (2026-10-29 확인, VAT 별도)
 */
export const PUBLISHED_RATES = {
  provider: "SOLAPI",
  SMS: 18,
  LMS: 45,
  checkedAt: "2026-10-29",
  url: "https://solapi.com/pricing",
  note: "SOLAPI 공시 기본 단가 (VAT 별도, 2026-10-29 확인)",
} as const;

export const VAT_RATE = 0.1;

export function rateFor(apt: { rateSms: string | number; rateLms: string | number }, type: MessageType): number {
  return Number(type === "SMS" ? apt.rateSms : apt.rateLms);
}

export function won(n: number | string | null | undefined, digits = 0): string {
  const v = Number(n ?? 0);
  return v.toLocaleString("ko-KR", { minimumFractionDigits: digits, maximumFractionDigits: 1 }) + "원";
}

export function withVat(n: number): number {
  return Math.round(n * (1 + VAT_RATE) * 10) / 10;
}
