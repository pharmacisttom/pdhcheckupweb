# PDH Smart Health Check — One-Pass Production Legacy-Compatible Cutover Runbook

**Target:** `PRODUCTION ONLY` (`https://pdhcheckup.pluakdaenghospital.cloud` · `127.0.0.1:3036`)  
**Database:** `pdh_healthcheck` (`pdhcheckup_prod`)  
**Service:** `pdhcheckup-production.service` (`User=pdhcheckup`)  
**Legacy Runtime Preserved:** `/var/www/pdhcheckup/releases/rc01-e75f4d9`  
**Target Branch:** `feature/rc04-ui-impeccable-playwright`  
**Approved Migration Digest (14 migrations):** `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b`

---

## Step 0 — Operator Preconditions (Do Not Skip)
1. Confirm PR #10 and the Production cutover scripts (`cutover-legacy-pinned-sha.sh`, `rollback-legacy-cutover.sh`) have passed code review and both CI workflows (`push` and `pull_request`).
2. Confirm Staging RC04 verification is green.
3. Use the exact reviewed 40-character branch HEAD SHA (`PINNED_SHA`) — `cutover-legacy-pinned-sha.sh` enforces `BRANCH_TIP == PINNED_SHA` (not mere ancestry).

---

## Step 1 — Read-Only Preflight
What `--preflight-only` actually does (accurate side-effect disclosure):
- Acquires `/var/www/pdhcheckup/releases/production/.deploy.lock` via `flock`.
- Fetches `refs/heads/<BRANCH>` into an ephemeral `mktemp -d` bare repository (removed automatically on `EXIT`) — does **not** touch `/var/www/pdhcheckup/releases/production/.git-cache` or `/var/www/pdhcheckup/source`.
- Creates a temporary mode-600 MySQL option file inside `mktemp -d` (removed on `EXIT`) to run read-only `SELECT` queries against `pdh_healthcheck` verifying DB identity (`pdhcheckup_prod` / `pdh_healthcheck`) and all 14 migration checksums.
- Makes **zero** changes to Production runtime, systemd unit/drop-ins, `.env`, or patient data.

```bash
set -Eeuo pipefail
PINNED_SHA="<EXACT_40_CHAR_REVIEWED_HEAD_SHA>"
DIGEST="d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b"

# 1. Inspect existing systemd unit, drop-ins, legacy runtime, and backup paths
bash deploy/production/rollback-legacy-cutover.sh --preflight

# 2. Run pinned-SHA preflight
APPROVED_MIGRATIONS_SHA256="$DIGEST" \
  bash deploy/production/cutover-legacy-pinned-sha.sh --preflight-only \
  feature/rc04-ui-impeccable-playwright "$PINNED_SHA"
```

---

## Step 2 — One-Pass Production Cutover
`cutover-legacy-pinned-sha.sh` executes fail-closed:
1. Enforces exact `origin/<BRANCH>` tip match with `$PINNED_SHA` and migration digest `$DIGEST`.
2. Builds an immutable release `/var/www/pdhcheckup/releases/production/<UTC-TS>-<SHA>` via `git archive`, removes `.env*` from `runtime/`, writes `REVISION`, and fixes `pdhcheckup:pdhcheckup` ownership/permissions.
3. Runs `deploy/shared/backup.sh` and verifies the exact `BACKUP_FILE=` emitted by that invocation (`gzip -t`, `sha256sum -c`, mtime >= start time, SQL `pdh_healthcheck` header & `CREATE TABLE`).
4. Re-verifies `pdh_healthcheck` DB identity and 14/14 migration checksums immediately before cutover (zero seeds/resets/destructive SQL).
5. Saves verbatim SHA-256-verified backups of the live systemd unit and any `${UNIT_PATH}.d/*.conf` drop-ins plus a validated non-executable `rollback-state.json` + `.sha256` under `/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>/`.
6. Surgically updates only `WorkingDirectory`, `ExecStart`, and `ReadWritePaths` on the live unit (and runtime paths in drop-ins if present), preserving all existing site-specific directives, runs `systemctl daemon-reload` and `systemctl restart pdhcheckup-production.service`.
7. Verifies active service, `WorkingDirectory`, `127.0.0.1:3036`, HTTPS `/api/v1/health`, `REVISION`, read-only auth/RBAC probes, unchanged `.env`, unchanged legacy runtime, unchanged Staging service, and unchanged `/var/www/pdhcheckup/source`.
8. On **any** failure or `INT`/`TERM`/`ERR` after activation starts, executes an idempotent application-only rollback (`rollback-state.json` + unit + drop-ins checksum-verified fail-closed, verifies restored legacy `WorkingDirectory` and loopback health, and **never** auto-restores `pdh_healthcheck`).

```bash
APPROVED_MIGRATIONS_SHA256="$DIGEST" \
CONFIRM_PRODUCTION_CUTOVER=pdh_healthcheck \
  bash deploy/production/cutover-legacy-pinned-sha.sh \
  feature/rc04-ui-impeccable-playwright "$PINNED_SHA"
```

---

## Step 3 — Controlled Post-Cutover Verification (Manual Sanitized Checks)
1. Confirm `/var/www/pdhcheckup/shared/production/evidence/cutover-*.txt` exists (mode `600`, zero secrets/PHI).
2. Verify in browser without creating unapproved patient records or publishing questionnaires:
   - Public `/`, `/privacy`, `/register` (read-only render)
   - Staff `/login` + TOTP MFA + `/admin/dashboard`
   - Admin RBAC isolation & `/admin/audit`
   - `/api/v1/packages` and `/api/v1/booking-policy`

---

## Step 4 — Manual Application-Only Rollback (If Required)
Never auto-restore `pdh_healthcheck`. Use the exact `Systemd Unit Backup` directory printed in Step 2:
```bash
SCHEMA_COMPATIBILITY_REVIEWED=true \
CONFIRM_PRODUCTION_ROLLBACK=pdh_healthcheck \
  bash deploy/production/rollback-legacy-cutover.sh \
  --restore-legacy "/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>"
```
