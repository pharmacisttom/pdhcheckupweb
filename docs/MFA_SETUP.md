# Operator MFA enrollment

Production staff login and sessions require MFA. Superadmin retains wildcard permissions. The existing production account pharmacisttom@gmail.com must not be recreated or rotated by deployment. No account was changed in this work.

The CLI now refuses an existing email by default. Creation requires protected OPERATOR_EMAIL, OPERATOR_PASSWORD (at least 14 characters, at most 72 UTF-8 bytes), OPERATOR_ROLE and absolute MFA_ENROLLMENT_FILE. Use OPERATOR_NAME optionally. Enrollment files must be outside the repo and public directories, in a protected parent directory. Linux creation is exclusive mode 600. On Windows restrict the parent directory and file ACLs; POSIX mode alone does not secure Windows files. Existing-account replacement requires separately authorized OPERATOR_ROTATE_EXISTING=true, replaces password/role/MFA together and revokes sessions in a transaction. Never set it for a routine deployment.

After supplying these variables through a protected operator session (never command-line passwords):

~~~powershell
npx tsx --env-file=.env scripts/manage-user.ts
# Set MFA_QR_FILE to a new absolute protected .png path first:
npx tsx scripts/mfa-qr.ts
~~~

For VPS operators, load only the protected production variables using a secure process launcher; do not copy production .env to the repository or use Windows .env examples as production credentials. QR generation reads only the local enrollment URI, uses the installed qrcode library and makes no network request. Scan directly into an approved authenticator. No third-party QR website is permitted. Treat both URI and PNG as credentials, transfer only over an approved secure channel and delete both after successful login verification. Deletion does not guarantee forensic erasure; use encrypted storage.

Issuer: PDH Smart Health Check. Account label: normalized email. SHA1, 6 digits, 30 seconds. Validation accepts the current and adjacent 30-second steps (window 1), rejects malformed codes and uses server time. Unit tests cover the RFC vector and drift boundary. Keep VPS and authenticator clocks synchronized with trusted NTP. There is no MFA recovery web bypass and no enforced one-use tracking within the accepted TOTP step; login rate limiting remains active. Lost enrollment requires an authorized recovery/rotation process, not disabling MFA.

Exclusive enrollment output is written before database changes. Failure removes that artifact where possible; inspect protected paths/account state after interruption. An enrollment generated before a process crash is not proof the database transaction committed.

## Self-service enrollment extension — 2026-10-22

Staff account invitations, temporary-password replacement and locally rendered self-service QR enrollment are now implemented. See [USER_MANAGEMENT.md](USER_MANAGEMENT.md) for session boundaries, administration, recovery and the additive migration. The CLI above remains for initial bootstrap/explicit recovery; routine staff onboarding uses the application. Staff MFA is required in every environment. No existing production MFA was reset.
