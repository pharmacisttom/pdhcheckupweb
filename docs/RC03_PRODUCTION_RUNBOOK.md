# RC03 production runbook

## Gate

RC03 is **GO for review/UAT** and **NO-GO for unattended Production apply** until clinical, privacy/DPO, finance, backup-restore, operator and load approvals are recorded. No Production database was accessed by this work.

## Prepare

```bash
git fetch origin feature/rc03-production-readiness
git checkout --detach 84f18c8c5152a1c0ba30a7d6c8fd2a5908defa47
export DATABASE_URL='mysql://...'
export SOURCE_DATABASE_URL='mysql://...'
export TARGET_DATABASE_URL='mysql://...'
bash scripts/run-production-deploy.sh --prepare
```

The prepare step creates an immutable manifest and mandatory compressed backup with SHA-256. An operator must restore that backup into the isolated database `pdh_healthcheck_restore_rc03` and run `scripts/verify-promotion-restore.mjs`; the resulting receipt is required for APPLY.

## Apply (operator-approved only)

```bash
RESTORE_VERIFICATION_FILE=/secure/rc03-restore-receipt.json \
bash scripts/run-production-deploy.sh --apply
```

The script verifies the exact commit, manifest, backup digest, restore receipt, database identity, and migration digest before a serializable transaction. Never pass a staging/UAT database or a production credential to a test-mode run.

## Rollback

Rollback the application to the previously approved release using the repository rollback script after compatibility review. Do not blindly restore a full database over new bookings; preserve post-release transactions and use the reviewed data-repair procedure.

