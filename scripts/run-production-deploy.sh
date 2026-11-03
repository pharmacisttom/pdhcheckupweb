#!/usr/bin/env bash
# ==============================================================================
# PDH Smart Health Check — Production Go-Live Deployment & Verification Pipeline
# Target: PRODUCTION ONLY (pdh_healthcheck @ 127.0.0.1:3036)
# Service: pdhcheckup-production.service
# Safety: Strict fail-closed validation. Pre-deployment backup required.
# ==============================================================================
set -Eeuo pipefail

TARGET_BRANCH="${1:-feature/staging-uat}"
TARGET_COMMIT="${2:-}"
CONFIRM_FLAG="${3:-}"

# Independently approved migration set digest
APPROVED_MIGRATION_DIGEST="664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8"

SOURCE_DIR="/var/www/pdhcheckup/source"
PROD_ENV_FILE="/var/www/pdhcheckup/shared/production/.env"
STAGING_ENV_FILE="/var/www/pdhcheckup/shared/staging/.env"
PROD_SERVICE="pdhcheckup-production.service"
STAGING_SERVICE="pdhcheckup-staging.service"
PROD_BASE="https://pdhcheckup.pluakdaenghospital.cloud"
BACKUP_DIR="/var/www/pdhcheckup/shared/production/backups"

# Dynamic verification state
CRITICAL_ERRORS=0
WARNINGS=0
declare -a AUDIT_LOG=()

log_info() {
  echo -e "  [INFO] $1"
  AUDIT_LOG+=("[INFO] $1")
}

log_pass() {
  echo -e "  ✔ $1"
  AUDIT_LOG+=("[PASS] $1")
}

log_warn() {
  echo -e "  ⚠️ WARNING: $1"
  WARNINGS=$((WARNINGS + 1))
  AUDIT_LOG+=("[WARN] $1")
}

log_fail() {
  echo -e "  ❌ FAIL: $1"
  CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1))
  AUDIT_LOG+=("[FAIL] $1")
}

die() {
  echo -e "\n🛑 FATAL ERROR: $1" >&2
  exit 1
}

echo "======================================================================"
echo "🚀 PDH SMART HEALTH CHECK — PRODUCTION GO-LIVE DEPLOYMENT PIPELINE"
echo "======================================================================"
echo "Timestamp: $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Target Host: 187.52.117.39 | Service: $PROD_SERVICE"
echo "----------------------------------------------------------------------"

# ------------------------------------------------------------------------------
# Operator Authorization Gate
# ------------------------------------------------------------------------------
if [[ "$CONFIRM_FLAG" != "--approve-production-release" ]]; then
  echo -e "\n⚠️ OPERATOR CONFIRMATION REQUIRED!"
  echo "Production deployment modifies live hospital infrastructure."
  echo "To proceed, run with explicit authorization:"
  echo "  bash scripts/run-production-deploy.sh <BRANCH> <FULL_SHA> --approve-production-release"
  die "Operator approval flag missing. Deployment aborted."
fi

# ------------------------------------------------------------------------------
# Phase 1: Pre-deployment & Safety Verification
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 1] Pre-deployment Safety Verification & Isolation Checks..."

cd "$SOURCE_DIR" || die "Cannot access source directory: $SOURCE_DIR"

# 1.1 Verify Production Environment File & Database Target
if [[ ! -f "$PROD_ENV_FILE" ]]; then
  die "Production environment file not found: $PROD_ENV_FILE"
fi
PROD_PERMS=$(stat -c %a "$PROD_ENV_FILE" 2>/dev/null || stat -f %Op "$PROD_ENV_FILE" 2>/dev/null || echo "unknown")
if [[ "$PROD_PERMS" != "600" ]]; then
  die "Security violation: Production .env permissions are $PROD_PERMS; must be strictly 600"
fi

DB_TARGET=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' | sed -E 's/.*\/([^?]+)(\?.*)?$/\1/')
if [[ "$DB_TARGET" != "pdh_healthcheck" ]]; then
  die "CRITICAL CONFIG ERROR: Production DATABASE_URL points to '$DB_TARGET'; expected: pdh_healthcheck. Aborting."
