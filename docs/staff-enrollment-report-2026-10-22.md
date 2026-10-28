# Staff user management and self-service MFA — verification 2026-10-22

## Delivered

Added /admin/users for create/edit, existing-role assignment, activation/deactivation, first-login password replacement, single-use invitations, account/MFA status, session revocation and MFA reset. Manager manages non-Superadmin staff; only Superadmin manages Superadmin accounts. All writes require the acting administrator's password plus current TOTP, fresh session/role revalidation inside a transaction and an audit event. Self lockout and self MFA reset are rejected.

Added /auth/activate, /auth/password and /auth/mfa/setup with ten-minute restricted database sessions. Credential login does not grant staff API access until account/password requirements and MFA are complete. Pending sessions have an exact API allowlist and cannot use auth/guest to bypass it. session() independently rejects pending, unknown or missing stages, incomplete account flags, inactive users, expired sessions and staff without MFA. Admin routes redirect restricted users to the required step.

QR uses the installed local qrcode library in memory. Neither QR PNG nor otpauth URI is stored or sent externally. Only the pending secret is encrypted in its own Session; only a confirmed secret reaches User.mfaSecret. Confirmation is user-rate-limited, serialized by the user row lock, deletes all existing staff sessions and issues a different full token. Manual key is available only in the same authenticated, noncached setup response. Browser state is memory-only and clears on expiry/pagehide. Existing issuer, SHA1/30-second/6-digit settings and adjacent-step window remain.

Invitations use 256-bit random tokens stored only as hashes, expire after 24 hours and are consumed atomically. Tokens use URL fragments removed from browser history. Reissue, deactivation and email/role edits invalidate older invitations. Only new-password selection follows a valid invitation. Invite links are displayed once for manual delivery through the approved hospital channel; no email sending is implemented or claimed.

Existing homepage/deployment work was already uncommitted at the start of this task and has been preserved. No existing account was recreated, rotated or automatically disabled. Test staff are synthetic and cleaned up. No commit, push, merge, VPS access, production migration or service restart was performed.

## Migration

New additive 202610220002_staff_enrollment: User.activationRequired and mustChangePassword default false; Session.stage defaults full and pendingMfaSecret is nullable encrypted text; new indexed UserInvitation table with hashed tokens and restrictive user foreign key. Original three migration files remain untouched.

Applied only to localhost synthetic development pdh_healthcheck and isolated pdh_healthcheck_test (port 3308). A safety check required loopback, expected schema name, SEED_DEMO=true and non-production process before the development migration. No production/staging environment was used. Existing fully enrolled production staff continue to use their existing MFA. Unenrolled staff must enroll even outside production; browser tests now create their own MFA-enabled fixtures instead of bypassing MFA or changing seed accounts.

## Checks actually executed

| Check | Result |
| --- | --- |
| npm run typecheck | Passed |
| npm run lint | Passed; one existing TanStack Table/React Compiler warning |
| npm test | 54 passed; 31 database-conditional cases skipped in this default run |
| npm run test:db | 32 passed across 6 integration files on isolated MySQL, including all 9 new lifecycle/security cases |
| npm run test:e2e | 13 passed across the complete browser suite |
| Staff browser recheck | Invitation and temporary-password workflows passed again; desktop and 390px mobile user list captured after loading, no horizontal body overflow |
| npm run build | Passed Next.js standalone production build with /admin/users and all three auth routes |
| npx prisma validate | Passed |
| npx prisma migrate status | Four migrations, local configured development database up to date |
| Read-only local datasource/schema diff | No difference detected |
| Original migration review | No edits to the original three migrations |
| Source/logging review | No console logging in new lifecycle services; no real credentials in new production files found by heuristic scan |

