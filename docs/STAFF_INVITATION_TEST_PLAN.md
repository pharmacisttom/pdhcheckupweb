# Planned tests before implementation

Use localhost pdh_healthcheck_test only. Test existing staff suite plus invitation creation/duplicate email/RBAC/superadmin protection, revoke/resend old-token rejection, expired/replay/concurrent activation, provider disabled/failure/success mock, generic forgot-password, password policy and reset replay/race/session revocation/MFA retention, recovery-code once-only and wrong-user/race, metadata filters, safe audit and environment isolation. Responsive Chromium E2E at390/820 plus existing staff onboarding. Real sender DNS/provider and Ubuntu staging are external pending gates. No patient data or production DB tests.

## Actual results before handoff (2026-10-29; finalized2026-10-30)

Typecheck PASS; lint0errors/1existing TanStack warning; unit82/15files PASS; isolatedMySQL integration59/11files PASS; staff Chromium E2E3 PASS; public noOTP regression4 PASS. No skips in selected runs. Full npm run build (Prisma generate + Next webpack) PASS with local test dist directory. Prisma schema diff against migrated testDB: no difference. Git Bash syntax common.sh PASS.

Earlier failing runs exposed a real header override (fixed), stale test ports/activation path/fixture guard (fixed), and test scope errors (fixed). Mock SMTP/Resend success is NOT real email acceptance. DNS, actual recipient receipt, VPS staging/restore and physical device UAT remain NOT TESTED: sender/authorized access absent. No production operation. Screenshots in qa/2026-10-29/staff-email contain no live tokens, MFA secrets or recovery codes.
