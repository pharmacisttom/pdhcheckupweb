import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
export const viewport: Viewport = {
  width: "device-width",
  initialScale: 1,
  viewportFit: "cover",
  themeColor: "#008577",
};
export const metadata: Metadata = {
  title: {
    default: "PDH Smart Health Check | โรงพยาบาลปลวกแดง",
    template: "%s | PDH Smart Health Check",
  },
  description: "ระบบลงทะเบียนและบริหารจัดการการตรวจสุขภาพ โรงพยาบาลปลวกแดง",
};
export default function RootLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <html lang="th">
      <body>
        <a href="#main" className="skip-link">
          ข้ามไปยังเนื้อหา
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
