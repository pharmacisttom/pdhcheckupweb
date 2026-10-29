# Prompt สำหรับแจ้ง ChatGPT

อัปเดตคำสั่งล่าสุด: ผู้ใช้สั่งปิด OTP เพราะไม่มีงบประมาณ ตั้ง OTP_PROVIDER=disabled แล้ว ลงทะเบียนได้โดยไม่ขอรหัส เบอร์รอเจ้าหน้าที่ตรวจสอบ ห้ามปลอม verifiedPhone และห้ามกู้รายการข้ามอุปกรณ์ด้วยเบอร์/เลขอ้างอิงอย่างเดียว การเปิดใช้ SMS อีกครั้งต้องมีคำสั่งและ configuration ชัดเจน ข้อมูล OTP-enabled ด้านล่างเป็นประวัติ/ทางเลือกในอนาคต


คัดลอกข้อความด้านล่างไปใช้กับ ChatGPT ที่เข้าถึง repository ได้ หากไม่มีสิทธิอ่าน repo ให้แนบเอกสารที่ระบุพร้อมข้อความนี้

---

คุณเป็นผู้พัฒนาโปรเจกต์ PDH Smart Health Check สำหรับโรงพยาบาลปลวกแดง ให้ทำงานต่อจากโค้ดปัจจุบัน ไม่เริ่มโปรเจกต์ใหม่และไม่หยุดแค่เสนอแผน

Repository: https://github.com/pharmacisttom/pdhcheckupweb
Branch: main
Local workspace: D:\pdhcheckupweb

ก่อนทำงาน:
1. อ่าน AGENTS.md และคู่มือ Next.js ที่เกี่ยวข้องใน node_modules/next/dist/docs/ ก่อนเขียนโค้ด
2. อ่าน docs/system-workflow-2026-10-27.md, docs/implementation-report-2026-10-28.md, docs/i18n-review-2026-10-28.md และ docs/qa/2026-10-28/README.md แล้วตรวจเทียบกับโค้ดจริง
3. ตรวจ git status/diff รักษางานที่ยังไม่ commit ห้าม reset/clean หรือทับงานโดยไม่ตรวจ
4. ใช้ UI, API, authentication, encryption, Prisma/MySQL และ booking transaction เดิม
5. ทำงานใน local ห้าม deploy หรือรัน migration กับ production หากยังไม่ได้รับคำสั่งชัดเจน

สถานะล่าสุดที่ทำแล้ว:
- ส่งความสนใจได้แม้ไม่มีแพ็กเกจหรือ quote พร้อมเลขติดตาม และแยกจากการยืนยันนัด
- เก็บข้อมูลส่วนตัว/สุขภาพเข้ารหัส รองรับประวัติผ่าตัด ยา/อาหารเสริม แพ้ยา/อาหาร/สาร และ NCD ญาติแบบความสัมพันธ์/โรค โดยไม่มีฟิลด์ชื่อญาติ
- Privacy ก่อนเริ่มกรอก เก็บ notice version, validation รุ่นใหม่ และอ่านแบบร่างเก่าได้
- หลังบ้านมีผู้รับผิดชอบ ผลตรวจข้อมูล ผลตรวจสิทธิ บันทึกติดต่อ ขอข้อมูลเพิ่ม และ server-side status/audit
- ผู้ใช้รับทราบราคาและวันเวลา ก่อนเจ้าหน้าที่สร้าง Booking จริงผ่าน service เดิมที่ตรวจราคา ความจุ และป้องกันรายการซ้ำ
- กู้รายการและนัดเดิมต่างอุปกรณ์ด้วย OTP เบอร์เดิม + เลขติดตาม/เลขนัด + วันเกิด พร้อมตรวจ ownership
- Public UI รองรับ th, en, zh-Hans, my, km; เปลี่ยนภาษาไม่ล้างฟอร์มหรือ OTP มี dictionaries/fallback และฟอนต์ local
- เมนูมือถือสามรายการ: หน้าหลัก ลงทะเบียน รายการของฉัน พร้อม responsive/safe-area
- มี staff enrollment/MFA/user management และเอกสาร operations ใน snapshot นี้
- Dev ใช้ Turbopack หลังพบปัญหา manifest JSON ใน Webpack dev; production build ยังใช้ Webpack

