# Delivery status and release gates

This repository started empty on 21 October 2026. Status must be read alongside actual test evidence. No live deployment was performed.

Local verification on 22 October 2026 passed typecheck, lint (one compatibility warning), production build, 22 unit tests, 3 real-MySQL integration tests and 6 browser tests. See [test evidence and limitations](test-report-2026-10-22.md). Outstanding acceptance below still applies; some test-related entries predate this verification.

| Phase          | Delivered code                                                                                                                    | Outstanding acceptance                                                                                                         |
| -------------- | --------------------------------------------------------------------------------------------------------------------------------- | ------------------------------------------------------------------------------------------------------------------------------ |
| 0 discovery    | architecture, ERD, routes, permissions, tokens, missing-source analysis                                                           | actual workbook and screenshots; hospital policy                                                                               |
| 1 foundation   | Next/TS/Tailwind, MySQL Prisma schema, generated migration, sessions/RBAC, gated synthetic seed                                   | configured database migration/restore verification; production MFA enrollment                                                  |
| 2 registration | six-step UI, OTP test provider, validation, versioned dynamic questions, encrypted persisted assessment/draft                     | live OTP, cross-device recovery, autosave of initial partial draft, clinically approved questionnaire                          |
| 3 packages     | DB-backed catalog/cards, create draft versions, approval, archive                                                                 | full edit/duplicate UI, drag ordering, per-item optional/assessment editor, version comparison                                 |
| 4 pricing      | bounded CSV/XLSX staging, mappings, diffs, two-actor approval, price history, exact quotation snapshots, duplicate/panel blocking | configurable contract/discount/entitlement precedence; hospital import UAT                                                     |
| 5 appointments | DB slots, daily/slot locks, 5-minute holds, idempotent confirm, check-in, cancellation, status transitions                        | full recurrence/holiday editor, rescheduling, waitlist, organization reservations, final-confirm concurrency integration proof |
| 6 dashboard    | database metrics, date filters, trend/status chart, masked appointments                                                           | additional filters/charts and full pagination                                                                                  |
| 7 enterprise   | organization draft CRUD, estimate invoices, finance read, aggregate export                                                        | employee roster/group allocations/contracts, financial approval/billing integration, PDF export                                |
| 8 quality      | unit, browser smoke, real-DB hold contention test, security headers and checks                                                    | full DB integration, full registration E2E, ASVS review, performance, restore, UAT                                             |
| 9 operations   | isolated local compose, deployment/runbook/checklists                                                                             | authorized VPS inspection, dry run and backups, monitoring integration, actual deployment                                      |

## Approval dependencies

Clinical questionnaire/rules, eligibility, examination indications and preparation instructions need named clinical approval and version sign-off. Catalog mapping, prices and policy precedence need finance/laboratory approval. Privacy notice, lawful bases, retention, DSR and processor agreements need DPO/legal review. Hosting, TLS, backups, restoration, incident contacts and integration boundaries need infrastructure authorization.

**The complete master prompt acceptance gate has not passed. Do not use this application with actual patient data yet.** The table records genuine missing functionality rather than presenting draft interfaces as completed enterprise modules.
