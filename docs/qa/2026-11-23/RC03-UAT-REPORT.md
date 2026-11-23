# RC03 UAT report — 2026-11-23

**DEVELOPMENT / TEST ONLY — Production NO-GO.**

## Source and preservation

- Requested/start commit: `b7cc60b5b18ea1c46a7e494e861503f618f9fb39` on `feature/rc03-clinician-feedback-7`, PR https://github.com/pharmacisttom/pdhcheckupweb/pull/9.
- Re-fetched origin after the user's request to update Git before release; remote target still matches the start commit. Inspected `origin/feature/rc03-production-readiness` (`1f6c5a2`) and its promotion/deploy/sandbox changes. These remain on their existing branch; no replacement or unrelated merge.
- Original checkout `feature/fix-data-promotion-safety`, HEAD `0e39d94`, and uncommitted promotion script/unit-test edits preserved. RC03 work lives in `D:/pdhcheckupweb/.worktrees/rc03`.
- Implementation commit: `0f18538e32db4bd8ae0e0c3808aa22de0c81cc01`. Final documentation commit and CI evidence follow below; pending gates are not PASS.
- Pre-change evidence: [RC03-BASELINE.md](RC03-BASELINE.md).

## Seven-item acceptance checklist

| Item | Implementation and reuse | Current acceptance |
|---|---|---|
| 1. Wizard persistence | Reuses RHF, encrypted registration payload, session ownership and OTP recovery. Rehydrates the saved questionnaire version. Persists package/add-on/day/slot preferences on subsequent forward saves; recovered preferences never restore a quote/hold/acceptance. Stable request UUID creates a session-bound deterministic registration ID, so same-request retries update one record under the existing session lock. | PARTIAL: mocked browser back/reload passes; real DB/recovery and concurrent retry gates pending. Data typed before the completed assessment save is still only in memory; no incomplete-input autosave claim. |
| 2. Thai ID | Shared client/server checksum validator; fixed double-escaped client digit regex. Excess pasted characters remain visible and invalid rather than silently truncated. Thai inline error is linked with aria-describedby/aria-invalid. Alternative-document policy preserved. | DONE in unit/mocked browser tests; live API integration gate pending. |
| 3. Questionnaire/family | Checkbox matrix writes existing relationship+disease array; old notes remain editable. Existing intakeReuse and immutable published-version services reused. Inventory shows IDs, exact reuse mappings and duplicate/complex-label candidates per version. Proposal preserves all existing IDs/conditions/rules. | PARTIAL: no access to live published/draft catalog; clinician must resolve duplicate/unclear questions, approve translations and save/approve proposed version. No published content changed. |
| 4. Contact admin | Server pagination (20 default, max 50), reference search, status filter, metadata-only table. No patient identifiers/clinical answers decrypted for list. Details fetched by ID only after bookings:read guard and successful audit; Radix dialog reuses current review/status/quote/schedule endpoints. Success alert opens after closing modal; errors stay inside dialog; focus returns to originating button. | PARTIAL: implementation/static checks complete; real staff browser/RBAC/audit integration pending. Existing RBAC retained: registration/manager/superadmin can inspect; clinician role alone has no bookings:read. |
| 5. Snoring | Proposed optional versioned yes/no/unknown item, Thai/English labels. No frequency/apnea follow-up, diagnostic rule or package-selection logic. Existing answer encryption, navigation, recovery and staff detail rendering reused. | PARTIAL: proposed content only, requires clinician-approved draft/publication. Legacy answers remain valid; no live questionnaire modified. Other languages currently use Thai fallback. |
| 6. Individual/group | Individual default. Group selects an existing active Organization and provides primary contact, phone and optional member reference inside encrypted payload. Existing registration.organizationId reused; organization is locked and checked on save. No group-wide PHI lookup added. | PARTIAL: mocked browser persistence and unit validation pass; real relational/privacy and booking concurrency gates pending. Active organization list is capped at 200; larger catalogs need lookup UX. |
| 7. Height/weight/BMI/age | Current intake version 3 requires both measurements; new-registration API also enforces the pair for older request shapes. Historical payloads without measurements remain readable. Shared Bangkok calendar age; display categories strictly <35 / >=35. BMI unrounded internally, 2-decimal display only. Consent-version checks include new intake version. | DONE in unit/mocked UI; DB persistence/recovery acceptance pending. Measurement plausibility limits still require clinician approval. |

## Verification ledger

Local results on the working RC03 source, with synthetic data only:

| Check | Result / evidence |
|---|---|
| Locked install | npm ci succeeded after sandbox EPERM required elevated local dependency installation: 659 packages. Next security patch subsequently installed with updated lockfile. |
| Typecheck | PASS, exit 0; `.local/qa/post-typecheck.log`. |
| ESLint | PASS, exit 0; one pre-existing TanStack react-hooks/incompatible-library warning. `.local/qa/post-lint.log`. |
| Unit | PASS, 23 files / 197 tests; `.local/qa/post-unit.log`. Includes Bangkok midnight, ages 34/35/36, invalid birthdate/ID, alternative documents, old/current payloads, group metadata and proposed-version compatibility. |
| DB guard harness | PASS, 5/5; `.local/qa/post-guard.log`. |
| Mocked browser | PASS, 6/6, clean exit, 38.9s; `.local/qa/post-ui-final.log`. Registration back/reload, family/group/snoring, ID lengths/checksum/extra characters, 320–1440px layout, generic alerts and Bangkok age. This is UI evidence, not real DB E2E. |
| Production-mode build | Next 16.4.2 first stopped for security advisory; repeat completed. Final build on patched 16.4.5 PASS, exit 0 (`.local/qa/post-build-patched.log`). No bypass flag or security control was disabled. |
| Real DB integration | BLOCKED locally: dedicated DATABASE_URL missing; strict RC03 runner refuses before fixtures. Docker daemon unavailable. Root .env points at pdh_healthcheck/pdh_dev and was rejected for test use without connecting. |
| Real admin E2E | BLOCKED locally by missing dedicated test config. New test exercises metadata masking, detail/audit, keyboard focus/ESC, desktop/mobile. CI provisioning uses localhost pdh_test/pdh_healthcheck_rc01_test only. |
| Migrations/schema drift | No new migrations or Prisma schema changes. CI explicitly provisions an ephemeral DB, applies existing 14 migrations, verifies identity/grants/state, and runs read-only migrate diff before fixtures. Actual execution pending. |

