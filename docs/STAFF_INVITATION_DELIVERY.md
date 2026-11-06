# Staff feature handoff — 2026-10-30

Branch feature/staff-email-onboarding, base3c0c301. Extends existing RBAC/session/TOTP. Supports department/position/filters, encrypted invitation note, expiry/history/revoke/resend, SMTP TLS/Resend adapters disabled by default, password reset retaining MFA, hashed one-use recovery codes and separate audited administrator MFA recovery. Fragment-only token links avoid access-log exposure.

Migrations202610290001_staff_email_recovery and202610290002_legacy_invitation_history retain User credentials/data; classify old ambiguous consumed invitations. New tables StaffPasswordReset and MfaRecoveryCode store hashes only. Test database schema matches Prisma.

Source changes: prisma/schema.prisma; services staff-users/enrollment/passwords/staff-email/staff-password-reset/mfa-recovery; security audit optional correlation; api router; staff-users/staff-enrollment/staff-recovery/login/public-mobile-nav; invite/forgot-password/reset-password/auth/mfa/recovery pages; CSS/security headers; package manifests; env template; deployment validator/common; expiry/DNS scripts; isolated test config and tests. Nine requested staff architecture/API/email/MFA/recovery/security/test/deployment/rollback guides are under docs.

Actual results and limits: STAFF_INVITATION_TEST_PLAN.md. SMTP/provider sender verification, SPF/DKIM/DMARC, mailbox receipt and authorized VPS staging/restore UAT remain pending. This is NOT production acceptance. No real email or production operation/account credential change. Public patient cross-device recovery remains outside scope. Pre-existing mobile audit files/Next-generated references are excluded from feature commit.
