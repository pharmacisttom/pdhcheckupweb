# PDH Smart Health Check — Controlled Production Pilot (operator review)

Status: **NO-GO until the gates below are evidenced and operator-approved**. This is a production pilot, not a sandbox deployment. This document grants no permission to change live systems.

## Release identity

- Original security patch: `0f796cf9923b8f1360fd89e0bee858c0e599769f`
- Source branch: `fix/security-hardening-rc01`
- The branch may contain subsequent review/CI/doc commits. **Record and lock the full final HEAD SHA** before readiness signoff; CI, isolated rehearsal, migration and artifact receipts must be tied to that exact SHA.
- PR: https://github.com/pharmacisttom/pdhcheckupweb/pull/6 (Draft until approved).

## Pilot scope and enrollment

- Initial participants: 2 physicians, 2 operational admins, 1 clinical/pharmacy reviewer and 1 IT observer (named nominees to be confirmed by the hospital owner).
- Restrict enrollment with an explicit role/user allowlist, MFA using separate authenticator enrollments, and least-privilege RBAC. If access is internet-facing, independently verify the ingress allowlist / VPN / identity boundary; avoid an uncontrolled public patient-facing booking launch.
- Test the physician review and allowed clinical views, admin CRUD workflows, save → API read-back → page refresh → persistence, session revocation, MFA and failed-auth telemetry, and public booking **read-only** unless the owner explicitly authorizes a limited synthetic booking cohort.
- Use synthetic names and patient placeholders for prelaunch and pilot system-check steps; do not import real HIS or patient records into test environments. Define handling and consent before processing real patient data in production.
- No privilege bypass, no sharing staff accounts, and no disabling MFA to work around login issues.

## Gate checklist (evidence receipt required)

| Gate | Evidence | Owner | Outcome |
|---|---|---|---|
| Source lock | Exact Git SHA, PR and diff; clean tag/tree; static CI | Release lead | Pending |
| Security | Staff MFA/TOTP replay, recovery code, RBAC matrix, denied-auth audit persistence/fail-closed tests | Security lead | Pending |
| Functional | CRUD/read-back/refresh, booking read-only and controlled synthetic write tests | Clinical/admin UAT lead | Pending |
| Migration | Review all 14 SQL files, exact SHA-256 digest and DBA-signed approved digest | DBA + release approver | Pending approval |
| Backup | Protected final pre-change backup, SHA sidecar, counts, migration baseline, key custody | DBA | Pending |
| Restore | Recover into **new isolated DB** and app; reconcile table counts, migrated state, synthetic decrypt fixture and time; signed restore receipt | DBA + observer | Pending |
| Rehearsal | Deploy RC01/rollback on **new isolated non-shared environment**, with matching unit/release layout and dedicated DB | DevOps + observer | Pending |
| Operational | Monitoring dashboard, staff roster, communications, safe stop-new-bookings switch, recovery plan | Pilot owner | Pending |
| Final approval | Owner explicitly authorizes exact SHA, window, cohort, stop rules and operator execution | Hospital owner | Pending |

## Migration and rollback safety

- Prior 11 migrations are already represented in the baseline; RC01 adds three migrations (14 total). A Production database found with 6 applied migrations must be rehearsed from a **restored six-migration copy** up to 14 and checked for compatibility with the prior app. Never claim the new schema can be rolled back solely by switching code.
- Canonical RC01 migration-tree digest (independently checked at PR review): `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b`.
- Existing legacy hardcoded approved digest remains `664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8`. A digest match is **not approval**. Do not automatically update or bypass this gate.
- Do **not** invoke `scripts/run-production-deploy.sh`: it contains `git checkout` and `git reset --hard` in the source path.
- Do not run `deploy/production/deploy.sh` unmodified merely because it exists; check the *actual* VPS systemd ExecStart/WorkingDirectory, production release symlink, current/previous layout and operator privileges. Prepare commands in a signed change ticket only after an isolated rehearsal. The repository's `deploy/shared/deploy.sh` accepts an operator-provided digest, so verify independent authorization separately.
- Application rollback does not undo database migrations. A failed partial migration is not safe to solve by destructive restoration without explicit recovery authorization. Preserve baseline backup and account for transactions after it.

## Operational roles

- Approver/pilot owner: hospital project owner (explicit approval required)
- Release operator: named IT/DevOps operator with least-privilege systemd/release access
- DBA/backup: named database custodian and restore witness
- Clinical validator: physician lead and pharmacy/clinical-safety representative
- Security monitor: designated staff for auth failures, unexpected 5xx, session anomalies, and permissions
- Feedback triage: named administrator; no patient identifiers in feedback

## Pilot monitoring (first 60 minutes / each day)

Record time-window, release SHA and: health endpoint, DB connectivity, auth success/failure rate, failed MFA and replay-denial counts, 5xx rate, CRUD read-back errors, booking requests/failed allocations, backup status and audit-write availability. Confirm actual alert thresholds with operators before enablement. Log incident IDs, not secrets, tokens or patient records.

## Stop conditions

Immediately stop **new bookings and new pilot enrollment** (using a previously tested, approved reversible switch) and alert pilot owner if: failed-auth or MFA bypass evidence; authorization/data-isolation failure; missing security-event writes; patient data exposure; corruption/persistence mismatch; repeated unexpected 5xx; missing audit trails; or failed health/DB availability. Keep existing clinical records accessible safely where required; do not terminate sessions or delete data reflexively.

A booking stop switch or maintenance include must be verified against the **actual running configuration** on an isolated clone before use. No unverified Nginx or SQL command is authorized here.

## Feedback form (no PHI)

- Date/time and pilot session ID (no patient ID):
- Participant role (physician / admin / clinical reviewer / IT):
- Screen / workflow:
- Task (login / MFA / CRUD / read-back / booking / report):
- Expected result:
- Actual result:
- Severity (blocker / major / minor / suggestion):
- Reproducible? Y/N; steps (without secrets or patient details):
- Screenshot with all personal/clinical data removed? Y/N:
- Owner, incident reference, target fix branch and retest result:

## Pre-approval verification commands — READ ONLY on VPS

```bash
sudo systemctl show pdhcheckup-production.service -p ActiveState -p MainPID -p WorkingDirectory -p ExecStart
sudo systemctl show pdhcheckup-staging.service -p ActiveState -p MainPID -p WorkingDirectory -p ExecStart
sudo readlink -f /var/www/pdhcheckup/releases/production/current 2>/dev/null || true
sudo readlink -f /var/www/pdhcheckup/releases/production/previous 2>/dev/null || true
sudo ss -ltnp | grep -E ':3036|:3037' || true
sudo mysql --table pdh_healthcheck -e 'SELECT COUNT(*) total, SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL) completed FROM _prisma_migrations'
```

Do not print environment file contents or run migration/deployment scripts as part of preflight. Only the separately approved operator runbook may contain production-changing commands after all gates are completed.
