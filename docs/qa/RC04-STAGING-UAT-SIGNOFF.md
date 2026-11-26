# PDH Smart Health Check — RC04 Staging Deployment & Visual UAT Sign-Off

**Project:** PDH Smart Health Check (โรงพยาบาลปลวกแดง จังหวัดระยอง)  
**Branch:** `feature/rc04-ui-impeccable-playwright`  
**Base Branch:** `feature/rc03-clinician-feedback-7`  
**Reviewed RC04 Application SHA (prior to this sign-off dossier commit):** `e419ae6ad9dab0ec319a00a30d3d60b2c92c0acb`  
**Draft PR:** https://github.com/pharmacisttom/pdhcheckupweb/pull/10  
**Overall Staging Live Status:** **BLOCKED (ไม่มี SSH/shell access จากเครื่อง Windows `DESKTOP-R1S9FTO` ไปยัง Staging VPS `187.52.117.39`)**  
**Production Status:** **STRICT NO-GO**

---

## 1. Phase 1 — Read-Only Preflight Evidence

| # | Preflight Item | Status | Observed Evidence |
| :---: | :--- | :---: | :--- |
| 1 | Exact Git SHA & Clean Checkout | **PASS** | `git rev-parse HEAD` verified `e419ae6ad9dab0ec319a00a30d3d60b2c92c0acb` on `feature/rc04-ui-impeccable-playwright` (before adding `deploy-pinned-sha.sh` & UAT docs) |
| 2 | Local Uncommitted Edits Preserved | **PASS** | Previous `feature/rc02-integrated-registration-recovery` edits preserved in `git stash@{0}` (`preserve-rc02-local-changes-before-rc04-2026-11-26`); working tree clean |
| 3 | Inspect `scripts/run-staging-deploy.sh` | **PASS (HAZARDS IDENTIFIED — DO NOT RUN)** | Hardcodes `EXPECTED_BRANCH="feature/staging-uat"`, runs `git reset --hard`, hardcodes older migration digest `664693a4...` (current head has `d5b1c407...`), and auto-executes `scripts/seed-uat-staging.ts --apply` |
| 4 | Inspect `deploy/shared/deploy.sh` & `validate-env.mjs` | **PASS** | Enforces mode-600 `.env`, separate `pdh_healthcheck_staging` DB (`pdhcheckup_stg`), `127.0.0.1:3037`, independent `DATA_ENCRYPTION_KEY`/`OTP_PEPPER`, `OTP_PROVIDER=disabled`, immutable `releases/staging/<ts>-<sha>`, `previous` symlink, and `healthcheck.sh` |
| 5 | Inspect `systemd` staging & production services | **BLOCKED (No VPS SSH)** | Local host is Windows `DESKTOP-R1S9FTO` (`%USERPROFILE%\.ssh\config` absent, no VPS keys/tunnels). Reviewed unit template: `deploy/staging/pdhcheckup-staging.service.example` (`User=pdhcheckup`, `WorkingDirectory=/var/www/pdhcheckup/releases/staging/current/runtime`, `PORT=3037`, `EnvironmentFile=/var/www/pdhcheckup/shared/staging/.env`) |
| 6 | Verify Nginx staging routing | **PARTIAL / HTTPS VERIFIED, CONFIG BLOCKED** | Read-only external HTTPS probe to `https://staging-pdhcheckup.pluakdaenghospital.cloud/api/v1/health` returned `HTTP 200` (`{"data":{"status":"ok","database":true,"notifications":"disabled"},"correlationId":"f31a8db3-b106-473a-99ff-7d33c51b043e"}`). Live `/` HTML showed `hospital-logo.png=True`, `LINE Official Account=False`, `Facebook Page=False` (confirming Staging is still on an earlier release, pre-RC04). Server `/etc/nginx` inspection requires VPS SSH |
| 7 | Verify staging DB identity & credentials | **BLOCKED (No VPS SSH)** | `deploy/shared/validate-env.mjs` enforces `mysql://pdhcheckup_stg:***@127.0.0.1:3306/pdh_healthcheck_staging`; live VPS `.env` & MySQL grant verification requires VPS SSH |
| 8 | Confirm no shared mutable DB or runtime | **PARTIAL** | `deploy/shared/validate-env.mjs` & unit tests (`tests/unit/deployment.test.ts`) enforce distinct DB, keys, port (`3037` vs `3036`), and `APP_URL`. Live VPS verification requires running `--preflight-only` on VPS |
| 9 | Verify available staging backups & rollback | **BLOCKED (No VPS SSH)** | `deploy/shared/backup.sh` creates `mysqldump` `.sql.gz` + `.sha256` in `/var/www/pdhcheckup/shared/staging/backups/`; `deploy/staging/rollback.sh` switches `current` symlink. Live VPS listing requires VPS SSH |
| 10 | Document exact deployment target | **PASS** | Host `187.52.117.39`, URL `https://staging-pdhcheckup.pluakdaenghospital.cloud`, Service `pdhcheckup-staging.service`, Loopback `127.0.0.1:3037`, DB `pdh_healthcheck_staging`, User `pdhcheckup_stg`, Migration Digest (`14` migrations) `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b` |

