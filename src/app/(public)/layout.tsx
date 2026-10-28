"use client";
import { useLanguage } from "@/components/language-provider";
import {
  LanguageProvider,
  LanguageSwitcher,
} from "@/components/language-provider";
import { PublicMobileNav } from "@/components/public-mobile-nav";
import { Brand } from "@/components/ui";
function PublicContent({ children }: { children: React.ReactNode }) {
  const { t } = useLanguage();

  return (
    <div className="public-app-shell">
      <header className="public-header">
        <div className="container nav">
          <Brand />
          <LanguageSwitcher />
          <nav aria-label={t("เมนูหลัก")}>
            <a href="/#packages">{t("แพ็กเกจตรวจสุขภาพ")}</a>
            <a href="/#how-it-works">{t("ขั้นตอนการลงทะเบียน")}</a>
            <a href="/bookings">{t("ตรวจสอบนัดหมาย")}</a>
            <a href="/#contact">{t("ติดต่อโรงพยาบาล")}</a>
            <a href="/login">{t("เข้าสู่ระบบ")}</a>
          </nav>
          <a className="button small" href="/register">
            {t("ลงทะเบียนตรวจสุขภาพ")}
          </a>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer id="contact">
        <div className="container footer-content">
          <Brand />
          <p>
            {t("ระบบลงทะเบียนและบริหารจัดการการตรวจสุขภาพ")}
            <br />
            {t("โรงพยาบาลปลวกแดง จังหวัดระยอง")}
          </p>
          <div>
            <a href="/privacy">{t("ประกาศความเป็นส่วนตัว")}</a>
            <br />
            <a href="/admin/dashboard">{t("สำหรับเจ้าหน้าที่")}</a>
          </div>
        </div>
      </footer>
      <PublicMobileNav />
    </div>
  );
}

export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <LanguageProvider>
      <PublicContent>{children}</PublicContent>
    </LanguageProvider>
  );
}
