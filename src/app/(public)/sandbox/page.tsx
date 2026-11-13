import Link from "next/link";
import { notFound } from "next/navigation";
import { sandboxEnabled } from "@/lib/sandbox";

const modules = [
  ["01", "ข้อมูลส่วนบุคคลและการลงทะเบียน", "ทดลองเพิ่มและแก้ข้อมูลก่อนส่ง ชื่อ นามสกุล วันเกิด เพศ สิทธิการรักษา ช่องทางติดต่อ ประวัติสุขภาพ และความยินยอม", "/register", "เริ่มลงทะเบียน"],
  ["02", "แบบประเมินและกฎ", "สร้างฉบับร่าง แก้ไข คัดลอกเป็นรุ่นใหม่ อนุมัติและถอนฉบับ โดยรักษาประวัติรุ่นที่เคยใช้", "/admin/questionnaires", "จัดการแบบประเมิน"],
  ["03", "รายการตรวจและราคา", "เพิ่มและแก้รายการตรวจ ปิดใช้งาน นำเข้าราคา และอนุมัติราคาโดยเจ้าหน้าที่อีกบัญชี", "/admin/lab-pricing", "จัดการรายการตรวจ"],
  ["04", "แพ็กเกจและรายการในแพ็กเกจ", "สร้างฉบับร่าง เพิ่มรายการตรวจ คัดลอกรุ่น อนุมัติ และเก็บเข้าคลังแทนลบประวัติ", "/admin/packages", "จัดการแพ็กเกจ"],
  ["05", "วันและช่วงเวลาให้บริการ", "กำหนดความจุ จัดสรรให้องค์กร และทดลองกรณีจองเต็ม โดยไม่ลดความจุต่ำกว่านัดที่มีอยู่", "/admin/calendar", "จัดการปฏิทิน"],
  ["06", "คำขอและนัดหมาย", "เจ้าหน้าที่ทบทวนข้อมูล เสนอราคา นัดหมาย เปลี่ยนสถานะ เลื่อนนัด และยกเลิกพร้อมเหตุผล", "/admin/contact-requests", "ทดสอบคำขอและนัด"],
  ["07", "องค์กรและผู้ใช้งาน", "ทดลอง CRUD องค์กร และจัดการบัญชีเจ้าหน้าที่ผ่านสิทธิ์เดิมของระบบ", "/admin/organizations", "จัดการองค์กร"],
  ["08", "สิทธิ์ข้อมูลและ Audit", "ทดลองคำขอใช้สิทธิ ตรวจสอบตัวตน มอบหมายและปิดเรื่อง พร้อมตรวจประวัติการเปลี่ยนแปลง", "/admin/privacy", "จัดการคำขอข้อมูล"],
];

export default function SandboxPage() {
  if (!sandboxEnabled()) notFound();
  return <main id="main" className="sandbox-hub">
    <header className="sandbox-hero">
      <span className="sandbox-eyebrow">PDH SMART HEALTH CHECK / SANDBOX</span>
      <h1>ทดลองครบทุกขั้นตอน<br />ก่อนส่งมอบระบบจริง</h1>
      <p>ต้นแบบนี้ใช้ฟอร์ม API สิทธิ์ผู้ใช้ และ MySQL ชุดเดียวกับแอปจริง แยกฐานข้อมูลสำหรับทดสอบ และใช้ข้อมูลสังเคราะห์เท่านั้น</p>
      <div className="sandbox-actions"><Link href="/register" className="sandbox-primary">ทดลองข้อมูลส่วนบุคคล →</Link><Link href="/login">เข้าสู่ระบบเจ้าหน้าที่</Link></div>
    </header>
    <section aria-label="ขอบเขตต้นแบบ" className="sandbox-facts">
      <div><strong>CRUD ผ่านฐานข้อมูลจริง</strong><span>บันทึก → อ่านกลับ → รีเฟรช</span></div>
      <div><strong>MFA และสิทธิ์เดิม</strong><span>ไม่มีบัญชีลัดหรือการข้ามสิทธิ์</span></div>
      <div><strong>แยกจาก Production</strong><span>ไม่ส่ง SMS อีเมล หรือข้อมูลไป AI</span></div>
    </section>
    <section className="sandbox-checklist"><h2>เริ่มทดสอบอย่างไร</h2><ol>
      <li>ใช้ชื่อ “ผู้ทดสอบ ตัวอย่าง” และข้อมูลติดต่อสังเคราะห์ ห้ามกรอกข้อมูลผู้ป่วยจริง</li>
      <li>เพิ่ม แก้ และลบรายละเอียดก่อนส่งฟอร์ม ตรวจข้อความเมื่อเว้นช่องบังคับหรือกรอกผิดรูปแบบ</li>
      <li>ทดลองเปลี่ยนภาษา ย้อนขั้นตอน และรีเฟรช ตรวจว่าระบบรักษาข้อมูลตามขั้นตอนที่กำหนด</li>
      <li>เข้าสู่ระบบเจ้าหน้าที่ ตั้งค่า Authenticator แล้วตรวจรายการที่บันทึกและ Audit ตามสิทธิ์</li>
    </ol><p>ข้อมูลที่ส่งยืนยันแล้วใช้ขั้นตอนคำขอแก้ไขหรือยกเลิกตามสิทธิ์ ระบบไม่เปิดให้ลบประวัติธุรกรรมโดยตรง</p></section>
    <div className="sandbox-module-head"><h2>พื้นที่ทดลองระบบ</h2><span>ใช้โมดูลที่มีอยู่ใน repository</span></div>
    <section className="sandbox-grid">{modules.map(([number, title, description, href, label]) => <article key={number}>
      <span className="sandbox-number">{number}</span><h3>{title}</h3><p>{description}</p><Link href={href}>{label} <span aria-hidden="true">↗</span></Link>
    </article>)}</section>
    <footer className="sandbox-checklist"><h2>จุดตรวจรับก่อนใช้งานจริง</h2><p>ข้อมูลสังเคราะห์และบัญชีทดลองไม่ถูกเลื่อนไป Production ต้องตรวจรับแบบประเมิน ราคา สิทธิ์ผู้ใช้ การกู้คืน backup และอนุมัติ release SHA ก่อน PREPARE / APPLY ตามคู่มือส่งมอบ</p><div className="sandbox-actions"><Link href="/admin/users">บัญชีและสิทธิ์เจ้าหน้าที่ →</Link><Link href="/admin/booking-control">นโยบายการจอง →</Link><Link href="/admin/audit">ตรวจ Audit →</Link><Link href="/bookings">ตรวจนัดหมาย →</Link></div></footer>
  </main>;
}
