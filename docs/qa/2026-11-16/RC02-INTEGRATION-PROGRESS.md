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
- The next diagnostic run https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/43847062784 confirmed HTTP 403 CSRF: Browser sent `Origin: http://localhost:3036` while the managed API test server requires `APP_URL=http://localhost:3037`.
- Root cause: the CI smoke step invoked Playwright without the Admin-specific config, causing it to fall back to the generic `playwright.config.ts` port 3036. Updated the CI smoke command to the existing guarded `test:admin-crud:e2e` harness on port 3037; this change is not yet supported by a completed CI result at the time of this report.

## Outstanding release gates

1. Obtain a clean, completed browser smoke and full Admin/Mobile E2E run on the exact integration HEAD, including a non-zero-exit fail gate.
2. Demonstrate actual persisted CRUD after reload, recovery across browser/session, mobile responsive 320/390/430/1440, and accessible SweetAlert success/error/confirm.
3. Verify the standalone integration build against isolated RC01 test only; configure approved real packages, prices and future slots under authorized UAT before a patient booking pilot.
4. Define and test how recovered registrations behave when OTP delivery is unavailable in Production (currently no self-service cross-device recovery).
5. Reconcile PR changes to the intended RC02 baseline and review release/rollback data preservation. Production remains NO-GO until all gates pass.

## Safety boundary

Production database `pdh_healthcheck`, Production service/configuration and existing Registration/Booking rows have not been modified by these integration changes. Never seed synthetic packages or delete historical registrations in Production.
