# Staging deployment

Follow [production setup](PRODUCTION_DEPLOYMENT.md) with pdhcheckup-staging.service, port 3037, database pdh_healthcheck_staging and database user pdhcheckup_stg. Staging uses NODE_ENV=production, HOSTNAME=127.0.0.1 and SEED_DEMO=false. Set APP_URL to an approved separate HTTPS staging hostname; none has been assumed. Use independent DATA_ENCRYPTION_KEY and OTP_PEPPER. Both environment files must exist and remain mode 600.

Use the staging systemd reference and a separately reviewed staging reverse proxy. Never point staging at production data. Do not copy identifiable production data into staging; use approved synthetic fixtures or a governed anonymized restore.

After review and approval:

~~~bash
cd /var/www/pdhcheckup/source
APPROVED_MIGRATIONS_SHA256=REVIEWED_DIGEST bash deploy/staging/deploy.sh APPROVED_BRANCH FULL_40_CHARACTER_SHA
bash deploy/staging/healthcheck.sh
SCHEMA_COMPATIBILITY_REVIEWED=true bash deploy/staging/rollback.sh PREVIOUS_RELEASE_ID
~~~

Rehearse build failure before activation, successful deployment, failed health detection and application rollback. Confirm production's process/port/release have not changed. Rehearse backup restoration in a third recovery database. Record unit, symlink, HTTPS and UAT evidence. No staging rehearsal has been executed by this change. The unconfigured SMS provider blocks phone-verified self-service booking here too; production-style staging must not enable test OTP.
