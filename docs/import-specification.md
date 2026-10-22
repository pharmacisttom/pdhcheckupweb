# Price import specification

Template: `public/templates/service-prices.csv` (header-only; contains no invented live prices).

UTF-8 CSV or XLSX, first worksheet normalized tabular layout, header row 1, at most 5,000 rows, upload <= 2 MB, XLSX uncompressed central-directory sizes <= 20 MB and <= 1,000 entries. Formulas, hyperlinks and rich-text cells are rejected. XLSX parser/decompression must also be security reviewed against malformed archives before accepting untrusted public uploads; imports are staff-only.

Staging stores a SHA-256-derived file hash, uploader, normalized rows and actionable row errors. Preview displays new codes, prior price, proposed price and name mismatch. Invalid rows cannot be published. Approval is atomic, permission checked and requires a second actor. Effective dates are interpreted as Bangkok midnight, end exclusive. Selection uses latest effective start, then highest version among approved prices. No implicit discounts, entitlement or contract adjustments are applied; unsupported policies require further implementation and hospital approval.

Rollback is a new staged approved import reproducing a previous rate with a new effective date. Original price rows remain unchanged. The original file is not retained; retain approved source evidence in the hospital's controlled repository per its retention policy.
