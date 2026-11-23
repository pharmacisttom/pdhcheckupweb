# PDH Smart Health Check — Staging UAT Deployment & Testing Kit

ชุดเครื่องมือและคู่มือสำหรับการเตรียมข้อมูล Synthetic Data และทดสอบระบบ End-to-End User Acceptance Testing (UAT) สำหรับระบบ **PDH Smart Health Check** บนสภาพแวดล้อม **Staging**

> [!CAUTION]
> **กฎความปลอดภัยสูงสุด (CRITICAL SAFETY MANDATE):**
> 1. ห้ามแตะต้องฐานข้อมูล Production (`pdh_healthcheck`), Services, ไฟล์ หรือ Nginx ของ Production โดยเด็ดขาด
> 2. สคริปต์นี้ถูกออกแบบมาสำหรับฐานข้อมูล Staging (`pdh_healthcheck_staging`) เท่านั้น
> 3. มีระบบ Database Name Verification ตรวจจับ URL หากชี้ไปยัง Production ระบบจะตัดการทำงานทันที (Fail-Closed)
> 4. ปฏิบัติตามคำสั่งใน [MASTER_PROMPT.md](file:///d:/pdhcheckupweb/pdhcheckup-uat-kit/MASTER_PROMPT.md) อย่างเคร่งครัด

---

## 1. ข้อมูลระบบและสภาพแวดล้อม (System & Environment Info)

- **Repository:** `https://github.com/pharmacisttom/pdhcheckupweb`
- **VPS Host:** `187.52.117.39`
- **VPS SSH User:** `deploy`
- **Project Source:** `/var/www/pdhcheckup/source`
- **Staging URL:** `https://staging-pdhcheckup.pluakdaenghospital.cloud`
- **Staging Service:** `pdhcheckup-staging.service`
- **Staging Database:** `pdh_healthcheck_staging` (MySQL on `127.0.0.1:3306`)
- **Staging .env:** `/var/www/pdhcheckup/shared/staging/.env`
- **Staging Backup:** `/var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql`
- **Production Database:** `pdh_healthcheck` *(ต้องไม่มีการแก้ไขหรือรันคำสั่งใดๆ ต่อระบบนี้)*

---

## 2. โครงสร้างไฟล์ในชุดเครื่องมือ (Kit Contents)

```text
pdhcheckup-uat-kit/
├── MASTER_PROMPT.md      # ข้อกำหนดและบทบาท Master Prompt ฉบับเต็ม
├── README.md             # คู่มือการติดตั้ง คำสั่ง Dry-run/Apply และเกณฑ์การตรวจรับ
└── seed-uat-staging.ts   # สคริปต์ Seeding ข้อมูลจำลองสำหรับ Staging แบบ Idempotent
```

*(และมีไฟล์เดียวกันอยู่ที่ `scripts/seed-uat-staging.ts` ภายใน Source Code ของโปรเจกต์)*

---

## 3. รายการข้อมูลจำลองที่สคริปต์จัดเตรียม (Synthetic UAT Dataset)

### 3.1 แบบประเมินสุขภาพ (Questionnaire v1)
ครอบคลุมทั้ง 10 หมวดหมู่ตามข้อกำหนด Master Prompt:
1. **โรคประจำตัวเรื้อรัง (Chronic diseases):** เบาหวาน, ความดันโลหิตสูง, ไขมันในเลือดสูง, โรคไต, โรคหัวใจ, โรคตับ
2. **ประวัติครอบครัว (Family history):** ประวัติ NCDs ในญาติสายตรง
3. **การสูบบุหรี่ (Smoking):** ไม่สูบ, เลิกแล้ว, สูบประจำ
4. **การดื่มแอลกอฮอล์ (Alcohol):** ไม่ดื่ม, บางครั้ง, ประจำ
5. **น้ำหนักและส่วนสูง (Weight & Height):** Numeric validation
6. **ประวัติยา (Medication history):** มียาประจำหรือไม่ และระบุรายละเอียดยา
7. **ประวัติแพ้ยา (Drug allergy):** ประวัติแพ้ยาหรือสารเคมี
8. **ความเสี่ยงจากการทำงาน (Occupational exposure):** ประวัติสัมผัสสารเคมีหรือความเสี่ยงงาน
9. **การตั้งครรภ์ (Pregnancy):** ประเมินกรณีสุภาพสตรี
10. **อาการผิดปกติที่ต้องประเมินซ้ำ (Symptoms requiring clinical review):** หากมีอาการผิดปกติ กฎ Risk Rule จะปรับสถานะเป็น `needs_clinical_review`

> สถานะแบบประเมินถูกกำหนดเป็น `published` และมีผู้ลงนามอนุมัติ (`approvedBy`) ทำให้หน้าลงทะเบียนไม่พบข้อผิดพลาด *"แบบประเมินยังไม่ได้รับอนุมัติ"*

### 3.2 รายการตรวจสุขภาพและราคาจำลอง (Services & Prices)
- `UAT-CBC`: ตรวจความสมบูรณ์ของเม็ดเลือด (120.00 บาท)
- `UAT-FBS`: ตรวจน้ำตาลในเลือด (80.00 บาท)
- `UAT-LIPID`: ตรวจไขมันในเลือดครบชุด (250.00 บาท)
- `UAT-RENAL`: ตรวจการทำงานของไต BUN/Creatinine (150.00 บาท)
- `UAT-LIVER`: ตรวจการทำงานของตับ SGOT/SGPT/ALP (200.00 บาท)
- `UAT-UA`: ตรวจปัสสาวะสมบูรณ์แบบ (80.00 บาท)

### 3.3 แพ็กเกจตรวจสุขภาพจำลอง (Packages)
- `UAT-BASIC`: [UAT] แพ็กเกจตรวจสุขภาพพื้นฐาน (CBC, FBS, UA) ราคา 250.00 บาท
- `UAT-PLUS`: [UAT] แพ็กเกจตรวจสุขภาพครอบคลุม (CBC, FBS, LIPID, RENAL, LIVER, UA) ราคา 750.00 บาท

### 3.4 โควตาและรอบนัดหมาย (Appointment Availability)
- นโยบายการจองออนไลน์ `BookingPolicy` สถานะเปิดใช้งาน (`onlineEnabled: true`)
- รองรับล่วงหน้า 14 วัน (เริ่มจาก Day +2 เพื่อสอดคล้องกับเกณฑ์จองล่วงหน้า >24 ชั่วโมง)
- วันละ 4 รอบ: `08:00`, `09:00`, `10:00`, `13:00` (เวลาประเทศไทย `Asia/Bangkok`)
- รองรับรอบละ 5 ท่าน (Day capacity: 20 ท่าน/วัน)
- ทำงานแบบ **Idempotent**: ไม่ลบหรือเขียนทับรอบที่ผู้ทดสอบได้จองไปแล้ว

---

## 4. ขั้นตอนการดำเนินการบน VPS (Execution Guide)

### ขั้นตอนที่ 1: ตรวจสอบความถูกต้องและสิทธิ์ผู้ใช้
ก่อนดำเนินการ ให้ตรวจสอบว่าในฐานข้อมูล Staging มีบัญชีผู้ดูแลระบบระดับ `superadmin` ที่มีสถานะ `active = true` อย่างน้อย 1 บัญชี เพื่อใช้เป็นผู้ลงนามอนุมัติ (Auditor)

### ขั้นตอนที่ 2: รันการจำลอง (Dry-run — อ่านอย่างเดียว ไม่มีการแก้ไขข้อมูล)

```bash
cd /var/www/pdhcheckup/source

sudo -u pdhcheckup env \
  UAT_STAGING_CONFIRM=pdh_healthcheck_staging \
  SEED_DEMO=true \
  NODE_ENV=development \
  UAT_BACKUP_FILE=/var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql \
  bash -c 'set -a; source /var/www/pdhcheckup/shared/staging/.env; set +a; ./node_modules/.bin/tsx scripts/seed-uat-staging.ts --dry-run'
```

**ผลลัพธ์ที่คาดหวัง:**
- แสดง `TARGET: pdh_healthcheck_staging @ 127.0.0.1`
- แสดงชื่อและ ID ของ Superadmin
- สรุปจำนวน Service, Package, Questionnaire, Slots ที่วางแผน
- แสดงข้อความ `DRY-RUN COMPLETE: Staging database verification successful.` โดยไม่มีข้อผิดพลาด

### ขั้นตอนที่ 3: ดำเนินการบันทึกข้อมูลจำลองจริง (Apply Mode)

```bash
cd /var/www/pdhcheckup/source

sudo -u pdhcheckup env \
  UAT_STAGING_CONFIRM=pdh_healthcheck_staging \
  SEED_DEMO=true \
  NODE_ENV=development \
  UAT_BACKUP_FILE=/var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql \
  bash -c 'set -a; source /var/www/pdhcheckup/shared/staging/.env; set +a; ./node_modules/.bin/tsx scripts/seed-uat-staging.ts --apply'
```

**ผลลัพธ์ที่คาดหวัง:**
- `Created & published UAT Questionnaire v1`
- `Upserted 6 synthetic health services & prices`
- `Upserted 2 synthetic packages and item mappings`
- `Verified 14-day schedule (56 slots created/verified)`
- `Audit record created: Correlation ID [...]`
- `SUCCESS: UAT staging seed committed successfully!`

---

## 5. แผนการทดสอบ UAT และเกณฑ์การตรวจรับ (Acceptance Checklist)

### 5.1 การทดสอบหน้าบ้าน (Frontend Public Flow)
- [ ] เข้าสู่หน้าแรก Staging: `https://staging-pdhcheckup.pluakdaenghospital.cloud`
- [ ] กรอกข้อมูลผู้รับบริการจำลอง และยอมรับข้อตกลงความเป็นส่วนตัว
- [ ] ทำแบบประเมินสุขภาพครบทุกหมวดหมู่ (ไม่พบข้อความ "แบบประเมินยังไม่ได้รับอนุมัติ")
- [ ] ทดสอบเงื่อนไข Risk Rule: เลือก "มีอาการผิดปกติ" หรือ "ตั้งครรภ์" ระบบต้องแนะนำให้เจ้าหน้าที่ประเมิน
- [ ] ตรวจสอบการเลือกแพ็กเกจ `[UAT] แพ็กเกจตรวจสุขภาพพื้นฐาน` หรือ `[UAT] แพ็กเกจตรวจสุขภาพครอบคลุม`
- [ ] เพิ่มเติมรายการแล็บเดี่ยว (เช่น `UAT-RENAL` หรือ `UAT-LIVER`) และคำนวณราคารวมถูกต้อง
- [ ] เลือกรอบวันและเวลานัดหมายล่วงหน้า (แสดงช่วงเวลาตามที่สคริปต์ได้ลงทะเบียนไว้)
- [ ] ยืนยันการจอง และได้รับรหัสอ้างอิงการจอง (Booking Reference)
- [ ] ค้นหาการจองด้วยเบอร์โทรศัพท์หรือรหัสอ้างอิง

### 5.2 การทดสอบหลังบ้าน (Administrative Dashboard Flow)
- [ ] เข้าสู่ระบบเจ้าหน้าที่ผ่านหน้า Admin Login
- [ ] ตรวจสอบรายการจองคิวใหม่ที่ส่งมาจาก Frontend UAT
- [ ] ตรวจสอบแบบประเมินสุขภาพและประวัติผู้รับบริการ
- [ ] ทดสอบแก้ไข/เปลี่ยนสถานะการจองตามสิทธิ์ที่ได้รับอนุญาต
- [ ] ตรวจสอบ Audit Log ว่าบันทึกผู้ดำเนินการถูกต้อง

---

## 6. รูปแบบการบันทึกข้อบกพร่อง (UAT Defect Register)

หากพบปัญหา ให้บันทึกตามแบบฟอร์มมาตรฐานดังนี้:

| ฟิลด์ | รายละเอียด |
| :--- | :--- |
| **Bug ID** | รหัสปัญหา (เช่น `UAT-BUG-001`) |
| **Severity** | `Critical` / `Major` / `Minor` / `Cosmetic` |
| **Module** | Registration / Assessment / Booking / Admin / Availability |
| **Reproduction Steps** | ขั้นตอนการทำให้เกิดปัญหา 1-2-3 |
| **Expected Result** | ผลลัพธ์ที่ควรเกิดขึ้นตามข้อกำหนด |
| **Actual Result** | ผลลัพธ์จริงที่เกิดขึ้น (รวม HTTP Status เช่น 400, 500) |
| **Correlation ID** | รหัสอ้างอิงจาก Response Header หรือ Audit Log |
| **Fix Status** | `Open` / `In Progress` / `Resolved` / `Retested` |

---

## 7. แผนการย้อนกลับฉุกเฉิน (Rollback Instructions)

หากพบปัญหาไม่พึงประสงค์ใน Staging Database สามารถกู้คืนกลับไปยังสถานะก่อนเริ่ม UAT ได้ทันทีโดยใช้ไฟล์ Backup:

```bash
# หยุด Staging Service ชั่วคราว
sudo systemctl stop pdhcheckup-staging.service

# กู้คืนฐานข้อมูล Staging จากไฟล์ Backup ที่เตรียมไว้
mysql -u root -p pdh_healthcheck_staging < /var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql

# เริ่มการทำงานของ Staging Service อีกครั้ง
sudo systemctl start pdhcheckup-staging.service

# ตรวจสอบ Health Endpoint
curl -fsS https://staging-pdhcheckup.pluakdaenghospital.cloud/api/health
```
