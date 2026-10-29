/** 국내 휴대전화 번호 정규화: 숫자만 남기고 +82 → 0 변환. 유효하지 않으면 null */
export function normalizeMobile(input: string): string | null {
  let d = (input ?? "").replace(/[^0-9+]/g, "");
  if (d.startsWith("+82")) d = "0" + d.slice(3);
  else if (d.startsWith("82") && d.length >= 11) d = "0" + d.slice(2);
  d = d.replace(/\D/g, "");
  // 010(11자리), 011·016·017·018·019(10~11자리)
  if (/^010\d{8}$/.test(d)) return d;
  if (/^01[16789]\d{7,8}$/.test(d)) return d;
  return null;
}

/** 발신번호(유선 포함) 정규화 */
export function normalizeAnyPhone(input: string): string | null {
  const d = (input ?? "").replace(/\D/g, "");
  if (d.length < 8 || d.length > 12) return null;
  return d;
}

export function formatPhone(d: string): string {
  if (d.length === 11) return `${d.slice(0, 3)}-${d.slice(3, 7)}-${d.slice(7)}`;
  if (d.length === 10 && d.startsWith("02")) return `${d.slice(0, 2)}-${d.slice(2, 6)}-${d.slice(6)}`;
  if (d.length === 10) return `${d.slice(0, 3)}-${d.slice(3, 6)}-${d.slice(6)}`;
  if (d.length === 9 && d.startsWith("02")) return `${d.slice(0, 2)}-${d.slice(2, 5)}-${d.slice(5)}`;
  if (d.length === 8) return `${d.slice(0, 4)}-${d.slice(4)}`;
  return d;
}

export function maskedPhone(last4: string): string {
  return `***-****-${last4}`;
}
