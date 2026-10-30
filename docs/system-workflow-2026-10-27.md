# PDH Smart Health Check — implementation workflow

## Current override: OTP delivery disabled (2026-10-28)

The user has disabled OTP because there is no SMS budget. OTP_PROVIDER=disabled is now the default and the local setting. Registration proceeds without requesting or verifying OTP. Request/verify/recovery endpoints return OTP_DISABLED before creating or sending a code. verifiedPhone is never fabricated: interest payloads record contactVerification=staff_pending, and staff must check contact details. Session ownership, expiry, encryption, same-origin protection, rate limits and Booking capacity/price checks remain enforced. Self-service cross-device recovery is unavailable while OTP is disabled; contact the hospital for staff-assisted identity verification. Do not implement lookup by phone/reference alone. Staff authenticator MFA remains unchanged.

The OTP-enabled paths described below remain optional configuration for a future budget; they do not describe the current disabled mode. Regression fixtures explicitly enable only the development test provider on the isolated test database.

Current-mode browser command: node node_modules/@playwright/test/cli.js test --config playwright.no-otp.config.ts


Updated 2026-10-28 from local source. This replaces the earlier analysis of 2026-10-27. No production deployment or production database changes were performed.

## Selectable health histories (2026-10-28)

Medical, medication, allergy, surgery, assistance, hospital/insurer and family-detail fields now support None/Unknown/Specified, multiple preset checkboxes and custom editable/removable rows. Optional healthSelections stores stable codes/custom entries in the encrypted person payload. Readable canonical summaries remain in the original fields for compatibility; old free text is preserved as a custom entry without diagnosis inference. There is no new clinical scoring rule or SQL migration. Free-text API questions and per-relative notes use the same picker while keeping the existing string API contract; identity/date/numeric fields keep appropriate native controls. Family rows use stable identities on removal. See docs/all-registration-choices-2026-10-28.md for current checks/screenshots.

## ลดคำถามซ้ำ (2026-10-29)

The wizard reuses canonical intake answers for exact known duplicate questionnaire definitions only when no rule or dependent condition consumes the target field. The server recomputes requested bindings before validation/evaluation. Family reuse requires fully representable explicit disease codes. Conflicting legacy answers, unsupported family diseases, changed definitions and oversized text retain separate questions. Diagnosis questions and approved rules remain intact; duplicated diagnosis presets are omitted only for new choices. Surgery and family rows are grouped with health history. Additional family notes are optional expansion. See docs/lean-registration-2026-10-29.md for implementation limits and actual QA.

## Public workflow implemented

