# Troubleshooting

## Nginx 502 / health failure

Inspect systemctl status pdhcheckup-production.service and local curl http://127.0.0.1:3036/api/v1/health. For staging use its service and 3037. Check current symlink, runtime/server.js, WorkingDirectory, Node path, service user and protected EnvironmentFile permissions. Inspect selected service journals with restricted access; never paste raw sensitive logs. Confirm static/public assets were copied and loopback port is free. Check database reachability/grants. Review upstream address and certificate/domain separately. Test nginx -t before an approved configuration reload; normal deployments never restart shared infrastructure.

## Login / MFA / CSRF

APP_URL must exactly match the browser's HTTPS origin, without trailing slash. Check Secure/HttpOnly/SameSite cookies, proxy scheme and session expiry (staff 8 hours, guest 2 hours). Confirm account active, role, password and enrolled MFA. Check clock synchronization and adjacent 30-second window. Rate-limited requests must wait for the window; do not disable MFA, origin checks or rate limiting. Existing CLI accounts are intentionally not overwritten without explicit recovery authorization.

## Prisma

P1001: check selected local host/port and MySQL availability. P1000: verify protected credentials and schema grants without printing them. P3009: inspect failed migration state, preserve backup and resolve through an explicitly reviewed repair; never reset. P2002: inspect idempotency/uniqueness inputs and return the existing controlled conflict rather than delete records. A clean migrate status does not prove absence of schema drift.

## Booking and notifications

OTP_PROVIDER=unconfigured intentionally returns provider-unavailable. The repository currently has no live SMS implementation, and changing the string to another provider does not implement one. Database/HTTP health can pass while registration requiring phone verification cannot finish. Arrange hospital-approved assisted operations and implement/test the real provider before claiming self-service readiness. Check package publication, approval, effective dates, age eligibility, quote expiry, booking policy, day/slot capacity and ownership. Existing notification records are an outbox, not evidence of message delivery.

## Package draft: serviceIds must have at least one item

Select at least one active service before saving. If the catalog is empty, verify the intended production database and the approved import state; a staged upload does not yet create services. See package-draft-fix-2026-10-22.md for read-only diagnostics and the two-person import approval workflow. A UI fix does not populate the VPS service catalog.
