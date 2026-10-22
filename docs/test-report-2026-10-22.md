# Local verification — 22 October 2026

Environment: Windows, Next.js 16.4.2, Prisma 6.19.3, local MySQL on loopback port 3308. Synthetic development data only. No deployment performed.

## Changes

Registration form submission now creates the React Hook Form submit handler inside the submit event. This avoids passing a callback that reads the idempotency ref into a function executed during render, resolving the React refs lint error while preserving booking idempotency.

Playwright uses one worker because its shared Next.js development server compiles routes on demand. Parallel cold route visits were associated with registration resetting to the first step; serial execution passed all six tests without changing application validation.

## Results

| Check | Result |
| --- | --- |
| `npm run typecheck` | Passed |
| `npm run lint` | Passed, with one existing TanStack Table / React Compiler compatibility warning |
| `npm test` | 22 unit tests passed; 3 database tests intentionally skipped in this command |
| `npm run test:db` | All 3 integration tests passed against isolated `pdh_healthcheck_test`; migrations current |
| `npm run build` | Passed, including Prisma generation and Next.js compilation / page generation |
| Registration browser rerun | 2 passed: six-step registration through booking confirmation and staff dashboard login |
| `npm run test:e2e` final run | All 6 browser tests passed in 20.1 seconds; exit code 0, one worker, separately started local dev server |

Database integration covers capacity contention among 20 requests, booking confirmation and repeated idempotent confirmation, and price import. The browser registration test covers test OTP, assessment, package selection, quote, slot hold, confirmation and booking QR.

The initial browser run overlapped a source edit and failed with empty personal fields. A clean registration rerun passed; a subsequent parallel run also reset the form, so the test configuration was changed to serial execution. The first build attempt overlapped the running browser server and hit a Windows Prisma DLL lock; after stopping that server, the full build passed.

The automatically managed Playwright dev server hung during teardown on this Windows environment after reporting all six tests successful. For the final run, the dev server was started separately using `npm run dev`; Playwright reused it and exited successfully. On this machine, use two terminals (`npm run dev`, then `npm run test:e2e`) if automatic teardown hangs.

## Booking mode and callback workflow — additional verification

Added persistent booking mode control (`/admin/booking-control`) and staff callback work queue (`/admin/contact-requests`). The migration defaults to online booking enabled and preserves existing bookings. Mode changes and booking mutations coordinate through a MySQL policy row lock; closing online booking rejects holds, confirmations and rescheduling, including calls from stale browser pages. Callback payloads and staff notes are encrypted, ownership is checked, repeat submission for the same registration returns the existing reference, and staff access/status changes are audited. A callback request does not create a booking, invoice, QR or capacity allocation.

- `npm test`: 22 unit tests passed (4 database tests skipped in this command).
- `npm run test:db`: 4 tests passed against the isolated MySQL test database, including closed-mode rejection and callback ownership/idempotency.
- `npm run test:e2e`: 7 tests passed in 21.0 seconds, exit code 0. Added staff UI mode change, unauthorized setting change rejection, customer OTP and callback submission, no booking creation, owner status visibility, staff details/status/note persistence, and policy restoration.
- `npm run typecheck` passed; lint passed with the existing TanStack Table warning.
- Final `npm run build` passed after all application changes, including Prisma generation and Next.js TypeScript/page generation.

One browser attempt hit the existing login rate limit after repeated local test runs. Only the synthetic seed account's login rate counter on the guarded localhost development database was reset before the successful rerun. Production rate limiting was unchanged.

Mode control is manual and immediate; daily blackouts remain separate. Staff marking a callback as scheduled records an externally arranged appointment and does not reserve online capacity. Contact requests are listed up to the latest 200 records. See the updated [staff manual](admin-manual-th.md).

## Self-service password changes — additional verification

Added `/admin/change-password` for any authenticated staff account. The API verifies the current password, validates confirmation and a different new password of at least 14 characters / at most 72 UTF-8 bytes, hashes it using bcrypt, revokes all owner sessions, clears the browser cookie and audits the event without passwords. Requests are same-origin protected and limited to five attempts per account per 15 minutes. Login and password changes share a user row lock to prevent an in-flight old-password login from creating a session after revocation.

Form fields wait for hydration before accepting input, including the login form used after a password change. The sidebar now scrolls so the password menu remains reachable on shorter screens.

- Unit and validation: 23 tests passed; database-dependent tests skipped in the default command.
- Isolated MySQL: 6 tests passed, including password validation, wrong-current-password rejection without mutation, new/old hash checks, owner session revocation, preservation of another account's session and sanitized audit.
- Password browser workflow: passed, including guest rejection, wrong password error, successful change, rejection of another device's old session and login using the new password.
- Full browser regression: all 8 tests passed in 48.1 seconds, exit code 0.
- Final lint passed with the existing table compatibility warning; production build passed with exit code 0.

All password changes in tests use disposable synthetic accounts; the configured superadmin password was not changed by these tests.

## Remaining acceptance

Hospital logo update: shared public/header/footer and staff-sidebar branding now uses `public/images/hospital-logo.png`, exported from the existing matching hospital favicon without redrawing. TypeScript, lint (existing table warning) and production build passed. Production browser checks on port 3036 verified loaded square logo images at 1366px and 390px viewport widths with no horizontal overflow; screenshots were reviewed locally.

Port configuration update: application development/start commands, Playwright URLs/origins, OpenAPI server URL, local setup script, PM2 and Nginx upstream now use **3036**. TypeScript passed. Production server smoke checks at `127.0.0.1:3036` returned HTTP 200 for health and favicon; guest session creation accepted `Origin: http://localhost:3036` (200) and rejected the old port 3000 origin (403). The browser suite was not completed for this port-only update because the local development server accepted sockets but did not respond to HTTP; verification used the production build instead. No hospital host was modified or deployed.

These results establish local checks for implemented flows, not completion of every module or production acceptance. See [requirements](requirements.md) for remaining functionality and [security and operations](security-operations.md) for release gates. Live OTP, clinical/finance/privacy sign-off, production MFA, restore drills, accessibility UAT, infrastructure setup and deployment remain unverified.
