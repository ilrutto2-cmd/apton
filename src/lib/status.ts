/** 화면 표시용 상태 문구(클라이언트에서도 사용) */
export const DELIVERY_STATUS: Record<string, { label: string; cls: string; desc: string }> = {
  pending: { label: "발송 대기", cls: "bg-slate-100 text-slate-700", desc: "아직 문자 서비스로 보내지 않음" },
  sending: { label: "발송 요청", cls: "bg-sky-50 text-sky-700", desc: "문자 서비스에 요청을 보내는 중" },
  requested: { label: "발송 요청", cls: "bg-sky-50 text-sky-700", desc: "문자 서비스가 접수함(통신사 전달 대기)" },
  processing: { label: "발송 처리 중", cls: "bg-indigo-50 text-indigo-700", desc: "통신사로 전달됨, 수신 결과 대기" },
  success: { label: "발송 성공 확인", cls: "bg-emerald-50 text-emerald-700", desc: "통신사가 수신 완료를 알림" },
  failed: { label: "발송 실패", cls: "bg-red-50 text-red-700", desc: "보내지 못함(재발송 가능)" },
  unknown: { label: "결과 확인 불가", cls: "bg-amber-50 text-amber-800", desc: "접수·수신 여부를 확인할 수 없음" },
};

export const DISPATCH_STATUS: Record<string, { label: string; cls: string }> = {
  scheduled: { label: "예약됨", cls: "bg-violet-50 text-violet-700" },
  sending: { label: "발송 중", cls: "bg-sky-50 text-sky-700" },
  done: { label: "처리 완료", cls: "bg-emerald-50 text-emerald-700" },
  failed: { label: "발송 실패", cls: "bg-red-50 text-red-700" },
  canceled: { label: "취소됨", cls: "bg-slate-100 text-slate-600" },
};

export const NOTICE_STATUS: Record<string, { label: string; cls: string }> = {
  draft: { label: "임시 저장", cls: "bg-slate-100 text-slate-700" },
  scheduled: { label: "예약됨", cls: "bg-violet-50 text-violet-700" },
  sending: { label: "발송 중", cls: "bg-sky-50 text-sky-700" },
  sent: { label: "발송 완료", cls: "bg-emerald-50 text-emerald-700" },
  partial: { label: "일부 실패", cls: "bg-amber-50 text-amber-800" },
  failed: { label: "발송 실패", cls: "bg-red-50 text-red-700" },
  canceled: { label: "취소됨", cls: "bg-slate-100 text-slate-600" },
};
