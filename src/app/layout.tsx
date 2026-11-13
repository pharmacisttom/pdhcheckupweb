import type { Metadata, Viewport } from "next";
import "./globals.css";
import { Providers } from "@/components/providers";
import { sandboxEnabled } from "@/lib/sandbox";
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
        {sandboxEnabled() && <div className="sandbox-banner" role="status"><strong>ระบบต้นแบบ / SANDBOX</strong><span>ใช้ข้อมูลสังเคราะห์เท่านั้น · แยกจาก Production</span><a href="/sandbox">คู่มือทดลอง →</a></div>}
        <a href="#main" className="skip-link">
          ข้ามไปยังเนื้อหา
        </a>
        <Providers>{children}</Providers>
      </body>
    </html>
  );
}
