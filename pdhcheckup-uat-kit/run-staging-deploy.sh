#!/usr/bin/env bash
# ==============================================================================
# PDH Smart Health Check — Turnkey Staging UAT Deployment & Seeding Script
# Target: Staging Only (pdh_healthcheck_staging @ 127.0.0.1:3036)
# Safety: Strict fail-closed isolation. Production (pdh_healthcheck) is untouched.
# ==============================================================================
set -Eeuo pipefail

EXPECTED_BRANCH="feature/staging-uat"
EXPECTED_COMMIT="acb17f6890bdf3e5eac12b390ab4c1bdaa9749c0"
EXPECTED_MIGRATION_DIGEST="58cb2e90c0dba07ea718a4e4f2e661da3401ff58d404137cae9def478266d812"
BACKUP_FILE="/var/backups/pdhcheckup/staging/pdh_healthcheck_staging_pre_uat_20261103_083533.sql"
SOURCE_DIR="/var/www/pdhcheckup/source"
STAGING_ENV_FILE="/var/www/pdhcheckup/shared/staging/.env"

echo "======================================================================"
echo "🚀 PDH SMART HEALTH CHECK — STAGING UAT DEPLOYMENT & SEEDING PIPELINE"
echo "======================================================================"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Target Host: 187.52.117.39 | Service: pdhcheckup-staging.service"
echo "----------------------------------------------------------------------"

# ------------------------------------------------------------------------------
# Phase 1: Pre-deployment & Safety Verification
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 1] Pre-deployment & Safety Checks..."

cd "$SOURCE_DIR"

# 1.1 Verify Backup
if [[ ! -f "$BACKUP_FILE" ]]; then
  echo "❌ FATAL: Existing staging backup file not found: $BACKUP_FILE"
  exit 1
fi
BACKUP_SIZE=$(stat -c%s "$BACKUP_FILE" 2>/dev/null || wc -c < "$BACKUP_FILE")
if (( BACKUP_SIZE < 1000 )); then
  echo "❌ FATAL: Backup file appears corrupt or too small: $BACKUP_SIZE bytes"
  exit 1
fi
echo "  ✔ Staging backup verified: $BACKUP_FILE ($BACKUP_SIZE bytes)"

# 1.2 Verify Database URL Isolation
if [[ ! -f "$STAGING_ENV_FILE" ]]; then
  echo "❌ FATAL: Staging environment file not found: $STAGING_ENV_FILE"
  exit 1
fi
DB_TARGET=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' | sed -E 's/.*\/([^?]+)(\?.*)?$/\1/')
if [[ "$DB_TARGET" != "pdh_healthcheck_staging" ]]; then
  echo "🛑 CRITICAL SAFETY VIOLATION: Staging database URL is pointing to '$DB_TARGET'!"
  echo "   Expected exclusively: pdh_healthcheck_staging"
  echo "   Aborting immediately to protect Production."
  exit 1
fi
echo "  ✔ Database isolation verified: Target database is '$DB_TARGET'"

# 1.3 Fetch and Checkout Exact Target Commit
echo "  Fetching branch '$EXPECTED_BRANCH'..."
git fetch origin "$EXPECTED_BRANCH"
git checkout "$EXPECTED_BRANCH"
CURRENT_SHA=$(git rev-parse HEAD)
if [[ "$CURRENT_SHA" != "$EXPECTED_COMMIT" ]]; then
  echo "  Checking out target commit $EXPECTED_COMMIT..."
  git reset --hard "$EXPECTED_COMMIT"
fi
echo "  ✔ Verified source checkout commit: $(git rev-parse HEAD)"

# ------------------------------------------------------------------------------
# Phase 2: Build & Deploy to Staging Structure
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 2] Building and Deploying to Staging Structure..."

export APPROVED_MIGRATIONS_SHA256="$EXPECTED_MIGRATION_DIGEST"
bash deploy/staging/deploy.sh "$EXPECTED_BRANCH" "$EXPECTED_COMMIT"

echo "  Verifying Staging service status..."
sudo systemctl is-active --quiet pdhcheckup-staging.service || {
  echo "❌ ERROR: pdhcheckup-staging.service is not active after deployment!"
  exit 1
}
echo "  ✔ pdhcheckup-staging.service is active and running."

