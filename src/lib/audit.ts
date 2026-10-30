import { db } from "@/db";
import { auditLogs } from "@/db/schema";
import type { AdminContext } from "./auth";

export const AUDIT_LABELS: Record<string, string> = {
  "auth.login": "로그인",
  "auth.signup": "관리자 가입",
  "admin.create": "관리자 계정 추가",
  "admin.deactivate": "관리자 계정 비활성화",
  "apartment.update": "아파트 정보 수정",
  "building.create": "동 추가",
  "building.delete": "동 삭제",
  "unit.create": "호수 추가",
  "unit.delete": "호수 삭제",
  "contact.create": "연락처 등록",
  "contact.update": "연락처 수정",
  "contact.delete": "연락처 삭제",
  "contact.deactivate": "연락처 비활성화(전출 등)",
  "contact.activate": "연락처 다시 사용",
  "contact.reveal": "전화번호 전체 보기",
  "contact.import": "연락처 일괄 등록",
  "contact.export": "연락처 백업 내려받기",
  "contact.sample_purge": "샘플 데이터 삭제",
  "notice.draft": "공지 임시 저장",
  "notice.send": "공지 즉시 발송",
  "notice.schedule": "공지 예약",
  "notice.update": "예약 공지 수정",
  "notice.cancel": "예약 발송 취소",
  "notice.resend": "공지 재발송",
  "notice.delete": "공지 삭제",
  "settings.sms": "문자 발송 설정 변경",
  "settings.live_test": "실제 발송 연결 테스트",
};

export async function audit(
  ctx: AdminContext | { apartmentId: string; adminId?: string | null; adminName?: string | null },
  action: string,
  opts: { targetType?: string; targetId?: string; detail?: Record<string, unknown>; ip?: string } = {},
) {
  const base =
    "admin" in ctx
      ? { apartmentId: ctx.apartment.id, adminId: ctx.admin.id, adminName: ctx.admin.name }
      : { apartmentId: ctx.apartmentId, adminId: ctx.adminId ?? null, adminName: ctx.adminName ?? null };
  await db.insert(auditLogs).values({
    ...base,
    action,
    targetType: opts.targetType,
    targetId: opts.targetId,
    detail: opts.detail,
    ip: opts.ip,
  });
}
