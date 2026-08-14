import type { Metadata } from "next";
import "./globals.css";

export const metadata: Metadata = {
  title: "Detail Page Asset Manager 5.0",
  description: "브랜드별 상세페이지 자산과 HTML을 관리하는 내부 도구",
};

export default function RootLayout({ children }: Readonly<{ children: React.ReactNode }>) {
  return <html lang="ko"><body>{children}</body></html>;
}
