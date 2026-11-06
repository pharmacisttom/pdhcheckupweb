# Staff invitation and recovery API

Uses existing /api/v1/[...path] router, AppError/ZodError envelopes, HttpOnly staged sessions, same-origin POST checks and private API responses. No new authentication stack or roles.

| Method/path | Gate / contract |
|---|---|
| GET admin/users?q=&page=&department=&role=&status= | users:manage; status active/pending/suspended; max25/page |
| POST admin/users or admin/users/invitations | users:manage + current operator password/TOTP; name,email,role,department,position, optional invitationExpiresAt (ISO, max7days), invitationNote (max1000), sendEmail; legacy temporaryPassword remains supported |
| POST admin/users/update | same privileged proof; edit metadata/role/active; revoke target sessions/reset tokens; no self-lockout or manager->superadmin |
| POST admin/users/action | same proof; id,action,reason(min8); invite rotates token, revoke-invitation cancels pending links, reset-mfa requires another admin, revoke-sessions |
| GET admin/users/invitations?userId= | users:manage; safe history(max200), lifecycle and delivery status; never tokenHash, raw token, note or MFA secret |
| GET admin/users/audit?userId= | users:manage; only staff account/invitation/auth/email event names/times(max100), no patient audit metadata |
| POST invitations/verify | public same-origin/rate-limited; token64hex; limited name/masked email/department/role/expiry |
| POST auth/activate | existing acceptance transaction; token,newPassword,confirmPassword; only pre-provisioned activationRequired active user; one winner; creates MFA-stage session |
| POST auth/mfa/setup and auth/mfa/confirm | existing restricted enrollment; code6digits; confirm returns10 recoveryCodes once with next route |
| POST auth/mfa/recovery-codes | full staff session + own password/current TOTP; atomically replaces codes and audits |
| POST auth/forgot-password | email; same generic response for eligible/unknown/disabled/pending accounts; rate limits; mail scheduled with Next after |
| POST auth/reset-password | token,newPassword,confirmPassword; expiry30min/one use; revokes all sessions and all open reset tokens; retains MFA/recovery codes; no auto login |
| POST auth/login | existing email/password/mfa; mfa accepts TOTP or 128-bit one-use recovery code; password required in both cases |

Invitation links use /invite#token (old /auth/activate#token remains valid); reset uses /reset-password#token. Tokens never go in path/query. The browser removes fragment immediately and POSTs token, not a GET navigation containing credentials. No /invite/[token] routes are emitted because access logs can capture initial path before JavaScript runs.

DeliveryStatus sent means provider accepted, not proof of recipient inbox delivery. failed/disabled/not_requested are explicit; account creation can succeed while mail fails. Administrator may reissue a fresh token; old token becomes invalid. No reset token is returned by forgot-password. Concurrency can return409 at the existing unique/rate-limit gate; tests require at most one successful token/code operation, not a misleading success for both.
