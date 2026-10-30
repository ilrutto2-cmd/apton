import Link from "next/link";
import { notFound } from "next/navigation";
import { and, asc, eq, isNotNull } from "drizzle-orm";
import { db } from "@/db";
import { dispatches } from "@/db/schema";
import { aptBySlug, publicNotice } from "@/lib/public-notices";
import { NoticeView } from "@/components/notice-view";
import { ResidentFooter } from "@/components/policy";

export const dynamic = "force-dynamic";
export const metadata = { robots: { index: false, follow: false } };

export default async function ResidentNotice({ params }: { params: Promise<{ slug: string; id: string }> }) {
  const { slug, id } = await params;
  const apt = await aptBySlug(slug);
  if (!apt) notFound();
  const n = await publicNotice(apt, id);
  if (!n) notFound();
  const [first] = await db.select({ at: dispatches.startedAt }).from(dispatches).where(and(eq(dispatches.noticeId, n.id), isNotNull(dispatches.startedAt))).orderBy(asc(dispatches.startedAt)).limit(1);
  return (
    <main className="mx-auto max-w-xl px-4 pt-5 pb-16">
      <Link href={`/n/${slug}`} className="mb-3 inline-block text-[0.95rem] font-semibold text-brand-600">← {apt.name} 공지 전체 보기</Link>
      <NoticeView aptName={apt.name} officePhone={apt.officePhone} n={n} sentAt={first?.at} />
      <ResidentFooter apt={apt} />
    </main>
  );
}
