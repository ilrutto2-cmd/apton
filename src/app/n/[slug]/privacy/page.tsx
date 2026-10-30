import Link from "next/link";
import { notFound } from "next/navigation";
import { aptBySlug } from "@/lib/public-notices";
import { PrivacyBody } from "@/components/policy";

export const dynamic = "force-dynamic";
export const metadata = { title: "개인정보 처리방침", robots: { index: false, follow: false } };

export default async function AptPrivacy({ params }: { params: Promise<{ slug: string }> }) {
  const { slug } = await params;
  const apt = await aptBySlug(slug);
  if (!apt) notFound();
  return (
    <main className="mx-auto max-w-2xl px-4 pt-6 pb-16">
      <Link href={`/n/${slug}`} className="text-[0.95rem] font-semibold text-brand-600">← {apt.name} 공지</Link>
      <h1 className="mt-2 mb-6 text-2xl font-bold">{apt.name} 문자 알림 개인정보 처리방침</h1>
      <PrivacyBody apt={apt} />
    </main>
  );
}
