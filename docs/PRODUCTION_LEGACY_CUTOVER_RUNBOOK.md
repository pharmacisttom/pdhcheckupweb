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
2. Builds an immutable release `/var/www/pdhcheckup/releases/production/<UTC-TS>-<SHA>` via `git archive`, removes `.env*` from `runtime/`, writes `REVISION`, fixes `pdhcheckup:pdhcheckup` ownership/permissions, and checks runtime permissions (`test -r server.js && test -w .next`).
3. Runs `deploy/shared/backup.sh` and verifies the exact `BACKUP_FILE=` emitted by that invocation (`gzip -t`, `sha256sum -c`, mtime >= start time) plus an **EOF-consuming `awk` scan** of the decompressed SQL dump (zero SIGPIPE on large dumps under `set -o pipefail`).
4. Re-verifies `pdh_healthcheck` DB identity and 14/14 migration checksums immediately before cutover (zero seeds/resets/destructive SQL).
5. Saves verbatim SHA-256-verified backups of the live systemd unit and all `${UNIT_PATH}.d/*.conf` drop-ins plus a validated non-executable `rollback-state.json` + `.sha256` under `/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>/`.
6. Surgically updates only `WorkingDirectory`, non-empty `ExecStart`, and `ReadWritePaths` on the live unit and drop-ins (preserving `ExecStart=` resets and all site directives), runs `systemctl daemon-reload`, and runs **`systemd-analyze verify` + effective property checks** (`LoadState`, `User`, `WorkingDirectory`, `ExecStart`, `EnvironmentFiles`, `ReadWritePaths`/`ProtectSystem`, service user runtime permissions) **before** restarting `pdhcheckup-production.service`.
7. Verifies active service, `WorkingDirectory`, `127.0.0.1:3036`, HTTPS `/api/v1/health`, `REVISION`, read-only auth/RBAC probes, unchanged `.env`, unchanged legacy runtime, unchanged Staging service, and unchanged `/var/www/pdhcheckup/source`.
8. **Transactionally commits:** writes sanitized evidence + `.sha256` and atomically writes `rollback-state.json` (`phase: "committed"`, preserving previous verified state on failure) **before** setting `ACTIVATION_COMMITTED=true`.
9. On **any** failure or `ERR`/`INT`/`TERM`/`EXIT` while un-committed, executes an idempotent state-tracked application-only rollback (`ROLLBACK_IN_PROGRESS` -> `ROLLBACK_SUCCEEDED` or `ROLLBACK_FAILED`), verifies `systemd-analyze verify` + restored `LoadState` + legacy `WorkingDirectory` + loopback healthcheck, and **never** auto-restores `pdh_healthcheck`.

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

## Step 4 — Manual Application-Only Rollback & Operator Recovery
Never auto-restore `pdh_healthcheck`. Check the latest directory under `/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>/rollback-state.json`:
- If automatic rollback already reported `ROLLBACK_SUCCEEDED=true` (`phase: "rolled_back"`): confirm `systemctl status pdhcheckup-production.service`, `WorkingDirectory=/var/www/pdhcheckup/releases/rc01-e75f4d9`, and `https://pdhcheckup.pluakdaenghospital.cloud/api/v1/health`.
- If cutover succeeded (`phase: "committed"`) and you need to revert manually, OR if automatic rollback stopped with `ROLLBACK_FAILED=true` (`phase: "rollback_failed"`): run the manual application-only rollback against the `<UTC-TS>` backup directory (it verifies checksums fail-closed, restores unit + drop-ins + `current` symlink, runs `systemctl daemon-reload`, `systemd-analyze verify`, verifies `LoadState=loaded`, restarts service, and verifies restored runtime + HTTPS health):

```bash
SCHEMA_COMPATIBILITY_REVIEWED=true \
CONFIRM_PRODUCTION_ROLLBACK=pdh_healthcheck \
  bash deploy/production/rollback-legacy-cutover.sh \
  --restore-legacy "/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>"
```
