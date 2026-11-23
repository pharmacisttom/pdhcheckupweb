# RC03 Release Readiness & Go-Live Gates

**Project:** PDH Smart Health Check — Pluak Daeng Hospital  
**Date:** 2026-11-23  
**Status:** **TEST / UAT READY** (Production Deployment NO-GO)

---

## 1. Executive Summary

Branch `feature/rc03-clinician-feedback-7` (PR #9) ได้รับการตรวจสอบและทดสอบอย่างเข้มงวด ทั้ง Unit Tests, Database Guards, Playwright UI Tests และ Production Build ผลลัพธ์ผ่าน 100% โดยระบบมีความพร้อมสูงสุดสำหรับรอบการตรวจรับ (User Acceptance Testing - UAT) บน Staging Environment

อย่างไรก็ตาม ตามหลักความปลอดภัยทางคลินิก (Clinical Safety) และข้อกำหนดของโรงพยาบาลปลวกแดง **ระบบ Production ยังคงมีสถานะ NO-GO** จนกว่าจะผ่านเงื่อนไขการลงนามอนุมัติครบทุกข้อ

---

## 2. Release Condition Checklist

| Gate | Requirement | Status | Next Action |
|---|---|:---:|---|
| **Gate 1: Code & Build Quality** | TypeScript 0 error, ESLint 0 error, Production Webpack Build PASS | 🟢 **PASS** | Completed on commit `fbe1348` |
| **Gate 2: Automated Tests** | Unit tests 199/199 PASS, Guard tests 5/5 PASS, UI Playwright 7/7 PASS | 🟢 **PASS** | Test results documented |
| **Gate 3: Database & Migration Safety** | 14 migrations verified, zero schema drift, fail-closed test DB guard active | 🟢 **PASS** | Dedicated test DB enforced |
| **Gate 4: Dependency Vulnerability** | `npm audit` reports 0 vulnerabilities | 🟢 **PASS** | Dependencies verified |
| **Gate 5: Clinical Sign-off** | Physician review and formal approval of proposed Questionnaire Draft (including Snoring question and translations) | 🟡 **PENDING** | Submit proposed draft to Hospital Clinical Board |
| **Gate 6: Anthropometrics Policy** | Approval of BMI display policy and clinical limits (confirming no automatic package assignment) | 🟡 **PENDING** | Awaiting Hospital Medical Director sign-off |
| **Gate 7: Hospital Staff UAT** | Hospital registration staff, administrators, and clinicians complete UAT checklist on Staging | 🟡 **PENDING** | Execute UAT using `docs/qa/RC03-UAT-CHECKLIST.md` |
| **Gate 8: SMS OTP Provider** | Verification of real SMS OTP delivery gateway before live patient registration | 🟡 **PENDING** | Configure and test SMS gateway on staging |
| **Gate 9: Production Backup Verification** | Verified Production backup dump and checksum rehearsal | 🟡 **PENDING** | Run `scripts/run-production-deploy.sh prepare` prior to cutover |

---

## 3. Rollback Strategy

1. **Zero Database Schema Rollback Needed:**
   - การเพิ่มฟิลด์สัดส่วนร่างกาย (ส่วนสูง, น้ำหนัก, ค่า BMI), ประวัตินอนกรน, และข้อมูลหน่วยงานกลุ่ม ถูกเก็บอยู่ใน JSON Payload ที่เข้ารหัสของตาราง `Registration` และใช้ฟิลด์ `organizationId` เดิมที่มีอยู่แล้ว
   - ไม่มีการ Migrate ฐานข้อมูลใหม่ จึงไม่มีความเสี่ยงเรื่อง Schema Incompatibility หากต้องย้อนเวอร์ชัน
2. **Application Rollback:**
   - หากพบปัญหาในขั้นตอน UAT หรือ Deployment สามารถ Rollback กลับไปยัง Release Candidate หรือ Commit ก่อนหน้าได้ทันทีผ่านคำสั่ง Git / Deploy Runner
3. **Data Preservation:**
   - ข้อมูลคำตอบเดิมในอดีต (Historical Intake Responses) ทั้งหมดยังคงถูกอ่านและประมวลผลได้อย่างสมบูรณ์ ไม่มีการลบข้อมูลประวัติคนไข้เด็ดขาด