---

## 2. Phase 2 — Safe Staging-Only Pinned-SHA Deployment Process

Created [`deploy/staging/deploy-pinned-sha.sh`](../../deploy/staging/deploy-pinned-sha.sh) with unit-tested invariants ([`tests/unit/staging-pinned-deploy.test.ts`](../../tests/unit/staging-pinned-deploy.test.ts)):
- Strictly `DEPLOY_ENV=staging` only (rejects production).
- **Zero** `git reset --hard`, **zero** `git checkout` on `/var/www/pdhcheckup/source`, **zero** `seed-uat-staging` auto-seeding, **zero** questionnaire publication.
- Uses an isolated bare cache (`/var/www/pdhcheckup/releases/staging/.git-cache`) + `git archive <PINNED_SHA>` into immutable `/var/www/pdhcheckup/releases/staging/<UTC-TS>-<SHA>`.
- Validates `APPROVED_MIGRATIONS_SHA256=d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b` before build/deploy.
- Captures Production (`pdhcheckup-production.service` PID/timestamp/symlink/`.env` SHA-256) and `/var/www/pdhcheckup/source` before and after deployment to prove zero cross-environment drift.
- Preserves `$RELEASES/previous` symlink for rollback (`SCHEMA_COMPATIBILITY_REVIEWED=true bash deploy/staging/rollback.sh <PREV_RELEASE_ID>`).

### Operator Commands on Staging VPS (`187.52.117.39`)
```bash
# 1. Inspect systemd, Nginx, DB, and backups (read-only)
sudo systemctl status pdhcheckup-staging.service pdhcheckup-production.service --no-pager
sudo nginx -T | grep -E "server_name|proxy_pass|staging-pdhcheckup|3037"

# 2. Fetch script from reviewed branch into a temporary path without altering /var/www/pdhcheckup/source
PINNED_SHA="$(git ls-remote https://github.com/pharmacisttom/pdhcheckupweb.git refs/heads/feature/rc04-ui-impeccable-playwright | cut -f1)"
echo "Pinned SHA: $PINNED_SHA"

# 3. Run read-only preflight first (--preflight-only)
APPROVED_MIGRATIONS_SHA256=d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b \
  bash deploy/staging/deploy-pinned-sha.sh --preflight-only feature/rc04-ui-impeccable-playwright "$PINNED_SHA"

# 4. Execute safe staging-only pinned-SHA deployment
APPROVED_MIGRATIONS_SHA256=d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b \
  bash deploy/staging/deploy-pinned-sha.sh feature/rc04-ui-impeccable-playwright "$PINNED_SHA"

# 5. Verify live Staging REVISION and HTTPS health
cat /var/www/pdhcheckup/releases/staging/current/REVISION
curl -fsS https://staging-pdhcheckup.pluakdaenghospital.cloud/api/v1/health
```

---

## 3. Phase 3 — Live Staging UAT Checklist

> [!IMPORTANT]
> Local isolated DB (`pdh_healthcheck_rc01_test`) and GitHub CI gates (`#45804844942`, `#45806800257`) passed **30/30 E2E**, **17/17 Visual/Multilingual UI**, **108/108 Integration**, and **199/199 Unit** tests (see [`RC04-PLAYWRIGHT-REPORT.md`](RC04-PLAYWRIGHT-REPORT.md)). Because live Staging VPS deployment is **BLOCKED** from this workstation, **every live Staging UAT item below remains `BLOCKED` until deployed and executed against `https://staging-pdhcheckup.pluakdaenghospital.cloud`**.

