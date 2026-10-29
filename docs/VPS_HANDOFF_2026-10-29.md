# GitHub release และ prompt สำหรับ VPS — 29 ตุลาคม 2569

Repository: https://github.com/pharmacisttom/pdhcheckupweb.git — branch main
ใช้ full 40-character SHA ที่แนบมากับการส่งมอบครั้งนี้ ตรวจให้ตรง GitHub และ HEAD บน VPS ก่อน deploy ไม่ใช้การดึง main ล่าสุดโดยไม่ตรวจ SHA ไม่ deploy จาก working tree ที่ dirty

## ข้อมูล release

รวม flow ส่งความสนใจไม่เลือกแพ็กเกจ, staff review และ Booking จริง, ปิด OTP, ตัวเลือกประวัติสุขภาพ/เพิ่มรายการ, ลดคำถามซ้ำ, ห้าภาษา, responsive navigation และภาพประชาสัมพันธ์17ภาพ

OTP_PROVIDER=disabled เท่านั้นสำหรับ deployment ของ release นี้ validator ปรับตามแล้ว ยังต้องมี OTP_PEPPER ที่ปลอดภัยสำหรับระบบเดิม และ staff Authenticator TOTP 2FA ยังคงบังคับใช้ ไม่เกี่ยวกับ SMS budget ห้ามเปิด OTP test หรืออ้างว่าส่ง SMS สำเร็จ

โครงสร้างที่เอกสารเดิมคาดไว้ (ต้องตรวจของจริงก่อนใช้): /var/www/pdhcheckup/source, releases/{production,staging}, shared/{production,staging}; production loopback3036, staging3037; systemd pdhcheckup-production.service และ pdhcheckup-staging.service; production origin https://pdhcheckup.pluakdaenghospital.cloud; MySQL production pdh_healthcheck/user pdhcheckup_prod และ staging pdh_healthcheck_staging/user pdhcheckup_stg ตัว validator ผูกกับโครงสร้างนี้ ถ้า VPS ไม่ตรง ห้ามแก้ค่าข้ามเงื่อนไขหรือ deploy เดาเอง

Protected env ทั้งสอง environment ต้องมี NODE_ENV=production, SEED_DEMO=false, HOSTNAME=127.0.0.1, PORT, APP_URL แบบ HTTPS exact origin, DATABASE_URL, DATA_ENCRYPTION_KEY, OTP_PEPPER, OTP_PROVIDER=disabled และ mode600 staging/production ต้องมี DBuser/DB/key/pepper แยกกัน

หากมีข้อมูลเดิม ห้ามสร้าง DATA_ENCRYPTION_KEY หรือ OTP_PEPPER ใหม่มาทับของเดิม ต้องคงกุญแจที่เข้ารหัสข้อมูลชุดนั้นและสำรองนอก Git ห้ามใส่ .env, DB dumps, keys, MFA QR/secret, activation link, session token หรือข้อมูลผู้ป่วยใน Git/log/chat ภาพ QA ที่ commit เป็นข้อมูลสังเคราะห์

## หลักฐาน local และข้อจำกัด

- รอบเตรียม release: unit75 ผ่าน/typecheckผ่าน; lintรอบล่าสุด0errors1warningเดิม TanStack Table
- รอบ auditก่อนหน้า: Next webpack production build ผ่านโดยใช้ generated Prisma client; npm run build เต็มคำสั่งบน Windows ติด prisma DLL EPERM ขณะ dev server ใช้งาน ต้องรัน npm ci/generate/build ใหม่ใน Linux stagingจริง
- integration50 และ browser OTPdisabled4 + original booking regression1 ผ่านในรอบก่อน บนฐานทดสอบเท่านั้น; campaignตรวจ17URLs/7widths/5locales/keyboardผ่าน เป็น Chromium emulation
- ยังไม่ทดสอบ VPS, physical devices, providerจริง หรือการrestore productionในรอบนี้ ไม่ได้อ้างว่าพร้อมเปิดบริการผู้ป่วยจริงโดยไม่มี UAT
- ช่องว่างสำคัญใน docs/system-audit-2026-10-29.md: manual identity recoveryขณะOTPปิด, privacy/DPO approval, expert translations, notification workerที่ยังunconfigured และข้อความหน้าแรกยังกล่าวถึงยืนยันเบอร์โทร ต้องรายงานข้อจำกัดเหล่านี้ตามจริง

## Prompt ส่งให้ ChatGPT / coding agent ที่เข้าถึง VPS

คัดลอกข้อความต่อไปนี้ พร้อมแนบ FULL_COMMIT_SHA จากผู้ส่งมอบ ห้ามแนบ secrets:

---
คุณเป็นผู้ดูแล deploy โปรเจกต์ PDH Smart Health Check โรงพยาบาลปลวกแดง
Repo: https://github.com/pharmacisttom/pdhcheckupweb.git
Branch: main
Release SHA: <วาง FULL_COMMIT_SHA 40 ตัวจากผู้ส่งมอบ>

เป้าหมาย: เตรียมและนำ release นี้ขึ้น VPS โดยรักษาข้อมูลและระบบเดิม ทำงานจริง ไม่หยุดแค่เสนอแผน แต่ห้ามเริ่ม production migration/switch/restart ก่อนผู้ใช้อนุมัติ release และ SQL ที่ตรวจแล้วในขั้นสุดท้าย การอนุมัติเดิมที่ชัดเจนในsessionนี้ให้ถือว่ายังใช้ได้ไม่ถามซ้ำ

