import Link from "next/link";
import { notFound } from "next/navigation";
import { aptBySlug, publicNotices } from "@/lib/public-notices";
import { categoryOf } from "@/lib/notice-templates";
import { ResidentFooter } from "@/components/policy";
import { fmtDateTime, fmtSchedule, startOfKstDay } from "@/lib/time";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ResidentHome({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apt = await aptBySlug(slug);
  if (!apt) notFound();
  const list = await publicNotices(apt);
  const today = startOfKstDay();
  const upcoming = list
    .filter((n) => n.startsAt && (n.endsAt ?? n.startsAt) >= today)
    .sort((a, b) => a.startsAt!.getTime() - b.startsAt!.getTime());

  return (
    <main className="mx-auto max-w-xl px-4 pt-6 pb-16">
      <header className="mb-5">
        <p className="text-sm font-semibold text-brand-600">아파트온 · 입주민 공지</p>
        <h1 className="text-2xl font-extrabold">{apt.name}</h1>
        {apt.officePhone && (
          <a href={`tel:${apt.officePhone.replace(/[^0-9]/g, "")}`} className="mt-1 inline-block text-[0.95rem] text-sub underline">
            관리사무소 {apt.officePhone}
          </a>
        )}
      </header>
      {apt.smsMode !== "live" && (
        <div className="mb-4 rounded-xl bg-amber-100 px-4 py-2 text-sm text-amber-900">관리사무소에서 서비스를 시험 운영 중입니다.</div>
      )}

      <section className="mb-6">
        <h2 className="mb-2 text-lg font-bold">📅 다가오는 관리 일정</h2>
        {upcoming.length === 0 ? (
          <p className="card p-4 text-sub">예정된 일정이 없습니다.</p>
        ) : (
          <ul className="space-y-2">
            {upcoming.map((n) => {
              const s = fmtSchedule(n.startsAt, n.endsAt);
              return (
                <li key={n.id}>
                  <Link href={`/n/${slug}/${n.id}`} className="card block p-4 active:bg-slate-50">
                    <div className="text-sm font-bold text-brand-700">{s?.date} {s?.time ?? ""}</div>
                    <div className="mt-0.5 text-[1.05rem] font-bold">{categoryOf(n.category).icon} {n.title}</div>
                    <div className="text-sm text-sub">대상: {n.targetLabel}</div>
                  </Link>
                </li>
              );
            })}
          </ul>
        )}
      </section>

      <section>
        <h2 className="mb-2 text-lg font-bold">📢 공지 내역</h2>
        {list.length === 0 ? (
          <p className="card p-4 text-sub">아직 공지가 없습니다.</p>
        ) : (
          <ul className="card divide-y divide-line overflow-hidden">
            {list.map((n) => (
              <li key={n.id}>
                <Link href={`/n/${slug}/${n.id}`} className="block px-4 py-3.5 active:bg-slate-50">
                  <div className="flex items-start gap-2">
                    {n.isEmergency && <span className="badge mt-0.5 bg-red-600 text-white">긴급</span>}
                    <span className="font-semibold">{n.title}</span>
                  </div>
                  <div className="text-sm text-sub">
                    {fmtDateTime(n.sentAt ?? n.createdAt)} · {n.targetLabel}
                  </div>
                </Link>
              </li>
            ))}
          </ul>
        )}
      </section>
      <p className="mt-8 text-center text-xs text-sub">이 페이지에는 단지 전체에 공개되는 공지만 표시됩니다. 세대별 안내는 문자로 받은 개인 링크에서 확인하세요.</p>
      <ResidentFooter apt={apt} />
    </main>
  );
}
