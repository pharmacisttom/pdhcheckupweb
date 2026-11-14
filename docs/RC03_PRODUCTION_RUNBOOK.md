# RC03 production runbook

## Current status

RC03 is ready for code review and controlled UAT. The Production service currently uses `/var/www/pdhcheckup/source` as its deployment checkout and `/var/www/pdhcheckup/releases/production` as its runtime release. Production must remain on its current healthy release until the reviewed RC branch, backup restore, and deploy gates have passed.

Do not run this procedure from `/home/deploy/pdh-rc03-20261112/repo`; that directory is an isolated test clone at the original RC base and contains test outputs/uncommitted files.

## Prepare

After the PR has been reviewed and its exact commit is published at the remote RC branch, run as an authorized operator:

```bash
cd /var/www/pdhcheckup/source
sudo -u pdhcheckup git fetch origin feature/rc03-production-readiness
sudo -u pdhcheckup git switch feature/rc03-production-readiness
sudo -u pdhcheckup git pull --ff-only origin feature/rc03-production-readiness
sudo -u pdhcheckup git status --short
sudo -u pdhcheckup git rev-parse HEAD
sudo -u pdhcheckup bash scripts/run-production-deploy.sh prepare feature/rc03-production-readiness FULL_REVIEWED_COMMIT_SHA
```

Confirm `git status --short` is empty and `HEAD` equals the reviewed full 40-character commit at the branch tip. PREPARE creates a compressed Production backup and promotion manifest. Inspect the manifest. Restore that exact backup to the isolated database `pdh_healthcheck_restore_rc03`, then run `scripts/verify-promotion-restore.mjs` to create the receipt. Use protected credentials and never use the Production database as the restore target.

## Apply

Only after the backup restore has been independently verified and the manifest contents approved, use the exact receipt path and checksum printed by PREPARE:

```bash
RESTORE_VERIFICATION_FILE=/absolute/path/to/rc03-restore-receipt.json \
sudo -u pdhcheckup bash scripts/run-production-deploy.sh apply feature/rc03-production-readiness FULL_REVIEWED_COMMIT_SHA --manifest-checksum=PREPARE_MANIFEST_SHA256
```

Replace the uppercase placeholders with exact values; do not type them literally. The script requires the selected commit to be the fetched branch tip and the matching branch to be checked out. It validates PREPARE state, backup integrity, restore receipt, database identity, migration digest, then builds/activates the release and promotes configuration. It does not accept `--prepare`/`--apply`; the stage names are `prepare` and `apply`.

## Rollback and post-deploy verification

If activation or health checks fail, follow `deploy/production/rollback.sh` after schema compatibility review. Roll back the application release first; do not blindly restore a full database over bookings created after deployment. Preserve logs and the backup for investigation. Verify public health/readiness, staff login with MFA, CRUD persistence, booking/cancellation, and Thai/English/Chinese/Burmese/Khmer rendering before clinical UAT.

