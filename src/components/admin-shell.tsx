"use client";
import * as Dialog from "@radix-ui/react-dialog";
import { staffLanding } from "@/lib/staff-roles";
import { useState } from "react";
import { usePathname, useRouter } from "next/navigation";
import {
  Activity,
  BarChart3,
  Building2,
  CalendarDays,
  ClipboardList,
  FileText,
  FlaskConical,
  LayoutDashboard,
  LogOut,
  Menu,
  Package,
  ShieldCheck,
  X,
} from "lucide-react";
import { Brand } from "./ui";
import { request } from "@/lib/client";
const links = [
  { path: "dashboard", label: "ภาพรวมระบบ", icon: LayoutDashboard },
  { path: "appointments", label: "จัดการนัดหมาย", icon: CalendarDays },
  {
    path: "booking-control",
    label: "เปิด–ปิดรับนัดออนไลน์",
    icon: CalendarDays,
  },
  { path: "contact-requests", label: "คำขอให้ติดต่อนัด", icon: ClipboardList },
  { path: "packages", label: "แพ็กเกจตรวจสุขภาพ", icon: Package },
  { path: "questionnaires", label: "แบบประเมินและกฎ", icon: ClipboardList },
  { path: "calendar", label: "ปฏิทินให้บริการ", icon: CalendarDays },
  { path: "waitlist", label: "รายชื่อรอคิว", icon: ClipboardList },
  { path: "lab-pricing", label: "ห้องปฏิบัติการและราคา", icon: FlaskConical },
  { path: "organizations", label: "หน่วยงาน / องค์กร", icon: Building2 },
  { path: "quotations", label: "ใบเสนอราคา", icon: FileText },
  { path: "billing", label: "การเงินและค่าบริการ", icon: ClipboardList },
  { path: "reports", label: "รายงานและสถิติ", icon: BarChart3 },
  { path: "privacy", label: "คุ้มครองข้อมูลส่วนบุคคล", icon: ShieldCheck },
  { path: "audit", label: "บันทึกการใช้งาน", icon: Activity },
  { path: "change-password", label: "เปลี่ยนรหัสผ่าน", icon: ShieldCheck },
];
export function AdminShell({
  children,
  name,
  role,
  demo,
}: {
  children: React.ReactNode;
  name: string;
  role: string;
  demo: boolean;
}) {
  const path = usePathname();
  const router = useRouter();
  const [open, setOpen] = useState(false);
  async function logout() {
    await request("auth/logout", {});
    router.replace("/login");
    router.refresh();
  }
  const home = staffLanding(role);
  const shortcuts = [
    { href: home, label: "หน้าหลัก", icon: LayoutDashboard },
    ...(["manager", "superadmin", "registration"].includes(role)
      ? [{ href: "/admin/appointments", label: "นัดหมาย", icon: CalendarDays }]
      : []),
    ...(["manager", "superadmin"].includes(role)
      ? [
          { href: "/admin/packages", label: "แพ็กเกจ", icon: Package },
          { href: "/admin/users", label: "ผู้ใช้", icon: ShieldCheck },
        ]
      : [
          { href: "/admin/change-password", label: "บัญชี", icon: ShieldCheck },
        ]),
  ].filter(
    (item, index, all) =>
      all.findIndex((other) => other.href === item.href) === index,
  );
  return (
    <Dialog.Root open={open} onOpenChange={setOpen}>
      <div className="admin-shell">
        <aside className="sidebar">
          <Brand />
          <button
            aria-label="ปิดเมนู"
            className="menu-button"
            style={{ color: "white" }}
            onClick={() => setOpen(false)}
          >
            <X />
          </button>
          <div className="nav-label">WORKSPACE</div>
          <nav aria-label="เมนูเจ้าหน้าที่">
            {["manager", "superadmin"].includes(role) && (
              <a
                href="/admin/users"
                className={path === "/admin/users" ? "active" : ""}
              >
                <ShieldCheck size={17} />
                จัดการผู้ใช้งาน
              </a>
            )}
            {links.map((link) => (
              <a
                key={link.path}
                href={"/admin/" + link.path}
                className={path === "/admin/" + link.path ? "active" : ""}
              >
                <link.icon size={17} />
                {link.label}
              </a>
            ))}
          </nav>
          <div className="sidebar-bottom">
            <b>PDH Smart Health Check</b>
            <br />
            <small>ระบบบริหารจัดการตรวจสุขภาพ v1.0</small>
            <br />
            <a href="/">กลับหน้าเว็บไซต์ →</a>
          </div>
        </aside>
        <header className="admin-topbar">
          <Dialog.Trigger asChild>
            <button
              className="menu-button"
              aria-label="เปิดเมนู"
              onClick={() => setOpen(true)}
            >
              <Menu />
            </button>
          </Dialog.Trigger>
          <div className="mobile-app-title">
            <b>PDH Health Check</b>
            <small>
              {path === "/admin/users"
                ? "จัดการผู้ใช้งาน"
                : links.find((link) => path === "/admin/" + link.path)?.label}
            </small>
          </div>
          <div className="crumb">
            พื้นที่เจ้าหน้าที่ <span style={{ padding: "0 10px" }}>/</span>{" "}
            {links.find((l) => path.includes(l.path))?.label ??
              "ระบบตรวจสุขภาพ"}
          </div>
          <div className="topbar-right">
            <div className="avatar">PDH</div>
            <div style={{ fontSize: 11 }}>
              <b>{name}</b>
              <small
                style={{
                  display: "block",
                  color: "var(--muted)",
                  fontSize: 10,
                }}
              >
                {role}
              </small>
            </div>
            <button
              className="button ghost"
              aria-label="ออกจากระบบ"
              onClick={logout}
            >
              <LogOut size={17} />
            </button>
          </div>
        </header>
        {demo && (
          <div className="demo-banner">
            สภาพแวดล้อมสาธิต — ข้อมูลสังเคราะห์สำหรับทดสอบ
            ไม่ใช่ข้อมูลผู้ป่วยจริง
          </div>
        )}
        <main id="main" className="admin-main">
          {children}
        </main>
        <nav
          className="mobile-bottom-nav"
          aria-label="เมนูด่วนเจ้าหน้าที่"
          style={{
            gridTemplateColumns: `repeat(${shortcuts.length + 1}, 1fr)`,
          }}
        >
          {shortcuts.map((item) => (
            <a
              key={item.href}
              href={item.href}
              aria-current={path === item.href ? "page" : undefined}
            >
              <item.icon size={21} />
              <span>{item.label}</span>
            </a>
          ))}
          <Dialog.Trigger asChild>
            <button type="button" aria-label="เมนูทั้งหมด">
              <Menu size={21} />
              <span>เมนู</span>
            </button>
          </Dialog.Trigger>
        </nav>
        <Dialog.Portal>
          <Dialog.Overlay className="mobile-menu-overlay" />
          <Dialog.Content className="mobile-menu-panel">
            <div className="mobile-menu-heading">
              <div>
                <Dialog.Title>เมนูเจ้าหน้าที่</Dialog.Title>
                <Dialog.Description>
                  {name} · {role}
                </Dialog.Description>
              </div>
              <Dialog.Close className="button ghost" aria-label="ปิดเมนู">
                <X size={22} />
              </Dialog.Close>
            </div>
            <nav aria-label="เมนูเจ้าหน้าที่บนมือถือ">
              {[
                ...(["manager", "superadmin"].includes(role)
                  ? [
                      {
                        path: "users",
                        label: "จัดการผู้ใช้งาน",
                        icon: ShieldCheck,
                      },
                    ]
                  : []),
                ...links,
              ].map((link) => (
                <a
                  key={link.path}
                  href={"/admin/" + link.path}
                  aria-current={
                    path === "/admin/" + link.path ? "page" : undefined
                  }
                  onClick={() => setOpen(false)}
                >
                  <link.icon size={20} />
                  {link.label}
                </a>
              ))}
            </nav>
            <a className="button secondary" href="/">
              กลับหน้าเว็บไซต์
            </a>
            <button className="button secondary" onClick={logout}>
              <LogOut size={18} />
              ออกจากระบบ
            </button>
          </Dialog.Content>
        </Dialog.Portal>
      </div>
    </Dialog.Root>
  );
}
