"use client";
import Image from "next/image";
import { useLanguage } from "./language-provider";
const posters = [
  ["341611_0.jpg", "ตรวจวิเคราะห์องค์ประกอบร่างกาย InBody"],
  ["341612_0.jpg", "ตรวจการนอนหลับ Sleep Test"],
  ["343052_0.jpg", "โปรแกรมตรวจสุขภาพ โรงพยาบาลปลวกแดง"],
  ["343053_0.jpg", "คลินิกอาชีวเวชกรรม"],
  ["343054_0.jpg", "โปรแกรมตรวจสุขภาพอุ่นใจ สบายกระเป๋า"],
  ["343055_0.jpg", "โปรแกรมตรวจสุขภาพ Premium สำหรับผู้หญิง"],
  ["343056_0.jpg", "โปรแกรมตรวจสุขภาพ Premium สำหรับผู้ชาย"],
  ["343057_0.jpg", "โปรแกรมตรวจสุขภาพสำหรับข้าราชการ"],
  ["343058_0.jpg", "โปรแกรมข้าราชการอายุน้อยกว่า 35 ปี"],
  ["343059_0.jpg", "โปรแกรมข้าราชการอายุ 35 ปีขึ้นไป"],
  ["343066_0.jpg", "รายการตรวจสุขภาพตามสิทธิประกันสังคม"],
  ["343067_0.jpg", "โปรแกรมผู้ประกันตนตามช่วงวัย 15 และ 20–34 ปี"],
  ["343068_0.jpg", "โปรแกรมผู้ประกันตนอายุ 30 ปี"],
  ["343069_0.jpg", "โปรแกรมผู้ประกันตนอายุ 35 ปี"],
  ["343070_0.jpg", "โปรแกรมผู้ประกันตนอายุ 40 ปีขึ้นไป"],
  ["343071_0.jpg", "รายการตรวจทางห้องปฏิบัติการ"],
];
const featuredFiles = ["343052_0.jpg", "341611_0.jpg", "341612_0.jpg"];
export function CampaignGallery() {
  const { t } = useLanguage();
  function poster(file: string, title: string, width = 1076, height = 1522) {
    return (
      <figure key={file}>
        <a
          className="campaign-image-link"
          href={"/img/" + file}
          target="_blank"
          rel="noreferrer"
          aria-label={
            t("ดูภาพขนาดเต็ม: ") + t(title) + " " + t("(เปิดแท็บใหม่)")
          }
        >
          <Image
            src={"/img/" + file}
            alt={t(title)}
            width={width}
            height={height}
            sizes="(max-width:600px) 90vw, (max-width:1000px) 45vw, 30vw"
            style={{ width: "100%", height: "auto" }}
          />
        </a>
        <figcaption>
          {t(title)}{" "}
          <a
            className="campaign-full-link"
            href={"/img/" + file}
            target="_blank"
            rel="noreferrer"
          >
            {t("ดูภาพขนาดเต็ม")}
            <span className="sr-only">
              : {t(title)} {t("(เปิดแท็บใหม่)")}
            </span>
          </a>
        </figcaption>
      </figure>
    );
  }
  return (
    <div className="campaign-media">
      <p>{t("ภาพต้นฉบับเป็นภาษาไทย")}</p>
      <p className="campaign-note">
        {t(
          "รายละเอียดและราคาในสื่ออาจมีเงื่อนไข กรุณาตรวจสอบสิทธิและข้อมูลปัจจุบันกับเจ้าหน้าที่ก่อนรับบริการ",
        )}
      </p>
      <div
        className="campaign-grid campaign-featured"
        aria-label={t("บริการแนะนำ")}
      >
        {featuredFiles.map((file) => {
          const item = posters.find((p) => p[0] === file)!;
          return poster(item[0], item[1]);
        })}
      </div>
      <details className="campaign-more">
        <summary>
          {t("ดูสื่อประชาสัมพันธ์เพิ่มเติม")} (
          {posters.length - featuredFiles.length})
        </summary>
        <div className="campaign-grid">
          {posters
            .filter((p) => !featuredFiles.includes(p[0]))
            .map(([file, title]) => poster(file, title))}
        </div>
      </details>
      <article
        className="campaign-education"
        aria-labelledby="sleep-education-title"
      >
        {poster(
          "asc_sleep_1.jpg",
          "สื่อความรู้: แบบประเมินการนอนหลับ ANAMAI STOP-BANG",
          1365,
          2048,
        )}
        <div>
          <h3 id="sleep-education-title">{t("ความรู้เรื่องการนอนหลับ")}</h3>
          <p>
            {t(
              "อ่านสื่อความรู้เรื่องการนอนหลับและเปิดภาพขนาดเต็มเพื่อดูรายละเอียด",
            )}
          </p>
          <p className="campaign-note">
            {t(
              "ภาพนี้เป็นสื่อประกอบ ไม่ใช่แบบประเมินออนไลน์หรือผลวินิจฉัยของระบบ",
            )}
          </p>
        </div>
      </article>
    </div>
  );
}
