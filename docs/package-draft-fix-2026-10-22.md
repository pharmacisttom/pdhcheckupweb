# Package draft save failure — 2026-10-22

## Verified observations

The reported VPS error is serviceIds: Too small: expected array to have >=1 items. Repository API validation requires at least one service, while the original package form allowed an empty selection to be submitted. The original UI also did not distinguish catalog loading, an unsuccessful request and an empty catalog.

Read-only checks against the supplied production domain returned HTTP 200 for /api/v1/health with status=ok and database=true, and HTTP 200 for /api/v1/services with an empty data array (0 services). No authenticated requests, production writes, imports, migrations or deployment were performed. This confirms no services were exposed for selection at the time of checking; it does not prove that the Service table itself is empty. Inactive rows, the configured database and the deployed API version still need operator verification.

## Source fix

- Package editor displays catalog loading, empty, search-empty and request-error states separately, with a retry button and Thai guidance.
- Save is disabled until at least one service is selected and the catalog request succeeds; submit also checks that invariant before making a request.
- Search calls the existing service API by code/name so services beyond its first 200 results remain discoverable. Selections persist while searching; count and 100-item limit are visible.
- The server retains the minimum-one-service rule, returns a Thai validation message, and rejects missing/inactive IDs before creating a draft. Fixed package prices do not require every included service to have an individual approved price.
- Existing publication/approval, roles, package versioning and data source are preserved. No schema or data migration is added by this fix.
- ESLint now ignores generated .local archives and browser artifacts; source files remain checked. This was necessary because a previously archived Next.js build was being linted as source.

## VPS remediation

First confirm that production's protected DATABASE_URL points to the intended pdh_healthcheck database rather than staging. Do not print passwords or copy the environment into chat/Git. An authorized database operator can run these read-only queries after selecting the verified production schema:

~~~sql
SELECT COUNT(*) AS total_services,
       COALESCE(SUM(active = 1), 0) AS active_services
FROM Service;
SELECT status, COUNT(*) AS batches
FROM ImportBatch
GROUP BY status;
~~~

If service data has not been loaded, use the real hospital-approved service/price CSV or XLSX in the laboratory/pricing workspace. The existing download template contains headers only, not approved hospital data. Validate the preview, then have a different authorized approver approve/publish the batch. Staging an import alone does not create active service records: approveImport performs the Service upsert and uses status=active to enable selection. The importer cannot approve their own batch, including when using Superadmin. If existing data is inactive, review its status and intended database before importing again.

Once the existing service API returns the correct active hospital services, select at least one service in the package editor and save the draft. Review the draft's items and price before publication. Do not add demo services or run a seed/reset merely to make saving succeed. Code-only deployment does not populate the catalog.

The working tree also contains the previously requested homepage/deployment and staff-enrollment work. Review the release scope and any required earlier migration separately before deploying; this hotfix itself adds no migration. No VPS changes are claimed.

## Validation

- npm run typecheck: passed.
- npm run lint: passed with the existing TanStack/React Compiler warning.
- npm test: 54 passed, 34 database-conditional tests skipped in the default run.
- npm run test:db: 35 passed in 7 files on isolated local MySQL. Three new package cases cover empty selection/Thai validation, actual draft-item persistence without an individual service price, and inactive/missing IDs without partial saves.
- Focused package browser suite: 2 passed, including actual MySQL save after search, checkbox/save-button behavior, loading/empty/error states and retry. The first attempt used an incorrect test-only form-toggle label; it was corrected to match the existing UI.
- npm run build: passed, followed by a successful explicit typecheck.

Modified for this fix: src/components/admin-workspace.tsx, src/server/api.ts (package branch), src/app/globals.css (fieldset styling), eslint.config.mjs, tests/integration/package-drafts.test.ts, tests/e2e/package-drafts.spec.ts, docs/TROUBLESHOOTING.md, and this report.
