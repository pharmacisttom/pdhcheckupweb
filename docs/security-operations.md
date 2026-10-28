# Security and operational acceptance checklist

Local white-box pentest and remediation evidence (22 October 2026): [report](pentest-2026-10-22.md). Application checks passed for the documented cases; unresolved dependency, perimeter, CSP and operational gates remain. This does not replace an authorized staging/production infrastructure pentest.

Use OWASP ASVS 5.0.0 with a hospital-approved verification scope. The presence of this file does not imply compliance.

- [ ] Clinical/finance approval recorded for every public rule/package/price.
- [ ] Lawful basis by purpose, controller/processor roles, ROPA/data flows and DPO contact approved.
- [ ] Privacy notice, separate purpose-specific consent when required, retention, DSR and incident procedures approved.
- [ ] MFA enrolled for all staff, account revocation and privileged recovery tested.
- [ ] Deny-by-default permissions and object ownership tested for every sensitive endpoint.
- [ ] OTP provider contract, number normalization, retries and throttling verified.
- [ ] Perimeter IP rate limits, secure proxy configuration and resource exhaustion controls enabled.
- [ ] TLS, secure cookies, headers, stronger CSP without unsafe-inline where practical, XSS/CSRF/injection verified.
- [ ] Encryption key storage, rotation, backup and restoration demonstrated.
- [ ] Dependency vulnerabilities triaged and resolved/accepted by security owner.
- [ ] Twenty-request last-place **confirmation** contention and idempotency proven against MySQL.
- [ ] Malicious spreadsheet corpus, ZIP bomb and parser resource tests passed.
- [ ] Audit immutability/access/export review and centralized sanitized logging verified.
- [ ] Retention purge and expired-session/hold cleanup jobs approved and tested.
- [ ] Notification queue processing, retries, deduplication and provider outage recovery implemented.
- [ ] Authorized HIS protocol and integration security reviewed; no public MySQL intranet bridge.
- [ ] Responsive 360/390/768/1024/1366/1920 QA, keyboard and screen reader UAT.
- [ ] Backup restoration and rollback drills passed; monitoring and response contacts active.

Incident outline: isolate affected access without destroying evidence, revoke compromised sessions/keys, preserve sanitized audit evidence, involve hospital incident/DPO owners, determine statutory obligations with counsel, recover from verified backups, reconcile financial/appointment changes and record corrective action. No notification deadlines are assumed in code.

Staff account administration, invitation delivery and self-service MFA enrollment are described in USER_MANAGEMENT.md. Require the acting administrator's password and TOTP for administrative mutations, independent identity verification before MFA recovery, and staging verification of the additive migration.
