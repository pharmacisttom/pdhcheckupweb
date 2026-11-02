# Prompt ส่งต่อ ChatGPT ฝั่ง VPS — 31 ตุลาคม 2026

คัดลอกข้อความด้านล่าง พร้อมแนบ full commit SHA และลิงก์ PR จากข้อความส่งมอบล่าสุด

---

คุณดูแล PDH Smart Health Check โรงพยาบาลปลวกแดง ให้เตรียมอัปเดตงาน CRUD หลังบ้านจาก GitHub โดยเริ่มตรวจระบบจริงแบบ read-only ก่อน อย่าสมมติว่าโค้ดถูก deploy แล้ว

Repository: https://github.com/pharmacisttom/pdhcheckupweb
Branch: feature/admin-crud-completion
Release SHA: ยึด full40-character SHA ที่แนบจากผู้ส่งมอบ และตรวจว่า checkout/branch tip ตรงกัน ห้ามเดา SHA หรือ deploy branch tip ที่ยังไม่ได้ review

Dependency ที่ตรวจพบขณะส่งมอบ:
- PR1 staff onboarding: https://github.com/pharmacisttom/pdhcheckupweb/pull/1 — e8a0ad8
- PR2 Health Chat: https://github.com/pharmacisttom/pdhcheckupweb/pull/2 — f63ca09
- งาน CRUD ต่อจาก feature/pdh-health-chat ต้องตรวจสถานะจริงของ PR ทั้งหมดก่อนเลือก release/merge ห้ามข้าม migration ของ branch ก่อนหน้า

อ่านก่อนทำ:
- AGENTS.md และคู่มือ Next.js ที่เกี่ยวข้องใน node_modules/next/dist/docs/
- docs/ADMIN_CRUD_HANDOFF_2026-10-31.md
- docs/admin-crud-audit-2026-10-30.md
- docs/system-workflow-2026-10-27.md
- deploy/README.md และ deployment/backup/rollback docs ที่อ้างถึง

งานที่เพิ่มจริง:
1. CRUD องค์กรและข้อมูลติดต่อเข้ารหัส
2. รายการตรวจ/ประวัติราคา และยกเลิกชุดนำเข้าที่ยังไม่เผยแพร่
3. ปรับความจุ/สำรอง/ปิด slot โดยตรวจ Booking/Hold และ lock ตามลำดับเดิม
4. คิวรอพร้อมผู้รับผิดชอบ บันทึกติดต่อ และลิงก์ Booking จริง
5. เลื่อนนัดฝั่งเจ้าหน้าที่ผ่าน transaction ตรวจความจุเดิม พร้อมบันทึกผู้ใช้ตกลงวันเวลาใหม่
6. clinician อ่านแพ็กเกจเพื่ออนุมัติได้, clone เติมค่าเดิมเป็นรุ่นใหม่, pagination/search
7. แก้แบบประเมิน draft/เก็บเข้าคลังโดยไม่แก้ published ทับ
8. การเงินแบบ manual evidence ledger: อนุมัติยอด/เรียกเก็บ/รับชำระ/คืน/void พร้อม revision และ idempotency ไม่ได้โอนเงินจริงหรือออกใบเสร็จทางการ
9. PDPA case workflow ตรวจตัวตน ผู้รับผิดชอบ ประวัติ และปกปิดแชตเฉพาะเจ้าของคำร้องลบที่ผ่านการตรวจแล้ว ไม่ลบข้อมูลคลินิกทั้งหมด/backup อัตโนมัติ
10. CRUD หน่วยงาน Chat และเมนูตาม permission เดียวกับ server
11. แก้ race ของ rate limiter เมื่อคำขอแรกเข้าพร้อมกัน
12. CSV รักษารหัสศูนย์นำหน้า; ไฟล์/mapping ผิดตอบ422; unknown503 มี request ID และ sanitized metadata log โดยไม่ log ข้อมูลผู้ใช้

Migration ใหม่: prisma/migrations/202610300003_admin_crud/migration.sql
เป็น additive เพิ่ม revision/fields และ FinanceEntry/PrivacyCaseEvent ไม่ลบตารางเดิม เคยรันเฉพาะ local test และ local demo ไม่ใช่ VPS

