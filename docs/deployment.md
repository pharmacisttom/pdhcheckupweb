# Ubuntu VPS deployment plan — approval required

No host/domain/SSH credential is assumed. No production action has been executed.

1. Obtain explicit authorization and inspect OS, Node support, free memory/disk, service ports, existing Nginx sites/certificates, PM2 apps, database instances, backup jobs and firewall. Record results without secrets. Do not restart or overwrite shared infrastructure.
2. Prepare a named isolated application directory, non-root OS user, least-privilege MySQL application account and separate migration account. MySQL must be accessible only locally or through an approved private network. Require MySQL 8 InnoDB utf8mb4 and UTC sessions.
3. Review dependency audit, clinical/finance/privacy approvals and UAT. Run `npm ci`, `npm run db:generate`, `npm run typecheck`, `npm test`, DB integration tests, E2E tests and `npm run build` in a staging environment.
4. Copy `.env.example` into protected environment storage. Generate independent encryption key and OTP pepper. Set APP_URL to the exact HTTPS origin. Back up and protect encryption keys separately; losing them makes encrypted patient information unrecoverable.
5. Capture encrypted verified database and application backups. Run `prisma migrate status`, review generated SQL and dry-run migrations against a restored staging clone. Never use db push/reset on production. Apply reviewed migrations via `npm run db:migrate` during an approved window.
6. Run the built server as the dedicated user on a distinct loopback port with PM2/systemd. Add a new Nginx vhost only after reviewing port/domain conflicts. The sample is not an instruction to replace any existing site. Test config with `nginx -t`; shared service reload requires authorization.
7. Install approved TLS certificate and enable HTTPS, secure cookies and HSTS after validating the complete domain. Nginx body limit 2 MB and request rate limits provide a second layer. Preserve expected Host; only trust proxy-derived client IP after explicit configuration.
8. Verify public and staff workflows, health endpoint, OTP failure handling, audit integrity, alarms and restoration. Do not seed demonstration data in production.
9. Rollback application code to the prior release. Schema rollbacks require a reviewed forward correction or verified restore; never drop data just to match prior code. Price rollback uses a new approved price version.

`ops/nginx.example.conf` and `ops/ecosystem.config.cjs` are templates only. Monitoring should alert on health failure, 5xx/latency, connection pool saturation, deadlocks, disk/backup age, notification backlog and unauthorized attempts. Never log raw request bodies, clinical answers, full identifiers, OTPs or session tokens.
