# MFA enrollment and recovery codes

1. Admin manager/superadmin provisions an individual staff account and invitation (or legacy temporary password).
2. Owner opens /invite#token; fragment disappears immediately; verifies limited invited identity and sets passphrase14+characters, at most72 UTF8bytes/128characters. Local common-password examples rejected; no external breached-password service is connected.
3. Temporary-password owner must replace it first. No staff data access while session stage=password or mfa.
4. Start MFA, scan locally generated QR in a standards-compatible Authenticator and confirm6digits. TOTP SHA1/6digits/30seconds, existing window+/-1 preserved. QR/secret encrypted in pending session; final secret encrypted with existing AES-GCM key, never emailed.
5. Confirmed enrollment displays10 independent128-bit recovery codes only once. Save them separately from Authenticator and click acknowledgement. Pagehide clears in-memory secrets/codes; no browser storage. Recovery codes are stored only as SHA256 hashes.
6. Later login: password + TOTP; alternatively choose recovery-code mode and supply one recovery code with the password. Atomic consumption prevents replay without removing MFA.
7. Logged-in staff can create a new recovery set at /auth/mfa/recovery after own password+current TOTP. All old codes become invalid. The admin users page links there; other staff can open the route directly.
8. If all factors are lost: designated manager/superadmin verifies identity outside the application then uses reset-mfa with own fresh password/TOTP and recorded reason. Self-reset denied. Sessions/reset tokens/recovery codes revoked; target changes password then enrolls MFA again. Email password reset alone never disables MFA.

No passwords, enrollment QR/key or recovery-code screenshots belong in tickets/chat/Git. User-to-human identity-verification policy and storage of saved recovery codes require hospital operational approval; no new automatic identity proof is invented.
