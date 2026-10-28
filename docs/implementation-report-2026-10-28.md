# รายงานพัฒนา PDH Smart Health Check — 28 ตุลาคม 2569

## ความสามารถที่ทำและทดสอบแล้ว

- ส่งความสนใจได้โดยไม่เลือกแพ็กเกจหรือสร้าง quote; เก็บแพ็กเกจที่สนใจเป็นข้อมูลทางเลือกโดยไม่เดาราคา มีเลขติดตามและหน้าสำเร็จแยกจาก Booking
- อ่าน privacy ก่อนเริ่มกรอก; เก็บ notice version เมื่อยืนยันส่ง; ข้อมูลส่วนบุคคล/สุขภาพ ประวัติผ่าตัด ยา/อาหารเสริม แพ้ยา/อาหาร/สาร และ NCD ญาติแบบความสัมพันธ์/โรคเก็บใน encrypted payload ไม่เก็บชื่อญาติเป็นฟิลด์ ไม่มี health data ใน URL/log/localStorage
- แบบร่างเก่ายังอ่านได้; intakeVersion=2 ตรวจช่องใหม่ทั้งหน้าจอและ server; อายุคำนวณจากวันเกิด
- เจ้าหน้าที่เห็นประวัติใหม่ คำถามแบบประเมินเป็นชื่อที่อ่านได้ ผู้รับผิดชอบ ผลตรวจข้อมูล ผลตรวจสิทธิ บันทึกติดต่อและข้อมูลเพิ่มเติม; สถานะและการเปลี่ยนสถานะตรวจฝั่ง server พร้อม audit
- สิทธิที่ผู้ใช้แจ้งแยกจากผลตรวจสิทธิของเจ้าหน้าที่ ไม่มีการตรวจ HIS/ประกันอัตโนมัติหรือวิเคราะห์ข้อความอิสระเป็นความเสี่ยง
- ผู้ใช้รับทราบราคา/fingerprint และวันเวลา ก่อนเจ้าหน้าที่สร้าง Booking ผ่าน transaction เดิม ตรวจ capacity/hold/day, อายุแพ็กเกจ, ราคาปัจจุบันและ duplicate พร้อม invoice/outbox และเชื่อม bookingId; เปลี่ยนสถานะเป็น scheduled โดยตรงไม่ได้
- ป้องกันคำขอซ้ำและนัดซ้ำ; คิวเต็ม/ราคาเปลี่ยน/หมดอายุไม่ยืนยันสำเร็จ ต้องเสนอราคาและรับทราบใหม่
- รับข้อมูลเพิ่มเติมจาก verified owner ได้เฉพาะสถานะรอข้อมูลเพิ่ม เก็บแยกประวัติ ไม่เขียนทับ intake ที่ส่งแล้ว
- กลับมาดูคำขอหรือนัดออนไลน์เดิมบนอุปกรณ์ใหม่ได้ด้วย OTP เบอร์เดิม + เลขติดตาม/เลขนัด + วันเกิด พร้อมโอน ownership และเพิกถอนการเห็นรายการจาก session เก่า
- Public navigation สามเมนู รองรับ responsive/safe-area; UI และ error dictionaries ห้าภาษา เปลี่ยนภาษาไม่ล้างฟอร์มหรือ OTP; API questionnaire/rule translations รองรับ partial translation กับ fallback และ stable answer codes
- สื่อเดิม 16 ภาพยังใช้งาน เปิดภาพเต็ม รักษาสัดส่วน แปล caption/alt/headings และระบุภาพต้นฉบับภาษาไทย; ราคา Booking มาจากระบบที่อนุมัติ
- OTP จริงมี HTTP adapter/configuration; provider ที่ไม่พร้อม/ส่งล้มเหลวคืน error และ test provider ไม่ทำงานใน production ไม่มีการส่ง SMS จริงในงานนี้

## Migrations และฐานข้อมูล

เพิ่มแบบ additive:

1. 202610280001_interest_review — assignee, coverage outcome, encrypted review, quote/booking links, acceptance fingerprint/time/slot
2. 202610280002_legacy_request_status — เก็บป้ายสถานะนัดแบบเก่าใน legacyStatus และย้าย scheduled ที่ไม่มี Booking ไป under_review เพื่อไม่แสดงเป็นนัดจริง

รันเฉพาะ MySQL loopback 127.0.0.1:3308: ฐานทดสอบ pdh_healthcheck_test และฐาน development เดิม pdh_healthcheck โดยตรวจชื่อฐาน/localhost/SEED_DEMO=true ก่อน migrate development ไม่มี production migration หรือ deployment

งานที่ยังไม่ commit ที่มีมาก่อนเริ่มถูกคงไว้ ไม่ reset/clean/commit และไม่เขียนทับ secrets ใน .env

## ผลทดสอบ

