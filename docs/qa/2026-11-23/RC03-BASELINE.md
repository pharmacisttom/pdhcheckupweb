# RC03 baseline — 2026-11-23

Inspected before implementation. Isolated worktree `.worktrees/rc03`, branch `feature/rc03-clinician-feedback-7`, HEAD `b7cc60b5b18ea1c46a7e494e861503f618f9fb39`; fetched origin matches expected HEAD. PR #8 remains draft/unmerged; PR #9 is based on #8. Original checkout remains `0e39d9463cf7ed66c0c2c6cd7afe4c10b7d66a1c` on `feature/fix-data-promotion-safety`; existing edits to promotion script/tests preserved.

| Requirement | Baseline | Evidence |
|---|---|---|
| Wizard persistence | Partial | RHF shouldUnregister=false, answers state, encrypted registrations/draft, OTP recovery; recovery currently combines latest questions with saved version |
| Thai ID | Partial | domain.validThaiId and inline checksum; maxLength may silently truncate pasted excess |
| Questionnaire/family | Partial | immutable published version services, exact intakeReuse mapping, relational entries; dropdowns rather than checkboxes; no live inventory available |
| Contact admin | Partial | booking-control.tsx cards; guarded API decrypts all 200 rows, no server paging/detail boundary |
| Snoring | Missing | no proposed versioned item found |
| Group | Missing | Organization entity and registration.organizationId exist; no intake mode |
| Measurements/age | Partial | encrypted optional pair, BMI display only; ageOn uses UTC and UI browser-local date |

Baseline commands (logs in ignored `.local/qa/baseline-*.log`):
- npm ci: sandbox EPERM; elevated retry pending during inspection. No clean install claim.
- typecheck using available parent TypeScript: FAIL (missing sweetalert2, parent Prisma lacks SecurityEvent/TotpStepUse).
- lint using available parent ESLint: exit 0, one existing react-hooks/incompatible-library warning.
- unit using available parent Vitest: 22 files, 184 tests PASS, duration 15.70s.
- node --test scripts/test-db-guard.test.mjs: 5/5 PASS.
- integration `node scripts/test-db.mjs`: exit 1, missing worktree .env; no database writes.
- E2E managed harness: exit 1, missing worktree .env; no server/fixtures.
- production webpack build: started; interrupted after stalled compilation under incomplete dependency install. NOT PASS.
- Docker daemon unavailable. Existing root config names `pdh_healthcheck`, user `pdh_dev`; rejected for testing without connecting. No isolated DB credentials supplied.

No Production actions, published questionnaire changes, migrations or patient-data reads performed.