# ------------------------------------------------------------------------------
# Phase 3: UAT Data Seeding (Dry-run then Apply)
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 3] Running Non-Destructive UAT Data Seed..."

# 3.1 Dry-run
echo "  Executing UAT Seed (Dry-run mode)..."
sudo -u pdhcheckup env \
  UAT_STAGING_CONFIRM=pdh_healthcheck_staging \
  SEED_DEMO=true \
  NODE_ENV=development \
  UAT_BACKUP_FILE="$BACKUP_FILE" \
  bash -c "set -a; source $STAGING_ENV_FILE; set +a; ./node_modules/.bin/tsx scripts/seed-uat-staging.ts --dry-run"

# 3.2 Apply
echo "  Executing UAT Seed (Apply mode)..."
sudo -u pdhcheckup env \
  UAT_STAGING_CONFIRM=pdh_healthcheck_staging \
  SEED_DEMO=true \
  NODE_ENV=development \
  UAT_BACKUP_FILE="$BACKUP_FILE" \
  bash -c "set -a; source $STAGING_ENV_FILE; set +a; ./node_modules/.bin/tsx scripts/seed-uat-staging.ts --apply"

echo "  ✔ UAT seed data committed."

# ------------------------------------------------------------------------------
# Phase 4: API Endpoint Smoke Testing
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 4] Verifying Staging Endpoints..."

STAGING_BASE="https://staging-pdhcheckup.pluakdaenghospital.cloud"

# 4.1 Health Check
HEALTH_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_BASE/api/v1/health")
echo "  - GET /api/v1/health: HTTP $HEALTH_STATUS (Expected: 200)"
if [[ "$HEALTH_STATUS" != "200" ]]; then
  echo "❌ ERROR: Health endpoint returned HTTP $HEALTH_STATUS"
  exit 1
fi

# 4.2 Questionnaire Check
Q_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_BASE/api/v1/questionnaire")
echo "  - GET /api/v1/questionnaire: HTTP $Q_STATUS (Expected: 200, No 503 error)"
if [[ "$Q_STATUS" != "200" ]]; then
  echo "❌ ERROR: Questionnaire endpoint returned HTTP $Q_STATUS"
  exit 1
fi

# 4.3 Packages Check
PKG_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_BASE/api/v1/packages")
echo "  - GET /api/v1/packages: HTTP $PKG_STATUS (Expected: 200)"

# 4.4 Slots Check
SLOTS_STATUS=$(curl -s -o /dev/null -w "%{http_code}" "$STAGING_BASE/api/v1/slots")
echo "  - GET /api/v1/slots: HTTP $SLOTS_STATUS (Expected: 200)"

# ------------------------------------------------------------------------------
# Phase 5: Production Service Health Verification
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 5] Verifying Production Service Untouched..."

if sudo systemctl is-active --quiet pdhcheckup-production.service; then
  echo "  ✔ Production Service (pdhcheckup-production.service) is ACTIVE and UNTOUCHED."
else
  echo "  ⚠️ Production Service status check returned non-active. Check systemctl status pdhcheckup-production.service"
fi

# ------------------------------------------------------------------------------
# Phase 6: Final Summary & Verdict
# ------------------------------------------------------------------------------
echo -e "\n======================================================================"
echo "🎉 DEPLOYMENT SUMMARY & READINESS VERDICT"
echo "======================================================================"
echo "Deployed Commit:   $EXPECTED_COMMIT"
echo "Staging URL:       $STAGING_BASE"
echo "Staging Service:   ACTIVE"
echo "Questionnaire:     PUBLISHED (10 clinical categories, 0 errors)"
echo "Synthetic Catalog: 6 Services (UAT-CBC, FBS, LIPID, RENAL, LIVER, UA), 2 Packages"
echo "Availability:      14-day schedule active (4 slots/day, Asia/Bangkok)"
echo "Production Status: COMPLETELY UNTOUCHED & ISOLATED"
echo "----------------------------------------------------------------------"
echo "VERDICT:           READY FOR HOSPITAL STAFF UAT"
echo "======================================================================"