ผลทดสอบ local ล่าสุด:
- typecheck และ standalone build ผ่าน
- lint0 errors /1 warning เดิม TanStack Table
- unit114 ผ่าน
- integration94 ผ่าน บนฐานทดสอบเท่านั้น
- browser CRUD8, Health Chat8, ลงทะเบียนปิด OTP4 ผ่าน
- screenshots มือถือ390/แท็บเล็ต820 และ Chat360–1280 เป็น browser emulation ไม่ใช่อุปกรณ์จริง
ผล local ไม่ใช่หลักฐานว่า staging/production ผ่านแล้ว

ลำดับดำเนินงาน:
1. ตรวจ git status, release SHA ที่ systemd ใช้จริง, source checkout, port3036/3037, Nginx และ migration status แบบ read-only อย่า reset/เขียนทับงานค้าง
2. วิเคราะห์503หน้า /admin/lab-pricing แยกจาก CRUD: ระบุ GET/POST endpoint, response/request ID, app/proxy logs และ schema/config จริง ห้ามสรุปว่าไฟล์ผิดหรือขาด migration จาก503อย่างเดียว
3. Review code/migration digest ของ exact SHA ใช้ Git blobs/LF ให้ตรงกับ git archive ไม่ใช้ checksum ของ working tree Windows CRLF โดยไม่เทียบ
4. ตรวจ protected staging/production environments แยก DB account/keys/origin/port; unset test-only environment overrides บน VPS ห้ามพิมพ์ .env หรือ secrets
5. Backup และ restore staging ลงฐานแยกเพื่อพิสูจน์กู้คืนได้ก่อนเสนอ production
6. เตรียมและทดสอบ staging ด้วย deploy/staging/deploy.sh BRANCH FULL_SHA และ APPROVED_MIGRATIONS_SHA256 ตาม handoff ใช้ข้อมูลสังเคราะห์ ไม่รัน integration tests หรือ seed กับ staging/production
7. ทดสอบ CRUD ตาม role, stale revision, payment retry/concurrency, queue-full, price two-person approval, PDPA identity/ownership, registration, staff MFA และ Chat
8. เตรียม application rollback ไป release ที่เข้ากับ schema โดยคง additive tables/history ห้าม restore DB ทับ Booking ใหม่โดยไม่พิจารณาข้อมูล
9. รายงานผลจริงพร้อม commit/digest/backup/restore/staging UAT/ข้อจำกัด และหยุดก่อนเปลี่ยน production เพื่อขออนุมัติแผนที่ตรวจสอบได้

ข้อห้าม:
- ไม่เปลี่ยนรหัส/seed เจ้าหน้าที่จริง ไม่ regenerate DATA_ENCRYPTION_KEY หรือ OTP_PEPPER
- OTP_PROVIDER=disabled ตามคำสั่งเจ้าของโครงการ; TOTP MFA เจ้าหน้าที่ต้องยังทำงาน
- Chat/email/external AI คงปิดหากยังไม่ได้ตั้งค่าและอนุมัติจริง ห้ามจำลองการส่งสำเร็จ
- ไม่ส่งข้อมูลผู้ใช้/สุขภาพไป external AI หรือแปลภายนอก
- ไม่ข้าม server permissions/ownership/revision/capacity หรืออนุมัติราคาด้วยผู้นำเข้าบัญชีเดียวกัน
- ไม่อ้างว่าพร้อม production หากยังไม่ได้ staging/restore/load/device tests

เริ่มตรวจและทำงานส่วนที่ปลอดภัยต่อได้ ไม่หยุดเพียงเสนอแผน แต่ห้ามเปลี่ยน production ก่อนอนุมัติ

Migration-set SHA256 from reviewed Git blobs (LF): 664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8
ตรวจ SQL และเทียบ digest ของ exact release บน VPS ก่อนตั้ง APPROVED_MIGRATIONS_SHA256; ค่านี้ไม่ใช่การอนุมัติ deploy production