fi
log_pass "Production database target verified: '$DB_TARGET'"

# 1.2 Baseline Staging State (To guarantee Staging remains untouched)
log_info "Recording Staging baseline state..."
STAGING_ACTIVE_BEFORE=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
STAGING_PID_BEFORE=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
log_pass "Staging baseline captured: PID $STAGING_PID_BEFORE ($STAGING_ACTIVE_BEFORE)"

# 1.3 Create Verified Production Pre-Deployment Backup
log_info "Creating verified pre-deployment Production database backup..."
mkdir -p "$BACKUP_DIR"
chmod 700 "$BACKUP_DIR"
PRE_DEPLOY_BACKUP="$BACKUP_DIR/pre-golive-$(date -u +%Y%m%dT%H%M%S).sql.gz"

if [[ -f "/var/www/pdhcheckup/shared/production/backup.cnf" ]]; then
  mysqldump --defaults-extra-file="/var/www/pdhcheckup/shared/production/backup.cnf" \
    --host=127.0.0.1 --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
    --databases pdh_healthcheck | gzip > "$PRE_DEPLOY_BACKUP"
  gzip -t "$PRE_DEPLOY_BACKUP" || die "Corrupt backup file generated: $PRE_DEPLOY_BACKUP"
  PRE_BACKUP_SHA256=$(sha256sum "$PRE_DEPLOY_BACKUP" | cut -d' ' -f1)
  echo "$PRE_BACKUP_SHA256  $(basename "$PRE_DEPLOY_BACKUP")" > "$PRE_DEPLOY_BACKUP.sha256"
  log_pass "Verified Production backup created: $PRE_DEPLOY_BACKUP"
  log_info "Backup SHA-256: $PRE_BACKUP_SHA256"
else
  log_warn "Dedicated backup.cnf not found; relying on deploy.sh internal backup."
fi

# 1.4 Resolve and Verify Target Commit
git fetch origin "$TARGET_BRANCH"
if [[ -z "$TARGET_COMMIT" ]]; then
  TARGET_COMMIT=$(git rev-parse "origin/$TARGET_BRANCH")
else
  TARGET_COMMIT=$(git rev-parse "$TARGET_COMMIT")
fi
git checkout "$TARGET_BRANCH"
git reset --hard "$TARGET_COMMIT"
ACTUAL_COMMIT=$(git rev-parse HEAD)
log_pass "Source checkout verified at commit: $ACTUAL_COMMIT"

# 1.5 Independent Migration Digest Verification
log_info "Independently verifying migration digest..."
MIG_TMP=$(mktemp -d)
git -c core.autocrlf=false archive "$ACTUAL_COMMIT" prisma/migrations | tar -x -C "$MIG_TMP"
CALCULATED_DIGEST=$(cd "$MIG_TMP" && find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sed 's/ \*/  /' | sha256sum | cut -d' ' -f1)
MIGRATION_TREE_SHA=$(git rev-parse "$ACTUAL_COMMIT:prisma/migrations")
rm -rf "$MIG_TMP"

log_info "Migration Tree SHA:  $MIGRATION_TREE_SHA"
log_info "Approved Digest:     $APPROVED_MIGRATION_DIGEST"
log_info "Calculated Digest:   $CALCULATED_DIGEST"

if [[ "$CALCULATED_DIGEST" != "$APPROVED_MIGRATION_DIGEST" ]]; then
  die "CRITICAL FAIL-CLOSED MISMATCH: Calculated digest $CALCULATED_DIGEST does not match approved $APPROVED_MIGRATION_DIGEST"
fi
log_pass "Migration digest verified: $CALCULATED_DIGEST"

# ------------------------------------------------------------------------------
# Phase 2: Build & Deploy to Production
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 2] Building and Deploying Production Release..."

export APPROVED_MIGRATIONS_SHA256="$APPROVED_MIGRATION_DIGEST"
bash deploy/production/deploy.sh "$TARGET_BRANCH" "$ACTUAL_COMMIT"

# Verify Production Service Active
if sudo systemctl is-active --quiet "$PROD_SERVICE"; then
  log_pass "Service $PROD_SERVICE is active and operational."