- Typecheck ผ่าน
- Lint ผ่าน: 0 errors, warning เดิม 1 จุดของ TanStack Table/React Compiler
- Unit: 62 ผ่าน, 12 files, ไม่มี skip
- Integration: 46 ผ่าน, 9 files, ไม่มี skip ใช้ฐานทดสอบเท่านั้น
- Browser suite: 16 ผ่าน ไม่มี skip ครบเจ็ดความกว้างและสี่แนวนอน รวม legacy UI booking + OTP recovery
- รันทวน scenario flow จริงหลังแก้ข้อความยืนยันนัดล่าสุด: 1 ผ่าน (20 วินาที) เป็นการรันซ้ำของ testcase เดิม ไม่ใช่จำนวน test เพิ่ม
- Production build ในเครื่องผ่าน ไม่มี deploy
- ดู [ผลและ screenshots](qa/2026-10-28/README.md)

Dev server เปลี่ยนเป็น Turbopack หลังพบ Webpack dev manifest อ่าน JSON ไม่ครบระหว่าง browser checks; production build ยังใช้ Webpack และผ่าน แยก cache ของ browser test จาก .next ปกติ

## การตั้งค่าที่ต้องมี

ใช้ DATABASE_URL, DATA_ENCRYPTION_KEY, OTP_PEPPER และ APP_URL เดิม; local schema ปรับแล้ว เปิด dev server ไว้ที่ http://localhost:3036 แล้ว: health=ok, database=true, OTP mode=development_test และ /register ตอบ HTTP 200; เริ่มใหม่ภายหลังด้วย npm run dev ที่พอร์ต 3036

สำหรับ SMS จริง: OTP_PROVIDER=http, OTP_HTTP_URL เป็น HTTPS, OTP_HTTP_TOKEN เป็น server secret; gateway ต้องรับ POST {phone,code,ttlSeconds:300} พร้อม Bearer token แล้วตอบ 2xx เมื่อยอมรับการส่งเท่านั้น ดู .env.example และ service otp-delivery.ts ไม่เคยทดสอบ credential/provider จริงในงานนี้

## งานภายนอกและสิ่งที่ยังไม่ได้ทดสอบ

- เชื่อมผู้ให้บริการ SMS และ worker/outbox ส่ง notification จริง; ไม่ได้จำลองว่ามีการส่งสำเร็จ
- ทดสอบอุปกรณ์ iPhone/Android/iPad/Android tablet ทั้งสองแนว คีย์บอร์ดจริง Safari/WebKit และ screen reader จริง ภาพที่ส่งเป็น browser emulation เท่านั้น
- โรงพยาบาล/DPO อนุมัติ privacy notice, retention/legal basis/contact details ก่อนเปิดบริการจริง
- ผู้เชี่ยวชาญตรวจคำแปลสุขภาพ/สิทธิ/ความเป็นส่วนตัวทั้งสี่ภาษาเพิ่มจากไทย ดู [translation review](i18n-review-2026-10-28.md)
- ข้อความ catalogue/preparation ที่เจ้าหน้าที่สร้างเองใช้ approved source/fallback จนมีคำแปลที่อนุมัติ ไม่แปลข้อมูลผู้ใช้หรือ catalogue อัตโนมัติผ่านบริการภายนอก
- ไม่ได้ทดสอบ HIS/ระบบสิทธิ/บริษัทประกันจริง, production load หรือ browser suite เก่าทั้งชุด; ใช้ integration regression เดิมและ scenario UI เดิมใน suite ใหม่ที่แยกฐานทดสอบ

## ไฟล์ที่เพิ่มหรือแก้ในงานนี้

รายการนี้แยกจากไฟล์อื่นที่ผู้ใช้แก้ค้างไว้ก่อนเริ่ม:

- package.json
- .env.example
- next.config.ts
- playwright.config.ts
- playwright.interest.config.ts
- tsconfig.json
- next-env.d.ts (Next-generated)
- prisma/schema.prisma
- prisma/migrations/202610280001_interest_review/migration.sql
- prisma/migrations/202610280002_legacy_request_status/migration.sql
- src/app/(public)/layout.tsx
- src/app/(public)/page.tsx
- src/app/(public)/privacy/page.tsx
- src/app/globals.css
- src/components/registration-wizard.tsx
- src/components/booking-control.tsx
- src/components/bookings.tsx
- src/components/calendar.tsx
- src/components/ui.tsx
- src/components/package-list.tsx
- src/components/public-mobile-nav.tsx
- src/components/language-provider.tsx
- src/components/recover-interest.tsx
- src/lib/domain.ts
- src/lib/client.ts
- src/lib/intake.ts
- src/lib/i18n/index.ts
- src/lib/i18n/th.json
- src/lib/i18n/en.json
- src/lib/i18n/zh-Hans.json
- src/lib/i18n/my.json
- src/lib/i18n/km.json
- src/server/api.ts
- src/server/services/appointments.ts
- src/server/services/booking-policy.ts
- src/server/services/pricing.ts
- src/server/services/availability.ts
- src/server/services/questionnaires.ts
- src/server/services/interest-review.ts
- src/server/services/otp-delivery.ts
- src/server/services/recover-interest.ts
- tests/integration/booking.test.ts
- tests/integration/interest-review.test.ts
- tests/unit/interest-intake.test.ts
- tests/e2e/interest-workflow.spec.ts
- public/fonts/ (3 local Noto fonts, OFL licences, README)
- docs/system-workflow-2026-10-27.md
- docs/i18n-review-2026-10-28.md
- docs/qa/2026-10-28/ (screenshots and results)
- docs/implementation-report-2026-10-28.md
