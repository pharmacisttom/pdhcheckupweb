#!/usr/bin/env bash
# ==============================================================================
# PDH Smart Health Check — Production Go-Live Deployment & Verification Pipeline
# Target: PRODUCTION ONLY (pdh_healthcheck @ 127.0.0.1:3036)
# Service: pdhcheckup-production.service
# Safety: Strict Two-Stage Architecture (PREPARE and APPLY)
# ==============================================================================
set -Eeuo pipefail

STAGE="${1:-}"
TARGET_BRANCH="${2:-feature/rc03-production-readiness}"
TARGET_COMMIT="${3:-}"

# Parse optional flags from remaining arguments
CLI_MANIFEST_CHECKSUM=""
PROMOTE_APPROVED_PRICES=false

shift 3 2>/dev/null || true
for arg in "$@"; do
  if [[ "$arg" =~ ^--manifest-checksum= ]]; then
    CLI_MANIFEST_CHECKSUM="${arg#*=}"
  elif [[ "$arg" == "--promote-approved-prices" ]]; then
    PROMOTE_APPROVED_PRICES=true
  fi
done

# Independently approved migration set digest
APPROVED_MIGRATION_DIGEST="664693a41280db0bc185ffd42f93ae535c38ffe621d61b892eb091580e69b8c8"

SOURCE_DIR="/var/www/pdhcheckup/source"
PROD_ENV_FILE="/var/www/pdhcheckup/shared/production/.env"
STAGING_ENV_FILE="/var/www/pdhcheckup/shared/staging/.env"
PROD_SERVICE="pdhcheckup-production.service"
STAGING_SERVICE="pdhcheckup-staging.service"
PROD_BASE="https://pdhcheckup.pluakdaenghospital.cloud"
BACKUP_DIR="/var/www/pdhcheckup/shared/production/backups"
MANIFEST_FILE="/var/www/pdhcheckup/shared/production/promotion-manifest.json"
STATE_FILE="/var/www/pdhcheckup/shared/production/prepare-state.env"

# Fallback for local testing if running outside VPS paths
if [[ ! -d "/var/www/pdhcheckup" ]]; then
  SOURCE_DIR="$(cd "$(dirname "${BASH_SOURCE[0]}")/.." && pwd)"
  BACKUP_DIR="$SOURCE_DIR/deploy/production/backups"
  MANIFEST_FILE="$SOURCE_DIR/deploy/production/promotion-manifest.json"
  STATE_FILE="$SOURCE_DIR/deploy/production/prepare-state.env"
fi

CRITICAL_ERRORS=0
WARNINGS=0

log_info() { echo -e "  [INFO] $1"; }
log_pass() { echo -e "  ✔ $1"; }
log_warn() { echo -e "  ⚠️ WARNING: $1"; WARNINGS=$((WARNINGS + 1)); }
log_fail() { echo -e "  ❌ FAIL: $1"; CRITICAL_ERRORS=$((CRITICAL_ERRORS + 1)); }
die() { echo -e "\n🛑 FATAL ERROR: $1" >&2; exit 1; }

echo "======================================================================"
echo "🚀 PDH SMART HEALTH CHECK — PRODUCTION GO-LIVE RUNNER"
echo "======================================================================"
echo "Timestamp:    $(date -u +"%Y-%m-%dT%H:%M:%SZ")"
echo "Stage:        ${STAGE^^}"
echo "Target Host:  187.52.117.39 | Service: $PROD_SERVICE"
echo "----------------------------------------------------------------------"

if [[ "$STAGE" != "prepare" && "$STAGE" != "apply" ]]; then
  echo -e "Usage:"
  echo -e "  PREPARE stage (Read-only, Backup, Dry-run manifest generation):"
  echo -e "    bash scripts/run-production-deploy.sh prepare [BRANCH] [COMMIT] [--promote-approved-prices]"
  echo -e ""
  echo -e "  APPLY stage (Atomic transactional deployment with manifest gate):"
  echo -e "    bash scripts/run-production-deploy.sh apply [BRANCH] [COMMIT] --manifest-checksum=<SHA256> [--promote-approved-prices]"
  die "Invalid stage '$STAGE'. Must be 'prepare' or 'apply'."
fi

cd "$SOURCE_DIR" || die "Cannot access source directory: $SOURCE_DIR"
exec 9>"$(dirname "$STATE_FILE")/promotion-runner.lock"
flock -n 9 || die "Another production PREPARE/APPLY is running"

