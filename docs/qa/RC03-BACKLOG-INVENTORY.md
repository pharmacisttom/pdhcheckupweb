# RC03 Backlog Inventory & Gap Analysis

**Project:** PDH Smart Health Check — Pluak Daeng Hospital, Rayong  
**Branch:** `feature/rc03-clinician-feedback-7` (PR #9)  
**Baseline Commit:** `fbe13485620bb9d653efa2787bdfa972bba5e4f9`  
**Evaluation Date:** 2026-11-23  
**Status:** TEST / UAT READY (Production NO-GO pending clinical sign-off)

---

## 1. Backlog Inventory Matrix

| Task ID | Module | Requirement | Existing Implementation | Missing / Remaining Work | Risk | Priority | Files Involved | Test Evidence | Classification |
|---|---|---|---|---|---|---|---|---|---|
| **RC03-M1** | Registration Recovery | Return to previous page without losing answers; preserve inputs, selections, height, weight, questionnaire; prevent accidental duplicates; encrypted draft storage | React Hook Form `shouldUnregister: false`, answers state, `draftToken` autosave checkpoints, session-bound deterministic registration ID | Incomplete input typed before demographic/assessment save is in-memory only (mitigated by autosave checkpoints) | Low | P1 | `src/components/registration-wizard.tsx`, `src/server/api.ts` | `tests/e2e/rc03-ui.spec.ts` (autosave & back/forward reload PASS), `tests/unit/registration-checkpoint.test.ts` (PASS) | **DONE / PARTIAL (UAT Ready)** |
| **RC03-M2** | Thai ID Validation | Validate exactly 13 digits, numeric keyboard, checksum algorithm, accessible error, prevent silent truncation on paste; keep alternative document policy | `validThaiId` in `src/lib/patient-validation.ts` and inline client validator with `aria-describedby` & `aria-invalid`; `maxLength={50}` prevents silent truncation | Hospital staff UAT verification with real Thai ID card scanner/input | Low | P1 | `src/lib/patient-validation.ts`, `src/components/registration-wizard.tsx` | `tests/unit/rc03.test.ts` (PASS), `tests/e2e/rc03-ui.spec.ts` (PASS) | **DONE** |
| **RC03-M3** | Questionnaire Cleanup | Checkbox matrix for family NCD (mother, father, sibling, child); duplicate question review; preserve historical clinical answers | Checkbox interface in wizard (`familyNcdEntries` array with disease grouping); `questionnaireInventory` and `proposeRc03Questionnaire` endpoints; read-compatibility with legacy data | Clinician review of duplicate questions, translations, and formal sign-off before publishing draft | Med | P1 | `src/lib/rc03-questionnaire.ts`, `src/components/registration-wizard.tsx`, `src/components/configuration-workspace.tsx` | `tests/unit/rc03.test.ts` (PASS), `tests/e2e/rc03-ui.spec.ts` (PASS) | **PARTIAL (Awaiting Clinical Sign-off)** |
| **RC03-M4** | Admin Contact Requests | Responsive table at `/admin/contact-requests`, server pagination, reference search, status filter, accessible Radix detail modal, RBAC, masked PHI, audit log | `<ContactRequests />` in `booking-control.tsx`, `/admin/contact-requests` route with server pagination (`pageSize=20`), reference search, status filter, Radix Dialog, audit logging | Hospital administrative staff UAT on staging | Low | P1 | `src/components/booking-control.tsx`, `src/app/(admin)/admin/[section]/page.tsx`, `src/server/api.ts` | `tests/e2e/rc03-contact.spec.ts` (PASS in CI), `tests/integration/rc03.test.ts` (PASS in CI) | **DONE** |
| **RC03-M5** | Snoring History | Versioned intake question for snoring history with options (yes/no/unknown); 5 languages; no automatic sleep apnea diagnosis | `proposeRc03Questionnaire` draft generator includes `snoring_history` (`yes`, `no`, `unknown`) with translations (th, en, zh-Hans, my, km); display-only in staff review | Clinician sign-off before publishing draft as new questionnaire version | Med | P2 | `src/lib/rc03-questionnaire.ts`, `src/components/registration-wizard.tsx` | `tests/unit/rc03.test.ts` (PASS), `tests/e2e/rc03-ui.spec.ts` (PASS) | **PARTIAL (Draft Proposed, Needs Sign-off)** |
| **RC03-M6** | Individual / Group Registration | Support individual and group registration; organization selection; primary coordinator contact; optional member reference; separate patient records | Radio button individual/group, active organization selection, coordinator name & phone, member reference; stored encrypted, `registration.organizationId` reused | Full real-browser group booking capacity UAT with hospital corporate clients | Low | P2 | `src/components/registration-wizard.tsx`, `src/server/api.ts`, `src/server/services/appointments.ts` | `tests/unit/rc03.test.ts` (PASS), `tests/e2e/rc03-ui.spec.ts` (PASS) | **DONE** |
| **RC03-M7** | Anthropometrics (BMI & Age) | Mandatory height (cm) & weight (kg); calculate BMI `weight/(height/100)^2` with 2 decimals; Bangkok calendar age categories `<35` vs `>=35`; display only | `calculateBmi` & `ageBand35` in `src/lib/anthropometrics.ts`; `ageOn` in `src/lib/patient-validation.ts`; displayed in registration wizard; unrounded internally | Hospital clinical team formal approval of measurement plausibility limits | Low | P1 | `src/lib/anthropometrics.ts`, `src/lib/patient-validation.ts`, `src/components/registration-wizard.tsx` | `tests/unit/anthropometrics.test.ts` (PASS), `tests/unit/rc03.test.ts` (PASS), `tests/e2e/rc03-ui.spec.ts` (PASS) | **DONE** |

---

## 2. Legacy Modules Audit Status

| Legacy Module | Status | Verification Summary |
|---|---|---|
| **Services** | DONE | Active hospital service catalog, CRUD, revision tracking, validation. |
| **Prices** | DONE | Versioned price list, `approvedBy` requirement, effective date range validation. |
| **Packages & Items** | DONE | Package draft/publish lifecycle, fixed price, included service mapping. |
| **Questionnaire Versioning** | DONE | Immutable published versions, draft editing, version increment on publish. |
| **Day Capacity & Slots** | DONE | Day blackout, capacity limits, slot start/end times, appointment reservation tracking. |
| **Bookings & Holds** | DONE | Slot hold expiration (10 min), concurrency lock, idempotency key, status transitions. |
| **Contact Requests** | DONE | Request reference generation, triage, quote generation, scheduling, audit. |
| **Organizations** | DONE | Active status, contact encryption, registration association. |
| **Staff Users & RBAC** | DONE | Roles (superadmin, manager, registration, clinician), invitations, password resets. |
| **Login / MFA / OTP** | DONE | Bcrypt password hash, TOTP setup & recovery, replay protection, OTP provider modes. |
| **Booking Policy** | DONE | Online booking enable/disable toggle, custom announcement message. |
| **Audit Logs** | DONE | Comprehensive audit logging for all privileged view and mutate operations. |
