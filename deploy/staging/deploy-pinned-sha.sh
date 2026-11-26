#!/usr/bin/env bash
set -Eeuo pipefail

# PDH Smart Health Check — Staging-Only Pinned-SHA Deployment
# Safety:
# - Operates exclusively on DEPLOY_ENV=staging (port 3037, pdh_healthcheck_staging)
# - Never mutates /var/www/pdhcheckup/source (uses isolated bare cache + git archive)
# - Never runs UAT auto-seeding or publishes clinical questionnaires
# - Never touches Production services, release symlinks, .env secrets, or databases

export DEPLOY_ENV=staging

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_TOOLS="$(cd -- "$SCRIPT_DIR/../shared" && pwd)"
# shellcheck source=../shared/common.sh
source "$SHARED_TOOLS/common.sh"

[[ ${DEPLOY_ENV:-} == staging ]] || die "Refusing to run: DEPLOY_ENV must be staging"

PREFLIGHT_ONLY=false
if [[ ${1:-} == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=true
  shift
fi

[[ $# == 2 ]] || die "Usage: APPROVED_MIGRATIONS_SHA256=<64-hex> bash deploy/staging/deploy-pinned-sha.sh [--preflight-only] BRANCH FULL_COMMIT_SHA"
BRANCH=$1
SHA=$2

[[ $SHA =~ ^[a-f0-9]{40}$ ]] || die "Use a full 40-character lowercase commit SHA"
[[ ${APPROVED_MIGRATIONS_SHA256:-} =~ ^[a-f0-9]{64}$ ]] || die "APPROVED_MIGRATIONS_SHA256 (64 lowercase hex chars) is required"
git check-ref-format --branch "$BRANCH" >/dev/null || die "Invalid branch format"
[[ $BRANCH != -* ]] || die "Invalid branch"

lock_environment
require_env

# Verify staging APP_URL and DB isolation independently from protected staging env
STAGING_APP_URL=$(with_env node -e 'console.log(process.env.APP_URL || "")')
STAGING_DB_CHECK=$(with_env node -e 'const u = new URL(process.env.DATABASE_URL || ""); console.log(`${u.hostname}:${u.pathname.slice(1)}:${decodeURIComponent(u.username)}`)')
[[ $STAGING_DB_CHECK == "127.0.0.1:pdh_healthcheck_staging:pdhcheckup_stg" || $STAGING_DB_CHECK == "localhost:pdh_healthcheck_staging:pdhcheckup_stg" ]] || die "Staging DB isolation check failed: $STAGING_DB_CHECK"
[[ $STAGING_APP_URL == https://* && $STAGING_APP_URL != "https://pdhcheckup.pluakdaenghospital.cloud"* ]] || die "Staging APP_URL isolation check failed: $STAGING_APP_URL"

# Capture Production baseline before any operation (read-only)
PROD_SERVICE="pdhcheckup-production.service"
PROD_ENV_FILE="$BASE/shared/production/.env"
PROD_ACTIVE_BEFORE=$(systemctl is-active "$PROD_SERVICE" 2>/dev/null || echo "unknown")
PROD_PID_BEFORE=$(systemctl show "$PROD_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
PROD_ENTER_BEFORE=$(systemctl show "$PROD_SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null || echo "unknown")
PROD_CURRENT_BEFORE=$(readlink -f "$BASE/releases/production/current" 2>/dev/null || echo "none")
PROD_ENV_SHA_BEFORE="missing"
if [[ -f $PROD_ENV_FILE ]]; then
  PROD_ENV_SHA_BEFORE=$(sha256sum "$PROD_ENV_FILE" | cut -d' ' -f1)
fi

# Capture existing development/source checkout baseline before any operation
SOURCE_HEAD_BEFORE="none"
SOURCE_STATUS_BEFORE="none"
if [[ -d $SOURCE/.git ]]; then
  SOURCE_HEAD_BEFORE=$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo "unknown")
  SOURCE_STATUS_BEFORE=$(git -C "$SOURCE" status --porcelain 2>/dev/null || echo "unknown")
fi

# Use an isolated bare repository cache inside staging releases so the existing checkout is untouched
GIT_CACHE="$RELEASES/.git-cache"
REMOTE_URL="${STAGING_REPO_URL:-}"
if [[ -z $REMOTE_URL && -d $SOURCE/.git ]]; then
  REMOTE_URL=$(git -C "$SOURCE" remote get-url origin 2>/dev/null || echo "")
fi
if [[ -z $REMOTE_URL ]]; then
  REMOTE_URL="https://github.com/pharmacisttom/pdhcheckupweb.git"
fi

if [[ ! -d $GIT_CACHE ]]; then
  git init --bare "$GIT_CACHE" >/dev/null
  git -C "$GIT_CACHE" remote add origin "$REMOTE_URL"
else
  git -C "$GIT_CACHE" remote set-url origin "$REMOTE_URL"
fi

git -C "$GIT_CACHE" fetch --prune origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git -C "$GIT_CACHE" cat-file -e "${SHA}^{commit}" || die "Pinned SHA $SHA not found in fetched branch $BRANCH"
git -C "$GIT_CACHE" merge-base --is-ancestor "$SHA" "refs/remotes/origin/$BRANCH" || die "Pinned SHA $SHA is not an ancestor of origin/$BRANCH"

# Verify migration SQL digest directly from the pinned commit archive (fail-closed)
MIG_TMP=$(mktemp -d)
trap 'rm -rf -- "$MIG_TMP"' EXIT
git -C "$GIT_CACHE" archive "$SHA" prisma/migrations | tar -x -C "$MIG_TMP"
CALCULATED_DIGEST=$(cd "$MIG_TMP" && find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
rm -rf -- "$MIG_TMP"
[[ $CALCULATED_DIGEST == "$APPROVED_MIGRATIONS_SHA256" ]] || die "Migration digest mismatch: got $CALCULATED_DIGEST, expected $APPROVED_MIGRATIONS_SHA256"

# Verify live Staging DB identity and Nginx/systemd status (read-only)
STAGING_ACTIVE_BEFORE=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown")
STAGING_CURRENT_BEFORE=$(readlink -f "$RELEASES/current" 2>/dev/null || echo "none")
STAGING_PREV_BEFORE=$(readlink -f "$RELEASES/previous" 2>/dev/null || echo "none")
LATEST_BACKUP=$(find "$BASE/shared/staging/backups" -maxdepth 1 -type f -name '*.sql.gz' 2>/dev/null | sort -r | head -n1 || true)
[[ -n $LATEST_BACKUP ]] || LATEST_BACKUP="none"
NGINX_CHECK="skipped"
if command -v nginx >/dev/null 2>&1; then
  if nginx -t >/dev/null 2>&1; then
    NGINX_CHECK="ok"
  else
    NGINX_CHECK="warn"
  fi
fi

echo "=== STAGING PINNED-SHA PREFLIGHT ==="
echo "Branch:              $BRANCH"
echo "Pinned SHA:          $SHA"
echo "Migration Digest:    $CALCULATED_DIGEST"
echo "Staging URL:         $STAGING_APP_URL"
echo "Staging DB Check:    $STAGING_DB_CHECK"
echo "Staging Service:     $SERVICE ($STAGING_ACTIVE_BEFORE)"
echo "Staging Current:     $STAGING_CURRENT_BEFORE"
echo "Staging Previous:    $STAGING_PREV_BEFORE"
echo "Latest Backup:       $LATEST_BACKUP"
echo "Nginx Config Check:  $NGINX_CHECK"
echo "Prod Baseline:       $PROD_SERVICE ($PROD_ACTIVE_BEFORE, PID=$PROD_PID_BEFORE, Release=$PROD_CURRENT_BEFORE)"
echo "Source Baseline:     HEAD=$SOURCE_HEAD_BEFORE"

if [[ $PREFLIGHT_ONLY == true ]]; then
  echo "Preflight-only mode completed cleanly with zero mutations."
  exit 0
fi

# Extract pinned commit into a fresh immutable release directory
RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%S)-$SHA"
mkdir "$RELEASE"
git -C "$GIT_CACHE" archive "$SHA" | tar -x -C "$RELEASE"
cd "$RELEASE"

diff -qr "$SHARED_TOOLS" "$RELEASE/deploy/shared" >/dev/null || die "Shared deployment tooling differs from pinned commit $SHA"
TOOLS="$RELEASE/deploy/shared"

ln -s "$ENV_FILE" .env
npm ci --include=dev
with_env npx prisma generate
with_env npm run typecheck
with_env npm run lint
RUN_DB_TESTS=false with_env npm run test:unit
with_env npm run build

mkdir runtime
cp -a .next/standalone/. runtime/
mkdir -p runtime/.next
cp -a .next/static runtime/.next/static
cp -a public runtime/public
# Never place environment secrets inside the runtime artifact
rm -f -- runtime/.env runtime/.env.production runtime/.env.local runtime/.env.staging
printf '%s\n' "$SHA" > REVISION

# Mandatory staging-only backup before applying migrations (no seeding, no questionnaire publishing)
bash "$TOOLS/backup.sh"
with_env npx prisma migrate deploy

PREVIOUS=""
if [[ -L $RELEASES/current ]]; then
  PREVIOUS=$(readlink -e "$RELEASES/current")
elif [[ -e $RELEASES/current ]]; then
  die "Current must be a release symlink"
fi
[[ -z $PREVIOUS || $PREVIOUS == "$RELEASES/"* ]] || die "Current release resolves outside staging releases"

if [[ -n $PREVIOUS ]]; then
  ln -s "$PREVIOUS" "$RELEASES/previous.next"
  mv -Tf "$RELEASES/previous.next" "$RELEASES/previous"
fi

ln -s "$RELEASE" "$RELEASES/current.next"
mv -Tf "$RELEASES/current.next" "$RELEASES/current"

if ! sudo systemctl restart "$SERVICE" || ! bash "$TOOLS/healthcheck.sh"; then
  echo "Staging activation or loopback healthcheck failed. Previous release preserved at: ${PREVIOUS:-none}" >&2
  echo "Review schema compatibility, then rollback with: SCHEMA_COMPATIBILITY_REVIEWED=true bash deploy/staging/rollback.sh $(basename -- "${PREVIOUS:-PREVIOUS_RELEASE_ID}")" >&2
  exit 1
fi

# Verify external HTTPS staging endpoint health
curl --fail --silent --max-time 10 "$STAGING_APP_URL/api/v1/health" | node -e '
  let s = "";
  process.stdin.on("data", d => s += d).on("end", () => {
    const v = JSON.parse(s).data;
    if (v?.status !== "ok" || v?.database !== true) process.exit(1);
    console.log("External HTTPS health:", JSON.stringify(v));
  });
' || die "External HTTPS staging health check failed for $STAGING_APP_URL"

# Verify active release REVISION matches pinned SHA
ACTIVE_SHA=$(cat "$RELEASES/current/REVISION")
[[ $ACTIVE_SHA == "$SHA" ]] || die "Active REVISION mismatch: $ACTIVE_SHA != $SHA"

# Post-deploy check: prove Production and existing source checkout were completely untouched
PROD_ACTIVE_AFTER=$(systemctl is-active "$PROD_SERVICE" 2>/dev/null || echo "unknown")
PROD_PID_AFTER=$(systemctl show "$PROD_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
PROD_ENTER_AFTER=$(systemctl show "$PROD_SERVICE" -p ActiveEnterTimestamp --value 2>/dev/null || echo "unknown")
PROD_CURRENT_AFTER=$(readlink -f "$BASE/releases/production/current" 2>/dev/null || echo "none")
PROD_ENV_SHA_AFTER="missing"
if [[ -f $PROD_ENV_FILE ]]; then
  PROD_ENV_SHA_AFTER=$(sha256sum "$PROD_ENV_FILE" | cut -d' ' -f1)
fi

[[ $PROD_ACTIVE_AFTER == "$PROD_ACTIVE_BEFORE" ]] || die "Production service state changed unexpectedly"
[[ $PROD_PID_AFTER == "$PROD_PID_BEFORE" ]] || die "Production service PID changed unexpectedly"
[[ $PROD_ENTER_AFTER == "$PROD_ENTER_BEFORE" ]] || die "Production service timestamp changed unexpectedly"
[[ $PROD_CURRENT_AFTER == "$PROD_CURRENT_BEFORE" ]] || die "Production release symlink changed unexpectedly"
[[ $PROD_ENV_SHA_AFTER == "$PROD_ENV_SHA_BEFORE" ]] || die "Production .env checksum changed unexpectedly"

if [[ -d $SOURCE/.git ]]; then
  SOURCE_HEAD_AFTER=$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo "unknown")
  SOURCE_STATUS_AFTER=$(git -C "$SOURCE" status --porcelain 2>/dev/null || echo "unknown")
  [[ $SOURCE_HEAD_AFTER == "$SOURCE_HEAD_BEFORE" && $SOURCE_STATUS_AFTER == "$SOURCE_STATUS_BEFORE" ]] || die "Shared source checkout changed unexpectedly"
fi

echo "Activated staging commit $SHA at $RELEASE (previous preserved at ${PREVIOUS:-none}). Production unchanged."
