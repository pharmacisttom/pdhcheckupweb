# RC02 Integrated Registration Recovery — Development Progress

Date: 2026-11-16
Branch: `feature/rc02-integrated-registration-recovery`
Base branch: `feature/rc02-mobile-sweetalert` (Codex RC02 mobile/SweetAlert2)
Status: IN PROGRESS; NO-GO for merge to Production and NO-GO for deploy.

## Implemented in this branch
- Public `GET /api/v1/registrations/draft`: removed the expired-at filter so an authenticated owner session can retrieve its saved draft even when its draft expiry timestamp has passed. Existing database rows are retained and no migration is needed for this first change.
- Staff `GET /api/v1/admin/registrations/pending`: protected by `bookings:read`, queries only unbooked/unsubmitted registrations, most recent 100; returns non-clinical list metadata; no encrypted person/assessment fields returned. The query excludes entries already moved to ContactRequest workflow.
- Staff ContactRequests UI now displays a separate pending-registration table with timestamp, opaque ID suffix, and state clearly distinguished from a confirmed Booking; reuses existing mobile responsive table CSS and keeps Codex SweetAlert2 changes.
- Added database-backed E2E coverage for a synthetic Registration whose old draft expiry has passed, requiring a dedicated test database and confirming that no Booking row was created. **The test has not yet run.**

## Remaining functional work
- Cross-device/session recovery still not implemented. Guest sessions expire in 2h; lifting the draft expiry display filter does NOT restore access from another phone/browser. Need an explicit recovery proof mechanism, rate limits, and safe owner rebinding, tested before release.
- Staff workflow must allow appropriate follow-up/action on pending registrations, without treating a saved draft as a submitted request and without revealing PHI in the listing.
- No published Packages or Slots in Production as of the last read-only check. Real staff-configured services, approved packages and appointment slots are required for confirmed bookings. Never fabricate bookings or prices.
- Test timeout/resume across session restart, mobile UI, cross-device owner validation, saved vs booked states, audit, and regression coverage.

## Tests
The upstream Codex QA report at `docs/qa/2026-11-16/RC02-QA-REPORT.md` reports typecheck/lint/unit/harness/build passes *for upstream RC02 commit*.
**No fresh typecheck, lint, build, unit, harness, browser E2E, or persistence tests have been executed for the integrated branch.** Do not transfer upstream pass claims to new code.

## Release gates
- Identity/grants of dedicated `pdh_healthcheck_rc01_test` and `pdh_test`, 14 completed migrations / 0 incomplete (or explicitly reviewed updated target).
- Browser/E2E clean exit and database persistence verification, including migrated legacy Registration unchanged.
- No Production DB writes, migration, deploy or configuration changes under this branch until reviewed GO decision.
