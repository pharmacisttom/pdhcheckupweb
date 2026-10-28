# Database migrations

Preserved without edits: 202610210001_initial, 202610210002_booking_changes, 202610220001_booking_policy. The staff enrollment extension adds 202610220002_staff_enrollment; see the section below. Local prisma validate, migrate status and read-only schema comparison succeeded; this is not VPS verification.

Use npx prisma migrate status to inspect the selected database, then npx prisma migrate deploy only after SQL review and a verified backup. The deployment script binds the selected environment and requires a digest of all reviewed migration.sql files. A pending-status exit is expected; connection errors, failed migrations and drift require investigation. Never modify an applied migration to make checks pass.

For a future model change, create and review a new migration in an isolated development database. Test forward compatibility and the prior application's compatibility on an anonymized/synthetic restore. Review locking/time cost, nullability, backfills and unique constraints. Preserve migration history and the MySQL migration lock. migrate deploy does not detect every form of manual schema drift; compare schema separately before releases.

For the current local configured database only, the read-only drift check is:

~~~powershell
npx prisma migrate diff --from-schema-datasource prisma/schema.prisma --to-schema-datamodel prisma/schema.prisma --exit-code
~~~

Do not run migrate reset, force-reset, DROP or TRUNCATE against deployment databases. Database recovery is a separate reviewed operation from application rollback.

## Staff enrollment migration

202610220002_staff_enrollment adds user activation/password flags, restricted session stage/pending encrypted MFA and hashed UserInvitation records. The three original migrations remain unchanged. This is an additive schema change requiring SQL review and a fresh approved migration digest before production. Legacy application rollback requires special session revocation because old code does not enforce restricted session stages; see USER_MANAGEMENT.md.
