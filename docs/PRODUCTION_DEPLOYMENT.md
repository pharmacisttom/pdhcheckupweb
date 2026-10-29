# Production deployment

Prepared configuration, not a report of VPS changes. Production is https://pdhcheckup.pluakdaenghospital.cloud, loopback 3036, pdh_healthcheck, pdhcheckup_prod, pdhcheckup-production.service. Staging is separate on 3037. No remote access, push or deployment was performed.

## One-time operator review

Use Ubuntu 24.04, supported Node 22 (at least 22.17), npm, Git, Bash, flock, curl, tar, gzip, openssl, MySQL 8 client and sufficient build space. Compare installed Node against package engines. Prepare /var/www/pdhcheckup/source, releases/{production,staging} and shared/{production,staging}. Run deployment as pdhcheckup with write access to releases and source; grant sudo only for restarting the two named application services, not general root access. Provision protected .env files (mode 600, readable by the deployment/service account) and backup.cnf for each environment. Peer environments must be readable to compare secrets; they must have independent keys and database users.

Review the example systemd units against the existing units. They expect releases/production/current/runtime/server.js. Back up the existing unit and identify the currently running release before any change. For first adoption, preserve the existing runtime as a compatible release with a REVISION marker, or record a separate tested restoration path. Do not install a unit until current resolves to a prepared runtime. Unit changes require an explicitly approved daemon-reload/setup step; normal scripts only restart their named service. No Nginx, MySQL or unrelated restart is included.

Existing Nginx/Let's Encrypt remain authoritative. The new reference forwards Host, X-Forwarded-Host and HTTPS scheme, replaces client X-Forwarded-For at this single proxy, allows 3 MB for the API's bounded 2.2 MB import body, disables buffering, and uses 5/60-second timeouts. Review certificate paths and shared rate-limit policy. Review HSTS before adoption. Run sudo nginx -t before any separately authorized reload. Do not replace the existing vhost automatically.

## Git review and release

On Windows, inspect git diff and the new files, then create a local commit (commands also cover the lowercase existing architecture and recovery documents):

~~~powershell
git diff --check
git add .gitattributes .gitignore next.config.ts prisma src scripts/manage-user.ts scripts/mfa-qr.ts tests deploy docs README.md
git diff --cached --stat
git diff --cached
git commit -m "Prioritize health packages and add isolated release deployment"
git rev-parse HEAD
~~~

Push only after explicit approval: git push origin HEAD. Review branch protection/PR policy first. On the VPS, after separate deployment approval, select the approved branch and full SHA, fetch and fast-forward the clean source checkout to that SHA. Scripts reject a different checked-out branch, dirty source tree or fetched branch tip. There is no automatic force checkout/reset.

~~~bash
cd /var/www/pdhcheckup/source
git fetch origin APPROVED_BRANCH
git switch APPROVED_BRANCH
git merge --ff-only origin/APPROVED_BRANCH
git rev-parse HEAD
# Review all SQL and confirm compatibility with both the new and previous runtime:
find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum
# Replace both placeholders with the reviewed values. Do not paste secrets.
APPROVED_MIGRATIONS_SHA256=REVIEWED_DIGEST bash deploy/production/deploy.sh APPROVED_BRANCH FULL_40_CHARACTER_SHA
~~~

The digest gates all migration SQL, including the existing history. It is not permission to edit old migrations. The workflow verifies environment isolation, installs with npm ci, generates Prisma, runs TypeScript/lint/unit tests and builds in a timestamped release. It copies standalone, public and static assets; backs up the selected database; runs migrate status and migrate deploy; atomically switches current and restarts only the selected service. Migration status may exit nonzero for pending migrations; deploy must succeed before activation. Failed builds/migrations leave the existing runtime active; failed health after activation requires a reviewed rollback.

Integration/E2E tests are separate pre-release gates against isolated test data; they never run against production during deployment. Require the local report and an authorized staging rehearsal before production. After activation, run healthcheck.sh and verify HTTPS /, /#packages, /login, /api/v1/health, /api/v1/packages and /api/v1/booking-policy. Test staff MFA login/logout and hospital-approved registration/booking UAT with controlled data. Health success only proves HTTP/DB reachability; it does not prove a working SMS provider.

## Application rollback

~~~bash
readlink -f /var/www/pdhcheckup/releases/production/previous
# After reviewing current schema compatibility, use the previous directory basename:
SCHEMA_COMPATIBILITY_REVIEWED=true bash deploy/production/rollback.sh PREVIOUS_RELEASE_ID
~~~

Rollback switches only application code and reruns health. Migrations stay applied. Never restore a database automatically to fix a failed build. Keep prior releases until the approved retention policy permits pruning. Scripts do not delete releases or backups.


## Current release override — 2026-10-29

Use OTP_PROVIDER=disabled in both protected environment files. The validator now rejects test, http and legacy unconfigured modes for this release. OTP has been disabled by the project owner; staff Authenticator 2FA remains required. See docs/VPS_HANDOFF_2026-10-29.md (relative to repository root) for the current handoff, pending release checks and deployment prompt. Do not regenerate existing production encryption keys or OTP pepper when updating an existing database.
