export const CONSENT_LABELS: Record<string, string> = {
  agreed: "수신 동의 확인",
  pending: "동의 확인 전",
  refused: "수신 거부",
  withdrawn: "동의 철회",
};

export const CONSENT_BASIS_OPTIONS = ["서면 동의서", "온라인·문자 회신 동의", "전화 확인", "입주 시 관리 안내 동의", "기타"];

export function parseConsent(v: string | undefined | null): "agreed" | "refused" | "pending" | null {
  const s = (v ?? "").trim().toLowerCase();
  if (!s) return "pending";
  if (["y", "yes", "o", "예", "네", "동의", "동의함", "1", "true", "수신", "수신동의"].includes(s)) return "agreed";
  if (["n", "no", "x", "아니오", "아니요", "거부", "미동의", "0", "false", "수신거부"].includes(s)) return "refused";
  if (["보류", "확인전", "확인 전", "대기"].includes(s)) return "pending";
  return null;
}

