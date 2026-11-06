# Staff invitation rollback

Before migration: verified encrypted DB backup, separately protected original encryption key/OTPpepper/.env, prior compatible release and restore rehearsal. Capture current/previous SHA and approved migration digest.

If build/tests fail before activation, leave existing runtime active. If new runtime fails after activation, review schema compatibility and use existing environment-specific rollback.sh to prior reviewed release. New nullable User fields and invitation delivery metadata/tables are additive; keep them during application rollback. Never drop recovery/reset tables or overwrite users to make code fit. Do not delete migration history.

Older runtime supports TOTP but cannot use new recovery-code login or new reset pages. Tell staff to use existing Authenticator; pending emailed new reset links may fail closed after rollback. An activated MFA account remains enrolled. Deployed email may continue arriving after invitation revoked/resend; the server rejects old/revoked token regardless. Outbound email cannot be undone.

For security incident, authorized operator can set staff email disabled through approved configuration change and use existing revoke sessions/invitations actions after identity proof. Do not disable MFA. Database restoration is a separate approved incident plan because it can lose appointments/staff changes since backup. No automated down migration is supplied.
