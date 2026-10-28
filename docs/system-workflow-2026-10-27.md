# PDH Smart Health Check — implementation workflow

Updated 2026-10-28 from local source. This replaces the earlier analysis of 2026-10-27. No production deployment or production database changes were performed.

## Public workflow implemented

1. Open the website / promotional QR and select ไทย, English, 简体中文, မြန်မာ or ខ្មែរ. The selected language is the only preference saved in localStorage. Switching language updates document lang without remounting the form, its current step or OTP state.
2. Read the privacy summary and full-notice link before entering personal or health information. Current acknowledgement version: 2026-10-28-v1. The hospital must approve the notice wording and retention/contact details before release. Legacy API callers that omit noticeVersion retain the draft-v1 acknowledgement label; the new wizard always sends the current version.
3. Enter identity, date of birth (age calculated), sex, phone and optional email/document, self-reported healthcare coverage and hospital/insurer. Verify the phone through OTP.
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
