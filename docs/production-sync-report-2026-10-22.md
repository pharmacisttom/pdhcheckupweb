# Production synchronization verification — 2026-10-22

## Outcome and boundaries

Prepared locally for Git review. No commit, push, merge, VPS access, service restart, account creation/rotation or production migration was performed. Existing working tree was clean before work. Local MySQL at loopback port 3308 was available; it is not the VPS. Browser tests used the existing explicitly enabled local synthetic demo environment. Do not infer production functionality from local test OTP.

Before: hero, registration instructions, then #packages. After: #packages with the Thai hospital heading and live package cards first, instructions/preparation second. The single original anchor, MySQL-backed API query, details dialog, age eligibility display, package links and booking components remain. Mobile header now exposes booking/login/instruction/contact links instead of hiding navigation. Desktop/mobile contract tests use synthetic API fixtures only inside tests; production package data was not replaced. Screenshot review confirmed loaded mobile cards and no overflow.

## Validation actually executed

| Check | Result |
| --- | --- |
| npm run typecheck | Pass |
| npm run lint | Pass, one existing TanStack/React Compiler warning in data-table.tsx |
| npm run build | Pass, Next.js 16.4.2 webpack standalone; final UI check repeated after responsive refinement |
| npm test | 53 passed, 22 skipped (11 files passed, 4 conditional integration files skipped) |
| npm run test:db | 23 passed in 5 files, isolated pdh_healthcheck_test; migrate deploy found no pending migrations |
| npm run test:e2e | 11 passed: registration, real MySQL appointment, staff login/dashboard, password/session revocation, booking pause/callback/reopen, public access/CSRF/mobile and package-first regressions |
| Homepage browser recheck after mobile nav change | 3 passed at 390/1280px plus loading/empty/error states |
| npx prisma validate | Pass |
| npx prisma migrate status | Three migrations, local configured DB up to date |
| Read-only Prisma datasource-to-schema diff | No difference detected locally |
| Bash syntax | Pass for deployment wrappers/shared scripts and operational smoke harness |
| Isolated Bash operational harness | Pass schema-review gate, traversal rejection and staging-only HTTP/route probes with fake service/network/env tools |
| Native symlink switch, flock and systemd | Skipped on Windows: no flock; native symlink creation denied. Linux staging rehearsal required |
| Real dump/restore and failure recovery | Not executed; no VPS/backup credentials used |
| Dependency audit | Five high-severity findings in ESLint dependency chain; no automatic breaking downgrade applied |
| Secret review | Changed non-test text files scanned for private keys, credential URLs and embedded enrollment URIs; no findings. Synthetic test vectors/fixture credentials are intentional. This is a heuristic scan, not full-history secret certification |

Default npm test skips database cases; the separate test:db run executed them. Counts overlap across runs and must not be added as unique coverage. Real API integration regressions also verify logout deletes the database session, refuses token reuse and denies expired staff sessions. Session unit tests cover missing/expired sessions, disabled accounts, production MFA requirements and superadmin access. TOTP unit tests cover RFC SHA1 generation, adjacent time window, malformed input, issuer and email label. The QR CLI test creates only a temporary synthetic artifact, verifies PNG generation and exclusive output, then removes it.

## Database and authentication

No schema/migration changes. All three existing migration files are unchanged. Booking service retains transactional capacity locking, quote/eligibility validation, idempotent confirmation and duplicate prevention. Existing registration and administrative modules remain.

Fixed a verified CLI issue: user upsert previously replaced credentials/MFA for existing email automatically. Existing accounts now fail closed unless OPERATOR_ROTATE_EXISTING=true is explicitly supplied; replacement and session revocation share a transaction and concurrent credential changes are detected. Enrollment is written exclusively to a protected external path; local-only QR uses qrcode without network traffic. Production MFA, rate limiting, CSRF and RBAC remain enabled. No real superadmin account was touched.

## Deployment deliverables and recovery

