# PDH Smart Health Check v1.0

พอร์ตระบบ: **3036** ทั้ง `npm run dev` และ `npm start` เปิดที่ `http://localhost:3036` สำหรับติดตั้งหลัง reverse proxy ใช้ upstream `127.0.0.1:3036` ตามไฟล์ตัวอย่างใน `ops` และตั้ง `APP_URL` ให้ตรงกับ URL จริงที่ผู้ใช้เปิด (รวมพอร์ตหากเปิดผ่านพอร์ตโดยตรง)

แอป Next.js สำหรับลงทะเบียนตรวจสุขภาพและจัดการงานโรงพยาบาลปลวกแดง อยู่ระหว่างพัฒนา — **ยังไม่ผ่านเกณฑ์ production และยังไม่ครบทุกโมดูลใน master prompt** ดู [สถานะงาน](docs/requirements.md) และ [เงื่อนไขความปลอดภัย](docs/security-operations.md)

## เริ่มต้นในเครื่อง

ใช้ Node.js 22 LTS และ MySQL 8 InnoDB แยกฐานข้อมูลสำหรับพัฒนา ห้ามใช้ฐานข้อมูลผู้ป่วยจริง

```powershell
npm ci
Copy-Item .env.example .env
# ตั้ง DATABASE_URL, APP_URL, DATA_ENCRYPTION_KEY และ OTP_PEPPER ใน .env
npm run db:generate
npm run db:migrate
# เฉพาะพัฒนา: SEED_DEMO=true, SEED_ADMIN_EMAIL และรหัสผ่าน >=14 ตัวอักษร
npm run db:seed
npm run dev
```

ตั้ง `OTP_PROVIDER=test` เฉพาะพัฒนาเพื่อทดสอบการยืนยันเบอร์ ระบบแสดงรหัสบนหน้าฟอร์มพร้อมป้ายทดสอบ ไม่บันทึกรหัสใน log หากยังไม่เชื่อมต่อผู้ให้บริการจริงจะตอบว่า unconfigured ห้ามตั้ง test provider ใน production

สร้าง key และ pepper แยกกันด้วย `node -e "console.log(require('crypto').randomBytes(32).toString('hex'))"` เก็บเฉพาะใน environment ที่ป้องกันสิทธิ์ ห้าม commit `.env`

ทางเลือก MySQL แบบแยก: ตั้ง MYSQL_PASSWORD และ MYSQL_ROOT_PASSWORD ใน shell จากนั้น `docker compose up -d db` ใช้พอร์ต loopback 3307 ไม่กระทบ MySQL พอร์ตเดิม Docker ต้องทำงานก่อน

## ตรวจสอบ

```powershell
npm run typecheck
npm run lint
npm test
npm run build
npm run test:e2e
npm run test:pentest
```

Integration test ใช้ฐานชื่อ `pdh_healthcheck_test` เท่านั้น ตั้ง DATABASE_URL ของฐานทดสอบที่ migrate แล้ว และ RUN_DB_TESTS=true ก่อน `npm test` ไม่ใช้ mock แทน InnoDB หรืออ้างว่าผ่านเมื่อไม่มี MySQL

## โครงสร้างและเอกสาร

Source: `src/app`, `src/components`, `src/lib`, `src/server/services` · Schema/migration: `prisma` · Tests: `tests` · API: [OpenAPI](docs/openapi.json)

[สถาปัตยกรรม](docs/architecture.md) · [ERD](docs/database-erd.md) · [สิทธิ์](docs/permissions.md) · [เส้นทาง](docs/routes.md) · [การนำเข้า](docs/import-specification.md) · [การวิเคราะห์ Excel ที่ยังไม่ได้แนบ](docs/excel-source-analysis.md) · [คู่มือผู้ใช้](docs/user-manual-th.md) · [คู่มือเจ้าหน้าที่](docs/admin-manual-th.md) · [แผน deployment](docs/deployment.md) · [สำรอง/กู้คืน](docs/backup-restore.md)

ไม่ deploy อัตโนมัติ ไม่แก้ VPS เดิม ไม่มีข้อมูลติดต่อ/ตราโรงพยาบาลหรือข้อมูลราคาจริงที่สร้างขึ้นเอง ข้อมูล seed เป็นสังเคราะห์และใช้เฉพาะการพัฒนา

## Production synchronization

See [deployment workflow](docs/PRODUCTION_DEPLOYMENT.md), [environment settings](docs/ENVIRONMENT_VARIABLES.md), [MFA enrollment](docs/MFA_SETUP.md), and [verification report](docs/production-sync-report-2026-10-22.md). Production/staging scripts are under deploy/. Existing lowercase docs/architecture.md and docs/backup-restore.md remain canonical on Windows.

Staff account administration and self-service 2FA are documented in [USER_MANAGEMENT.md](docs/USER_MANAGEMENT.md), including the additive migration and restricted enrollment sessions.
