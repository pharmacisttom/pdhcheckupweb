# Release deployment tooling

See [production](../docs/PRODUCTION_DEPLOYMENT.md), [staging](../docs/STAGING_DEPLOYMENT.md), [backup/recovery](../docs/backup-restore.md), and [verification report](../docs/production-sync-report-2026-10-22.md).

Wrappers under production/ and staging/ select only their own port, service, environment, releases, backups and lock. Shared code implements both workflows. Staging also has backup and rollback wrappers. Existing ops/ PM2 files remain historical references; use the systemd examples for this VPS.

Scripts are prepared locally. Bash syntax checks and environment-validator tests do not certify VPS activation, systemd permissions, backup restorability or rollback. Run an authorized staging rehearsal first. Never run with bash -x or print environment files.


## Current release override — 2026-10-29

Use OTP_PROVIDER=disabled in both protected environment files. The validator now rejects test, http and legacy unconfigured modes for this release. OTP has been disabled by the project owner; staff Authenticator 2FA remains required. See docs/VPS_HANDOFF_2026-10-29.md (relative to repository root) for the current handoff, pending release checks and deployment prompt. Do not regenerate existing production encryption keys or OTP pepper when updating an existing database.
