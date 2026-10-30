import type { Metadata, Viewport } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: { default: "아파트온", template: "%s · 아파트온" },
  description: "관리사무소는 한 번 알리고, 주민은 어디서든 확인한다 — 아파트 관리 공지 문자 서비스",
};

export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  themeColor: "#2f6fed",
};

// 외부 글꼴·분석 도구를 불러오지 않는다(입주민 접속 정보가 제3자에게 전달되지 않도록). 글꼴은 기기 기본 한글 글꼴을 쓴다.
export default function RootLayout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="ko">
      <body className="min-h-dvh antialiased">{children}</body>
    </html>
  );
}
