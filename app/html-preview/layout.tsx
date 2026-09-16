import type { Metadata } from "next";
import type { ReactNode } from "react";

export const metadata: Metadata = {
  title: "HTML 미리보기",
};

export default function HtmlPreviewLayout({ children }: { children: ReactNode }) {
  return children;
}
