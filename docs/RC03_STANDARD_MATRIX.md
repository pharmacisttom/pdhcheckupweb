# RC03 standard matrix

This release candidate is aligned to `prisma/schema.prisma` and `docs/data-mapping.md`.

| Area | Source of truth | Lifecycle / persistence rule | Acceptance evidence |
|---|---|---|---|
| Services | Service model + mapping | Create/read/update; deactivate instead of destructive delete | Admin CRUD E2E, API read-back |
| Prices | Price model + 9-column mapping | New effective version; approved prices only; no overwrite of published version | Promotion integration + CRUD E2E |
| Packages/items | Package and PackageItem models | Version/archive; referential integrity is fail-closed | Promotion integration |
| Questionnaires | Questionnaire model | Publish only with approval; published versions are immutable | Promotion integration |
| Day capacity/slots | DayCapacity and Slot models | Occupied capacity/slots cannot be closed or reduced unsafely | Reservation safety integration |
| Bookings | Booking/hold models | Status transitions and cancellation are audited; history retained | Admin CRUD + booking E2E |
| Organizations/staff | Organization/User/Staff models | Deactivate or role-change; invite and MFA gates remain enabled | Staff/MFA E2E |
| Personal data | encrypted patient/registration fields and governed domain schema | Consent, purpose limitation, encrypted storage, no PII in manifests/logs | Privacy review + sandbox tests |

The mapping import contract remains: `service_code`, `service_name_th`, `service_name_en`, `category`, `standard_price`, `unit`, `effective_from`, `effective_to`, `status`. Dates are ISO dates; `effective_to` is exclusive. No migration is added by RC03.

