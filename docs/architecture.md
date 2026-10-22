# PDH Smart Health Check v1.0 — Architecture

One Next.js App Router application, strict TypeScript, React, Tailwind tokens, Radix Dialog, Lucide, React Hook Form, Recharts. Server-only Prisma/MySQL InnoDB persistence. Node 22.17.1 was detected. Installed versions are pinned by package-lock.json; review their security status before each deployment. Next.js installation reference: https://nextjs.org/docs/app/getting-started/installation. Prisma/MySQL reference: https://docs.prisma.io/docs/orm/v6/overview/databases/mysql.

## Boundaries

- `(public)` contains homepage, six-step registration, appointments, login and privacy.
- `(admin)` authenticates the session before rendering staff pages. APIs independently authorize every operation.
- `src/server/api.ts` validates requests and returns explicit DTOs and safe errors.
- `src/server/services/pricing.ts` handles effective approved prices and immutable quote snapshots.
- `appointments.ts` owns capacity transactions, holds, confirmation, idempotency and state transitions.
- `imports.ts` owns bounded spreadsheet parsing, staging, validation, two-person approval and append-only prices.
- `src/lib/security.ts` owns AES-256-GCM encryption, keyed identity/OTP hashing, database-backed opaque sessions, RBAC, same-origin CSRF controls and rate limits.

No browser SQL, external HIS access, payment provider or live messaging integration is present. Unconfigured providers return an error rather than fake success. Questionnaire and catalog demo data is synthetic and gated outside production.

## Booking consistency

Every allocation locks the owning Session, then DayCapacity, then Slot in InnoDB. Cancellation locks the day then booking; it does not acquire a session lock. Daily and slot limits count non-cancelled bookings and live unconsumed holds. Expired holds are ignored. Holds expire in five minutes. Quotes expire in fifteen minutes. All booking writes happen in one ReadCommitted transaction, including invoice estimate, privacy acknowledgement, notification outbox and audit event. The global idempotency key also stores a request hash; a key reused by another owner or request is rejected.

Locking the day intentionally serializes same-day allocation to enforce the daily ceiling. Integration tests must run on MySQL, not a mock that merely imitates a lock. Completed and no-show allocations continue to consume that day's original capacity.

## Data flow

Browser → same-origin API → validation and ownership/RBAC → domain service → Prisma transaction → isolated MySQL. Sensitive registration and health answers are encrypted separately. Operational queries deliberately omit names, identity numbers and answers. QR contains a random 256-bit token; only authenticated authorized staff can redeem it.

## Deployment limitations

This is an in-development application, not a production certification. The requirements/status register is authoritative. Hospital assets, source workbook, approved packages/prices, clinical rule approval, privacy/legal review, live notification contracts, MFA enrollment procedure, backup restoration and UAT remain release dependencies.
