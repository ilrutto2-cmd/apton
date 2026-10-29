import { categoryOf } from "@/lib/notice-templates";
import { fmtDateTime, fmtSchedule } from "@/lib/time";

export function NoticeView({
  aptName,
  officePhone,
  n,
  sentAt,
}: {
  aptName: string;
  officePhone: string;
  n: { title: string; category: string; body: string; smsText: string; startsAt: Date | null; endsAt: Date | null; targetLabel: string; isEmergency: boolean; createdAt: Date };
  sentAt?: Date | null;
}) {
  const s = fmtSchedule(n.startsAt, n.endsAt);
  const c = categoryOf(n.category);
  return (
    <article className="card overflow-hidden">
      <div className={`px-5 py-4 ${n.isEmergency ? "bg-red-600 text-white" : "bg-brand-500 text-white"}`}>
        <div className="text-sm opacity-90">{aptName} {n.isEmergency ? "긴급안내" : "관리사무소"}</div>
        <h1 className="mt-0.5 text-[1.35rem] leading-snug font-extrabold">{n.title}</h1>
      </div>
      <dl className="grid grid-cols-[4.5rem_1fr] gap-y-2 border-b border-line px-5 py-4 text-[1.02rem]">
        <dt className="text-sub">분류</dt>
        <dd>{c.icon} {c.label}</dd>
        {s && (
          <>
            <dt className="text-sub">일시</dt>
            <dd className="font-bold">{s.date}</dd>
            {s.time && (
              <>
                <dt className="text-sub">시간</dt>
                <dd className="font-bold">{s.time}</dd>
              </>
            )}
          </>
        )}
        <dt className="text-sub">대상</dt>
        <dd>{n.targetLabel}</dd>
      </dl>
      <div className="px-5 py-4 text-[1.05rem] leading-relaxed whitespace-pre-wrap">{n.smsText}</div>
      <div className="border-t border-line px-5 py-3 text-sm text-sub">
        안내일 {fmtDateTime(sentAt ?? n.createdAt)}
        {officePhone && (
          <>
            {" · "}문의{" "}
            <a className="font-semibold text-brand-600 underline" href={`tel:${officePhone.replace(/[^0-9]/g, "")}`}>
              관리사무소 {officePhone}
            </a>
          </>
        )}
      </div>
    </article>
  );
}
