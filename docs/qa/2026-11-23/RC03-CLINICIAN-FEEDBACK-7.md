# RC03 — Seven clinician / patient feedback items (incremental continuation of PR #8)

Date: 2026-11-23
Base: PR #8 head `eb0fdac5e6f1ba46a4f6f7b085b317fba6489079`
Branch: `feature/rc03-clinician-feedback-7`
Scope: DEVELOPMENT / TEST ONLY. Do not deploy or migrate Production from this branch.

## Prior test evidence (do not duplicate work)
- PR #8 remains OPEN, DRAFT and unmerged; 22 changed files at inspection. Its base is `feature/rc02-mobile-sweetalert`.
- Verified full CI previously recorded: 178/178 unit, 2/2 persistence integration, 15/15 browser E2E at source commit `2f4922247da2bdee8a211c47cc2e2e4bf82f2d8d`, run 43850310860.
- Latest PR head `eb0fdac5e6f1ba46a4f6f7b085b317fba6489079` has successful workflow run 43851284791 (verify per-job breakdown before merging).
- Baseline includes 7-day guest session, durable saved registrations, same-session draft rehydration, OTP-assisted recovery (only when OTP configured), and centralized alerts.
- These results are PRE-CHANGE evidence. They do not imply RC03 changes passed.

## Requirement / gap matrix and acceptance criteria

1. **Back to previous questions: preserve answers.**
   - Existing wizard uses `react-hook-form` with `shouldUnregister:false`, persistent `answers` state and explicit back button; draft data is recovered via `registrations/draft` and `reset(draft.person)`.
   - Gap: verify answers still survive back/forward across all six steps; do not silently discard unsubmitted latest edits on reload. Persist only after patient consent and within a secure authenticated guest session; do not write clinical answers to localStorage.
   - Test: fill demographic, multi-select and free text, go back twice, return, confirm exact values. Repeat after secure save/recovery and after session expiry.

2. **Thai national ID length and validity.**
   - Backend already uses `validThaiId` (13 digits, not uniform, checksum). Existing client field previously had no inline validation.
   - RC03 implemented client inline validation with 13-digit maximum, numeric keyboard, accessible error and checksum, leaving backend as authority. `documentType=none` and passports still follow existing policy.
   - Test 12 digits / 14 pasted digits / nonnumeric / checksum error / valid 13 digits; verify corresponding server rejection.

3. **Simplify duplicate questions and family history via checkbox.**
   - Existing `intakeReuse` avoids repeatedly asking values sourced from personal intake. Family NCD uses structured relationship+disease entries.
   - Do not delete or repurpose a published questionnaire question (existing responses reference versions). Run a signed-off inventory of published questionnaire questions and duplicate `intakeReuse` mappings; create a new version, preview and publish only after clinician approval. Represent relative categories as checkboxes (mother/father/sibling/child) with disease grouping; no relative names or identifiers. Keep existing persisted entries read-compatible.
   - Test conditional, multi-select and legacy-version read paths; ensure no historical answers lost.

4. **Admin contact requests table + modal.**
   - Existing generic managed-records editor uses Radix Dialog, but this is NOT evidence that `/admin/contact-requests` already has the requested table and detail dialog.
   - Inventory its page and role-guarded endpoints; render a filterable/paginated table with masked patient identifiers, request state, date and assigned follow-up. Open details in an accessible Radix modal; keep mutation controls permission-checked and audited.
   - Test paging, empty state, keyboard focus trap/ESC, authorization, field masking, modal overlay/SweetAlert interplay, and mobile.

5. **Snoring history.**
   - Introduce a clinician-approved item (yes/no/unsure, frequency and witnessed apnea as *optional* follow-up if reviewed) in the versioned intake/questionnaire instead of a breaking change to existing submissions.
   - Do not interpret snoring as a diagnosis or automatically label sleep apnea. Preserve old responses.
   - Test old versions, answer save/back/recovery, clinical visibility and access control.

6. **Organization: group vs individual.**
   - Existing `Organization` model and admin CRUD are not sufficient evidence for group registration. Design attendance type individual/group; group needs organization ID, primary contact and optional member/participant reference, with explicit consent and no exposure of other members' clinical data.
   - Reuse organizations; avoid duplicate organization table or duplicate bookings. Design migration as additive nullable fields with rollback and referential checks.
   - Test individual and group, organization status, authorization, concurrent bookings and privacy.

7. **BMI and age boundary 35.**
   - Existing age is derived from birthdate, not a numeric user-entered age. Confirm clinical intention: age under 35 vs >=35 (what happens exactly at 35), and whether BMI is simply displayed or changes eligibility/package logic.
   - Calculate BMI=weight_kg/(height_m^2); validate realistic height/weight bounds as approved by clinicians, avoid division by zero, calculate age from DOB at relevant assessment date in Asia/Bangkok; do not conflate BMI threshold 35 with age threshold 35.
   - Test age 34/35/36 at birthday boundary, BMI known values, missing/invalid inputs and save/recovery. No automatic booking eligibility decision until policy approved.

## Mandatory gates before any merge or deployment
1. Obtain real Questionnaire IDs/version and clinician-reviewed duplicate mapping before altering published questions.
2. Add focused unit/integration and Playwright tests for each implemented behavior, then execute Typecheck, Lint, Unit, E2E, Build, DB guard against isolated test DB. Record exact commit SHA and Actions runs.
3. Perform TEST UAT with real staff roles; no production patient records or synthetic production booking data.
4. Read-only Production reconciliation and verified backup/restore rehearsal; scrutinize schema/data migration and approvals.
5. No Production deployment until RC02 outstanding SMS OTP, PDPA, clinical content and release gates are signed off.

## Delivery status as of this document
- Completed code: **item 2 client validation** only; existing backend validation reused.
- Confirmed pre-existing: portions of item 1 (draft/back), item 3 (intake reuse and structured relatives), item 7 (age computation).
- Pending code/clinical signoff: full item 1 regression tests, item 3 questionnaire review, item 4 admin modal, item 5 snoring, item 6 group registration, item 7 approved BMI and age rules.
- All RC03 tests: **NOT YET EXECUTED**. Do not claim seven features complete.
