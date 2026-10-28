# Staff user management and self-service TOTP

Implemented as an extension of the existing opaque Prisma-backed cookie sessions, RBAC, same-origin protection, rate limits, encryption and audit tables. No new roles, replacement authentication framework, mail delivery service or external QR service was introduced.

## Administrative workflow

Open /admin/users after full staff authentication. The navigation entry is visible only for Manager and Superadmin. Server page and every API independently require users:manage. Manager can create/manage non-Superadmin staff in the existing roles; only Superadmin can create, promote, edit, disable, invite, reset or revoke sessions for Superadmin accounts. The UI disables Superadmin management for Managers; server checks remain authoritative.

Every mutation requires the acting administrator's current password and six-digit TOTP. Proof fields are cleared after submission, excluded from query caches and never audited. All operations recheck the active actor, role, live full session and unchanged credentials inside the transaction. Superadmin row locks serialize privileged changes. Self deactivation/demotion/forced password change and self MFA reset are refused, preventing an administrator from locking out their own account. A different authorized administrator must handle MFA recovery after identity verification. Editing one's own name/email or revoking one's own sessions redirects to login.

Create an account with either a 24-hour single-use activation invitation or an explicitly supplied temporary password. Invitation-only accounts have a random non-delivered password hash and cannot sign in until activated. Temporary-password accounts must change their password before MFA. Passwords require at least 14 characters and at most 72 UTF-8 bytes (bcrypt limit), with confirmation. The UI lists account state, forced-password status, MFA enrollment state and unexpired session count, with server search and 25-row pagination. MFA enrollment state is never inferred merely from a generated QR.

Invitations are returned to the administrator once for manual delivery through a hospital-approved channel. No email is sent by this feature. Treat the link as a credential. The database stores only its SHA256 hash, expiry, creator and consumption time. The token is in the URL fragment rather than the query; activation removes it from browser history and posts it in the HTTPS request body. Do not log request bodies or use browser session-recording/analytics on authentication pages. Lost/expired invitations must be reissued; reissue invalidates all older invitations. Disabling a user or changing their email/role invalidates outstanding invitations. Reactivation of a pending account requires a fresh invitation.

Editing any user revokes all of that user's sessions; role changes take effect immediately. The security action form supports explicit session revocation, invitation reissue and MFA reset, with a mandatory reason. Reasons must not contain passwords, keys or patient data. MFA reset clears the enrolled secret, revokes full and pending sessions, and requires a password change followed by new enrollment. It does not expose the previous secret or provide an MFA bypass.

## First login and session boundaries

1. Invitation holders choose and confirm a password at /auth/activate. Alternatively, staff sign in at /login using their temporary credentials.
2. Credentials are verified. Existing enrolled staff still need their current TOTP even when a forced password change is pending. Unactivated accounts must use their invitation.
3. A password-stage or MFA-stage session is issued for ten minutes. Staff with forced password change go to /auth/password first. No fully authenticated session is issued prematurely.
4. /auth/mfa/setup generates a unique 160-bit secret, encrypted in that specific pending session. Retrying within the same session returns the same secret. Independent sessions have independent pending secrets. No QR image or otpauth URI is stored in the database or on disk.
5. The server uses the installed qrcode library locally in memory and returns a PNG data URL plus manual key under Cache-Control: no-store. Secrets live only in component memory and the encrypted pending session, never localStorage/sessionStorage, audit logs, URLs or third-party APIs. Auth pages set Referrer-Policy: no-referrer. The UI clears QR/key on expiry and pagehide.
6. A six-digit TOTP is verified with the existing SHA1/30-second/6-digit configuration and adjacent-step window. Confirmation is limited to five attempts per user per ten minutes. Setup requests are also limited. New pending sessions do not reset those user-level limits.
7. Only successful confirmation writes User.mfaSecret. In one user-locked transaction, every full/pending session for that account is deleted, a new full token is issued, and enrollment is audited. A stale confirmation cannot replace an already enrolled secret.
8. Forms remain disabled until hydration. After authentication cookie rotation, the browser opens a fresh document at the authorized role destination, avoiding stale client session state. Laboratory, clinician, DPO and auditor use their existing workspaces. Coordinator lands on the authorized password-management page because it has no dashboard:read permission. All other applicable roles use the existing dashboard.

