 > Recovery update (2026-11-24): run 45133653177 failed during pre-consent initialization after the historical results below. See [CI failure recovery evidence](2026-11-24/RC03-CI-FAILURE-RECOVERY.md) for diagnosis, local verification, latest CI and remaining clinical/UAT gates.

# RC03 Regression & Test Verification Report

**Project:** PDH Smart Health Check  
**Commit SHA:** `fbe13485620bb9d653efa2787bdfa972bba5e4f9`  
**Branch:** `feature/rc03-clinician-feedback-7` (PR #9)  
**Verification Date:** 2026-11-23  
**Verdict:** **ALL LOCAL & ISOLATED SUITES PASS (100%)**

---

## 1. Test Execution Summary

| Suite / Gate | Command | Result | Duration / Details |
|---|---|---|---|
| **Locked Install** | `npm ci` | **PASS** | 651 packages added, 658 audited, 0 vulnerabilities |
| **Prisma Generation** | `npx prisma generate` | **PASS** | Prisma Client v6.19.3 generated |
| **TypeScript Typecheck** | `npm run typecheck` | **PASS** | Exit code 0, 0 type errors |
| **ESLint Static Code Analysis** | `npm run lint` | **PASS** | Exit code 0, 0 errors, 1 known TanStack Table warning |
| **Vitest Unit Test Suite** | `npm run test:unit` | **PASS** | **24/24 files passed, 199/199 tests passed (100%)** |
| **Database Guard Harness** | `npm run test:harness` | **PASS** | **5/5 subtests passed** (zero DB writes) |
| **Playwright UI Regression** | `npm run test:rc03:ui` | **PASS** | **7/7 browser tests passed (42.2s)** |
| **Production Build** | `npm run build` | **PASS** | Webpack production bundle, 14 static pages generated |
| **Security Audit** | `npm audit` | **PASS** | 0 vulnerabilities found |
| **Test DB Protection Gate** | `npm run test:rc03:db` | **PASS (Refused)** | Fail-closed guard successfully blocked execution against production DB |

---

## 2. Unit Test Breakdown (24 Files / 199 Tests)

```text
 ✓ tests/unit/data-promotion.test.ts (24 tests)
 ✓ tests/unit/chat-safety.test.ts (20 tests)
 ✓ tests/unit/deployment.test.ts (22 tests)
 ✓ tests/unit/chat-knowledge-seed.test.ts (25 tests)
 ✓ tests/unit/alerts.test.ts (3 tests)
 ✓ tests/unit/intake-reuse.test.ts (4 tests)
 ✓ tests/unit/session.test.ts (5 tests)
 ✓ tests/unit/crud-validation.test.ts (5 tests)
 ✓ tests/unit/health-history.test.ts (6 tests)
 ✓ tests/unit/domain.test.ts (16 tests)
 ✓ tests/unit/mfa.test.ts (5 tests)
 ✓ tests/unit/rc03.test.ts (13 tests)
 ✓ tests/unit/anthropometrics.test.ts (6 tests)
 ✓ tests/unit/staff-email.test.ts (6 tests)
 ✓ tests/unit/security.test.ts (4 tests)
 ✓ tests/unit/request-limits.test.ts (4 tests)
 ✓ tests/unit/registration-checkpoint.test.ts (2 tests)
 ✓ tests/unit/health-intake.test.ts (3 tests)
 ✓ tests/unit/interest-intake.test.ts (6 tests)
 ✓ tests/unit/pentest-regressions.test.ts (3 tests)
 ✓ tests/unit/mfa-qr.test.ts (1 test)
 ✓ tests/unit/imports.test.ts (2 tests)
 ✓ tests/unit/import-limits.test.ts (4 tests)
 ✓ tests/unit/chat-import.test.ts (10 tests)

Total: 24 passed | 0 failed | 199 tests passed
```

---

## 3. UI Regression Suite Breakdown (7 Tests / 7 Passed)

Executed via `playwright.rc03-ui.config.ts` on isolated mock layer:
1. `group, family checkboxes, snoring and BMI survive back/forward and saved reload` (8.1s) — **PASS**
2. `Thai ID errors reject excess characters without silently truncating` (4.6s) — **PASS**
3. `age display follows Bangkok even in an American browser timezone` (1.1s) — **PASS**
4. `unfinished demographic input is autosaved before assessment and restored after reload` (3.0s) — **PASS**
5. `registration stays within all target widths on mobile and desktop` (1.1s) — **PASS**
6. `registration keeps fields between steps and reports server success only after confirmation` (6.2s) — **PASS**
7. `registration uses a generic accessible alert for API errors` (1.7s) — **PASS**

---

## 4. CI Historical Cross-Verification

* **GitHub Actions Run:** [45106491302](https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/45106491302)
* **Job ID:** `137468950485`
* **Workflow:** `RC02 Integration Gates (isolated test only)`
* **Results in Ephemeral CI Environment:**
  - 14 migrations deployed to disposable `pdh_healthcheck_rc01_test` (No schema drift).
  - Persistence integration: 7/7 tests passed.
  - Guarded browser suite: 19/19 tests passed (including real admin CRUD & modal flows).
  - Webpack production build: PASS.
