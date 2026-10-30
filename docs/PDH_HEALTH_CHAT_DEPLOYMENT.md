# Staging handoff, no production deployment
This branch stacks on feature/staff-email-onboarding (draft PR1). Review/merge predecessor before choosing base. No VPS state, DNS or staging deployment was accessed; only local test DB used.

Set existing protected DB/encryption/session configuration using current deploy scripts. Keep CHAT_ENABLED=false, CHAT_AI_ENABLED=false, CHAT_AI_PROVIDER=disabled, CHAT_EXTERNAL_PROCESSING_APPROVED=false. Apply additive migrations only after staging backup/restore rehearsal and confirmation target is staging. Regenerate Prisma and build with same locked dependencies. Do not reseed real staff.

Configure independent clinical reviewer/publisher and ChatAgent membership. Enter approved notice and retention while disabled, DPO approves fingerprint; test real staff with MFA and synthetic conversations. Keep external AI disabled until provider/legal/network/budget/model contract tests. Optional vars CHAT_AI_MODEL/API_KEY/ENDPOINT/MAX_CALL_USD; zero budget makes no calls. No new listener/Redis/cron automatically installed. Operator schedules retention CLI with existing protected environment.

Production approval remains separate after staging UAT, device tests, backup restore, parser standalone smoke, auth/access/load review.

Reviewed staging commands (operator only; not executed here):

```bash
cd /var/www/pdhcheckup/source
git status --short
git fetch origin feature/pdh-health-chat
# Select reviewed full SHA in a clean checkout; never discard local work.
git switch feature/pdh-health-chat
git merge --ff-only origin/feature/pdh-health-chat
git rev-parse HEAD
# Review all migration SQL and verify staging backup can be restored to an isolated DB first.
find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum
# Replace placeholders with reviewed exact values; deploy script independently verifies the digest.
APPROVED_MIGRATIONS_SHA256='<reviewed-digest>' bash deploy/staging/deploy.sh feature/pdh-health-chat '<reviewed-40-character-SHA>'
bash deploy/staging/healthcheck.sh
# If application rollback is required, preserve schema and choose an existing compatible release:
bash deploy/staging/rollback.sh '<previous-staging-release-id>'
```

Environment wrappers clear inherited CHAT variables before loading protected target configuration. Validation checks approved AI configuration and independent provider key when enabled. Linux build includes host-specific canvas native package glob. Full staging UAT is still required; commands are a handoff, not a report of deployment.
