# PDH Smart Health Check — RC02 Integrated Release
Status: DEVELOPMENT / NO-GO for Production
Base: RC02 SweetAlert/Mobile commit 6575693dd3b7be3f6eb80870adcb4c74f28725ec
Production RC01 baseline: e75f4d93ffbad33ce5e2916fee0ab654a1f01d47
Owner boundary: keep existing RC02 SweetAlert2 and responsive improvements; do not duplicate or overwrite Codex work.

## Production-confirmed defect (2026-11-16)
- `Registration` has 1 row; `Booking`, published `Package`, `Slot`, `Quote`, `Hold` each have 0.
- Saving a `Registration` does NOT create a confirmed booking. The dashboard counts Booking by appointment date, so it displays 0.
- `src/server/api.ts` sets `Registration.expiresAt` to now + 24h, while GET `registrations/draft` filters `ownerSessionId` and `expiresAt > now`.
- `ContactRequest` already models a durable staff-reviewed request with `reference`, `registrationId`, `status`, and optional `bookingId`. Reuse it, avoid duplicate registration rows and avoid discarding records.
- Public `GET /api/v1/bookings` uses the current browser session; it does not support cross-device recovery.

## Required integrated development
1. **Durable workflow:** preserve existing Production Registration rows. Clearly separate a SAVED REGISTRATION from a SUBMITTED CONTACT REQUEST and a CONFIRMED BOOKING. Do not fake a Booking without Package/Slot/Quote. Do not delete or reset existing records.
2. **Draft recovery:** make legitimate saved drafts recoverable after the arbitrary 24h display window, with defined retention policy and explicit status. Expired transactional hold/quote is not an expired patient registration. Use server persistence; do not put PHI in localStorage.
3. **Cross-device recovery:** provide a lookup using a non-guessable reference plus verified ownership proof (e.g. an OTP/approved equivalent), with enumeration resistance, rate limiting and masked output. Do not permit reference-only access to personal/health data.
4. **Admin queue:** show Registration records with no associated Booking, and ContactRequest entries, separately from confirmed Booking. Include createdAt, status, reference where available, and staff actions appropriate to the state. Do not decrypt PHI unnecessarily in list responses; maintain access controls/audit.
5. **Booking enablement:** existing Package and Slot CRUD must allow real, reviewed published Packages and future Slots. Display meaningful state when no packages/slots exist. Never publish UAT pricing or synthetic slots.
6. **Mobile UX:** keep Codex SweetAlert2 module from RC02; maintain responsive navigation, loading, no duplicate submits, consistent messages and a clear `saved != booked` distinction. Preserve user input through steps and refresh, after verified resumption.
7. **Legacy data preservation:** the existing `Registration` row is a migration invariant. Database changes must be additive and independently verified; no reset/seed/truncate against Production.
8. **Docs/tests:** contract and migration notes, unit tests for expiry/resumption/state transitions, API integration tests, browser E2E for mobile 320/390/430 and admin pending queue; assert database persistence after server restart/browser session change and for cross-device resume.

## Mandatory test database preflight
Use ONLY the dedicated local MySQL database `pdh_healthcheck_rc01_test` with `pdh_test` account as required by `scripts/test-db-guard.mjs`.
Verify `CURRENT_USER()`, `DATABASE()`, `SHOW GRANTS FOR CURRENT_USER()`, exactly 14 completed migrations and 0 incomplete (until any deliberately added migration changes that gate with corresponding tested update). Fail closed on any discrepancy. Do NOT substitute existing `pdh_healthcheck_prod_restore_test` for the required dedicated test DB, and never run E2E fixtures against `pdh_healthcheck` or staging. Do not rewrite `DATABASE_URL` in test scripts, create/migrate/seed/reset a database as an implicit preflight, or suppress a non-zero Playwright exit.
Use synthetic data and clean up only its own generated rows.

## Acceptance gates
- Typecheck/lint/build; unit and DB-free harness.
- Dedicated-test DB identity + grants + migration preflight.
- Real Admin CRUD E2E, mobile/public registration E2E with clean process exit, plus persistence E2E confirming correct rows and no duplicates.
- Confirm Registration is durable and visible to authorized Admin but remains distinct from Booking.
- Confirm booked records require real eligible Package + future Slot + Quote and remain visible through proper lookup after reopening a browser.
- Confirm screens at 320, 390, 430 and 1440px and SweetAlert2 success/error/confirm accessible behavior.
- Verify no regressions of RC01 existing production features and run reviewed cutover/rollback checks only AFTER GO decision.
- Production remains **NO-GO** until gates pass. No deploy, migration, write to Production DB, or Production configuration changes during RC02 development.

## Branch and PR hygiene
This integration branch is based on the RC02 feature commit, **not** on `main`. PR #7 compares 176 files/26 commits against `main`, while the true RC02 delta to baseline is 29 files/1 commit. Review the scoped diff from RC01 baseline to integration branch; avoid accidental main-targeted merge before checking changes and E2E evidence.
