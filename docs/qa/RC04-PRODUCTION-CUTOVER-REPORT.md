# PDH Smart Health Check — RC04 Production Legacy Cutover Readiness Report

**Project:** PDH Smart Health Check (โรงพยาบาลปลวกแดง จังหวัดระยอง)  
**Target Environment:** `PRODUCTION ONLY` (`https://pdhcheckup.pluakdaenghospital.cloud` · `127.0.0.1:3036`)  
**Branch:** `feature/rc04-ui-impeccable-playwright`  
**Base Staging-Verified SHA:** `3dcd1f29d21ae1367c9b16f10e904a22e2908e21`  
**Assessment Date:** 2026-11-26  
**Status:** **HARDENED CUTOVER TOOLING & FAULT-INJECTION SUITE IMPLEMENTED — NOT DEPLOYED TO PRODUCTION (PENDING CODE REVIEW & CI)**

---

## 1. Review Findings Addressed (PR #10 Comment `#7195305574`)

| # | Blocking Requirement | Hardening Applied |
| :---: | :--- | :--- |
| 1 | Fail-closed checksum verification | Removed `|| true` in rollback; `sha256sum -c` is mandatory on `rollback-state.json`, `pdhcheckup-production.service.orig`, and `dropins.sha256` before touching `$UNIT_PATH` |
| 2 | Idempotent transaction-aware rollback for all post-activation failures | Added `ACTIVATION_STARTED`, `ACTIVATION_COMMITTED`, and `ROLLBACK_DONE` guards; `.env`, legacy runtime, Staging PID/symlink, and `/var/www/pdhcheckup/source` drift checks all run before `ACTIVATION_COMMITTED=true` |
| 3 | Safe `EXIT` / `ERR` / `INT` / `TERM` traps | Installed `on_signal INT`, `on_signal TERM`, and `on_exit` with `set -Eeuo pipefail` + idempotent cleanup |
| 4 | Validated non-executable rollback state | Replaced `rollback-state.env` (`source`) with atomic `rollback-state.json` + `.sha256` parsed and schema/path/SHA-256 validated via Node.js |
| 5 | Preserve exact live systemd configuration & drop-ins | Surgically patches live unit + staged drop-ins in-place while backing up verbatim unit and `dropins.orig/` + `dropins.sha256` |
| 6 | Bind DB backup verification to exact current invocation | `deploy/shared/backup.sh` emits `BACKUP_FILE=` & `BACKUP_SHA256_FILE=`; cutover verifies path, mtime >= `BACKUP_START_EPOCH`, `gzip -t`, `sha256sum -c`, and `pdh_healthcheck` SQL structure |
| 7 | Exact reviewed branch tip SHA match | Enforces `BRANCH_TIP == "$SHA"` (no `merge-base --is-ancestor`) |
| 8 | Accurate preflight side-effect documentation | Uses ephemeral `mktemp -d` bare fetch in `--preflight-only` (does not touch `releases/.git-cache`) and discloses `.deploy.lock` + ephemeral mode-600 DB `.cnf` in runbook |
| 9 | Functional fault-injection tests | Added `tests/unit/production-cutover-fault-injection.test.ts` testing preflight, stale SHA tip, happy path + drop-ins, `daemon-reload`/restart/HTTPS failures, Staging drift, `SIGTERM`, tampered backup checksums, failed legacy health, and manual rollback |
| 10 | Verify rollback health against restored legacy runtime | Both auto and manual rollback assert active PID > 0, `WorkingDirectory == originalWorkingDirectory`, restored `current` symlink state, loopback `healthcheck.sh`, and HTTPS health |

---

## 2. Deliverables

- `deploy/shared/common.sh`, `deploy/shared/validate-env.mjs`, `deploy/shared/backup.sh` (test-isolatable `PDH_DEPLOY_ROOT` default `/var/www/pdhcheckup`, deterministic `BACKUP_FILE=` output)
- `deploy/production/cutover-legacy-pinned-sha.sh`
- `deploy/production/rollback-legacy-cutover.sh`
- `tests/unit/production-legacy-cutover.test.ts` & `tests/unit/production-cutover-fault-injection.test.ts`
- `.github/workflows/rc02-integration.yml` (`bash -n` + `shellcheck -x -S warning` gate)
- `docs/PRODUCTION_LEGACY_CUTOVER_RUNBOOK.md` & `docs/qa/RC04-PRODUCTION-CUTOVER-REPORT.md`

---

## 3. Live Execution Status

- **Production Cutover Executed:** **NO** (per instruction: do not merge or deploy Production before review).
- **Security Boundary:** `0` changes to `prisma/`, `src/app/api/`, `src/server/`, `src/lib/`, or existing patient records.
