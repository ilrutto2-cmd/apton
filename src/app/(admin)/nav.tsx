"use client";

import Link from "next/link";
import { usePathname } from "next/navigation";

const ITEMS = [
  { href: "/dashboard", label: "홈" },
  { href: "/notices", label: "공지 내역" },
  { href: "/residents", label: "입주민 연락처" },
  { href: "/apartment", label: "동·호수" },
  { href: "/costs", label: "문자 비용" },
  { href: "/settings", label: "설정" },
];

export function Nav() {
  const path = usePathname();
  return (
    <nav aria-label="주 메뉴" className="-mx-1 flex gap-1 overflow-x-auto pb-1 [scrollbar-width:none]">
      {ITEMS.map((it) => {
        const on = path === it.href || path.startsWith(it.href + "/");
        return (
          <Link
            key={it.href}
            href={it.href}
            aria-current={on ? "page" : undefined}
            className={`shrink-0 rounded-lg px-3.5 py-2 text-[0.95rem] font-semibold transition ${
              on ? "bg-brand-50 text-brand-700" : "text-sub hover:bg-slate-100 hover:text-ink"
            }`}
          >
            {it.label}
          </Link>
        );
      })}
    </nav>
  );
}
