# RC03 Security, PDPA & Data Integrity Review

**Project:** PDH Smart Health Check — Pluak Daeng Hospital  
**Audit Date:** 2026-11-23  
**Auditor Role:** Principal DevSecOps & Security Architect  
**Evaluation Target:** `feature/rc03-clinician-feedback-7` (PR #9)

---

## 1. Security Controls Assessment

### 1.1 Session & Authentication Security
* **Session Ownership:** Session tokens are cryptographically hashed using SHA-256 (`tokenHash`) and stored in the database.
* **Cookie Flags:** Sessions use `HttpOnly`, `SameSite=Lax`, and `Secure` attributes in production environments.
* **CSRF Protection:** Server validates `origin` and `host` headers strictly on mutating requests; cross-origin state-changing calls are rejected with 403 Forbidden.
* **OTP Rate Limiting:** Verification attempts are bounded (max 10 requests per 10 minutes per IP/session); lockouts prevent brute-force OTP guessing.
* **MFA for Privileged Users:** Staff login enforces TOTP authentication with replay protection (migration `202611150001_totp_replay_protection`) and encrypted emergency recovery codes.

### 1.2 Access Control & Role-Based Security (RBAC)
* **Principle of Least Privilege:**
  * `superadmin`: Full system administration, audit review, user provisioning.
  * `manager`: Service/pricing/slot management, appointment review, waitlist.
  * `registration`: Check-in, identity confirmation, slot management, contact requests.
  * `clinician`: Clinical assessment, medical review; restricted from direct financial/billing mutations and unmasked booking exports.
  * `patient` (Guest): Access restricted strictly to own session draft, quote, and confirmed booking.
* **Server-side Enforcement:** All API endpoints perform authorization guards via `guard(session, "permission:name")`; no client-side-only authorization checks.

### 1.3 PDPA & Clinical Data Privacy
* **Encryption at Rest:** All sensitive personal and clinical data (Thai national ID, name, birthdate, answers, height/weight, family history, snoring, draft questionnaires) are encrypted using AES-256-GCM via `DATA_ENCRYPTION_KEY`.
* **Zero PHI in Client Storage:** Clinical questionnaires and patient medical answers are **never stored in localStorage or sessionStorage**. Draft persistence uses server-side encrypted session checkpoints.
* **List Endpoint Masking:** The `/admin/contact-requests` endpoint returns strictly metadata (reference number, created date, status, assigned staff ID). Personal names, phone numbers, and clinical details are omitted and only decrypted individually on user demand within an audited detail view.
* **No PHI in Logs or Telemetry:** Server logs redact patient names, national IDs, and medical answers; log formatters enforce masking rules.

### 1.4 Database Guard & Multi-Environment Isolation
* **Hardcoded Allowlist Guard:** `scripts/test-db-guard.mjs` prevents test runners from ever executing against `pdh_healthcheck` or `pdh_healthcheck_staging`.
* **Credential Isolation:** Test database requires user `pdh_test` and dedicated database `pdh_healthcheck_rc01_test`. Any mismatch immediately throws a fail-closed error.
* **Single ACID Transaction:** Multi-table promotions and critical status updates execute inside Prisma transactions (`$transaction`) with automatic rollback on error.

---

## 2. Dependency Vulnerability Audit

```text
$ npm audit
found 0 vulnerabilities
```

* All dependencies in `package-lock.json` were audited with 0 vulnerabilities detected.
* Next.js pinned to 16.4.5, patch verified against security advisories.
