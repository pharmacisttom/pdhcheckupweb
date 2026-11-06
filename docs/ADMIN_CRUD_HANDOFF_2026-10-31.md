# Admin CRUD completion and VPS handoff — 2026-10-31

Branch: feature/admin-crud-completion. Parent f63ca09 (Health Chat); predecessor e8a0ad8 (staff onboarding). At read-only GitHub check on31October, PR1 and PR2 were open, unmerged. This work must be reviewed with that dependency chain. No VPS login or production changes were performed. This machine has no configured SSH host/user.

## Implemented changes

- Package approvers can read draft packages with packages:read without acquiring write permission. Menus use the same pure permission evaluator as server guards. Forms/actions use server capabilities.
- Organizations: create, paginated search, authorized encrypted-contact detail, name/contact/status edit, inactive status. Optimistic revision prevents stale overwrite; existing future linked bookings block deactivation.
- Services: create/update master fields, stable non-editable code, active/review/preparation controls and last100 price versions. No manual unapproved price mutation. Published-package dependencies block deactivation. CSV approval now updates English name/unit too; Thai name/category conflicts still require explicit master review.
- Imports: cancel staged/invalid batches by importer or approver; published batches immutable. Preserve leading-zero CSV codes; malformed CSV/XLSX/mapping produce422. Original two-person price approval remains.
- Slots: create and edit capacity, organization reservation and closed status. Day then Slot locking matches booking capacity service. Reject lowering free capacity below bookings/live holds, closing occupied slots or editing past slots.
- Waitlist: assignment, encrypted latest contact note, contacted/closed/cancelled/reopen workflow. Scheduled status requires a real non-cancelled Booking belonging to the same session/date. Staff contact detail returns only identity/contact fields from an unexpired registration, not health history. Closing retains booking linkage/history.
- Staff reschedule: recorded patient agreement plus reason, existing capacity/transaction/idempotency service. Caller identity comes from staff guard; owner session comes from stored Booking. Ordinary public reschedule still respects online policy. Staff action may operate when public online booking is closed, with actual staff actor and encrypted evidence recorded.
- Finance: manual invoice approval, billed amount, partial/full payments, refund and void with immutable FinanceEntry snapshots. Decimal arithmetic, row locks, optimistic revision and idempotency. Reject bill above approved, payment above balance, refund above receipts or void while money remains received. Evidence/reason encrypted. These actions record independently verified transactions; they do not transfer money or create an official electronic receipt.
- PDPA: case assignment, explicit recorded identity review, bounded status transitions and encrypted event history. Processing/completion require identity review. No automatic patient deletion or document delivery. Chat redaction requires a verified deletion case in processing, checks session ownership, and writes redaction + case/audit history atomically. Legacy direct redact action now directs staff to this case workflow. Backups remain under separate retention policy.
- Questionnaires: edit draft with revision, clone to new version, archive. Published versions cannot be edited in place; archive requires newer published replacement and no live unbooked registrations using that version. Clinical rules remain human-authored/reviewed. Editor waits for initial load to avoid pre-hydration text corruption.
- Chat departments: create/rename/enable/disable in settings. Open conversations block deactivation; session creation and transfer recheck active department under lock.
- Rate limiter: replace empty Prisma upsert read/insert race with parameterized MySQL atomic insert-on-duplicate, then existing locked counter. Concurrent initial requests no longer produce false duplicate conflicts.
- 503 diagnostics: unknown failures log only correlation ID, admin/public scope, method and sanitized error code. No message, SQL, stack, payload, headers or health data. Response includes X-Request-ID. This does NOT establish the cause of the reported production503; the deployed release/endpoint and actual logs still require investigation.

## Database

Additive migration 202610300003_admin_crud:
- revision columns: Service, Questionnaire, Slot, Organization, Invoice, PrivacyRequest, Waitlist
- Waitlist: assigneeId, noteEncrypted, bookingId
- PrivacyRequest: assigneeId, identityVerifiedAt/By
- immutable FinanceEntry and PrivacyCaseEvent with restrictive parent relations

No destructive drop/delete migration. Original patient/booking/quote data retained. Applied to isolated localhost:3308 pdh_healthcheck_test for tests, and then the explicitly guarded localhost:3308 pdh_healthcheck with SEED_DEMO=true for local development. Schema diff for both targets returned exit0. No production database was accessed. Production target must be inspected, backed up and restored into an isolated rehearsal database before migration approval. Do not run seed or regenerate existing encryption keys.

## Local verification

Integration94/13files passed, including CRUD/RBAC, revision conflicts, actual-booking linkage, live-hold capacity rejection, concurrent payment/idempotency, encrypted case/finance history, case-scoped redaction, CSV formatting, atomic rate-limit first-use concurrency and staff reschedule/full-slot checks. Unit114/17files passed. Browser/build final results are appended below after completion. Skipped/not-run checks are never counted as passed.

