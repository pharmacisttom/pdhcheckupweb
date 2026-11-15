# PDH Smart Health Check — Controlled Production RC01 completion checklist

Target URL: https://pdhcheckup.pluakdaenghospital.cloud/register
Target database: `pdh_healthcheck` (existing live database; retain data)
Live service: `pdhcheckup-production.service`, loopback 3036.
Live runtime: `/var/www/pdhcheckup/releases/production/server.js` (direct runtime, **not** a current symlink).
Protected environment: `/var/www/pdhcheckup/shared/production/.env`.

## Facts verified on 2026-11-15
- Production service healthy; database accessible; **6 completed migrations**; Questionnaire=0, Registration=0, Service=0, Package=0, Slot=0, DayCapacity=0, User=2 (one active superadmin, one active manager).
- Shared staging is **not** the deployment target. It contains one published, approved UAT questionnaire (version 1, 17 questions/2 clinical-review rules), 6 UAT services, 2 **fake-price** packages, 56 historical UAT slots, 14 days.
- A restricted local backup of the existing questionnaire's JSON has been exported by the operator to `/home/deploy/pdhcheckup-questionnaire-recovered.json` (mode 600). Preserve it; do not publish personal data, tokens, or credentials.
- RC01 source now provides guarded questionnaire update/archive handlers with revision checking and audit, in addition to create/list/approve. Existing integration regression tests are included but require a correctly isolated DB to run.
- GitHub static checks and successful 0→14 empty-schema migration do **not** prove 6→14 upgrade or Production save persistence.
- Backup archives pass checksum/gzip inspection, but isolated **restore proof is still outstanding**. Compressed dumps are plaintext: protect and encrypt separately.

## Required release gates: stop on first failure
1. Verify exact Git source SHA/commit and separately approved migration SHA256. Never silently change the pinned legacy digest. Do not run `scripts/run-production-deploy.sh`, which assumes a different runtime layout and may reset a working tree.
2. Reconcile Production **six migration checksums** with the six historical SQL files; inspect all **eight pending migrations**. They are mostly additive, but the invitation-history migration updates legacy rows. Confirm rollback/version compatibility of the old runtime with the new schema and restricted sessions.
3. Make a fresh encrypted, protected Production backup with a tested backup account. Test restore into a **separate, appropriately authorized recovery environment** and record counts, migration state, representative synthetic data decryption, recovery duration, RPO/RTO and owner sign-off. Never import a dump with embedded CREATE DATABASE/USE directed at the live schema.
4. Rehearse upgrading a baseline with the same six-migration history and realistic permitted data to 14; validate row-preservation, constraints, backfill and application compatibility. **Never upgrade live DB for rehearsal**.
5. Retain a hash-verified copy of the actual live direct-runtime artifact and protected environment; make a new RC01 runtime artifact in a separate immutable directory. Validate Node / Next / Prisma startup and post-upgrade health, and explicitly review an application rollback that does not reverse schema. Do not replace active `server.js` or change systemd/symlinks during preflight.
6. Require an explicit operator GO approval after the rehearsal receipts. Schedule maintenance/limited access and write freeze; record rollback owner.
7. Apply approved migrations against `pdh_healthcheck` and activate **RC01 runtime** only inside an approved change window with immediate health/functional verification. Never force-reset Git, auto-migrate by running generic seeding, or use production for destructive automated integration tests.
8. Import the recovered 17/2 questionnaire via authenticated admin Create Draft + authorized clinical Publish. **Do not copy staging approvedBy, stage credentials, published status or UAT prices.** Confirm saved version and reads after refresh.
9. For pilot catalogs: separately approve actual services/prices or clearly isolate synthetic UAT artifacts from public availability. Do not publish UAT-BASIC/UAT-PLUS fake prices. Create fresh future slots with the intended local time zone and approved capacity, not copied historical staging slots.
10. Confirm actual browser/API Create→Read→Update→Read→Approve, role controls, archive behavior, guest registration, persisted registration and audit with a narrowly permitted, clearly labeled synthetic pilot record. Verify real user data handling follows hospital consent/PDPA procedures. Stop rollout on P0/P1 defects.

## Questionnaire-specific functional expectations
- New draft, update draft, and archive require `questionnaire:write`, revision match, validation and audit.
- Published versions are immutable: clone to a new draft for changes. Archived records remain for historical references.
- A last published questionnaire cannot be archived without an approved successor.
- A successful HTTP 200 without a persisted read-back does not pass acceptance.
- Version conflict 409 must not overwrite another administrator's edits.
- Failure to load an approved questionnaire on `/register` must be shown as a clear error, not silently bypassed.

## Current release status
**NO-GO** until backup restore, 6→14 migration rehearsal, actual runtime rollback compatibility, authenticated integration persistence and explicit operator approval are evidenced.