# Common Pre-Checks
if [[ -f "$PROD_ENV_FILE" ]]; then
  PROD_PERMS=$(stat -c %a "$PROD_ENV_FILE" 2>/dev/null || stat -f %Op "$PROD_ENV_FILE" 2>/dev/null || echo "600")
  if [[ "$PROD_PERMS" != "600" ]]; then
    die "Security violation: Production .env permissions are $PROD_PERMS; must be strictly 600"
  fi
  DB_TARGET=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' | sed -E 's/.*\/([^?]+)(\?.*)?$/\1/')
  if [[ "$DB_TARGET" != "pdh_healthcheck" ]]; then
    die "CRITICAL CONFIG ERROR: Production DATABASE_URL points to '$DB_TARGET'; expected: pdh_healthcheck. Aborting."
  fi
  log_pass "Production database target verified: '$DB_TARGET'"
fi

# Resolve Target Commit
[[ -z "$(git status --porcelain)" ]] || die "Source checkout has local changes; use a clean checkout."
[[ "$TARGET_COMMIT" =~ ^[a-f0-9]{40}$ ]] || die "An explicit reviewed full 40-character commit is required."
git fetch origin "$TARGET_BRANCH" || die "Cannot fetch reviewed branch"
if [[ -z "$TARGET_COMMIT" ]]; then
  TARGET_COMMIT=$(git rev-parse "origin/$TARGET_BRANCH" 2>/dev/null || git rev-parse HEAD)
else
  TARGET_COMMIT=$(git rev-parse "$TARGET_COMMIT")
fi
[[ "$(git rev-parse "origin/$TARGET_BRANCH")" == "$TARGET_COMMIT" ]] || die "Selected commit must be the fetched branch tip"
[[ "$(git branch --show-current)" == "$TARGET_BRANCH" ]] || die "Source checkout must be on the requested branch; switch it explicitly before PREPARE/APPLY"
ACTUAL_COMMIT=$(git rev-parse HEAD)
[[ "$ACTUAL_COMMIT" == "$TARGET_COMMIT" ]] || die "Checkout SHA mismatch"
log_pass "Source checkout verified at commit: $ACTUAL_COMMIT"

# Migration Digest Fail-Closed Check
log_info "Independently verifying migration digest from Git archive..."
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