Browser fixtures are synthetic and restricted to localhost test DB. Mobile/tablet screenshots use docs/qa/2026-10-30/admin-crud-org-390.png and admin-crud-finance-820.png (existing QA folder maintained across31October). Browser emulation is not physical-device testing.

Remaining acceptance: staging deployment/restore/load/UAT and physical devices; actual production503 analysis; bank/payment gateway, official e-receipts and a separate organization quotation document module are not implemented. The quotations navigation currently shows booking invoice estimates and recorded finance actions; patient price proposals remain in the existing contact-request workflow. Clinical, legal and accounting workflow approval remains hospital responsibility. No general patient-record erase/export automation is claimed.

## Staging handoff

1. Read AGENTS.md, relevant installed Next docs and deploy/README.md. Inspect actual source checkout, active service/release SHA, migration status and git status read-only. Do not assume this branch is deployed.
2. Review PR1 -> PR2 -> CRUD dependency chain. Keep selected release on an exact reviewed full40-character SHA and clean source checkout; never reset/discard local VPS work.
3. Keep OTP_PROVIDER=disabled and external email/AI disabled unless independently configured/approved. Preserve DATA_ENCRYPTION_KEY/OTP_PEPPER and existing accounts.
4. Review all migration SQL and digest from selected Git blobs. Restore staging backup to a separate database and verify before any production proposal.
5. Existing staging wrapper accepts exact BRANCH SHA and APPROVED_MIGRATIONS_SHA256. It validates protected target/peer env, builds/tests, backs up, applies migrations and restarts only staging. Do not run integration tests against staging/production.
6. Verify staging HTTPS, MFA, roles, all CRUD flows, capacity rejection, price approval, financial idempotency, PDPA case checks, import formatting, public registration and chat. Keep real patient data out of test fixtures.
7. If application rollback needed, select a schema-compatible previous staging release with deploy/staging/rollback.sh. Keep additive tables/migration history; never restore full database over newer bookings blindly.
8. Report actual results and stop before changing production until a concrete deployment/migration/backup/rollback plan is approved.

Example commands for the reviewed source checkout on VPS (not executed locally):

```bash
cd /var/www/pdhcheckup/source
git status --short
git fetch origin feature/admin-crud-completion
# Select reviewed release in a clean checkout; do not discard existing work.
git switch feature/admin-crud-completion
git merge --ff-only origin/feature/admin-crud-completion
git rev-parse HEAD
# Review SQL, backup and an isolated restore rehearsal first.
find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum
APPROVED_MIGRATIONS_SHA256='<reviewed-digest>' bash deploy/staging/deploy.sh feature/admin-crud-completion '<reviewed-full-SHA>'
bash deploy/staging/healthcheck.sh
# Application rollback only after schema compatibility review:
bash deploy/staging/rollback.sh '<previous-staging-release-id>'
```

## Prompt to send to ChatGPT on VPS

Continue PDH Smart Health Check from feature/admin-crud-completion. Read this document and the actual GitHub PR dependency chain before actions. First inspect current release/service/SHA, protected environment isolation and migrations read-only. Diagnose the reported /admin/lab-pricing HTTP503 using actual endpoint/method/response/request ID and sanitized logs; do not guess that the file or missing migration is the cause. Prepare and test the exact reviewed commit on staging using existing deploy scripts, migration digest, backup/isolated restore and schema-compatible rollback. Do not run DB tests or seed against staging/production, overwrite existing work, expose secrets, regenerate encryption keys, bypass MFA/two-person price approval or enable OTP/external AI. Report actual evidence, remaining gaps and the concrete production plan; stop before production changes for approval. Local test passes are not VPS acceptance. See final PR description for exact SHA and reviewed migration digest.

Final browser verification: all8 CRUD cases passed together, including finance/PDPA, questionnaire update/archive, staff reschedule/waitlist and Chat departments. Existing no-OTP registration4 and Health Chat8 regression cases passed. Typecheck passed; lint0 errors/1 pre-existing TanStack warning. Local standalone build passed; final packaging recheck recorded in PR. No SSH, staging/production deploy, real-device/load/restore test performed. The user selected a prompt handoff to ChatGPT on VPS.

Migration-set SHA256 from reviewed Git blobs (LF): 664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8
ตรวจ SQL และเทียบ digest ของ exact release บน VPS ก่อนตั้ง APPROVED_MIGRATIONS_SHA256; ค่านี้ไม่ใช่การอนุมัติ deploy production

The migration-set digest was independently reproduced in Git Bash using --text to match Linux sha256sum output markers (Git Bash defaults to binary markers). Index blobs avoid CRLF differences. Generated SQL EOF blank line is retained to preserve its already-applied local checksum; whitespace checking ignores blank-at-EOF only.
