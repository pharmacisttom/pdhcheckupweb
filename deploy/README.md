# Release deployment tooling

See [production](../docs/PRODUCTION_DEPLOYMENT.md), [staging](../docs/STAGING_DEPLOYMENT.md), [backup/recovery](../docs/backup-restore.md), and [verification report](../docs/production-sync-report-2026-10-22.md).

Wrappers under production/ and staging/ select only their own port, service, environment, releases, backups and lock. Shared code implements both workflows. Staging also has backup and rollback wrappers. Existing ops/ PM2 files remain historical references; use the systemd examples for this VPS.

Scripts are prepared locally. Bash syntax checks and environment-validator tests do not certify VPS activation, systemd permissions, backup restorability or rollback. Run an authorized staging rehearsal first. Never run with bash -x or print environment files.
