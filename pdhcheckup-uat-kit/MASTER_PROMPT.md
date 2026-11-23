# MASTER PROMPT — PDH SMART HEALTH CHECK
## STAGING UAT DEPLOYMENT & END-TO-END TESTING

**Role:** Senior Full-Stack Engineer, DevOps Engineer, Database Engineer, QA Automation Engineer and Healthcare Information Security Specialist.  
**Mission:** Deploy and activate a fully functional UAT environment for PDH Smart Health Check on the existing Ubuntu VPS, using realistic synthetic data and the existing UI/UX.  
**Priority:** Make the Staging environment usable for hospital staff testing as soon as safely possible. Fix blocking issues, preserve existing functionality, and report remaining defects.

---

### 1. PROJECT INFORMATION

- **Project:** PDH Smart Health Check
- **Repository:** `https://github.com/pharmacisttom/pdhcheckupweb`
- **Technology Stack:**
  - Next.js 16 / React
  - TypeScript
  - Prisma ORM
  - MySQL
  - Nginx
  - Ubuntu VPS
  - systemd
  - Vitest / Playwright
- **VPS SSH User:** `deploy`
- **VPS Host:** `187.52.117.39`
- **Project Source Path:** `/var/www/pdhcheckup/source`
- **Staging Application:** `https://staging-pdhcheckup.pluakdaenghospital.cloud`
- **Staging Service:** `pdhcheckup-staging.service`
- **Staging Database:** `pdh_healthcheck_staging`
- **Staging Environment File:** `/var/www/pdhcheckup/shared/staging/.env`
- **Production Application:** `https://pdhcheckup.pluakdaenghospital.cloud`
- **Production Service:** `pdhcheckup-production.service`
- **Production Database:** `pdh_healthcheck`
- **Existing Staging Backup:** `/var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql`

> [!CAUTION]
> **IMPORTANT: Production must remain completely untouched.**

---

### 2. PRIMARY OBJECTIVES

1. Preserve the existing website design, navigation, registration workflow, and administration interface.
2. Activate the existing Staging application for end-to-end UAT.
3. Populate the isolated Staging database with realistic synthetic test data.
4. Allow testers to create, save, view, and modify test records through the actual application.
5. Enable staff to test administrative workflows.
6. Identify and fix blocking application errors.
7. Record bugs, errors, and correlation IDs.
8. Keep UAT data persistent for later investigation and correction.
9. Produce a deployment and UAT readiness report.
10. Do not replace the application with a prototype or a mock website. All test transactions must use the actual Staging application and Staging MySQL database.

---

### 3. MANDATORY SAFETY RULES

- Never modify the Production database, files, service, Nginx configuration, or environment variables.
- Never run database migrations or seed scripts against Production.
- Never execute the existing general-purpose seed without inspecting its side effects.
- Never run destructive tests against an unverified database.
- Never delete existing UAT records automatically.
- Never expose passwords, encryption keys, API tokens, session cookies, or patient information in logs or reports.
- Never use real patient identities or real medical records for testing.
- Never enable external AI, public Health Chat, or external notification services merely to make UAT pass.
- Do not modify global Node.js, MySQL, PHP, Nginx, or firewall settings that could affect other VPS applications.
- Do not disable authentication, authorization, MFA, CSRF protection, or rate limiting.
- Use least-privilege credentials.
- Do not change clinical decision rules merely to make tests pass.
- If an operation could affect Production or another application, stop and request approval.
- Before database writes, verify that the connected database is exactly `pdh_healthcheck_staging`.
- Before deployment, confirm that the existing backup is readable and verify its checksum. Preserve the backup and create another backup if necessary.

---

### 4. UAT DATA PREPARATION

Use the provided UAT kit, if available, as a starting point: `pdhcheckup-uat-kit.zip`.  
Review scripts and adapt them to the actual Prisma Schema and deployed application version. Do not assume the ZIP has already been installed or tested.

Create a dedicated Staging-only seed script: `scripts/seed-uat-staging.ts`.

The script must support:
- `--dry-run`
- `--apply`
- Exact database allowlist (`pdh_healthcheck_staging` on localhost only)
- Idempotent execution
- Synthetic data markers (`[UAT]`, `UAT-`)
- Structured execution summary
- Safe failure and rollback for transactional operations
- No destructive reset
- No overwrite of tester-modified records

#### Questionnaire
Create and publish a UAT questionnaire compatible with the current registration flow.
Include:
1. Chronic diseases (เบาหวาน, ความดันโลหิตสูง, ไขมันในเลือดสูง, โรคไตเรื้อรัง, โรคหัวใจและหลอดเลือด, โรคตับ)
2. Family history (ประวัติโรคไม่ติดต่อในญาติสายตรง)
3. Smoking (การสูบบุหรี่)
4. Alcohol consumption (การดื่มแอลกอฮอล์)
5. Weight and height (น้ำหนัก, ส่วนสูง)
6. Medication history (มียาที่ใช้ประจำหรือไม่, รายละเอียดยา)
7. Drug allergy (ประวัติแพ้ยา)
8. Occupational exposure (ความเสี่ยงจากการทำงาน)
9. Pregnancy (การตั้งครรภ์)
10. Symptoms requiring clinical review (อาการผิดปกติที่ต้องการให้เจ้าหน้าที่ประเมินเพิ่มเติม)

Preserve the existing risk-rule structure (`needs_clinical_review`).  
Verify that the registration page no longer displays: **แบบประเมินยังไม่ได้รับอนุมัติ**.  
Do not silently replace an existing published questionnaire.

