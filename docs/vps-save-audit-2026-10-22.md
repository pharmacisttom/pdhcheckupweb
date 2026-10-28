# Data-saving and VPS readiness audit — 22 October 2026

## Conclusion

Local persistence and browser checks pass, but complete VPS operation is not verified. Public production checks reveal no selectable services or published packages and an unconfigured notification status. The current source implements only development phone OTP; a real production SMS adapter is missing. This is separate from staff authenticator-app TOTP, which passes local enrollment tests.

## Completed validation

- ESLint: no errors, one existing TanStack Table/React Compiler compatibility warning. The rule remains enabled.
- TypeScript: passed.
- Isolated MySQL integration suite: 39 passed in 8 files. The runner restricts the host to localhost and uses pdh_healthcheck_test. All 4 local migrations are applied; this does not establish VPS migration status.
- Complete Playwright suite: 17 passed on the final run, against localhost and synthetic development data.
- Default unit suite: 54 passed, 38 skipped (database-dependent cases are executed separately by the 39-test integration run).

Added tests/integration/admin-persistence.test.ts with actual API save and database readback for organization/contact encryption, slot creation and calendar updates, questionnaire draft/publication, callback status/note encryption, and audit recording. The slot test also verifies Thai timezone conversion and rejection of mismatched daily capacity without partial writes.

Existing tests cover package/item persistence and invalid selections, import approval and price versions, booking/hold concurrency and idempotency, closed-booking callback submission, password changes, invitation/MFA enrollment, session revocation, and authorization/security checks. These results are scoped to tested paths and do not certify every possible input or deployed VPS behavior.

The initial browser run had a callback scenario timeout on the development server. An isolated rerun passed. The interrupted cleanup left local booking closed, causing the next registration test to correctly skip date selection. The registration test file now snapshots/restores the local policy in independent hooks and explicitly enables online booking for that scenario. The multi-page callback test permits 120 seconds overall while retaining normal assertion deadlines. The final full suite passes. These changes affect tests only.

## Read-only production observations

Checked https://pdhcheckup.pluakdaenghospital.cloud without authentication or production writes:

| Endpoint | HTTP | Result |
| --- | --- | --- |
| /api/v1/health | 200 | status=ok, database=true, notifications=unconfigured |
| /api/v1/services | 200 | 0 returned services |
| /api/v1/packages | 200 | 0 returned packages |
| /api/v1/booking-policy | 200 | onlineEnabled=true |

HTTP/database health does not verify schema migrations, deployment revision, authenticated mutations, notification delivery, or all storage permissions. An empty public catalog does not establish that the underlying tables are empty: inactive/unpublished data or a different database may explain it.

## Remaining production requirements

1. Establish authorized SSH/operator access; inspect deployed revision, service logs, protected environment configuration, and Prisma migration status. Compare the intended database/schema and existing records without printing secrets. No authenticated VPS session was used during this audit.
2. Verify/import hospital-approved service data through the existing pricing workflow and have a different authorized approver publish it. Select real active services when creating package drafts, then approve the packages for public display. See package-draft-fix-2026-10-22.md. Do not seed demo production data or reset the database.
3. Implement the selected SMS provider adapter and provision its credentials securely. In src/server/api.ts, otp/request currently allows only OTP_PROVIDER=test outside production; otherwise it returns 503 PROVIDER_UNCONFIGURED. Changing an environment variable alone will not implement production SMS delivery. Review consent and provider details before enabling the workflow.
4. Run an approved staging rehearsal and controlled authenticated production UAT after deployment/schema review. Source changes from earlier tasks remain local and are not evidence of the deployed version.

## Features not currently offered

The billing screen explicitly says payment collection and receipts are not enabled pending the finance workflow. Its API currently exposes invoice estimates for reading, not payment recording. Administrative privacy and waitlist screens are also read views; their full case-processing workflows should not be represented as implemented. These are product scope limits, not failures that lint can validate.

## Changes and deployment status

This audit adds a persistence regression test, improves browser test isolation/timing, and records these findings. It does not modify application saving handlers, production configuration, production records, remote migrations, or deploy code. No push or deployment was performed. Production readiness remains conditional on the requirements above.