### A. Public Portal (Live Staging)
| Item | Local/CI Isolated Evidence | Live Staging Status | Notes |
| :--- | :---: | :---: | :--- |
| Five viewports (320 / 390 / 768 / 1024 / 1440 px) | PASS (`rc04-public-*.png`) | **BLOCKED** | Pending live Staging deploy |
| Hospital logo & brand icons (LINE, Facebook) | PASS | **BLOCKED** | Read-only probe confirmed live `/` currently lacks RC04 icons |
| Package cards & accessibility labels | PASS | **BLOCKED** | Pending live Staging deploy |
| Five languages (`th`, `en`, `zh-Hans`, `my`, `km`) | PASS | **BLOCKED** | Pending live Staging deploy |
| Footer translations | PASS (with 2 known Thai fallbacks) | **BLOCKED** | Fallback strings documented in `RC04-RELEASE-READINESS.md` |
| Empty / loading / error states | PASS | **BLOCKED** | Pending live Staging deploy |

### B. Registration Flow (Live Staging)
| Item | Local/CI Isolated Evidence | Live Staging Status | Notes |
| :--- | :---: | :---: | :--- |
| PDPA consent & acknowledgement | PASS (`registration-mobile.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| Thai ID validation | PASS (`rc03-ui.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| Back / forward step navigation | PASS | **BLOCKED** | Pending live Staging deploy |
| Autosave & recovery | PASS (`test-rc03-integration.mjs`) | **BLOCKED** | Pending live Staging deploy |
| Individual / group registration | PASS (`rc03-group.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| BMI & age boundaries | PASS (`rc03-ui.spec.ts`) | **BLOCKED** | Pending live Staging deploy |

### C. Admin Workspace (Live Staging, Synthetic Test Records Only)
| Item | Local/CI Isolated Evidence | Live Staging Status | Notes |
| :--- | :---: | :---: | :--- |
| MFA & RBAC enforcement | PASS (`rc04-admin-e2e.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| Four sidebar categories & active state | PASS (`rc04-admin-dashboard-1440.png`) | **BLOCKED** | Pending live Staging deploy |
| Mobile drawer focus & ESC restoration | PASS (`rc04-admin-drawer-390.png`) | **BLOCKED** | Pending live Staging deploy |
| Dashboard KPI cards (6 metrics) | PASS (`rc04-admin-dashboard-*.png`) | **BLOCKED** | Pending live Staging deploy |
| Contact Requests table & detail modal | PASS (`rc04-admin-contact-modal-*.png`) | **BLOCKED** | Pending live Staging deploy |
| Audit log recording (`contact_request.detail_viewed`) | PASS (`rc03-contact.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| SweetAlert2 & Radix Dialog stacking | PASS (`rc04-admin-swal-stacking-*.png`) | **BLOCKED** | Pending live Staging deploy |

### D. Security Regression (Live Staging)
| Item | Local/CI Isolated Evidence | Live Staging Status | Notes |
| :--- | :---: | :---: | :--- |
| PHI masking in list responses | PASS (`rc04-admin-e2e.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| Session isolation (`pdh_healthcheck_staging`) | PASS (`pentest.test.ts`) | **BLOCKED** | Pending live Staging deploy |
| Forbidden role access (`registration` RBAC) | PASS (`rc04-admin-e2e.spec.ts`) | **BLOCKED** | Pending live Staging deploy |
| CSRF / MFA / consent regression | PASS (`pentest.test.ts`, `rc04-admin-e2e.spec.ts`) | **BLOCKED** | Pending live Staging deploy |

---

## 4. Actual Tester & Approval Sign-Off

| Role | Name | Live Staging Evidence URL / Log | Status | Date |
| :--- | :--- | :--- | :---: | :--- |
| DevSecOps / Staging Deployer | _Pending VPS Operator_ | `deploy/staging/deploy-pinned-sha.sh` output + `REVISION` | **PENDING** | — |
| QA / Playwright Lead | _Pending Live Verification_ | Live Staging Playwright / screenshots | **PENDING** | — |
| Clinician / Hospital Reviewer | _Pending UAT Sign-Off_ | Staging UAT review | **PENDING** | — |
| Production Release Gate | **STRICT NO-GO** | Do NOT merge PR #10 or deploy Production | **NO-GO** | 2026-11-26 |