1. Open the website / promotional QR and select ไทย, English, 简体中文, မြန်မာ or ខ្មែរ. The selected language is the only preference saved in localStorage. Switching language updates document lang without remounting the form, its current step or OTP state.
2. Read the privacy summary and full-notice link before entering personal or health information. Current acknowledgement version: 2026-10-28-v1. The hospital must approve the notice wording and retention/contact details before release. Legacy API callers that omit noticeVersion retain the draft-v1 acknowledgement label; the new wizard always sends the current version.
3. Enter identity, date of birth (age calculated), sex, phone and optional email/document, self-reported healthcare coverage and hospital/insurer. OTP is currently disabled: Continue proceeds without requesting a code, and staff must verify contact details. If an OTP provider is enabled later, the existing verification path remains available.
4. Enter medical, surgery, medication/supplement, drug/food/other allergy histories and immediate-family NCD history. None and unknown are accepted. Family entries contain relationship and disease codes, never a relative-name field. Approved questionnaire questions and rules remain versioned. Free text is never interpreted as a clinical risk score.
5. Select a package OR ask staff to recommend services. A questionnaire rule requiring review routes to the staff path and does not block submission. Submission without a package or quote is allowed. The existing self-service online booking path remains available for eligible assessments/packages when online booking is open.
6. Review the details and acknowledge the privacy notice. Interest submission creates one ContactRequest per Registration and returns PDH-C tracking reference. This screen explicitly says it is not an appointment, price or coverage confirmation. An optional quote is only an estimate.
7. Authorized staff review the request. They assign a responsible active registration/manager/superadmin user, record data/suitability review, coverage outcome and source, and encrypted contact notes. A separate request-for-information message can be shown to the owner; internal notes are not exposed publicly.
8. If more information is needed, the verified owner can submit a bounded supplementary message from My requests. It is encrypted, shown to staff, and returns the request to under_review. Submitted original intake is immutable; supplements do not silently overwrite history.
9. When ready_to_schedule, staff propose hospital-approved package and additional tests using existing pricing. Quotes currently expire after 15 minutes. Reviewed requests can use the staff-review pricing path; ordinary online pricing continues to reject services that require review. Staff review is a human decision, not generated clinical advice.
10. The verified owner opens My requests, reviews the quote, selects/agrees a date and time, and explicitly accepts the fingerprint and slot. Reviewed-request availability remains accessible when public online booking is closed. The availability window is the existing next 31 days.
11. Staff create the actual Booking. The shared confirmation transaction rechecks registration/quote ownership, questionnaire, manual review, accepted quote fingerprint, current approved prices, age conditions, duplicate patient/day, daily/slot capacity and active holds. It writes Booking, invoice, notification outbox, request bookingId and scheduled status atomically. Full queues or changed/expired prices cannot produce success. Repeating the operation returns the same Booking.
12. My requests shows the real appointment reference, check-in QR, tests/costs and existing cancellation/rescheduling controls. Check-in and service transitions use the existing Booking workflow.

## Request and coverage states

- Requests: submitted → under_review → awaiting_information → under_review, or ready_to_schedule → scheduled → closed. Review can return ready_to_schedule to under_review/awaiting_information; all allowed transitions are checked server-side. Closed records cannot reopen. Existing pending/contacted values remain readable; contacted remains accepted as a legacy transition for pending records.
- scheduled can only be set by successful Booking creation. The status-edit API rejects this target. Migration 202610280002 preserves previous manual scheduled labels in legacyStatus and changes unlinked historical records to under_review.
- Coverage: unverified, pending, verified, unable_to_verify. These outcomes are separate from the patient's declared treatmentRight and from Booking status. Ready requires documented data and coverage review and a terminal coverage outcome. Verified is a staff-recorded result; it is not an automated HIS/insurer verification.
- Saving a review, changing a quote or supplying additional information clears prior quote/date acceptance. Changed or expired prices require a new proposal and fresh acceptance.
- All review/contact changes and successful appointments produce audit records containing identifiers/state codes, not health text. Contact history/review/supplements remain encrypted.

## Identity, ownership and drafts

All public record access requires the existing HttpOnly session. A tracking reference or phone number alone never grants access. Recovery for interest requests and existing Booking references requires a newly verified OTP on the original phone, the tracking reference and exact birthdate, with rate limiting. The service transfers ownership of the matching registration, related request if present, current quote and booking to the verified session; the old session loses access. It accepts both PDH-C tracking references and PDH appointment references.

Drafts keep the existing encrypted server-side storage and 24-hour draft expiry. They are saved after assessment, not on every keystroke. Old payloads without intakeVersion remain parseable. New wizard payloads set intakeVersion=2 and must include sex, coverage and the new histories; a positive family history requires structured relationship/disease entries. Submitted requests are excluded from the editable-draft lookup. No health data is stored in URLs, logs or localStorage.

## API surfaces added or extended

- POST contact-requests: registrationId, optional quoteId/interestedPackageId, privacyAcknowledged, noticeVersion. Same-registration retries deduplicate under a session row lock.
- GET contact-requests: session-owned status, proposed quote, acceptance and public information-request message; no internal contact note.
- POST contact-requests/slots: authenticated owner + ready request; returns reviewed-request availability independently of the public booking switch.
- POST contact-requests/accept: owner accepts id + fingerprint + slotId; no Booking is created here.
- POST contact-requests/information: verified owner can supplement an awaiting-information request.
- POST contact-requests/recover: verified OTP session + reference + birthdate.
- GET admin/contact-requests and /assignees: bookings:read; opening the request queue is audited.
- POST admin/contact-requests/status, /quote and /schedule: bookings:write. Server-side transition, quote and acceptance checks apply. No arbitrary scheduled update is exposed.