#### Service and Price
Create synthetic health-check services and corresponding prices using distinct UAT identifiers:
- `UAT-CBC`: Complete Blood Count (ความสมบูรณ์ของเม็ดเลือด)
- `UAT-FBS`: Fasting Blood Sugar (น้ำตาลในเลือด)
- `UAT-LIPID`: Lipid Profile (ไขมันในเลือด)
- `UAT-RENAL`: Renal Function BUN/Creatinine (การทำงานของไต)
- `UAT-LIVER`: Liver Function AST/ALT/ALP (การทำงานของตับ)
- `UAT-UA`: Urinalysis (ตรวจปัสสาวะสมบูรณ์แบบ)

Use clinically plausible test descriptions, but clearly label every price as simulated.  
Verify service-price relationships and effective dates.

#### Packages
Create at least:
- `UAT-BASIC`: [UAT] แพ็กเกจตรวจสุขภาพพื้นฐาน (จำลอง)
- `UAT-PLUS`: [UAT] แพ็กเกจตรวจสุขภาพครอบคลุม (จำลอง)

Include package items, published status, and valid effective dates.  
Verify package eligibility and price calculation.

#### Appointment Capacity
Prepare appointment availability for approximately the next 14 days, using existing scheduling rules:
- Valid timezone: `Asia/Bangkok`
- Daily capacity & slot capacity
- Reservation limits, no overbooking, closed dates, concurrent booking safety
- Do not override existing schedules or bookings

#### Synthetic Patient Records
Do not prepopulate real patient data. Allow testers to create synthetic patient registrations through the actual UI using clearly fictional identities and reserved test contact information.

---

### 5. FRONTEND UAT

Test the complete public workflow:
1. Homepage
2. Registration entry
3. Privacy notice and consent
4. Patient information entry
5. Health-risk assessment
6. Questionnaire validation
7. Package recommendation
8. Package selection
9. Additional laboratory services
10. Price calculation
11. Appointment selection
12. Booking confirmation
13. Booking reference generation
14. Booking lookup
15. Cancellation or modification where supported
16. Desktop and mobile layouts

Preserve existing UI/UX. Fix blocking errors without unnecessary redesign.

---

### 6. ADMINISTRATIVE UAT

Test existing staff and administrative workflows:
- Staff login & MFA where configured
- Dashboard
- Questionnaire management
- Service management & Price management
- Package management
- Appointment capacity & Slot management
- Booking management & Booking status
- Patient registration lookup
- Audit trail
- Authorized record updates
- CSV/XLSX price import separately (preview, validation, approval)

Do not bypass authorization or force unsupported data modifications.  
For every failed operation, record endpoint, HTTP status, timestamp, and correlation ID.

---

### 7. AUTOMATED TESTING

Use the project's existing Vitest and Playwright test suites.
Before executing any test:
- Inspect its database dependencies.
- Identify setup and teardown operations.
- Check whether it creates or deletes data.
- Verify that the test target is an isolated disposable database when required.
- Do not run destructive Playwright suites directly against the persistent UAT database. Use a separate disposable test database or non-destructive browser test scenarios.

Test scopes:
- Registration validation
- Risk assessment
- Package eligibility & Price calculation
- Booking & Duplicate submission prevention
- Concurrent booking safety
- Authentication & Authorization
- Admin CRUD
- Error handling & Mobile responsiveness

---

### 8. DEPLOYMENT

Use the existing Staging deployment architecture:
1. Git status and version inspection
2. Staging database isolation verification
3. Backup verification
4. Dependency verification
5. TypeScript checks (`npm run typecheck`)
6. Prisma Client generation (`npx prisma generate`)
7. Build (`npm run build`)
8. Staging-only deployment
9. Controlled Staging service restart (`systemctl restart pdhcheckup-staging.service`)
10. Health checks (`GET /api/health` -> HTTP 200)
11. Smoke tests & UAT data verification

> [!WARNING]
> Do not restart Production. Use existing rollback mechanism if replacement fails.

---

### 9. ERROR MONITORING

Capture and categorize:
- HTTP 4xx/5xx errors
- Prisma errors & Database constraint violations
- Authentication errors
- Validation failures
- Booking conflicts
- React rendering errors
- Failed API requests & JS console errors

Create a UAT defect report containing:
- Bug ID
- Severity (Critical, Major, Minor, Cosmetic)
- Module
- Reproduction steps
- Expected result vs Actual result
- Correlation ID
- Root cause (if verified)
- Fix status & Retest result

> [!IMPORTANT]
> Do not log plaintext patient health information.

---

### 10. ACCEPTANCE CRITERIA

The UAT environment is ready when:
- [ ] Staging health endpoint returns HTTP 200.
- [ ] Registration page loads successfully.
- [ ] Published questionnaire is available (no "แบบประเมินยังไม่ได้รับอนุมัติ").
- [ ] Synthetic services and prices are visible.
- [ ] Packages can be selected and calculated accurately.
- [ ] Booking slots are available for the upcoming 14 days.
- [ ] A synthetic registration can be completed and saved.
- [ ] The resulting booking reference can be retrieved.
- [ ] Authorized staff can access the corresponding records in the admin dashboard.
- [ ] Supported administrative edits persist correctly.
- [ ] No critical blocking error remains in the tested workflow.
- [ ] Production remains completely unchanged.

*If any acceptance criterion fails, report it as FAILED rather than claiming completion.*

---

### 11. FINAL DELIVERABLES

1. Staging deployment report
2. Seed execution summary
3. Database isolation verification
4. Frontend test results
5. Admin test results
6. Playwright/Vitest results
7. Bug/Error register
8. Outstanding issues
9. Rollback instructions
10. UAT readiness verdict: **READY** / **READY WITH LIMITATIONS** / **NOT READY**
11. Final UAT URL: `https://staging-pdhcheckup.pluakdaenghospital.cloud`
