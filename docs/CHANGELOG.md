# Changelog

## 2026-10-22 — Production synchronization preparation

- Packages are the first homepage section; #packages, live API cards, package details and registration links remain.
- Added compact Thai heading, card loading skeletons and navigation to instructions/contact/login.
- Existing operator accounts now require explicit rotation; secure exclusive enrollment files and local QR generation added.
- TOTP settings shared between enrollment/login with clock-window regression tests.
- Added isolated production/staging release, database backup, health and application rollback scripts, systemd and Nginx references.
- Added deployment environment tests and browser package-first/loading/error/mobile tests.
- Preserved schema/migrations and existing registration/admin modules. No VPS change, account rotation, commit, push or deployment performed.

## Staff administration and self-service MFA — 2026-10-22

Added invitation/temporary-password staff creation, account edits and existing-role assignment, activation/deactivation, forced password change, audited session revocation and MFA recovery. New restricted password/MFA sessions cannot access protected APIs. A private local QR plus manual key becomes enrolled only after TOTP confirmation and token rotation. Added additive migration 202610220002_staff_enrollment. See USER_MANAGEMENT.md and staff-enrollment-report-2026-10-22.md. No VPS changes were performed.