else
  log_fail "Service $PROD_SERVICE failed to activate after deployment!"
  die "Production service is down. Review: journalctl -u $PROD_SERVICE -n 50"
fi

# ------------------------------------------------------------------------------
# Phase 3: Configuration Data Promotion (Dry-run then Transactional Apply)
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 3] Executing Selective Configuration Data Promotion..."

# 3.1 Dry-run
log_info "Running Configuration Promotion in Dry-run mode..."
SOURCE_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//') \
TARGET_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//') \
npx tsx scripts/promote-config-data.ts --dry-run

# 3.2 Transactional Apply
log_info "Applying Configuration Promotion into Production..."
SOURCE_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//') \
TARGET_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//') \
npx tsx scripts/promote-config-data.ts --apply
log_pass "Configuration data promoted successfully into Production."

# ------------------------------------------------------------------------------
# Phase 4: Production Endpoint & API Verification (Fail-Closed)
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 4] Verifying Production Endpoints & APIs..."

verify_endpoint() {
  local endpoint="$1"
  local expected_status="$2"
  local description="$3"

  local response_file
  response_file=$(mktemp)
  local http_code

  http_code=$(curl -s -o "$response_file" -w "%{http_code}" --max-time 15 "$PROD_BASE$endpoint" || echo "000")

  if [[ "$http_code" == "$expected_status" ]]; then
    log_pass "$description: HTTP $http_code (Match)"
    rm -f "$response_file"
    return 0
  else
    log_fail "$description: Expected HTTP $expected_status, got $http_code"
    echo -e "     Response snippet: $(head -c 200 "$response_file" 2>/dev/null || echo 'No response')"
    rm -f "$response_file"
    return 1
  fi
}

verify_endpoint "/api/v1/health" "200" "Public Health Endpoint" || die "Health check failed on Production"
verify_endpoint "/api/v1/readiness" "200" "Readiness & DB Connectivity" || die "Readiness check failed on Production"
verify_endpoint "/api/v1/packages" "200" "Packages API" || die "Packages API failed on Production"
verify_endpoint "/api/v1/slots" "200" "Appointment Slots API" || die "Slots API failed on Production"

# ------------------------------------------------------------------------------
# Phase 5: Staging Non-Interference Verification
# ------------------------------------------------------------------------------
echo -e "\n[PHASE 5] Verifying Staging Isolation & Non-Interference..."

STAGING_ACTIVE_AFTER=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
STAGING_PID_AFTER=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")

if [[ "$STAGING_ACTIVE_BEFORE" == "active" ]]; then
  if [[ "$STAGING_ACTIVE_AFTER" == "active" && "$STAGING_PID_BEFORE" == "$STAGING_PID_AFTER" ]]; then
    log_pass "Staging service was 100% UNTOUCHED (PID $STAGING_PID_AFTER unchanged)."
  else
    log_warn "Staging service PID changed ($STAGING_PID_BEFORE -> $STAGING_PID_AFTER)."
  fi
fi

# ------------------------------------------------------------------------------
# Phase 6: Final Go-Live Verdict
# ------------------------------------------------------------------------------
echo -e "\n======================================================================"
echo "📊 PRODUCTION GO-LIVE VERDICT & AUDIT SUMMARY"
echo "======================================================================"
echo "Timestamp:           $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Production Commit:   $ACTUAL_COMMIT"
echo "Migration Digest:    $CALCULATED_DIGEST"
echo "Production Service:  $PROD_SERVICE (Active)"
echo "Critical Errors:     $CRITICAL_ERRORS"
echo "Warnings:            $WARNINGS"
echo "----------------------------------------------------------------------"

if (( CRITICAL_ERRORS == 0 )); then
  echo -e "🟢 FINAL VERDICT: GO (PRODUCTION IS LIVE & OPERATIONAL)\n"
  echo "Production URL: $PROD_BASE"
  exit 0
else
  echo -e "🔴 FINAL VERDICT: NO-GO (CRITICAL ERRORS ENCOUNTERED)\n"
  exit 1
fi