## Five languages and promotional media

Dictionaries are separate JSON files under src/lib/i18n with Thai/key fallback. API errors include localized messages and stable error codes. Questionnaire translations and rule-reason translations may be supplied per approved questionnaire version; option codes and rule comparisons never change with language. Existing seed questionnaire wording has local dictionary translations. Unknown/custom API content falls back to its original text until hospital-approved translations are provided. Package/service metadata and preparation text currently use their approved system content; arbitrary catalogue content is not automatically translated.

Local Noto Sans SC, Myanmar and Khmer fonts and SIL OFL licences are under public/fonts; no external translation or runtime font service receives user information. Health, privacy, coverage and preparation translations require a qualified language/clinical reviewer before release; they are not certified translations.

The existing img/public/img gallery remains in use. Captions, alt text and headings are localized, full images open separately and preserve aspect ratio. The page identifies the originals as Thai. Confirmed prices come from approved catalogue/Quote data, never extracted from images.

Mobile navigation has Home, Register and My requests. Header links wrap/adapt on larger screens. Safe-area spacing, touch targets, keyboard focus and local font rendering are covered by browser checks; physical-device results must be recorded separately.

## Configuration and local verification

Use the existing DATABASE_URL, DATA_ENCRYPTION_KEY, OTP_PEPPER and APP_URL configuration. New additive migrations:

- 202610280001_interest_review: owner-linked quote/booking references, assignee, encrypted review, coverage state and accepted quote/date fields.
- 202610280002_legacy_request_status: preserves historical manual labels and removes unlinked scheduled claims.

Both the isolated localhost test database pdh_healthcheck_test and the existing synthetic localhost development database pdh_healthcheck were migrated. The development migration runner checked the exact database name, loopback hostname and SEED_DEMO=true before execution. All integration and browser tests used pdh_healthcheck_test only. No production database was accessed or migrated.

OTP_PROVIDER=test works only outside production and explicitly shows that no SMS was sent. For a real provider set OTP_PROVIDER=http, OTP_HTTP_URL (HTTPS only) and OTP_HTTP_TOKEN. The adapter POSTs JSON {phone, code, ttlSeconds:300} with Bearer authorization; use an approved provider-specific gateway implementing this contract. Non-2xx, timeout, redirect or missing configuration fails the request; the application never pretends to send. No real gateway credentials were supplied or tested. Existing Notification rows remain an unconfigured outbox until a delivery worker/provider is connected.

Commands:

- npm run typecheck
- npm run lint
- npm run test:unit
- npm run test:db (runner validates localhost and rewrites the database name to pdh_healthcheck_test)
- npm run test:interest:e2e (dedicated localhost:3037 Turbopack server with separate .local/next-interest cache, synthetic fixtures, isolated test database)

See docs/qa/2026-10-28/README.md for actual test results and browser-emulation screenshots. Hardware iPhone/Android/iPad tests, assistive-technology testing on real devices, actual OTP delivery, notification delivery, HIS/insurer integration and expert translation/privacy approval remain external validation work.


## Homepage campaign media (2026-10-29)

Homepage now shows three featured posters, 13 additional posters in expandable media, and one sleep-education reference image (asc_sleep_1.jpg). All 17 open full-size, with localized captions/alt text and a Thai-original notice. Backgrounds use soft gradients; posters remain content. No pricing/coverage/clinical rules are derived from image text. See docs/campaign-images-2026-10-29.md for actual checks and limitations.


## Staff email onboarding feature (2026-10-30)

See STAFF_INVITATION_DELIVERY.md and nine staff guides. Email defaults disabled; SMTP/Resend server adapters extend existing invitations. Reset retains MFA, recovery codes are one-use/hash-only and require password. Staff recovery does not enable public patient recovery. Local verification passed; real mail/DNS/VPS acceptance remains pending. No production activation.