Migrations ใหม่ในงานล่าสุด:
- 202610280001_interest_review
- 202610280002_legacy_request_status
มี staff enrollment migration 202610220002_staff_enrollment อยู่ก่อนด้วย ต้องอ่าน migration history ให้ครบ

ผลที่รันและบันทึกไว้ในรอบก่อน ไม่ใช่ผลทดสอบที่คุณเพิ่งรัน:
- typecheck และ build ผ่าน
- lint: 0 errors, 1 warning เดิมของ TanStack Table/React Compiler
- unit 62 ผ่าน, integration 46 ผ่าน, browser suite 16 ผ่าน ไม่มี skip
- รันทวน flow จริงหลังปรับข้อความล่าสุดอีก 1 ครั้ง ผ่าน (เป็น testcase เดิม ไม่ใช่เพิ่มเป็น 17 tests)
- screenshots 31 ภาพ: browser emulation เจ็ดความกว้าง 360/390/430/768/820/1024/1280 และสี่แนวนอน ไม่ใช่ผลจากอุปกรณ์จริง
- Integration/browser tests ใช้ฐาน pdh_healthcheck_test บน localhost เท่านั้น
- migrations ถูกใช้กับฐาน local development และ test แล้ว ไม่มี deploy หรือ production migration

สิ่งที่ยังเหลือ:
- เชื่อมและทดสอบ SMS provider จริง: OTP_PROVIDER=http, OTP_HTTP_URL (HTTPS), OTP_HTTP_TOKEN; adapter รับ POST {phone, code, ttlSeconds:300} พร้อม Bearer token
- เชื่อม notification worker/outbox และทดสอบการส่งจริง ห้ามจำลองว่ามีการส่งสำเร็จหรือเปิด test OTP ใน production
- ทดสอบ iPhone/Android/iPad/Android tablet จริง ทั้งสองแนว คีย์บอร์ดจริง Safari/WebKit และ screen reader
- ให้ผู้เชี่ยวชาญตรวจคำแปลสุขภาพ/สิทธิ/ความเป็นส่วนตัว และให้โรงพยาบาล/DPO อนุมัติ notice/retention/legal basis/contact details
- ข้อความ catalogue/preparation ที่ผู้ดูแลเพิ่มเองยังใช้ approved source/fallback จนมีคำแปลที่อนุมัติ ห้ามส่งข้อมูลผู้ใช้ไปบริการแปลภายนอก
- ยังไม่ได้ทดสอบ HIS/บริษัทประกันจริง, production load และ browser suite เก่าทั้งชุด อย่าอ้างว่าผ่าน

งานถัดไป: ตรวจ implementation กับเป้าหมายและเอกสาร สรุปช่องว่างที่มีหลักฐานสั้น ๆ แล้วแก้ส่วน local ที่ยังขาดให้ครบ โดยให้ความสำคัญกับ correctness, ownership, privacy, booking capacity/ราคา และ regression ก่อน หากต้องใช้ credentials ให้ทำส่วนที่ไม่ติดให้เสร็จและระบุ configuration ที่ต้องมีอย่างตรงไปตรงมา

รัน npm run typecheck, npm run lint, npm run test:unit, npm run test:db และ npm run test:interest:e2e ตามส่วนที่เปลี่ยน ใช้ฐานทดสอบเท่านั้น อัปเดต workflow และรายงานไฟล์/migrations/ผลทดสอบจริง/สิ่งที่ยังไม่ได้ทดสอบ ห้ามรายงานผ่านเมื่อไม่ได้รันหรือมี skip


อัปเดต 2026-10-29: ลดคำถามซ้ำและรวมกลุ่มประวัติ/ญาติแล้ว อ่าน docs/lean-registration-2026-10-29.md ก่อนทำต่อ ผลล่าสุด unit72 integration50 browser disabled4 และ booking regression1 ผ่าน ไม่มี migration/deploy/commit/push รอบนี้
