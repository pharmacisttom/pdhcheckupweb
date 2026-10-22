import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Heart,
  HeartPulse,
  ShieldCheck,
  Stethoscope,
} from "lucide-react";
import { PackageList } from "@/components/package-list";
export default function Home() {
  return (
    <>
      <section className="hero">
        <div className="container hero-grid">
          <div>
            <span className="pill">
              <span className="dot" />
              ดูแลสุขภาพวันนี้ เพื่อทุกวันที่ดีกว่า
            </span>
            <h1>
              สุขภาพดี เริ่มต้นที่
              <br />
              <span>การดูแลตัวคุณเอง</span>
            </h1>
            <p className="hero-description">
              วางแผนตรวจสุขภาพประจำปีได้ง่ายขึ้น เลือกแพ็กเกจที่เหมาะกับคุณ
              <br className="desktop" />
              ประเมินสุขภาพ และนัดหมายผ่านระบบออนไลน์
            </p>
            <div className="actions">
              <a className="button" href="/register">
                ลงทะเบียนตรวจสุขภาพ <ArrowRight size={18} />
              </a>
              <a className="button secondary" href="/bookings">
                <CalendarDays size={18} />
                ตรวจสอบหรือเลื่อนนัด
              </a>
            </div>
            <div className="trust">
              <span>
                <ShieldCheck size={18} />
                ปกป้องข้อมูลส่วนบุคคล
              </span>
              <span>
                <Heart size={18} />
                ออกแบบเพื่อการดูแลคุณ
              </span>
            </div>
          </div>
          <div className="hero-art" aria-hidden="true">
            <div className="orbit orbit-one" />
            <div className="orbit orbit-two" />
            <div className="health-core">
              <HeartPulse size={90} strokeWidth={1.3} />
              <b>ใส่ใจทุกจังหวะชีวิต</b>
              <small>YOUR HEALTH, OUR CARE</small>
            </div>
            <div className="float-card top">
              <span className="icon-box">
                <CalendarDays />
              </span>
              <span>
                <b>นัดหมายได้สะดวก</b>
                <small>เลือกวันและเวลาที่เหมาะกับคุณ</small>
              </span>
            </div>
            <div className="float-card bottom">
              <span className="icon-box">
                <ShieldCheck />
              </span>
              <span>
                <b>ดูแลอย่างเป็นระบบ</b>
                <small>ตั้งแต่ลงทะเบียนถึงวันตรวจ</small>
              </span>
            </div>
            <span className="art-plus p1">+</span>
            <span className="art-plus p2">+</span>
          </div>
        </div>
      </section>
      <section className="container process">
        <div className="section-intro">
          <span className="eyebrow">YOUR HEALTH JOURNEY</span>
          <h2>เริ่มต้นง่าย ๆ ใน 3 ขั้นตอน</h2>
          <p>เตรียมพร้อมก่อนมาถึงโรงพยาบาล ผ่านระบบลงทะเบียน 6 ขั้นตอน</p>
        </div>
        <div className="process-grid">
          {[
            {
              icon: ClipboardCheck,
              title: "กรอกข้อมูลและประเมินสุขภาพ",
              text: "ยืนยันเบอร์โทร และตอบแบบประเมินเพื่อการดูแลที่เหมาะสม",
            },
            {
              icon: Stethoscope,
              title: "เลือกแพ็กเกจและรายการตรวจ",
              text: "ดูรายละเอียด เปรียบเทียบ และตรวจสอบค่าใช้จ่ายก่อนยืนยัน",
            },
            {
              icon: CalendarDays,
              title: "นัดหมายและรับการยืนยัน",
              text: "เลือกคิวที่เปิดให้บริการ และแสดง QR ในวันเข้ารับบริการ",
            },
          ].map((s, i) => (
            <div className="process-item" key={s.title}>
              <span className="step-num">0{i + 1}</span>
              <s.icon size={27} />
              <h3>{s.title}</h3>
              <p>{s.text}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="packages" className="package-section">
        <div className="container">
          <div className="section-intro">
            <span className="eyebrow">HEALTH CHECK PACKAGES</span>
            <h2>เลือกการดูแลที่เหมาะกับคุณ</h2>
            <p>แพ็กเกจและราคาที่ได้รับอนุมัติจากโรงพยาบาล</p>
          </div>
          <PackageList />
        </div>
      </section>
      <section id="preparation" className="container preparation">
        <div className="icon-large">
          <ClipboardCheck size={36} />
        </div>
        <div>
          <span className="eyebrow">BEFORE YOUR VISIT</span>
          <h2>เตรียมตัวให้พร้อม ก่อนวันตรวจ</h2>
          <p>
            คำแนะนำจะแสดงตามแพ็กเกจที่เลือก หลังโรงพยาบาลอนุมัติข้อมูล
            <br />
            หากมีโรคประจำตัว ใช้ยา หรือมีข้อสงสัย
            กรุณาสอบถามเจ้าหน้าที่ก่อนปรับการใช้ยา
          </p>
        </div>
        <a href="/register" className="button secondary">
          เริ่มลงทะเบียน <ArrowRight size={18} />
        </a>
      </section>
    </>
  );
}
