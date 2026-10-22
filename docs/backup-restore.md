# Backup, restore and rollback

Hospital operations must define RPO/RTO, retention, storage jurisdiction, encryption, access and incident owners. These are unresolved organizational decisions, not invented defaults.

Use a dedicated backup account and MySQL option file (mode 0600), not passwords in shell arguments. Create a consistent InnoDB snapshot with `mysqldump --defaults-extra-file=/secure/backup.cnf --single-transaction --routines --triggers --no-tablespaces pdh_healthcheck` piped to approved authenticated encryption and protected remote storage. Do not leave unencrypted dumps in the app public directory. Securely back up environment keys separately from the encrypted dump.

Restore into a new isolated database and application instance. Validate migration state, row counts, financial totals, a decrypted synthetic fixture, immutable quotes, audit timestamps and appointment allocations. Record elapsed recovery time and evidence. Perform restore drills before go-live and periodically under the approved schedule.

For release rollback, retain prior application artifacts and lockfile, verify compatible schema, and switch the application path only after a dry run. Database changes should be forward corrected. Destructive restore of a live database requires explicit authorization, protected evidence and reconciliation of transactions after the backup point.
