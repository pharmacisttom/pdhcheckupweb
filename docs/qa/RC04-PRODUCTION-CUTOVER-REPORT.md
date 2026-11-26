# PDH Smart Health Check — RC04 Production Legacy Cutover Readiness Report

**Project:** PDH Smart Health Check (โรงพยาบาลปลวกแดง จังหวัดระยอง)  
**Target Environment:** `PRODUCTION ONLY` (`https://pdhcheckup.pluakdaenghospital.cloud` · `127.0.0.1:3036`)  
**Branch:** `feature/rc04-ui-impeccable-playwright`  
**Base Application SHA (Staging Verified):** `3dcd1f29d21ae1367c9b16f10e904a22e2908e21`  
**Assessment Date:** 2026-11-26  
**Status:** **CUTOVER TOOLING IMPLEMENTED & TESTED — NOT YET DEPLOYED TO PRODUCTION (PENDING REVIEW & VPS EXECUTION)**

---

## 1. Verified Baseline Assumptions (Reported by Operator)
- Production MySQL database: `pdh_healthcheck`
- Migrations: `14/14` applied, `14/14` checksums matched, `0` failed migrations (Digest: `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b`)
- Existing production service: `pdhcheckup-production.service` active on port `3036`
- Legacy runtime preserved: `/var/www/pdhcheckup/releases/rc01-e75f4d9`
- Staging RC04 activation: `PASS`

---

## 2. Deliverables Implemented (Without Modifying App Business Logic or Patient Data)

| Deliverable | Path | Purpose |
| :--- | :--- | :--- |
| **Production Cutover Script** | `deploy/production/cutover-legacy-pinned-sha.sh` | Immutable pinned-SHA build, `pdhcheckup` ownership/permission fix, fresh verified DB backup, 14/14 migration checksum verification, verbatim systemd backup + `daemon-reload`, atomic symlink switch, post-cutover verification, automatic application-only rollback on failure, sanitized evidence output |
| **Preflight & Rollback Script** | `deploy/production/rollback-legacy-cutover.sh` | `--preflight` read-only inspection & `--restore-legacy` checksum-verified systemd + release rollback (never restores Production DB) |
| **Automated Unit Tests** | `tests/unit/production-legacy-cutover.test.ts` | Verifies production-only isolation, confirmation gates, zero `git reset --hard`/seed/reset/destructive SQL/DB auto-restore, `pdhcheckup` chown, runtime `.env` exclusion, systemd backup & rollback handler |
| **One-Pass Runbook** | `docs/PRODUCTION_LEGACY_CUTOVER_RUNBOOK.md` | Copy-paste operator procedure for Step 1 preflight, Step 2 cutover, Step 3 verification, Step 4 rollback |
| **Readiness Report** | `docs/qa/RC04-PRODUCTION-CUTOVER-REPORT.md` | Sanitized readiness and sign-off dossier (this document) |

---

## 3. Requirements Traceability (1–15)

| # | Requirement | Implemented Mechanism |
| :---: | :--- | :--- |
| 1–2 | Separate immutable release; do not overwrite legacy runtime | `git archive "$SHA"` into `$RELEASES/<UTC-TS>-<SHA>`; `$LEGACY_RUNTIME` verified untouched before & after |
| 3–4 | Build pinned SHA with Production env; fix `pdhcheckup` ownership/perms | `with_env` build + `sudo chown -R pdhcheckup:pdhcheckup "$RELEASE"` + `chmod 750` / `g+rX,o-rwx` |
| 5 | Preserve production secrets & persistent data | `.env` checksum verified unchanged; zero `.env*` inside `runtime/` |
| 6–8 | Fresh verified backup; verify DB identity + 14/14 migration checksums; no seed/reset/destructive SQL | `backup.sh` + `gzip -t` + `sha256sum -c`; `verify_production_db_state` checks `pdh_healthcheck`, `pdhcheckup_prod`, `14` migrations, `0` failed, exact `sha256sum` match |
| 9–11 | Update systemd `ExecStart`; preserve original unit & legacy release; atomic symlink cutover | Verbatim backup in `shared/production/systemd-backups/<UTC-TS>/`; `mv -Tf current.next current`; `systemctl daemon-reload` + restart |
| 12 | Verify service, `127.0.0.1:3036`, HTTPS health, `REVISION`, Login/MFA/PDPA/Reg/Booking/Admin/Audit | Automated active/port/HTTPS/REVISION/read-only auth probes + Step 3 manual MFA/RBAC/Audit UAT |
| 13–14 | Auto-restore original unit & release on failure; never auto-restore Production DB | `rollback_application_only()` restores backed-up unit + prior `current` (or removes `current`) with zero DB restore |
| 15 | Sanitized deployment evidence | Written to `/var/www/pdhcheckup/shared/production/evidence/cutover-<UTC-TS>-<SHA>.txt` (mode `600`, zero secrets/PHI) |

---

## 4. Verification & Live Cutover Status

- **Local & CI Gates:** Verified via `bash -n`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:harness`, and GitHub Actions CI (`RC02 Integration Gates`).
- **Live Production Cutover Execution:** **NOT RUN / DEFERRED PENDING REVIEW** (in compliance with *"Do not merge or deploy automatically before the new production cutover script passes review"* and no VPS SSH session on local Windows workstation).
- **Security Boundary:** `0` modifications to `prisma/`, `src/app/api/`, `src/server/`, `src/lib/`, or existing patient records.

---

## 5. Operator Sign-Off (Complete After Live Cutover)

| Field | Value |
| :--- | :--- |
| Reviewed & Approved By | _Pending_ |
| Cutover Timestamp (UTC) | _Pending_ |
| Active Release Path & `REVISION` | _Pending_ |
| Production Backup File & SHA-256 | _Pending_ |
| Systemd Backup Dir | _Pending_ |
| HTTPS `/api/v1/health` & MFA/Admin Audit Check | _Pending_ |