Production/staging deploy.sh, healthcheck.sh, backup.sh and rollback.sh share reviewed implementations under deploy/shared. Added service examples and production Nginx reference. Deploy verifies branch/commit, environment/database/secret isolation, npm ci, TypeScript/lint/unit tests, build, standalone assets, reviewed migration digest, pre-migration backup, migrate deploy and atomic current switching. Only the selected application service is restarted. HTTP probes check database health, homepage, login, package and booking-policy routes. Integration/E2E are separate isolated-data release gates.

Application rollback requires a reviewed compatible prior release and SCHEMA_COMPATIBILITY_REVIEWED=true; it leaves database migrations applied. See [exact commit/deploy/rollback commands](PRODUCTION_DEPLOYMENT.md), [staging](STAGING_DEPLOYMENT.md), [MFA](MFA_SETUP.md) and [backup recovery](backup-restore.md).

## Remaining release risks

- No live SMS adapter: OTP_PROVIDER=unconfigured blocks phone-verified self-service registration. HTTP health cannot certify notification delivery.
- Five npm audit high findings originate in braces via micromatch/fast-glob/@next/eslint-plugin-next/eslint-config-next. npm proposes eslint-config-next 14.2.35 as a breaking downgrade. Review an upstream compatible fix separately; advisory: https://github.com/advisories/GHSA-vfj7-8cjw-p6xm. Do not use audit fix --force.
- Linux staging must validate real flock, symlinks, unit paths/permissions/sudo grants, backup credentials, actual activation, failed health and rollback before production.
- Backups are protected gzip plus checksum, not encrypted or shipped off-host by these scripts. Require encrypted storage, approved retention and an isolated verified restore. Keep encryption keys separately recoverable.
- Staging HTTPS origin, existing units/Nginx layout, account grants, actual VPS migration state, current release adoption and rollback baseline need operator verification.
- Existing TOTP window allows code reuse within the accepted step; no recovery bypass was added. Time sync and an approved recovery process remain operational requirements.
- Prisma package.json seed configuration and Vitest native-config warnings remain non-blocking deprecations. Hospital UAT, clinical/privacy approval and public TLS/proxy verification remain external gates.

## Modified/new file inventory

- .gitignore
- README.md
- docs/architecture.md
- docs/backup-restore.md
- docs/deployment.md
- scripts/manage-user.ts
- src/app/(public)/layout.tsx
- src/app/(public)/page.tsx
- src/app/globals.css
- src/components/package-list.tsx
- src/server/api.ts
- tests/e2e/public.spec.ts
- tests/integration/pentest.test.ts
- .gitattributes
- deploy/README.md
- deploy/production/backup.sh
- deploy/production/deploy.sh
- deploy/production/healthcheck.sh
- deploy/production/nginx.example.conf
- deploy/production/pdhcheckup-production.service.example
- deploy/production/rollback.sh
- deploy/shared/backup.sh
- deploy/shared/common.sh
- deploy/shared/deploy.sh
- deploy/shared/healthcheck.sh
- deploy/shared/rollback.sh
- deploy/shared/run.mjs
- deploy/shared/validate-env.mjs
- deploy/staging/backup.sh
- deploy/staging/deploy.sh
- deploy/staging/healthcheck.sh
- deploy/staging/pdhcheckup-staging.service.example
- deploy/staging/rollback.sh
- docs/CHANGELOG.md
- docs/DATABASE_MIGRATIONS.md
- docs/ENVIRONMENT_VARIABLES.md
- docs/MFA_SETUP.md
- docs/PRODUCTION_DEPLOYMENT.md
- docs/STAGING_DEPLOYMENT.md
- docs/TROUBLESHOOTING.md
- docs/production-sync-report-2026-10-22.md
- scripts/mfa-qr.ts
- src/lib/mfa.ts
- tests/e2e/homepage.spec.ts
- tests/ops/deployment-smoke.sh
- tests/unit/deployment.test.ts
- tests/unit/mfa-qr.test.ts
- tests/unit/mfa.test.ts
- tests/unit/session.test.ts

Lowercase existing docs/architecture.md and docs/backup-restore.md were extended in place to avoid case-only duplicate files on Windows.