# ==============================================================================
# STAGE 1: PREPARE (Read-only, Backup, Dry-run manifest generation)
# ==============================================================================
if [[ "$STAGE" == "prepare" ]]; then
  echo -e "\n[PREPARE 1/4] Baseline State Recording..."
  STAGING_ACTIVE_BEFORE=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
  STAGING_PID_BEFORE=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
  log_pass "Staging baseline captured: PID $STAGING_PID_BEFORE ($STAGING_ACTIVE_BEFORE)"

  PROD_ACTIVE_BEFORE=$(systemctl is-active "$PROD_SERVICE" 2>/dev/null || echo "unknown")
  PROD_PID_BEFORE=$(systemctl show "$PROD_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
  log_pass "Production baseline captured: PID $PROD_PID_BEFORE ($PROD_ACTIVE_BEFORE)"

  echo -e "\n[PREPARE 2/4] Generating Verified Production Pre-Deployment Backup..."
  mkdir -p "$BACKUP_DIR"
  chmod 700 "$BACKUP_DIR"
  PRE_DEPLOY_BACKUP="$BACKUP_DIR/pre-golive-$(date -u +%Y%m%dT%H%M%S).sql.gz"

  if [[ -f "/var/www/pdhcheckup/shared/production/backup.cnf" ]]; then
    mysqldump --defaults-extra-file="/var/www/pdhcheckup/shared/production/backup.cnf" \
      --host=127.0.0.1 --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF \
      pdh_healthcheck | gzip > "$PRE_DEPLOY_BACKUP"
    chmod 600 "$PRE_DEPLOY_BACKUP"
    gzip -t "$PRE_DEPLOY_BACKUP" || die "Corrupt backup file generated: $PRE_DEPLOY_BACKUP"
    PRE_BACKUP_SHA256=$(sha256sum "$PRE_DEPLOY_BACKUP" | cut -d' ' -f1)
    echo "$PRE_BACKUP_SHA256  $(basename "$PRE_DEPLOY_BACKUP")" > "$PRE_DEPLOY_BACKUP.sha256"
    log_pass "Verified Production backup created: $PRE_DEPLOY_BACKUP"
    log_info "Backup SHA-256: $PRE_BACKUP_SHA256"
  else
    die "Dedicated backup.cnf is mandatory; PREPARE cannot succeed without a physical backup."
    PRE_BACKUP_SHA256="none"
  fi

  echo -e "\n[PREPARE 3/4] Running Configuration Promotion Dry-Run (Read-Only)..."
  mkdir -p "$(dirname "$MANIFEST_FILE")"
  
  PROMOTION_ARGS=("--dry-run" "--manifest-file=$MANIFEST_FILE")
  if [[ "$PROMOTE_APPROVED_PRICES" == "true" ]]; then
    PROMOTION_ARGS+=("--promote-approved-prices")
  fi

  SOURCE_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" 2>/dev/null | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' || echo "${STAGING_DATABASE_URL:-}") \
  TARGET_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" 2>/dev/null | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' || echo "${DATABASE_URL:-}") \
  npx tsx scripts/promote-config-data.ts "${PROMOTION_ARGS[@]}"

  # Extract Manifest Checksum
  CALCULATED_MANIFEST_CHECKSUM=$(sha256sum "$MANIFEST_FILE" | cut -d' ' -f1)

  # Save prepare state for Apply gate validation
  cat <<EOF > "$STATE_FILE"
PREPARE_COMMIT="$ACTUAL_COMMIT"
PREPARE_DIGEST="$CALCULATED_DIGEST"
PREPARE_BACKUP="$PRE_DEPLOY_BACKUP"
PREPARE_BACKUP_SHA256="$PRE_BACKUP_SHA256"
MANIFEST_FILE="$MANIFEST_FILE"
PREPARE_MANIFEST_CHECKSUM="$CALCULATED_MANIFEST_CHECKSUM"
PREPARE_PROMOTE_APPROVED_PRICES="$PROMOTE_APPROVED_PRICES"
STAGING_PID_BASELINE="$STAGING_PID_BEFORE"
EOF
  chmod 600 "$STATE_FILE"

  echo -e "\n[PREPARE 4/4] Validation Summary & Stop Gate..."
  echo "======================================================================"
  echo "✔ PREPARE STAGE COMPLETED SUCCESSFULLY. ZERO PRODUCTION WRITES PERFORMED."
  echo "======================================================================"
  echo "Release Commit SHA:      $ACTUAL_COMMIT"
  echo "Migration Digest:        $CALCULATED_DIGEST"
  echo "Production Backup:       $PRE_DEPLOY_BACKUP"
  echo "Backup SHA-256:          $PRE_BACKUP_SHA256"
  echo "Manifest File:           $MANIFEST_FILE"
  echo "Manifest SHA-256:        $CALCULATED_MANIFEST_CHECKSUM"
  echo "Promote Approved Prices: $PROMOTE_APPROVED_PRICES"
  echo "----------------------------------------------------------------------"
  echo "Review the manifest above and verify that all proposed changes match"
  echo "official hospital policy. To proceed with the actual deployment,"
  echo "the operator must explicitly approve and run the APPLY command:"
  echo ""
  PRICE_FLAG=""
  if [[ "$PROMOTE_APPROVED_PRICES" == "true" ]]; then
    PRICE_FLAG=" --promote-approved-prices"
  fi
  echo -e "  bash scripts/run-production-deploy.sh apply $TARGET_BRANCH $ACTUAL_COMMIT --manifest-checksum=$CALCULATED_MANIFEST_CHECKSUM$PRICE_FLAG"
  echo ""
  exit 0
fi

# ==============================================================================
# STAGE 2: APPLY (Atomic transactional deployment with manifest gate)
# ==============================================================================
echo -e "\n[APPLY 1/5] Validating Operator Authorization & Integrity Gates..."

if [[ -z "$CLI_MANIFEST_CHECKSUM" ]]; then
  die "APPLY stage requires --manifest-checksum=<SHA256> generated during PREPARE."
fi

if [[ ! -f "$STATE_FILE" ]]; then
  die "Prepare state file not found ($STATE_FILE). Run PREPARE stage first."
fi

# Source prepare state
# shellcheck source=/dev/null
source "$STATE_FILE"

[[ "$PREPARE_DIGEST" == "$CALCULATED_DIGEST" ]] || die "Migration digest changed since PREPARE"
[[ "$PREPARE_PROMOTE_APPROVED_PRICES" == "$PROMOTE_APPROVED_PRICES" ]] || die "Price promotion option differs from PREPARE"

if [[ "$ACTUAL_COMMIT" != "$PREPARE_COMMIT" ]]; then
  die "COMMIT MISMATCH: Checkout commit ($ACTUAL_COMMIT) does not match PREPARE commit ($PREPARE_COMMIT)."
fi

if [[ "$CLI_MANIFEST_CHECKSUM" != "$PREPARE_MANIFEST_CHECKSUM" ]]; then
  die "CHECKSUM MISMATCH: Provided checksum ($CLI_MANIFEST_CHECKSUM) does not match PREPARE checksum ($PREPARE_MANIFEST_CHECKSUM)."
fi

CURRENT_MANIFEST_CHECKSUM=$(sha256sum "$MANIFEST_FILE" | cut -d' ' -f1)
if [[ "$CURRENT_MANIFEST_CHECKSUM" != "$PREPARE_MANIFEST_CHECKSUM" ]]; then
  die "TAMPER DETECTED: Manifest file has been modified since PREPARE! ($CURRENT_MANIFEST_CHECKSUM != $PREPARE_MANIFEST_CHECKSUM)"
fi
log_pass "Operator approval and manifest checksum matched: $CLI_MANIFEST_CHECKSUM"

# Verify Backup Integrity Before Apply
if [[ "$PREPARE_BACKUP" != "none" && -s "$PREPARE_BACKUP" && -s "$PREPARE_BACKUP.sha256" ]]; then
  gzip -t "$PREPARE_BACKUP" || die "Backup archive is corrupt"
  (cd "$(dirname "$PREPARE_BACKUP")" && sha256sum -c "$PREPARE_BACKUP.sha256" --status) || die "Pre-deployment backup verification failed!"
  BACKUP_SHA256=$(sha256sum "$PREPARE_BACKUP" | cut -d' ' -f1)
  [[ -n "${RESTORE_VERIFICATION_FILE:-}" ]] || die "An isolated restore verification receipt is required."
  node scripts/verify-promotion-restore.mjs \
    "--check-receipt=$RESTORE_VERIFICATION_FILE" "--backup-sha=$BACKUP_SHA256" \
    "--manifest-checksum=$CLI_MANIFEST_CHECKSUM" "--commit=$ACTUAL_COMMIT" || die "Restore verification receipt rejected"
  log_pass "Pre-deployment backup integrity verified."
else
  die "Verified PREPARE backup and checksum are mandatory before APPLY."
fi

echo -e "\n[APPLY 2/5] Building and Deploying Production Release..."
export APPROVED_MIGRATIONS_SHA256="$APPROVED_MIGRATION_DIGEST"
bash deploy/production/deploy.sh "$TARGET_BRANCH" "$ACTUAL_COMMIT"

if sudo systemctl is-active --quiet "$PROD_SERVICE"; then
  log_pass "Service $PROD_SERVICE is active and operational."
else
  die "Production service failed to activate! Review: journalctl -u $PROD_SERVICE -n 50"
fi

echo -e "\n[APPLY 3/5] Applying Configuration Promotion Transactionally..."
PROMOTION_ARGS=("--apply" "--manifest-file=$MANIFEST_FILE" "--manifest-checksum=$CLI_MANIFEST_CHECKSUM")
if [[ "$PROMOTE_APPROVED_PRICES" == "true" ]]; then
  PROMOTION_ARGS+=("--promote-approved-prices")
fi

SOURCE_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$STAGING_ENV_FILE" 2>/dev/null | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' || echo "${STAGING_DATABASE_URL:-}") \
TARGET_DATABASE_URL=$(grep -E '^DATABASE_URL=' "$PROD_ENV_FILE" 2>/dev/null | sed -E 's/^DATABASE_URL=["'\'']?//; s/["'\'']?$//' || echo "${DATABASE_URL:-}") \
npx tsx scripts/promote-config-data.ts "${PROMOTION_ARGS[@]}"
log_pass "Configuration data promoted successfully into Production."