Counts overlap and should not be added as unique coverage. The default skipped DB cases were executed by the separate isolated DB run. First browser run had one legacy password test failure because its second login omitted TOTP; the fixture was corrected, its isolated recheck passed and the complete 13-test rerun passed. A later cold-route browser recheck also exposed pre-hydration clicks in the new forms. Inputs/buttons now stay disabled until hydration, matching the existing login safeguard; authentication cookie changes use fresh document navigation. Both enrollment workflows passed again with that fix. The protected-page redirect is checked directly and the dev route is warmed before owner enrollment to prevent HMR interference. A subsequent development manifest parse failure was addressed by archiving only generated .next output under ignored .local storage and rerunning from fresh generated output; the final complete suite passed all 13 tests and the subsequent standalone build and explicit TypeScript check passed. No application/database source or data was reset. No authentication control was weakened to satisfy tests.

The new MySQL cases verify role/step-up boundaries, Superadmin protection, invitation hash/expiry/reissue/concurrent single-use, identity/role-change invalidation, restricted API denial, password-before-MFA ordering, local QR response, pending-vs-confirmed secret state, token rotation/stale-token rejection, explicit revocation, reset/deactivation, self lockout prevention, expiry, and independent pending-session isolation. Existing registration, booking, password/session, CSRF, RBAC and production secure-cookie tests remain passing. Browser tests verify both full owner enrollment paths, admin invitation UI, protected API denial before confirmation, role destination, MFA status after confirmation, no external enrollment requests and responsive user list.

## Deployment and recovery boundaries

Read [USER_MANAGEMENT.md](USER_MANAGEMENT.md), [MFA_SETUP.md](MFA_SETUP.md) and [production release instructions](PRODUCTION_DEPLOYMENT.md). Review SQL, validate backup restoration in staging and approve a new migration digest before production migrate deploy. Database migration is required before starting the new runtime; no database reset/down migration is supplied.

A rollback to code without restricted-session awareness is unsafe while pending staff sessions exist. Stop admissions/onboarding and revoke staff sessions through a separately reviewed operation before any such rollback, then review account flags and compatibility. Prefer a forward fix. The existing rollback script's schema-compatibility gate must include this session-semantics review.

No automatic invitation email delivery, recovery codes, recovery bypass or server-side QR persistence is included. Expired pending-session ciphertext and consumed invitation hashes remain subject to the hospital's retention/cleanup policy. Configure production request/analytics logging to omit bodies, cookies, activation links, QR/key data and OTPs. Production clocks must remain synchronized. Existing dependency advisories and VPS/restore/UAT prerequisites in the prior production synchronization report remain open; this is not a production deployment certification.

## Feature file inventory

- prisma/schema.prisma
- prisma/migrations/202610220002_staff_enrollment/migration.sql
- next.config.ts
- src/lib/security.ts
- src/lib/staff-roles.ts
- src/server/api.ts
- src/server/services/passwords.ts
- src/server/services/enrollment.ts
- src/server/services/staff-users.ts
- src/components/login.tsx
- src/components/admin-shell.tsx
- src/components/staff-enrollment.tsx
- src/components/staff-users.tsx
- src/app/(admin)/admin/layout.tsx
- src/app/(admin)/admin/users/page.tsx
- src/app/(public)/auth/activate/page.tsx
- src/app/(public)/auth/password/page.tsx
- src/app/(public)/auth/mfa/setup/page.tsx
- src/app/globals.css
- tests/unit/session.test.ts
- tests/integration/staff-enrollment.test.ts
- tests/e2e/password.spec.ts
- tests/e2e/registration.spec.ts
- tests/e2e/staff-enrollment.spec.ts
- tests/e2e/staff-fixture.ts
- docs/USER_MANAGEMENT.md
- docs/MFA_SETUP.md
- docs/DATABASE_MIGRATIONS.md
- docs/PRODUCTION_DEPLOYMENT.md
- docs/backup-restore.md
- docs/architecture.md
- docs/permissions.md
- docs/security-operations.md
- docs/CHANGELOG.md
- README.md
- docs/staff-enrollment-report-2026-10-22.md (this report)
