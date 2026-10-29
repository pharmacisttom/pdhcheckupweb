# ผล lint และตรวจช่องว่างระบบ — 29 ตุลาคม 2569

ตรวจจาก working tree ปัจจุบัน รวมงานที่ยังไม่ได้ commit โดยไม่ reset ไม่แก้ฐานข้อมูล และไม่ deploy รอบนี้ไม่ได้แก้ application code

## ผลคำสั่งที่รันจริง

| การตรวจ | ผล |
|---|---|
| npm run lint | exit 0, 0 errors / 1 warning ที่ src/components/data-table.tsx:24 react-hooks/incompatible-library จาก useReactTable |
| npm run typecheck | exit 0 ผ่าน |
| npm run test:unit | 72 tests / 14 files ผ่าน ไม่มี skip |
| npm run build | ไม่ผ่านขั้น prisma generate: EPERM rename query_engine-windows.dll.node บน Windows ไฟล์เป้าหมายถูกใช้งาน/ล็อก ไม่ได้ไปถึง Next build |
| PDH_TEST_DIST_DIR=.local/next-interest node node_modules/next/dist/bin/next build --webpack | exit 0 ผ่าน compilation, TypeScript, static generation และ build traces โดยใช้ generated Prisma client ที่มีอยู่ ไม่ใช่หลักฐานว่า npm run build ทั้งคำสั่งผ่าน |
| ตรวจ literal t(...) ในหน้าแรกและ registration-wizard/bookings/recover-interest/campaign-gallery/package-list/calendar/ui | ไม่พบ key ขาดใน dictionaries ทั้ง5ภาษา เฉพาะ literal ที่ตรวจ ไม่ครอบคลุม dynamic keys, API/catalogue หรือคุณภาพคำแปล |

Next build ใช้ cache แยกจาก .next ของ dev server และเขียน next-env.d.ts ซึ่งเป็นไฟล์ generated ตามปกติ ไม่ได้หยุด dev server เพื่อปลดล็อก DLL

## ช่องว่างเรียงความสำคัญ

1. การคืนสิทธิ์เข้าถึงเมื่อ OTP ปิด: recover-interest แสดงให้ติดต่อเจ้าหน้าที่ แต่ API recovery ปัจจุบันต้องใช้ OTP และถูกปิดเมื่อ provider disabled ยังไม่พบ flow staff-assisted identity recovery/transfer ทางเลือก ผู้ที่เปลี่ยนอุปกรณ์หรือ session หมดอายุจึงยังกลับมาอ่านรายการ/ยอมรับข้อเสนอด้วยตนเองไม่ได้ ขณะเดียวกัน Booking ที่ผ่านเจ้าหน้าที่ต้องมี acceptedFingerprint/acceptedSlotId/acceptedAt จริง จึงมีจุดติดขัดใน workflow นี้ ควรทำขั้นตอนเจ้าหน้าที่ยืนยันตัวตนและคืนสิทธิ์ที่มี audit หรือช่องทางยืนยันตัวตนทางเลือก โดยไม่เปิดด้วยเบอร์/เลขอ้างอิงเพียงอย่างเดียว
2. Privacy notice ยังเป็นข้อความรออนุมัติ: src/app/(public)/privacy/page.tsx:35 ระบุว่าฐานกฎหมาย ระยะเวลาเก็บข้อมูล ช่องทางผู้ควบคุม/DPO ต้องกำหนดและอนุมัติจากโรงพยาบาล ยังไม่ใช่ข้อมูลนโยบายครบถ้วน
3. ภาษา: dictionaries literal ที่สุ่มขอบเขตข้างต้นครบ แต่เอกสาร i18n-review ยังระบุคำแปลสุขภาพ/สิทธิ/ความเป็นส่วนตัวรอผู้เชี่ยวชาญตรวจ และ catalogue/คำถาม/คำแนะนำจากเจ้าหน้าที่อาจใช้ approved source fallback จึงยังสรุปไม่ได้ว่าเนื้อหาทั้งระบบแปลครบ/รับรองแล้ว
4. ข้อความหน้าแรกไม่สอดคล้องโหมดปัจจุบัน: src/app/(public)/page.tsx:65 ยังเขียนให้ยืนยันเบอร์โทร ทั้งที่ปิด OTP ควรเปลี่ยนเป็นกรอกช่องทางติดต่อให้เจ้าหน้าที่ตรวจสอบ หรือผูกข้อความกับโหมดจริง
5. การส่งแจ้งเตือนจริง: appointments เขียน Notification และ schema ตั้ง status=unconfigured ยังไม่พบ delivery worker/provider ใน source ปัจจุบัน การมีนัดในเว็บไม่เท่ากับส่ง SMS/อีเมลสำเร็จ ส่วน OTP ปิดตามงบประมาณโดยตั้งใจ จึงไม่ควรเปิดหรือทำ mock ส่งสำเร็จเพื่อแก้จุดนี้
6. ตารางหลังบ้าน: warning useReactTable เป็นการข้าม optimization ของ React Compiler ไม่ใช่ lint error ควรแยกแก้ความเข้ากันได้และทดสอบค้นหา เรียง และเปลี่ยนหน้าตาราง ไม่ปิด lint ทั้งระบบ
7. การทดสอบอุปกรณ์: หลักฐานที่มีเป็น Chromium emulation ยังต้องทดสอบ Safari/iPhone/Android/iPad/Android tablet จริง คีย์บอร์ดมือถือและ screen reader จริง
8. Build pipeline: npm build ยังติด Windows DLL lock ในสภาพ dev server ทำงาน ต้องตรวจซ้ำในสภาพ build ที่ Prisma engine ไม่ถูกล็อก มี warning Prisma package.json config deprecation เพิ่มเติม แต่ยังไม่ใช่ข้อผิดพลาด build ของ Next

ยังไม่ได้ทำ integration, browser, load, HIS/insurer หรือ security/pentest ใหม่ใน audit รอบนี้ ผล integration/browser ในรายงานก่อนหน้าเป็นผลจากรอบก่อน ไม่ใช่การรันครั้งนี้ งานแก้ล่าสุดยังอยู่ local และยังไม่ได้ commit/push