Pending sessions are accepted only by auth/onboarding, auth/onboarding/password, auth/mfa/setup, auth/mfa/confirm and logout (login is permitted to restart or switch accounts). Every other API is denied with ENROLLMENT_REQUIRED, including auth/guest. session() independently denies pending/unknown stages, activation-required users, forced-password users, disabled users, expired sessions and staff without enrolled MFA. Admin layout redirects pending users back to their required step. Logout removes the pending session and its encrypted secret. Expired sessions cannot confirm; expired rows remain encrypted until normal session retention cleanup. TOTP is now required for staff across all environments; tests use synthetic enrolled accounts, not a development bypass.

## API surface

| Method | Route under /api/v1 | Access |
| --- | --- | --- |
| GET | admin/users?q=&page= | Fully authenticated users:manage |
| POST | admin/users | Step-up create |
| POST | admin/users/update | Step-up edit/role/active/force-password |
| POST | admin/users/action | Step-up revoke-sessions/reset-mfa/invite |
| POST | auth/activate | Single-use invitation and new password |
| GET | auth/onboarding | Restricted identity status; no secret |
| POST | auth/onboarding/password | Password-stage identity |
| POST | auth/mfa/setup | MFA-stage identity after password completion |
| POST | auth/mfa/confirm | MFA-stage identity and valid pending TOTP |

Existing auth/login and auth/logout remain. Login now returns next and enrollmentRequired; the browser follows the server-controlled relative destination. Auth/me and all protected APIs require full authentication. Mutations retain same-origin CSRF checks and bounded request bodies. Generic errors never serialize database rows or credentials. Duplicate email returns a safe 409 conflict.

## Migration and deployment

New additive migration: 202610220002_staff_enrollment. User adds activationRequired/mustChangePassword (both default false). Session adds stage (default full) and encrypted pendingMfaSecret. UserInvitation is a separate indexed table with hashed tokens and a restrictive user foreign key. Existing users, passwords, MFA secrets and original migration files are preserved. Legacy users without MFA must enroll on their next credential login; existing full sessions without MFA cannot access staff APIs.

The migration was applied only to the isolated pdh_healthcheck_test and explicitly synthetic localhost development database, not the VPS. Review SQL, backup/restore and compatibility in staging, then use the existing approved release workflow with a newly reviewed migration digest. Do not apply to production without approval. Back up MFA/encryption keys separately. Existing encrypted secrets still use DATA_ENCRYPTION_KEY; do not rotate it as part of enrollment deployment.

Application rollback to code predating restricted-session enforcement is unsafe while onboarding sessions exist: old code does not understand Session.stage. Before any such rollback, stop admissions/onboarding and revoke all staff sessions through a separately reviewed database operation; review all account flags and access semantics before resuming. Prefer a forward fix. No automatic down migration or database reset is supplied.

The operator CLI remains available for initial Superadmin bootstrap or an explicitly authorized break-glass recovery. Routine onboarding does not run it. Existing Superadmin accounts are not recreated or rotated. Lost-MFA recovery requires independently verified identity and another authorized administrator, or the documented approved operator process if there is no other enrolled Superadmin. No recovery codes or delivery integration are claimed.

## Verification

See staff-enrollment-report-2026-10-22.md for executed tests and limitations. Tests create only synthetic local staff and remove their invitations/sessions/audit fixtures afterward. No production credentials or real account state were changed. Browser tests do not save QR/key screenshots; operational request logging must continue to omit bodies, cookies and activation links.