1. ตรวจ SSH/session ที่มีอยู่แบบ read-only ก่อน หากไม่มีการเชื่อมต่อ ให้ถามเฉพาะ host/SSH user/วิธีเข้าถึงที่ขาด ห้ามให้ผู้ใช้ส่งรหัสผ่าน private key .env หรือ secrets ในแชต
2. ตรวจ OS/Node/npm/MySQL/disk/RAM/ports/systemd/Nginx/TLS/DBbackup และ current/previous release ของจริง ห้ามสมมติว่า deployment docs เป็นสถานะ VPS ปัจจุบัน ห้าม reset/force checkout หรือเขียนทับงานค้าง
3. อ่าน AGENTS.md, คู่มือNextใน node_modules/next/dist/docs/ ที่เกี่ยวข้อง, docs/VPS_HANDOFF_2026-10-29.md, docs/PRODUCTION_DEPLOYMENT.md, docs/STAGING_DEPLOYMENT.md, docs/backup-restore.md และ deploy/shared/*.sh/*.mjs ใช้ toolingเดิม ไม่สร้างDocker/PM2 stackซ้อน systemd ที่ใช้อยู่
4. ตรวจ origin/branch/HEAD ให้ตรง SHA ที่กำหนด ตรวจ remoteก่อนfetchและfast-forwardเท่านั้น หากbranch tipเปลี่ยนไปจากSHAให้หยุดและแจ้ง ไม่เลือก release อื่นเอง
5. ตรวจ protected environment โดยรายงานเฉพาะมี/ไม่มีและผ่าน/ไม่ผ่าน ห้ามพิมพ์ค่า secrets staging/prodใช้ฐานและkeysแยกกัน; คงkeysเดิมของข้อมูลเดิม; NODE_ENV=production, SEED_DEMO=false, OTP_PROVIDER=disabled ห้ามใช้testprovider staff2FAต้องยังทำงาน
6. เตรียม Linux staging แยกก่อน npm ci, Prisma generate, typecheck, lint, unit, production build ใช้ฐานทดสอบแยกสำหรับ integration/E2E ห้ามรันทดสอบกับproduction ไม่ seed demo หรือ db push/reset
7. ตรวจ migration status และ SQL ใหม่ทั้งหมดกับschemaจริง ยืนยันว่า migration historyตรงกัน ไม่แก้ไฟล์ migrationเก่า คำนวณ APPROVED_MIGRATIONS_SHA256 ตาม deploy/shared/deploy.sh แต่ digest ไม่ใช่หลักฐานการreviewหรือการอนุมัติ production
8. เตรียมbackup protectedและทดสอบrestoreในฐานแยกให้สำเร็จ สำรองkeys/configนอกGit ยืนยันrollbackที่เข้ากับschemaใหม่ก่อนactivate backup.shทำgzip/checksumเท่านั้น จึงต้องมีrestore rehearsalเพิ่ม
9. ทำงานเตรียม/stagingที่ได้รับอนุญาตให้ครบ รายงาน releaseSHA, migrationSQL/digest, stagingผลทดสอบ, backup/restoreหลักฐาน, rollbackและข้อจำกัด แล้วขออนุมัติ production เป็นขั้นสุดท้ายถ้ายังไม่ได้รับ
10. เมื่ออนุมัติแล้ว ใช้ deploy/production/deploy.sh ตามเอกสารโดยส่ง branchและfullSHAและdigestที่reviewแล้ว สคริปต์จะbuild/backup/migrate/switch/restartเฉพาะบริการแอป ห้ามrestartMySQLหรือทับNginx/cert/firewall/บริการอื่นโดยพลการ ถ้าต้องแก้infraให้จัดdiff reviewแยก
11. ตรวจhealthและHTTPS พร้อมrevision, หน้าแรก/ภาพ17ไฟล์, สมัครไม่เลือกแพ็กเกจและไม่ขอOTP, ผู้ใช้อื่นอ่านข้อมูลไม่ได้, stafflogin/Auth2FA/ผู้รับผิดชอบคำขอ, review/รับทราบราคา/Bookingจริง และfullqueue/duplicateด้วยUATที่ควบคุม ห้ามสร้างข้อมูลทดสอบในproductionเองโดยไม่ได้อนุญาต ไม่มีการรายงานSMSส่งสำเร็จเพราะยังปิดอยู่
12. ถ้าhealthล้มเหลวให้รักษาข้อมูลและตรวจschema compatibilityก่อนrollbackแอป ห้ามrollbackDBแบบทำข้อมูลหาย รายงานสิ่งที่ทำจริง สิ่งที่ไม่ผ่าน/skip ข้อจำกัด และ URL/revisionสุดท้ายอย่างตรงไปตรงมา

ก่อนเปิดใช้งานจริงให้นำประเด็นauditมาประกอบการตัดสินใจ: cross-device recoveryยังไม่มีทางเลือกเมื่อOTPปิด, ข้อความprivacy/DPOและคำแปลยังรออนุมัติ, notificationoutboxยังไม่ส่งจริง ห้ามเพิ่มclinical scoringจากโปสเตอร์หรือfree textเอง
---
