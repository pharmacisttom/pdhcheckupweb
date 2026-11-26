# PDH Smart Health Check — One-Pass Production Legacy-Compatible Cutover Runbook

**Target:** `PRODUCTION ONLY` (`https://pdhcheckup.pluakdaenghospital.cloud` · `127.0.0.1:3036`)  
**Database:** `pdh_healthcheck` (`pdhcheckup_prod`)  
**Service:** `pdhcheckup-production.service` (`User=pdhcheckup`)  
**Legacy Runtime Preserved:** `/var/www/pdhcheckup/releases/rc01-e75f4d9`  
**Target Branch & Pinned SHA:** `feature/rc04-ui-impeccable-playwright` · `<FULL_40_CHAR_SHA>` (see PR #10 head after final review)  
**Approved Migration Digest (14 migrations):** `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b`

---

## Step 0 — Operator Preconditions (Do Not Skip)
1. Confirm Draft PR #10 and cutover script review are explicitly approved by the project owner / clinical & security lead.
2. Confirm Staging RC04 verification is complete and green.
3. Obtain the exact reviewed 40-character commit SHA (`PINNED_SHA`) and fetch `deploy/` into a clean reviewed path or temporary directory (do NOT modify `/var/www/pdhcheckup/source` or legacy `/var/www/pdhcheckup/releases/rc01-e75f4d9`).

---

## Step 1 — Read-Only Preflight (Zero Mutations)
```bash
set -Eeuo pipefail
PINNED_SHA="<EXACT_40_CHAR_APPROVED_SHA>"
DIGEST="d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b"

# 1. Inspect existing systemd service and rollback preflight
bash deploy/production/rollback-legacy-cutover.sh --preflight

# 2. Run pinned-SHA preflight (checks DB identity, 14/14 migration checksums, .env isolation, Staging baseline)
APPROVED_MIGRATIONS_SHA256="$DIGEST" \
  bash deploy/production/cutover-legacy-pinned-sha.sh --preflight-only \
  feature/rc04-ui-impeccable-playwright "$PINNED_SHA"
```
Proceed to Step 2 **only** if Step 1 prints `Preflight-only mode completed cleanly with zero mutations.`

---

## Step 2 — One-Pass Production Cutover
`cutover-legacy-pinned-sha.sh` performs in order:
1. Extracts `$PINNED_SHA` via `git archive` into `/var/www/pdhcheckup/releases/production/<UTC-TS>-<SHA>` (never overwrites `rc01-e75f4d9`).
2. Installs locked deps (`npm ci --include=dev`), generates Prisma client, runs `typecheck`, `lint`, `test:unit` (DB-free), builds standalone Next.js, removes any `.env*` from `runtime/`, writes `REVISION`, and sets `pdhcheckup:pdhcheckup` ownership/permissions.
3. Creates and verifies (`gzip -t` + `sha256sum -c`) a fresh Production DB backup under `/var/www/pdhcheckup/shared/production/backups/`.
4. Re-verifies `pdh_healthcheck` DB identity and 14/14 migration checksums immediately before cutover (zero seeds/resets/destructive SQL).
5. Saves a timestamped SHA-256-verified backup of the original `systemd` unit under `/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>/`.
6. Atomically switches `/var/www/pdhcheckup/releases/production/current`, updates the systemd unit `ExecStart` & `WorkingDirectory` to `current/runtime`, runs `systemctl daemon-reload`, and restarts `pdhcheckup-production.service`.
7. Verifies active service, `127.0.0.1:3036`, HTTPS `/api/v1/health`, `REVISION`, read-only auth/RBAC probes, unchanged Production `.env`, unchanged Staging service, and unchanged `/var/www/pdhcheckup/source`. On any activation failure, automatically restores the original systemd unit and previous/legacy release without touching `pdh_healthcheck`.

```bash
APPROVED_MIGRATIONS_SHA256="$DIGEST" \
CONFIRM_PRODUCTION_CUTOVER=pdh_healthcheck \
  bash deploy/production/cutover-legacy-pinned-sha.sh \
  feature/rc04-ui-impeccable-playwright "$PINNED_SHA"
```

---

## Step 3 — Controlled Post-Cutover Verification (Manual Sanitized Checks)
1. Confirm sanitized evidence file created under `/var/www/pdhcheckup/shared/production/evidence/cutover-*.txt`.
2. Verify in browser (without creating unapproved patient records or publishing clinical questionnaires):
   - Public `/` hospital logo, footer brand icons, PDPA `/privacy`, `/register` (read-only UI load)
   - Staff `/login` + Authenticator TOTP MFA + `/admin/dashboard`
   - Admin RBAC isolation & `/admin/audit` logging on staff login/detail view
   - Registration / Booking API read-only endpoints (`/api/v1/packages`, `/api/v1/booking-policy`)

---

## Step 4 — Immediate Application-Only Rollback (If Required)
Never auto-restore `pdh_healthcheck`. Roll back only the systemd unit and application symlink using the backup folder printed in Step 2:
```bash
SCHEMA_COMPATIBILITY_REVIEWED=true \
CONFIRM_PRODUCTION_ROLLBACK=pdh_healthcheck \
  bash deploy/production/rollback-legacy-cutover.sh \
  --restore-legacy "/var/www/pdhcheckup/shared/production/systemd-backups/<UTC-TS>"
```
