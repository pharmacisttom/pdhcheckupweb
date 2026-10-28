# Backup, restore and rollback

Hospital operations must define RPO/RTO, retention, storage jurisdiction, encryption, access and incident owners. These are unresolved organizational decisions, not invented defaults.

Use a dedicated backup account and MySQL option file (mode 0600), not passwords in shell arguments. Create a consistent InnoDB snapshot with `mysqldump --defaults-extra-file=/secure/backup.cnf --single-transaction --routines --triggers --no-tablespaces pdh_healthcheck` piped to approved authenticated encryption and protected remote storage. Do not leave unencrypted dumps in the app public directory. Securely back up environment keys separately from the encrypted dump.

Restore into a new isolated database and application instance. Validate migration state, row counts, financial totals, a decrypted synthetic fixture, immutable quotes, audit timestamps and appointment allocations. Record elapsed recovery time and evidence. Perform restore drills before go-live and periodically under the approved schedule.

For release rollback, retain prior application artifacts and lockfile, verify compatible schema, and switch the application path only after a dry run. Database changes should be forward corrected. Destructive restore of a live database requires explicit authorization, protected evidence and reconciliation of transactions after the backup point.

## Prepared VPS scripts — 2026-10-22

Use bash deploy/production/backup.sh or its staging equivalent. Each requires that environment's protected backup.cnf under /var/www/pdhcheckup/shared/ENV. MySQL option file format: [client], user=DEDICATED_BACKUP_USER, password=SECRET (actual values stay outside Git). The script fixes localhost and the selected database, uses a single-transaction snapshot, validates gzip and creates a SHA256 sidecar. It writes mode-600 compressed plaintext in a mode-700 backup directory. Compression is not encryption. Use encrypted host storage and transfer through approved authenticated encryption to protected off-host storage; neither off-host retention nor cryptographic encryption is implemented by these scripts. Restrict the backup account to the target schema; review triggers/routines/events with the DBA (Prisma schema currently defines none of those). Verify grants allow a complete dump.

Before relying on a backup, verify its checksum and gzip, restore it to a new isolated MySQL recovery instance and compare migration history, counts, totals and decrypted synthetic records using separately protected keys. Dump contains CREATE DATABASE/USE for the original schema: never import it unchanged into a shared production MySQL server to test restoration. Use an isolated recovery server or a DBA-reviewed database-name rewrite into an empty recovery schema. Record RPO/RTO and restore results. No restore has been performed here.

Application rollback: read the previous symlink, review compatibility with the currently applied schema, then SCHEMA_COMPATIBILITY_REVIEWED=true bash deploy/production/rollback.sh RELEASE_ID. This only switches code and restarts the selected application. Database restoration needs separate authorization, downtime planning and reconciliation of writes since backup; no automatic reverse migrations are attempted.

For the staff-enrollment release, application rollback must also review restricted-session semantics: older code cannot safely accept pending onboarding sessions. See USER_MANAGEMENT.md before setting the rollback compatibility gate.
