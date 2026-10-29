# ปิดระบบ OTP ตามงบประมาณ — 28 ตุลาคม 2569

คำสั่งล่าสุดของผู้ใช้ให้ปิดการส่ง OTP เพราะยังไม่มีงบประมาณ แทนที่ workflow เดิมที่บังคับ OTP

## การทำงานปัจจุบัน

- ค่าเริ่มต้นเมื่อไม่กำหนด provider และตัวอย่าง .env.example เป็น OTP_PROVIDER=disabled; .env local ตั้ง disabled แล้ว
- หน้าลงทะเบียนไม่มีปุ่ม/ช่อง OTP/รหัสทดสอบ และดำเนินการกรอกประวัติ/ส่งความสนใจต่อได้
- API otp/request, otp/verify และ contact-requests/recover คืน OTP_DISABLED ก่อนสร้าง verification หรือเรียก provider; service ส่ง OTP ตรวจ disabled ซ้ำด้วย
- ไม่ปลอม verifiedPhone: session ที่ไม่เคยยืนยันยังเป็น null และ payload คำขอระบุ contactVerification=staff_pending ให้เจ้าหน้าที่ตรวจเบอร์/ข้อมูล
- การส่งคำขอ รับทราบราคา ข้อมูลเพิ่มเติม และ booking ใช้ active owner session; ownership, expiry, encryption, rate limit, same-origin และ transaction ตรวจราคา/ความจุยังทำงาน
- ต่างอุปกรณ์หรือ session หมดอายุให้ติดต่อเจ้าหน้าที่เพื่อยืนยันตัวตนและค้นหารายการ ห้ามใช้เบอร์/เลขติดตามเพียงอย่างเดียวเพื่อเปิดเผยข้อมูล
- MFA ด้วย authenticator ของเจ้าหน้าที่คงเดิม ไม่เกี่ยวกับการส่ง SMS
- โค้ด provider แบบ http/test เก็บไว้สำหรับการเปิดใช้ในอนาคตด้วย configuration ที่ชัดเจน; test provider ยังใช้ใน production ไม่ได้ ไม่มีการส่ง SMS จริงในงานนี้

## ผลที่ทดสอบในรอบนี้

- Typecheck ผ่าน
- Unit 62 ผ่าน ไม่มี skip
- Integration 49 ผ่าน จาก 10 files ไม่มี skip; test runner ใช้ pdh_healthcheck_test และตั้ง provider=test สำหรับ regression เดิม ส่วนไฟล์ otp-disabled.test.ts ตั้ง disabled เฉพาะชุดและคืนค่าหลังจบ
- Browser disabled-mode 1 ผ่าน (ฐานทดสอบจริง): กรอกข้อมูล/ส่งความสนใจสำเร็จ, ไม่เรียก endpoint OTP, ไม่มีปุ่มยืนยัน/ขอ OTP, session verifiedPhone=null, ไม่มี verification row และ browser context อื่นไม่เห็นรายการ
- ดูภาพ [otp-disabled-interest-390.png](qa/2026-10-28/otp-disabled-interest-390.png)

คำสั่งทดสอบโหมดปัจจุบัน: npm run test:no-otp:e2e

รายงาน 16 browser tests และ OTP recovery ในเอกสารก่อนหน้าเป็นผลโหมด OTP-enabled ที่ทดสอบไว้ก่อนคำสั่งนี้ ไม่ใช่การอ้างว่าโหมด disabled อนุญาต self-service recovery

ไม่มี migration ใหม่ในงานนี้ และไม่ได้ deploy หรือเปลี่ยนฐาน production
