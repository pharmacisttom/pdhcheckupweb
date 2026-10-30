# Staff account recovery

/forgot-password accepts an email and gives the same message whether or not a recoverable account exists. Eligible means active, activated and MFA-enrolled. Pending invitations use invitation resend, not reset. Limit global100/15min and per-email3/15min; privateHMAC email keys avoid plaintext in rate-limit rows. Delivery/config failures keep the generic response. SMTP/API send happens after response using Next after; this is not a full constant-time proof against all DB timing inference.

Reset link fragment is256-bit random, hash-only in StaffPasswordReset, expires30min, removed from browser URL immediately. Database User lock and token re-read permit one winner. Password uses existing bcrypt12 policy; all active sessions and reset links revoked after success. Existing TOTP secret and unused recovery codes remain required/valid. No login session is issued by reset.

All administrator changes and normal/first password changes invalidate pending reset links as well, preventing reuse of links sent to an old email identity. Suspension stops login/reset/activation and revokes sessions/invitations; reactivation does not resurrect consumed/revoked links.

MFA recovery is separate: saved one-use code + password, or identity verification by another authorized administrator with fresh proof and audit reason. A forgotten password link cannot enroll/remove MFA for an already-activated identity. Recovery codes are not admin-visible after initial display.

Patient/public cross-device recovery while OTP disabled is outside this staff module and remains an open issue from system audit. Do not apply staff password-reset capability to patient records.