Logs above are local ignored artifacts; durable verification must use the exact source commit's Actions job logs. No full integration/real-browser PASS is claimed here.

## UAT procedure (isolated TEST only)

1. Follow the existing RC02 disposable database provisioning workflow. Supply restricted `pdh_test` credentials for localhost `pdh_healthcheck_rc01_test`, encryption key and OTP pepper. Apply the 14 existing migrations explicitly; verify identity/grants/migration guard before fixtures. Never copy root .env or Production data.
2. Run `npm ci`, `npx prisma generate`, `npm run typecheck`, `npm run lint`, `npm run test:unit`, `npm run test:harness`, `npm run test:rc03:db`, `npm run build`. The RC03 runner neither rewrites URLs nor migrates/seeds implicitly. Legacy `test:db` targets a different historical test DB and is not the RC03 entry point.
3. Run `npm run test:admin-crud:e2e` for real guarded staff/admin plus synthetic public regressions. Run `npm run test:rc03:ui` separately for DB-free API-mocked browser checks. Do not substitute mocked results for integration results.
4. As authorized clinical reviewer, open `/admin/questionnaires`, inspect each version's inventory and choose “เตรียมฉบับร่าง RC03 พร้อมประวัติกรน”. Review JSON and all languages, save as a NEW draft, then obtain clinical approval before publishing. Keep prior published IDs/answers unchanged. No automatic clinical publication occurs in this delivery.
5. Test individual and active-organization group registration. Enter measurements, invalid then valid national ID, multiple family relationship/disease checkboxes and snoring. Move back/forward; complete the assessment save. Repeat reload and same-session resume; verify same Registration ID and no Booking/ContactRequest duplication. Preferences are hints only; obtain a fresh quote/hold and explicit acknowledgment before booking.
6. With a configured TEST OTP provider, use a new browser context and existing reference+phone OTP+birthdate recovery. Confirm measurements/family/snoring/preferences persist; wrong DOB/OTP/other member must not read or change the record. Test real SMS delivery separately before release.
7. In `/admin/contact-requests`, search reference, change status filter, page through >20 synthetic records, open detail by keyboard, Tab within modal, ESC/Close and verify focus restoration. Repeat at 390 and 1440px. Check audit entries and API denials for unauthorized roles. Recheck review/quote/schedule transitions and alerts.
8. Check BMI 170cm/70kg = 24.22 displayed; no risk/package change. Verify Bangkok 2026-11-23 23:59:59 versus 2026-11-24 00:00 for DOB 1991-11-24 changes 34 to 35. Obtain staff/clinical acceptance signatures.

Screenshots: `rc03-register-320.png`, `rc03-register-390.png`, `rc03-register-1440.png` (synthetic UI). Real contact screenshots will be produced by the guarded CI test; do not claim them until artifacts exist.

## Security, migration and rollback

- No Production deployment, configuration change, DB connection/migration, seed or patient-data access. No merge of PR #8/#9.
- AES-256-GCM encryption, HttpOnly session ownership, MFA/OTP, CSRF/rate limits and audit controls retained. No added health-data browser storage, logs or analytics. List endpoint now omits personal identifiers entirely instead of decrypting all payloads; reference-only search does not scan encrypted PHI.
- New group metadata/preferences live inside encrypted JSON; existing Organization table and nullable registration.organizationId reused. Application checks organization integrity under lock. There is no new DB FK; read-only orphan reconciliation and deletion-policy review remain UAT gates.
- Additive payload changes only; prior records are not rewritten. No schema rollback required. Revert RC03 code commits to roll back UI/API, retaining encrypted extra JSON and existing rows. Preserve keys/backups. Any questionnaire published later requires a separate clinical rollback decision, never deletion of historical answers.
- Next.js patched from 16.4.2 to 16.4.5 with matching eslint-config-next. Initial audit identified 11 findings (8 moderate, 3 high); Prisma/effect and toolchain findings require reviewed remediation and a fresh audit before release. No forced blanket dependency upgrade applied.

## Outstanding clinical / Production blockers

- Clinician signoff on duplicate/complex questions, snoring wording and translations, measurement plausibility limits. BMI risk thresholds/package eligibility remain explicitly unapproved and unused.
- Live version inventory, approval of actual hospital catalog/packages/services/prices/slots; synthetic fixtures must never enter Production.
- Full isolated DB/real-browser CI, production-like TEST UAT, OTP delivery, PDPA/RBAC review, retention policy and pre-save draft-loss UX review.
- Archived questionnaire drafts retain historical read paths but the current wizard requires an approved published version for editing; archived-version resumption needs a separately reviewed policy.
- Real concurrent booking/contact constraints, backup/restore rehearsal, read-only Production reconciliation and explicit release review. Other readiness-branch deploy changes require separate scoped review before any eventual deployment.
