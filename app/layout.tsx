import type { Metadata, Viewport } from "next";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  interactiveWidget: "resizes-content",
  themeColor: "#f8f9fd",
};
import "./globals.css";
import "./mobile.css";
export const metadata: Metadata = {
  title: "画猜俱乐部 · DrawGuess Arena",
  description: "和朋友一起在线画画、猜词，开启脑洞派对。",
};
export default function Layout({ children }: { children: React.ReactNode }) {
  return (
    <html lang="zh-CN">
      <body>{children}</body>
    </html>
  );
}