echo -e "\n[APPLY 4/5] Production Endpoint & Health Verification..."

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

verify_endpoint "/api/v1/health" "200" "Public Health Endpoint" || die "Health check failed"
verify_endpoint "/api/v1/readiness" "200" "Readiness & DB Connectivity" || die "Readiness check failed"
verify_endpoint "/api/v1/packages" "200" "Packages API" || die "Packages API failed"
verify_endpoint "/api/v1/slots" "200" "Appointment Slots API" || die "Slots API failed"

echo -e "\n[APPLY 5/5] Verifying Staging Isolation..."
STAGING_ACTIVE_AFTER=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
STAGING_PID_AFTER=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")

if [[ "${STAGING_PID_BASELINE:-0}" != "0" ]]; then
  if [[ "$STAGING_ACTIVE_AFTER" == "active" && "$STAGING_PID_BASELINE" == "$STAGING_PID_AFTER" ]]; then
    log_pass "Staging service was 100% UNTOUCHED (PID $STAGING_PID_AFTER unchanged)."
  else
    log_warn "Staging service PID changed ($STAGING_PID_BASELINE -> $STAGING_PID_AFTER)."
  fi
fi

# Clean up state file after successful apply
rm -f "$STATE_FILE"

echo -e "\n======================================================================"
echo "📊 PRODUCTION GO-LIVE COMPLETED SUCCESSFULLY"
echo "======================================================================"
echo "Release Commit:      $ACTUAL_COMMIT"
echo "Migration Digest:    $CALCULATED_DIGEST"
echo "Manifest Checksum:   $CLI_MANIFEST_CHECKSUM"
echo "Production Service:  $PROD_SERVICE (Active)"
echo "Production URL:      $PROD_BASE"
echo "Critical Errors:     $CRITICAL_ERRORS"
echo "Warnings:            $WARNINGS"
echo "----------------------------------------------------------------------"
echo -e "🟢 FINAL VERDICT: GO (PRODUCTION IS LIVE & OPERATIONAL)\n"
exit 0
