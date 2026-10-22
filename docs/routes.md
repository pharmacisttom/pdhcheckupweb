# Routes and operations

Public: `/`, `/register`, `/bookings`, `/privacy`, `/login`.

Authenticated staff: `/admin/dashboard`, `/admin/appointments`, `/admin/packages`, `/admin/lab-pricing`, `/admin/organizations`, `/admin/quotations`, `/admin/billing`, `/admin/reports`, `/admin/privacy`, `/admin/audit`.

Versioned JSON API prefix: `/api/v1/`. Responses are `{ data, correlationId }` or `{ error: { code, message }, correlationId }`. Sensitive results use Cache-Control: no-store. Unknown routes return 404; validation 422; unauthenticated 401; forbidden 403; conflicts 409; throttled 429; unconfigured dependencies 503. API contract: `docs/openapi.json`.

GET: health, auth/me, packages, services?q=, questionnaire, registrations/draft, slots?from=, bookings.

POST: auth/guest, auth/login, auth/logout, otp/request, otp/verify, registrations, quotes, holds, bookings, bookings/:id/cancel, privacy/requests.

Admin GET: dashboard?from=&to=, bookings, packages, imports, organizations, quotations, reports, audit, privacy.

Admin POST: bookings/status, checkin, packages, packages/status, slots, imports (multipart), imports/approve, organizations, reports/export.

Bounded results rather than complete cursor pagination are currently used. Lists document their limits in the UI; full pagination is an outstanding requirement.
