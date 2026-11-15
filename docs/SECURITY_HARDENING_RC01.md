# Security hardening RC01

## TOTP replay policy

The verifier returns the exact 30-second counter accepted within the existing ±1-step clock-skew window. A database unique key on `(userId, purpose, timeStep)` is the authoritative one-use guard across requests, processes and restarts. Invalid proofs do not create rows. A duplicate insert is treated as failed MFA. The counter is consumed in its own committed database operation before session creation or privileged mutation; therefore later business rollback cannot make the proof reusable.

Purposes are deliberately separate: `login` and `privileged-step-up`. The same counter may be used once for each purpose during its acceptance window; within either purpose it is single-use. Authentication recovery codes remain hashed and consume-once through the existing conditional update.

## Authentication and authorization failure events

`SecurityEvent` stores only a keyed hash of the subject, a fixed event category, a sanitized route group, a ten-minute bucket, timestamps and an occurrence count. Upsert aggregation limits duplicate-row flooding; login rate limits remain in force. No email, phone, password, OTP, token, secret, patient information, request body or IP address is stored. Events are written through the independent Prisma client, not the business transaction.

Policy on event-store failure is fail closed: denied authentication/authorization remains denied and the API responds `503` to signal that security telemetry is unavailable. No code path grants access because audit storage failed. Unexpected errors remain `503` and are logged with correlation ID and a safe error code only.

Security events are retained 90 days. TOTP-use rows are pruned after seven days, well beyond the ±1-step acceptance window. Schedule `npm run security-events:prune` daily under the deployment account using the protected environment; validate the DB target before scheduling. Keep database backups and access controls consistent with the existing security log policy.

## Migration review

Migration `202611150001_totp_replay_protection` adds the per-user/purpose/counter uniqueness constraint and user FK. Migration `202611150002_security_events` adds aggregated security events and retention indexes. Migration `202611150003_totp_user_retention` sets the TOTP-use FK to cascade on hard user deletion; normal staff offboarding should continue to deactivate users. These migrations are additive and do not modify existing migration files. The production migration digest must be independently reviewed and intentionally updated before any deployment. Do not use the existing approved digest to bypass this review.

## Verification and recovery

Tests use a dedicated MySQL database named `pdh_healthcheck_test` and user `pdh_test`; the test runner checks current grants and refuses broad, Production or Staging privileges. The test database may be recreated only by the isolated test harness. Do not run Prisma migration commands with Production/Staging environment files. If migration review rejects RC01, leave the tables unused and deploy no code that requires them; recovery is application rollback after schema compatibility review, not destructive table removal.

Before release, review the complete migration SQL and its SHA-256 digest in the branch, confirm the backup restore receipt against a non-production restore target, and rehearse the selected release/rollback scripts on isolated staging. The migration tree in this RC calculates to `d5b1c407a9a2f2feff0680bcd1be0cf7db3ed759e2f6f77a43fdb2a021551b7b`; deployment scripts still pin the older approved digest `664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8`, so they will fail closed until a human independently reviews and approves the new digest. Follow [the production release and rollback runbook](PRODUCTION_DEPLOYMENT.md) and [the backup/restore runbook](backup-restore.md) only after a separate deployment approval and after confirming they match the VPS's actual systemd/release layout. Do not run the legacy `scripts/run-production-deploy.sh` from an arbitrary checkout: it performs `git checkout` and `git reset --hard` in its source directory, so an operator must first verify that this directory is not the live or shared source checkout. This RC has not been deployed or migrated in Production.
