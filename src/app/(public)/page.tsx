"use client";
import { useLanguage } from "@/components/language-provider";
import { CampaignGallery } from "@/components/campaign-gallery";
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
        <CampaignGallery />
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
