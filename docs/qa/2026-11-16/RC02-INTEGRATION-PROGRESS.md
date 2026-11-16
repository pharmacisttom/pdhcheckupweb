# RC02 Integrated Registration Recovery — Verified Progress

Date: 2026-11-16
Branch: `feature/rc02-integrated-registration-recovery`
PR: https://github.com/pharmacisttom/pdhcheckupweb/pull/8
Base: `feature/rc02-mobile-sweetalert`
Status: DEVELOPMENT / Production NO-GO. No Production database writes or deployment.

## Integrated functionality

- Durable saved registrations: `GET /api/v1/registrations/draft` no longer filters out a saved draft solely because its transactional 24-hour expiry passed.
- `GET /api/v1/registrations/saved` displays current-session, non-booked/non-submitted saved registrations separately from actual confirmed bookings.
- OTP-protected `POST /api/v1/registrations/recover` rebinds an unsubmitted registration to a verified new guest session only after verifying its non-guessable registration identifier, matching phone and birthdate. Recovery is disabled if the OTP provider is disabled.
- Guest session lifetime is seven days, using the existing HttpOnly cookie behavior. Staff session lifetimes are unchanged.
- Staff `admin/registrations/pending` lists non-booked/unsubmitted entries, and `admin/registrations/pending/detail` permits role-protected, audited inspection of contact information for follow-up. Saved Registration, submitted ContactRequest and confirmed Booking remain separate statuses.
- Updated contact-request submission so a securely owned saved registration is not rejected solely by the draft expiry timestamp; quote/hold expiration remains enforced.
- Preserves the upstream mobile UI and centralized SweetAlert2 features; no new Production migration.
- Test-only GitHub Actions workflow constructs a disposable MySQL `pdh_healthcheck_rc01_test` and verifies user, grants and all 14 completed migrations before fixtures.

## Verified CI evidence

- GitHub Actions run https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/43845715833: test-database identity/grants/migrations PASS, registration-recovery persistence integration 2/2 PASS, Typecheck PASS, Lint PASS, Unit tests 178 PASS, DB-free guard harness PASS, Production-mode build PASS.
- The same run's browser smoke FAILED. No full E2E PASS claim.
- Diagnostic run https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/43847062784 confirmed HTTP 403 CSRF caused by mismatched Browser Origin 3036 versus test API APP_URL 3037; CSRF enforcement was preserved.
- Corrected the CI smoke step to use the guarded Admin E2E harness on port 3037; validated request and database state for organization deactivation and slot closure.
- **Full CI PASS (source commit `2f4922247da2bdee8a211c47cc2e2e4bf82f2d8d`):** https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/43850310860 — dedicated test DB identity/grants, exactly 14 completed migrations, registration recovery persistence integration **2/2 PASS**, Typecheck PASS, Lint PASS, Unit **178/178 PASS**, Guard harness PASS, production-mode Build PASS, critical Radix/SweetAlert Browser Smoke **1/1 PASS**, full Admin/Mobile Browser E2E **15/15 PASS** with clean exit. All database fixtures used disposable isolated test database, not Production.

## Outstanding release gates

1. **Development/CI integration gates now passed** on the cited code commit. Retest if code changes before merge or release.
2. **Production data and clinical content remain unapproved:** import only real verified Services/Prices, reviewer-approved Packages/Questionnaire and future appointment Slots. Synthetic UAT catalog, prices and slots are prohibited in Production.
3. **Production SMS OTP provider remains disabled or unverified:** cross-device self-service recovery is unavailable when disabled. Exercise the real provider, identity/rate limits and manual staff fallback before public pilot.
4. Complete production-like TEST/UAT acceptance, including real-browser cross-device OTP recovery, server restart, retention/policy decisions, role/PDPA review and read-only reconciliation of the existing Production Registration rows.
5. Review exact PR diff, data backup/restore rehearsal and rollback plan. Obtain explicit release approval. Production remains NO-GO until these non-CI gates pass.

## Safety boundary

Production database `pdh_healthcheck`, Production service/configuration and existing Registration/Booking rows have not been modified by these integration changes. Never seed synthetic packages or delete historical registrations in Production.
