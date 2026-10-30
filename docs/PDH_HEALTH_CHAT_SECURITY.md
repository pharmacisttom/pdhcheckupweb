# Security implementation and remaining verification
Existing session/RBAC/TOTP guards retained. Explicit department grants, owner session check, row locks, UUID dedupe, message sequence uniqueness, public note filtering, status validation, human generation checks, final version/kill checks, no-store/no-referrer API. Scoped widget plain text React rendering: no imported HTML execution.

Import child has bounded size/time/heap/ZIP entries, no shell, no inherited secrets, no original public file. Process isolation is resource containment, not OS sandbox; hospital AV/content inspection and standalone parser tracing require staging verification. Configured compatible HTTPS endpoint is trusted operator configuration, not user input. No provider credentials returned by settings. No raw request/provider payload logs.

Known scope limits: safety lexical rules are not a multilingual medical classifier; assistant is Thai-first and conservative. All clinical facts require expert KB review. Rate limits and caps reduce abuse, not clinical assurance. No live penetration assessment or staging audit has been performed. Do not call this production certification.
