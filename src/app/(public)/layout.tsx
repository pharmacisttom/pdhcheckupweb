import { Brand } from "@/components/ui";
export default function PublicLayout({
  children,
}: {
  children: React.ReactNode;
}) {
  return (
    <>
      <header className="public-header">
        <div className="container nav">
          <Brand />
          <nav aria-label="เมนูหลัก">
            <a href="/#packages">แพ็กเกจตรวจสุขภาพ</a>
            <a href="/#preparation">เตรียมตัวก่อนตรวจ</a>
            <a href="/bookings">ตรวจสอบนัดหมาย</a>
          </nav>
          <a className="button small" href="/register">
            ลงทะเบียนตรวจสุขภาพ
          </a>
        </div>
      </header>
      <main id="main">{children}</main>
      <footer>
        <div className="container footer-content">
          <Brand />
          <p>
            ระบบลงทะเบียนและบริหารจัดการการตรวจสุขภาพ
            <br />
            โรงพยาบาลปลวกแดง จังหวัดระยอง
          </p>
          <div>
            <a href="/privacy">ประกาศความเป็นส่วนตัว</a>
            <br />
            <a href="/admin/dashboard">สำหรับเจ้าหน้าที่</a>
          </div>
        </div>
      </footer>
    </>
  );
}
