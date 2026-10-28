"use client";
import { useLanguage } from "@/components/language-provider";
import Image from "next/image";
import {
  ArrowRight,
  CalendarDays,
  ClipboardCheck,
  Stethoscope,
} from "lucide-react";
import { PackageList } from "@/components/package-list";
export default function Home() {
  const { t } = useLanguage();

  return (
    <>
      <section
        id="packages"
        className="package-section packages-primary"
        aria-labelledby="packages-heading"
      >
        <div className="container">
          <div className="section-intro">
            <span className="eyebrow">HEALTH CHECK PACKAGES</span>
            <h1 id="packages-heading">
              {t("แพ็กเกจตรวจสุขภาพ โรงพยาบาลปลวกแดง")}
            </h1>
            <p>{t("แพ็กเกจและราคาที่ได้รับอนุมัติจากโรงพยาบาล")}</p>
          </div>
          <PackageList />
        </div>
      </section>
      <section
        className="container campaign-section"
        aria-labelledby="campaign-heading"
      >
        <div className="section-intro">
          <h2 id="campaign-heading">
            {t("สนใจตรวจสุขภาพ เริ่มจากข้อมูลของคุณ")}
          </h2>
          <p>
            {t(
              "กรอกข้อมูลส่วนตัว อายุ เพศ สิทธิการรักษา ประวัติการเจ็บป่วย และโรค NCD ในญาติสายตรง เพื่อเตรียมข้อมูลก่อนรับบริการ",
            )}
          </p>
          <a href="/register" className="button">
            {t("กรอกข้อมูลและประวัติสุขภาพ")}
            <ArrowRight size={18} />
          </a>
        </div>
        <p>{t("ภาพต้นฉบับเป็นภาษาไทย")}</p>
        <details>
          <summary>
            {t("ดูสื่อประชาสัมพันธ์และโปรแกรมตรวจสุขภาพ (16 ภาพ)")}
          </summary>
          <p>
            {t(
              "รายละเอียดและราคาในสื่ออาจมีเงื่อนไข กรุณาตรวจสอบสิทธิและข้อมูลปัจจุบันกับเจ้าหน้าที่ก่อนรับบริการ",
            )}
          </p>
          <div className="campaign-grid">
            {[
              ["341611_0.jpg", t("ตรวจวิเคราะห์องค์ประกอบร่างกาย InBody")],
              ["341612_0.jpg", t("ตรวจการนอนหลับ Sleep Test")],
              ["343052_0.jpg", t("โปรแกรมตรวจสุขภาพ โรงพยาบาลปลวกแดง")],
              ["343053_0.jpg", t("คลินิกอาชีวเวชกรรม")],
              ["343054_0.jpg", t("โปรแกรมตรวจสุขภาพอุ่นใจ สบายกระเป๋า")],
              ["343055_0.jpg", t("โปรแกรมตรวจสุขภาพ Premium สำหรับผู้หญิง")],
              ["343056_0.jpg", t("โปรแกรมตรวจสุขภาพ Premium สำหรับผู้ชาย")],
              ["343057_0.jpg", t("โปรแกรมตรวจสุขภาพสำหรับข้าราชการ")],
              ["343058_0.jpg", t("โปรแกรมข้าราชการอายุน้อยกว่า 35 ปี")],
              ["343059_0.jpg", t("โปรแกรมข้าราชการอายุ 35 ปีขึ้นไป")],
              ["343066_0.jpg", t("รายการตรวจสุขภาพตามสิทธิประกันสังคม")],
              [
                "343067_0.jpg",
                t("โปรแกรมผู้ประกันตนตามช่วงวัย 15 และ 20–34 ปี"),
              ],
              ["343068_0.jpg", t("โปรแกรมผู้ประกันตนอายุ 30 ปี")],
              ["343069_0.jpg", t("โปรแกรมผู้ประกันตนอายุ 35 ปี")],
              ["343070_0.jpg", t("โปรแกรมผู้ประกันตนอายุ 40 ปีขึ้นไป")],
              ["343071_0.jpg", t("รายการตรวจทางห้องปฏิบัติการ")],
            ].map(([file, title]) => (
              <figure key={file}>
                <a
                  href={"/img/" + file}
                  target="_blank"
                  rel="noreferrer"
                  aria-label={t("ดูภาพขนาดเต็ม: ") + t(title)}
                >
                  <Image
                    src={"/img/" + file}
                    alt={t(title)}
                    width={1080}
                    height={1528}
                    sizes="(max-width: 600px) 100vw, (max-width: 1000px) 50vw, 33vw"
                    style={{ width: "100%", height: "auto" }}
                  />
                </a>
                <figcaption>{t(title)}</figcaption>
              </figure>
            ))}
          </div>
        </details>
      </section>
      <section id="how-it-works" className="container process">
        <div className="section-intro">
          <span className="eyebrow">YOUR HEALTH JOURNEY</span>
          <h2>{t("เริ่มต้นง่าย ๆ ใน 3 ขั้นตอน")}</h2>
          <p>
            {t("เตรียมพร้อมก่อนมาถึงโรงพยาบาล ผ่านระบบลงทะเบียน 6 ขั้นตอน")}
          </p>
        </div>
        <div className="process-grid">
          {[
            {
              icon: ClipboardCheck,
              title: t("กรอกข้อมูลและประเมินสุขภาพ"),
              text: t("ยืนยันเบอร์โทร และตอบแบบประเมินเพื่อการดูแลที่เหมาะสม"),
            },
            {
              icon: Stethoscope,
              title: t("เลือกแพ็กเกจและรายการตรวจ"),
              text: t(
                "ดูรายละเอียด เปรียบเทียบ และตรวจสอบค่าใช้จ่ายก่อนยืนยัน",
              ),
            },
            {
              icon: CalendarDays,
              title: t("นัดหมายและรับการยืนยัน"),
              text: t("เลือกคิวที่เปิดให้บริการ และแสดง QR ในวันเข้ารับบริการ"),
            },
          ].map((s, i) => (
            <div className="process-item" key={s.title}>
              <span className="step-num">0{i + 1}</span>
              <s.icon size={27} />
              <h3>{t(s.title)}</h3>
              <p>{t(s.text)}</p>
            </div>
          ))}
        </div>
      </section>
      <section id="preparation" className="container preparation">
        <div className="icon-large">
          <ClipboardCheck size={36} />
        </div>
        <div>
          <span className="eyebrow">BEFORE YOUR VISIT</span>
          <h2>{t("เตรียมตัวให้พร้อม ก่อนวันตรวจ")}</h2>
          <p>
            {t("คำแนะนำจะแสดงตามแพ็กเกจที่เลือก หลังโรงพยาบาลอนุมัติข้อมูล")}
            <br />
            {t(
              "หากมีโรคประจำตัว ใช้ยา หรือมีข้อสงสัย กรุณาสอบถามเจ้าหน้าที่ก่อนปรับการใช้ยา",
            )}
          </p>
        </div>
        <a href="/register" className="button secondary">
          {t("เริ่มลงทะเบียน")}
          <ArrowRight size={18} />
        </a>
      </section>
    </>
  );
}
