# RC03 CI failure recovery — 2026-11-24

Status: local recovery gates PASS; latest pushed HEAD CI verification follows below. Production remains NO-GO pending hospital/clinical UAT. No deployment, merge, force push, Production connection or clinical publication in this recovery.

## Baseline and preserved work

- Starting remote HEAD: `75d851eb65c60df14f262b33c0e57d9e24cc2347`, branch `feature/rc03-clinician-feedback-7`, PR https://github.com/pharmacisttom/pdhcheckupweb/pull/9.
- Fetched origin and fast-forwarded to that HEAD, preserving its five new QA documents, ESLint ignore and generated-type configuration. Original main worktree edits to promotion script/tests remain untouched. Local generated screenshots/types were backed up in ignored QA storage.
- Failed run: https://github.com/pharmacisttom/pdhcheckupweb/actions/runs/45133653177; job `137554656834`; artifact `14798742591` (`rc02-e2e-45133653177`). Downloaded/extracted and inspected its registration `error-context.md` and complete job log.

## Root cause: established facts and diagnostic limit

The timeout occurred before consent was displayed. The failure snapshot contains the server-rendered “กำลังโหลดข้อมูล…” state and a disabled language selector. The language selector is enabled by an independent client effect; this supports a pre-hydration/client-initialization stall, rather than a renamed consent button, a remembered consent decision, responsive hiding or a recovered checkpoint skipping consent. `startRegistration()` uses the correct, unchanged accessible Thai button name. All public API mock paths still match the wizard initialization requests.

The CI browser harness started `next dev --webpack` even though a production build had already passed. Release E2E therefore depended on development compilation/HMR instead of the built runtime. The artifact contains **no trace.zip** and no failure screenshot, so the exact lower-level browser/dev-server event that stopped hydration cannot be reconstructed or claimed as proven. Twelve unchanged local dev-mode registration tests passed with tracing; the original failure is intermittent, not a deterministic selector regression.

The fix removes development compilation/HMR from the release test harness and tests the immutable standalone production bundle, with its static/public assets, the same ports and unchanged timeouts. This does not add reload/retry logic, bypass consent or disable tests. Traces and failure screenshots are now retained. CI explicitly repeats the exact failed test five times with traces before the full browser suite.

Production-mode testing also exposed a genuine family-checkbox synchronization defect: Playwright observed an unchecked control immediately after click, while the later error snapshot showed it checked. Its trace was inspected. The checkbox read a lagging whole-form `useWatch` snapshot while `useFieldArray` updated the current values. One expression now reads the authoritative RHF `familyNcdEntries` values; existing field-array updates, historical notes, encryption and persistence are unchanged. The production suite then passed, including family selections and back/reload recovery.

## Files changed

- `.github/workflows/rc02-integration.yml`: audit gate and exact targeted registration repetition with traces.
- `scripts/start-browser-e2e.mjs`: guard the dedicated DB (or closed mock port), prepare standalone assets without rewriting existing runtime files, start the production bundle.
- `scripts/test-admin-crud-e2e.mjs`: use that built runtime; retain process ownership, clean-exit checks and DB preflight.
- `playwright.admin-crud.config.ts`, `playwright.rc03-ui.config.ts`: built-runtime startup and retained trace/screenshot evidence; no timeout increase.
- `src/components/registration-wizard.tsx`: one checkbox-value read corrected; consent, navigation, autosave and recovery flows retained.
- This report and the existing regression/readiness reports: distinguish historical results, failed CI and verified recovery evidence.

No schema, migration, dependency/lockfile, role, MFA, CSRF or clinical-rule change.

## Local verification (synthetic data only)

A new disposable MySQL 8.4.13 instance was created under ignored worktree QA storage, bound to `127.0.0.1:3338`. It has a restricted `pdh_test` account and only `pdh_healthcheck_rc01_test` grants. Existing services/configuration and database port 3306 were not modified. All 14 existing migrations were explicitly applied, then identity/grants/migration state verified with the existing guard before fixtures. Test credentials/keys are random and excluded from Git/logs.

| Gate | Verified result | Ignored local log |
|---|---|---|
| Exact failed registration case, five repeats | 5/5 PASS, 41.5s; trace per repeat; original timeouts | `.local/qa/ci-recovery/targeted-db.log` |
| Full guarded browser suite | 21/21 PASS, 44.2s; real admin/group + mocked public regressions | `.local/qa/ci-recovery/full-browser.log` |
| Mocked public UI suite | 7/7 PASS, 27.9s, production bundle | `.local/qa/ci-recovery/ui-production-fixed.log` |
| Full integration directory | 16 files / 108 tests PASS, 61.26s | `.local/qa/ci-recovery/integration.log` |
| Unit | 24 files / 199 tests PASS | `.local/qa/ci-recovery/unit.log` |
| Typecheck | exit 0 | `.local/qa/ci-recovery/typecheck.log` |
| ESLint | exit 0; existing TanStack warning only | `.local/qa/ci-recovery/lint.log` |
| Production webpack build | exit 0, Next.js 16.4.5 | `.local/qa/ci-recovery/build.log` |
| DB guard harness | 5/5 PASS; actual DB identity/grants/14 migrations also verified | `.local/qa/ci-recovery/guard.log` |
| npm audit, current unchanged lockfile | 0 info/low/moderate/high/critical, total 0 | `.local/qa/ci-recovery/audit.json` |

The built browser server uses the repository's approved OTP-disabled release policy, with email disabled. Staff MFA, secure cookies, session ownership, audit and CSRF remain enforced. Integration continues to test OTP behavior separately. No real SMS delivery is claimed. Mock UI tests additionally require an unusable DB port, so they cannot substitute for integration evidence.

## UAT and release limits

Hospital staff/clinical UAT, questionnaire wording/translation approval, measurement-policy approval, real provider policy, and backup/restore/release review remain outstanding. Proposed clinical content remains draft; BMI remains display-only. Archived-questionnaire resumption still needs an explicit clinical policy. No Production approval is inferred from automated PASS.

Reproduce after `npm ci`, `npx prisma generate`, and `npm run build` using only the guarded test configuration:

- `node scripts/test-admin-crud-e2e.mjs tests/e2e/registration-mobile.spec.ts --grep "registration keeps fields between steps and reports server success only after confirmation" --repeat-each=5 --trace=on`
- `npm run test:admin-crud:e2e`
- `npm run test:integration`, `npm run test:unit`, `npm run test:harness`, `npm run typecheck`, `npm run lint`, `npm audit --audit-level=low`.

The failed run's missing trace is an evidence gap, not a PASS. Future failures retain traces in the standard Actions artifact. Latest-HEAD CI result will be linked in PR #9 and recorded below after its run completes.
