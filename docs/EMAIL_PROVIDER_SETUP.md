# Staff email configuration

Default EMAIL_PROVIDER=disabled: no SMTP/API call, no claim that mail was sent. Staff email is separate from public OTP and patient Notification outbox. Keep OTP_PROVIDER=disabled. Configure dedicated service credentials, never an application's Superadmin password.

Protected variables: EMAIL_PROVIDER=disabled|smtp|resend, EMAIL_FROM (single sender email), EMAIL_SENDER_VERIFIED=false|true, SMTP_HOST, SMTP_PORT=587 or465, SMTP_USER, SMTP_PASSWORD, RESEND_API_KEY, EMAIL_DKIM_SELECTOR. Never commit .env. Use separate credentials for staging and production. Do not set EMAIL_SENDER_VERIFIED=true until domain/provider approval and test delivery are complete.

SMTP: dedicated authenticated account;465 implicitTLS or587 requiredSTARTTLS, certificate verification on, 10s connection and15s socket timeouts, file/URL attachments disabled, protocol/message logs disabled. References: [Nodemailer SMTP](https://nodemailer.com/smtp), [transport access controls](https://nodemailer.com/transports).

Resend: verified sender domain and server-only key; fixed HTTPS API endpoint, no redirects,10s timeout and per-invitation idempotency key. Reference: [official API](https://resend.com/docs/api-reference/emails/send-email). API errors are not logged verbatim. SES/API providers can implement the same StaffEmail->DeliveryStatus interface later; no SES SDK or actual SES delivery has been implemented/tested.

Domain readiness: load protected env through deployment runner, run npm run email:check-domain. This checks presence of SPF, selector DKIM public record and DMARC via DNS without printing record contents. It does not verify reputation, DMARC alignment, actual mailbox receipt or provider approval. Need sender domain and DKIM selector from operator; none supplied here, so live DNS/provider acceptance remains NOT TESTED.

Templates are plaintext Thai: invitation, resend, expiration, activated/MFA reminder, password reset, password changed, suspended. No password/TOTP code/secret/recovery code or health data is included. Optional invitation note is recipient-facing; administrators must not put patient information there.

Invitation delivery occurs from memory after DB commit, with lifecycle/hash retained and delivery attempts/status audited. No token payload queue in DB. Forgot-password schedules delivery with Next after so SMTP latency is not directly exposed by the public response. Process failure before send may lose a reset email; requesting again rotates tokens. No automatic mail retry with an old token; resend creates a fresh one.

Expiry notices: review and schedule staff:expire-invitations under the deployment account with protected environment. Each run marks at most100 expired pending invitations and attempts a notice once. Disabled/failed provider is audited; no false delivery claim. The timer/cron is NOT activated automatically.
