"use client";
import { ChatWidget } from "@/components/chat-widget";
import { useLanguage } from "@/components/language-provider";
import {
  LanguageProvider,
  LanguageSwitcher,
} from "@/components/language-provider";
import { PublicMobileNav } from "@/components/public-mobile-nav";
import { Brand } from "@/components/ui";
import { BrandIconLine, BrandIconFacebook } from "@/components/icons";
import { Phone, MapPin, ShieldCheck, UserCog } from "lucide-react";

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
          <div>
            <p>
              {t("ระบบลงทะเบียนและบริหารจัดการการตรวจสุขภาพ")}
              <br />
              {t("โรงพยาบาลปลวกแดง จังหวัดระยอง")}
            </p>
            <div style={{ display: "flex", gap: "16px", marginTop: "8px", fontSize: "12px", color: "var(--muted)", flexWrap: "wrap" }}>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <Phone size={14} aria-hidden="true" />
                038-659123
              </span>
              <span style={{ display: "inline-flex", alignItems: "center", gap: "6px" }}>
                <MapPin size={14} aria-hidden="true" />
                {t("อ.ปลวกแดง จ.ระยอง 21140")}
              </span>
            </div>
          </div>
          <div>
            <div style={{ display: "flex", gap: "12px", marginBottom: "10px", alignItems: "center" }}>
              <span style={{ fontSize: "11px", color: "var(--muted)" }}>{t("ช่องทางติดต่อ:")}</span>
              <a
                href="https://line.me"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="LINE Official Account"
                style={{ color: "#06C755", display: "inline-flex" }}
              >
                <BrandIconLine size={18} aria-hidden="true" />
              </a>
              <a
                href="https://facebook.com"
                target="_blank"
                rel="noopener noreferrer"
                aria-label="Facebook Page"
                style={{ color: "#1877F2", display: "inline-flex" }}
              >
                <BrandIconFacebook size={18} aria-hidden="true" />
              </a>
            </div>
            <div>
              <a href="/privacy" style={{ display: "inline-flex", alignItems: "center", gap: "5px" }}>
                <ShieldCheck size={14} aria-hidden="true" />
                {t("ประกาศความเป็นส่วนตัว")}
              </a>
              <br />
              <a href="/admin/dashboard" style={{ display: "inline-flex", alignItems: "center", gap: "5px", marginTop: "4px" }}>
                <UserCog size={14} aria-hidden="true" />
                {t("สำหรับเจ้าหน้าที่")}
              </a>
            </div>
          </div>
        </div>
      </footer>
      <PublicMobileNav />
      <ChatWidget />
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
