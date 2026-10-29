/** 문자 바이트 계산 규칙(국내 이통사 기준): 영문·숫자·기호 1바이트, 한글 등 그 외 2바이트 */
export function smsBytes(text: string): number {
  let n = 0;
  for (const ch of text) {
    const c = ch.codePointAt(0)!;
    n += c <= 0x7f ? 1 : 2;
  }
  return n;
}

export const SMS_MAX_BYTES = 90;
export const LMS_MAX_BYTES = 2000;
export const LMS_SUBJECT_MAX_BYTES = 40;

export type MessageType = "SMS" | "LMS";

export function detectType(text: string): MessageType {
  return smsBytes(text) <= SMS_MAX_BYTES ? "SMS" : "LMS";
}

export function truncateBytes(text: string, max: number): string {
  let n = 0;
  let out = "";
  for (const ch of text) {
    const b = ch.codePointAt(0)! <= 0x7f ? 1 : 2;
    if (n + b > max) break;
    n += b;
    out += ch;
  }
  return out;
}

/** 링크는 수신자마다 길이가 같도록 고정 길이 토큰을 쓴다 → 미리보기 바이트 = 실제 바이트 */
export function withLink(text: string, url: string | null): string {
  return url ? `${text}\n\n자세히 보기:\n${url}` : text;
}

/** 광고성으로 오해될 수 있는 표현(정보성 안내만 허용) */
const AD_WORDS = ["할인", "이벤트", "분양", "특가", "광고", "홍보", "무료체험", "세일", "쿠폰", "프로모션", "가입하세요", "구매"];
export function adWordsIn(text: string): string[] {
  return AD_WORDS.filter((w) => text.includes(w));
}
