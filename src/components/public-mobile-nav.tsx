"use client";
import Link from "next/link";
import { usePathname } from "next/navigation";
import { Home, ClipboardPlus, CalendarDays } from "lucide-react";
import { useLanguage } from "./language-provider";
export function PublicMobileNav() {
  const path = usePathname();
  const { t } = useLanguage();
  if (path.startsWith("/auth/") || path === "/login") return null;
  const items = [
    { href: "/", label: "หน้าหลัก", icon: Home, active: path === "/" },
    {
      href: "/register",
      label: "ลงทะเบียน",
      icon: ClipboardPlus,
      active: path === "/register",
    },
    {
      href: "/bookings",
      label: "รายการของฉัน",
      icon: CalendarDays,
      active: path.startsWith("/bookings"),
    },
  ];
  return (
    <nav className="mobile-bottom-nav" aria-label={t("เมนูหลัก")}>
      {items.map((item) => (
        <Link
          key={item.href}
          href={item.href}
          aria-current={item.active ? "page" : undefined}
        >
          <item.icon size={21} />
          <span>{t(item.label)}</span>
        </Link>
      ))}
    </nav>
  );
}
