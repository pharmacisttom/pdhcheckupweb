"use client";
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
  { path: "booking-control", label: "เปิด–ปิดรับนัดออนไลน์", icon: CalendarDays },
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
    router.replace('/login'); router.refresh();
  }
  return (
    <div className="admin-shell">
      <aside className={"sidebar " + (open ? "open" : "")}>
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
        <button
          className="menu-button"
          aria-label="เปิดเมนู"
          onClick={() => setOpen(true)}
        >
          <Menu />
        </button>
        <div className="crumb">
          พื้นที่เจ้าหน้าที่ <span style={{ padding: "0 10px" }}>/</span>{" "}
          {links.find((l) => path.includes(l.path))?.label ?? "ระบบตรวจสุขภาพ"}
        </div>
        <div className="topbar-right">
          <div className="avatar">PDH</div>
          <div style={{ fontSize: 11 }}>
            <b>{name}</b>
            <small
              style={{ display: "block", color: "var(--muted)", fontSize: 10 }}
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
          สภาพแวดล้อมสาธิต — ข้อมูลสังเคราะห์สำหรับทดสอบ ไม่ใช่ข้อมูลผู้ป่วยจริง
        </div>
      )}
      <main id="main" className="admin-main">
        {children}
      </main>
    </div>
  );
}
