#!/usr/bin/env bash
set -Eeuo pipefail

# PDH Smart Health Check — Production Legacy-Compatible Pinned-SHA Cutover
# Safety Guarantees:
# - Operates exclusively on DEPLOY_ENV=production (127.0.0.1:3036, pdh_healthcheck)
# - Preserves legacy runtime (e.g. /var/www/pdhcheckup/releases/rc01-e75f4d9) untouched
# - Never mutates /var/www/pdhcheckup/source (uses isolated bare cache + git archive)
# - Never runs seed, db reset, or destructive SQL
# - Never restores Production DB automatically on failure (application-only rollback)

export DEPLOY_ENV=production

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_TOOLS="$(cd -- "$SCRIPT_DIR/../shared" && pwd)"
source "$SHARED_TOOLS/common.sh"
TOOLS="$SHARED_TOOLS"

[[ ${DEPLOY_ENV:-} == production ]] || die "Refusing to run: DEPLOY_ENV must be production"

PREFLIGHT_ONLY=false
if [[ ${1:-} == "--preflight-only" ]]; then
  PREFLIGHT_ONLY=true
  shift
fi

[[ $# == 2 ]] || die "Usage: APPROVED_MIGRATIONS_SHA256=<64-hex> [CONFIRM_PRODUCTION_CUTOVER=pdh_healthcheck] bash deploy/production/cutover-legacy-pinned-sha.sh [--preflight-only] BRANCH FULL_COMMIT_SHA"
BRANCH=$1
SHA=$2

[[ $SHA =~ ^[a-f0-9]{40}$ ]] || die "Use a full 40-character lowercase commit SHA"
[[ ${APPROVED_MIGRATIONS_SHA256:-} =~ ^[a-f0-9]{64}$ ]] || die "APPROVED_MIGRATIONS_SHA256 (64 lowercase hex chars) is required"
git check-ref-format --branch "$BRANCH" >/dev/null || die "Invalid branch format"
[[ $BRANCH != -* ]] || die "Invalid branch"

if [[ $PREFLIGHT_ONLY == false && ${CONFIRM_PRODUCTION_CUTOVER:-} != "pdh_healthcheck" ]]; then
  die "Production cutover requires CONFIRM_PRODUCTION_CUTOVER=pdh_healthcheck after review (or pass --preflight-only)"
fi

lock_environment
require_env

TMP_WORK=$(mktemp -d)
chmod 700 "$TMP_WORK"
trap 'rm -rf -- "$TMP_WORK"' EXIT

# Verify Production APP_URL and DB isolation from protected environment file (values withheld)
PROD_APP_URL=$(with_env node -e 'console.log(process.env.APP_URL || "")')
PROD_DB_CHECK=$(with_env node -e 'const u = new URL(process.env.DATABASE_URL || ""); console.log(`${u.hostname}:${u.pathname.slice(1)}:${decodeURIComponent(u.username)}`)')
[[ $PROD_DB_CHECK == "127.0.0.1:pdh_healthcheck:pdhcheckup_prod" || $PROD_DB_CHECK == "localhost:pdh_healthcheck:pdhcheckup_prod" ]] || die "Production DB isolation check failed"
[[ $PROD_APP_URL == "https://pdhcheckup.pluakdaenghospital.cloud" ]] || die "Production APP_URL isolation check failed"

PROD_ENV_SHA_BEFORE=$(sha256sum "$ENV_FILE" | cut -d' ' -f1)

# Capture Staging baseline to prove zero cross-environment impact
STAGING_SERVICE="pdhcheckup-staging.service"
STAGING_ACTIVE_BEFORE=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
STAGING_PID_BEFORE=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
STAGING_CURRENT_BEFORE=$(readlink -f "$BASE/releases/staging/current" 2>/dev/null || echo "none")

# Capture existing source checkout baseline (never modified by this script)
SOURCE_HEAD_BEFORE="none"
SOURCE_STATUS_BEFORE="none"
if [[ -d $SOURCE/.git ]]; then
  SOURCE_HEAD_BEFORE=$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo "unknown")
  SOURCE_STATUS_BEFORE=$(git -C "$SOURCE" status --porcelain 2>/dev/null || echo "unknown")
fi

# Inspect live Production systemd unit configuration
UNIT_PATH=$(systemctl show "$SERVICE" -p FragmentPath --value 2>/dev/null || true)
[[ -n $UNIT_PATH && -f $UNIT_PATH ]] || UNIT_PATH="/etc/systemd/system/$SERVICE"
[[ -f $UNIT_PATH ]] || die "Cannot locate systemd unit file for $SERVICE"
PROD_ACTIVE_BEFORE=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown")
PROD_PID_BEFORE=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "0")
PROD_WORKDIR_BEFORE=$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "unknown")
PROD_EXEC_BEFORE=$(systemctl show "$SERVICE" -p ExecStart --value 2>/dev/null || echo "unknown")
LEGACY_RUNTIME="${LEGACY_RUNTIME_DIR:-$BASE/releases/rc01-e75f4d9}"
[[ -d $LEGACY_RUNTIME ]] || LEGACY_RUNTIME="$PROD_WORKDIR_BEFORE"

# Isolated bare repository cache (never mutates /var/www/pdhcheckup/source)
GIT_CACHE="$RELEASES/.git-cache"
REMOTE_URL="${PROD_REPO_URL:-}"
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

# Extract migrations from pinned commit archive and verify aggregate digest + per-file checksums
MIG_TMP="$TMP_WORK/migrations"
mkdir -p "$MIG_TMP"
git -C "$GIT_CACHE" archive "$SHA" prisma/migrations | tar -x -C "$MIG_TMP"
CALCULATED_DIGEST=$(cd "$MIG_TMP" && find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
[[ $CALCULATED_DIGEST == "$APPROVED_MIGRATIONS_SHA256" ]] || die "Migration digest mismatch: got $CALCULATED_DIGEST, expected $APPROVED_MIGRATIONS_SHA256"

# Create temporary mode-600 MySQL option file inside TMP_WORK from protected .env (never logged)
write_db_cnf() {
  local cnf_path="$1"
  with_env node -e '
    const fs = require("node:fs");
    const u = new URL(process.env.DATABASE_URL);
    const lines = [
      "[client]",
      `host=${u.hostname}`,
      `port=${u.port || "3306"}`,
      `user=${decodeURIComponent(u.username)}`,
      `password=${decodeURIComponent(u.password)}`,
      `database=${u.pathname.slice(1)}`,
    ];
    fs.writeFileSync(process.argv[1], lines.join("\n") + "\n", { mode: 0o600 });
  ' "$cnf_path"
  chmod 600 "$cnf_path"
}

verify_production_db_state() {
  local cnf_path="$TMP_WORK/db-check.cnf"
  write_db_cnf "$cnf_path"

  local db_identity
  db_identity=$(mysql --defaults-extra-file="$cnf_path" --protocol=TCP --batch --skip-column-names \
    -e "SELECT CONCAT(CURRENT_USER(), '|', DATABASE());")
  local db_user="${db_identity%%|*}"
  local db_name="${db_identity##*|}"
  [[ $db_name == "pdh_healthcheck" ]] || die "DB identity check failed: got $db_name"
  [[ $db_user == pdhcheckup_prod@* ]] || die "DB user check failed: got $db_user"

  local counts
  counts=$(mysql --defaults-extra-file="$cnf_path" --protocol=TCP --batch --skip-column-names \
    -e "SELECT CONCAT(
      SUM(finished_at IS NOT NULL AND rolled_back_at IS NULL), '|',
      SUM(finished_at IS NULL OR rolled_back_at IS NOT NULL)
    ) FROM _prisma_migrations;")
  local applied="${counts%%|*}"
  local failed="${counts##*|}"
  [[ $applied == "14" && $failed == "0" ]] || die "Migration state mismatch: applied=$applied failed=$failed (expected 14|0)"

  local db_checksums="$TMP_WORK/db_checksums.txt"
  local git_checksums="$TMP_WORK/git_checksums.txt"
  mysql --defaults-extra-file="$cnf_path" --protocol=TCP --batch --skip-column-names \
    -e "SELECT migration_name, checksum FROM _prisma_migrations WHERE finished_at IS NOT NULL AND rolled_back_at IS NULL ORDER BY migration_name;" \
    > "$db_checksums"

  : > "$git_checksums"
  while IFS= read -r mig_file; do
    local mig_name
    mig_name=$(basename "$(dirname "$mig_file")")
    local mig_sum
    mig_sum=$(sha256sum "$mig_file" | cut -d' ' -f1)
    printf '%s\t%s\n' "$mig_name" "$mig_sum" >> "$git_checksums"
  done < <(find "$MIG_TMP/prisma/migrations" -type f -name migration.sql | sort)

  diff -u "$git_checksums" "$db_checksums" >/dev/null || die "Production _prisma_migrations checksums do not match pinned SHA $SHA"
  rm -f -- "$cnf_path"
}

verify_production_db_state

echo "=== PRODUCTION LEGACY CUTOVER PREFLIGHT ==="
echo "Branch:               $BRANCH"
echo "Pinned SHA:           $SHA"
echo "Migration Digest:     $CALCULATED_DIGEST"
echo "DB Identity:          pdh_healthcheck (14/14 migrations & checksums matched, 0 failed)"
echo "Unit File:            $UNIT_PATH"
echo "Service State:        $SERVICE ($PROD_ACTIVE_BEFORE, PID=$PROD_PID_BEFORE)"
echo "Current WorkDir:      $PROD_WORKDIR_BEFORE"
echo "Legacy Runtime:       $LEGACY_RUNTIME"
echo "Production Port:      $PORT"
echo "Staging Baseline:     $STAGING_SERVICE ($STAGING_ACTIVE_BEFORE, PID=$STAGING_PID_BEFORE)"
echo "Source Baseline:      HEAD=$SOURCE_HEAD_BEFORE"

if [[ $PREFLIGHT_ONLY == true ]]; then
  echo "Preflight-only mode completed cleanly with zero mutations."
  exit 0
fi

# Create separate immutable release directory (never touches legacy runtime)
RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%S)-$SHA"
[[ ! -e $RELEASE ]] || die "Release directory already exists: $RELEASE"
mkdir -p "$RELEASE"
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

mkdir -p runtime
cp -a .next/standalone/. runtime/
mkdir -p runtime/.next
cp -a .next/static runtime/.next/static
cp -a public runtime/public
# Never copy environment files into runtime artifact
rm -f -- runtime/.env runtime/.env.production runtime/.env.local runtime/.env.staging
printf '%s\n' "$SHA" > REVISION

# Fix ownership & permissions for pdhcheckup service account
if id -u pdhcheckup >/dev/null 2>&1; then
  sudo chown -R pdhcheckup:pdhcheckup "$RELEASE"
fi
chmod -R u+rwX,g+rX,o-rwx "$RELEASE"
chmod 750 "$RELEASE" "$RELEASE/runtime" "$RELEASE/runtime/.next"

# Create and verify fresh Production DB backup before cutover
bash "$TOOLS/backup.sh"
LATEST_BACKUP=$(ls -1t "$BASE/shared/production/backups"/*.sql.gz | head -n1)
[[ -n $LATEST_BACKUP && -f "$LATEST_BACKUP.sha256" ]] || die "Production backup or sha256 sidecar missing"
gzip -t "$LATEST_BACKUP" || die "Production backup gzip integrity check failed"
(cd "$(dirname "$LATEST_BACKUP")" && sha256sum -c "$(basename "$LATEST_BACKUP").sha256") || die "Production backup sha256 verification failed"
BACKUP_SHA256=$(cut -d' ' -f1 "$LATEST_BACKUP.sha256")

# Re-verify DB identity and 14/14 migration checksums immediately before cutover (zero seed/reset/SQL writes)
verify_production_db_state

# Backup original systemd unit & previous current symlink for immediate application-only rollback
CUTOVER_TS=$(date -u +%Y%m%dT%H%M%S)
SYS_BACKUP_DIR="$BASE/shared/production/systemd-backups/$CUTOVER_TS"
mkdir -p "$SYS_BACKUP_DIR"
chmod 700 "$SYS_BACKUP_DIR"
cp -a "$UNIT_PATH" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig"
sha256sum "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" > "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig.sha256"
if [[ -d "${UNIT_PATH}.d" ]]; then
  cp -a "${UNIT_PATH}.d" "$SYS_BACKUP_DIR/dropins.orig"
fi

PREVIOUS_CURRENT=""
if [[ -L $RELEASES/current ]]; then
  PREVIOUS_CURRENT=$(readlink -e "$RELEASES/current")
elif [[ -e $RELEASES/current ]]; then
  die "$RELEASES/current exists and is not a symlink"
fi

cat > "$SYS_BACKUP_DIR/rollback-state.env" <<EOF
UNIT_PATH='$UNIT_PATH'
PREVIOUS_CURRENT='$PREVIOUS_CURRENT'
LEGACY_RUNTIME='$LEGACY_RUNTIME'
TARGET_RELEASE='$RELEASE'
TARGET_SHA='$SHA'
BACKUP_FILE='$LATEST_BACKUP'
EOF
chmod 600 "$SYS_BACKUP_DIR/rollback-state.env" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig"

rollback_application_only() {
  echo "ACTIVATION FAILED: Executing automatic application-only rollback (Production DB untouched)..." >&2
  if [[ -f "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" ]]; then
    (cd "$SYS_BACKUP_DIR" && sha256sum -c pdhcheckup-production.service.orig.sha256 >/dev/null) || true
    sudo cp -a "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$UNIT_PATH"
  fi
  if [[ -n $PREVIOUS_CURRENT ]]; then
    ln -s "$PREVIOUS_CURRENT" "$RELEASES/current.rollback"
    mv -Tf "$RELEASES/current.rollback" "$RELEASES/current"
  else
    rm -f -- "$RELEASES/current"
  fi
  sudo systemctl daemon-reload
  sudo systemctl restart "$SERVICE" || true
  bash "$TOOLS/healthcheck.sh" || echo "WARNING: Rollback healthcheck requires manual inspection" >&2
}

# Prepare updated systemd unit pointing to /var/www/pdhcheckup/releases/production/current/runtime/server.js
NODE_BIN=$(command -v node)
[[ -x $NODE_BIN ]] || die "Node binary not found"
UNIT_RENDERED="$TMP_WORK/pdhcheckup-production.service"
sed "s|^ExecStart=.*|ExecStart=$NODE_BIN server.js|" "$RELEASE/deploy/production/pdhcheckup-production.service.example" > "$UNIT_RENDERED"
chmod 644 "$UNIT_RENDERED"

# Atomic release symlink switch + systemd unit cutover
if [[ -n $PREVIOUS_CURRENT ]]; then
  ln -s "$PREVIOUS_CURRENT" "$RELEASES/previous.next"
  mv -Tf "$RELEASES/previous.next" "$RELEASES/previous"
fi
ln -s "$RELEASE" "$RELEASES/current.next"
mv -Tf "$RELEASES/current.next" "$RELEASES/current"

if ! sudo cp "$UNIT_RENDERED" "$UNIT_PATH" \
  || ! sudo systemctl daemon-reload \
  || ! sudo systemctl restart "$SERVICE" \
  || ! bash "$TOOLS/healthcheck.sh"; then
  rollback_application_only
  die "Production activation failed; original unit and legacy release restored (Production DB untouched)."
fi

# Verify runtime REVISION, listener 127.0.0.1:3036, HTTPS health, and read-only endpoint probes
ACTIVE_SHA=$(cat "$RELEASES/current/REVISION")
[[ $ACTIVE_SHA == "$SHA" ]] || { rollback_application_only; die "Active REVISION mismatch: $ACTIVE_SHA != $SHA"; }

systemctl is-active --quiet "$SERVICE" || { rollback_application_only; die "$SERVICE is not active"; }

LISTENER_OK=false
if command -v ss >/dev/null 2>&1; then
  ss -ltn | grep -q "127.0.0.1:$PORT" && LISTENER_OK=true
else
  curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null && LISTENER_OK=true
fi
[[ $LISTENER_OK == true ]] || { rollback_application_only; die "No listener verified on 127.0.0.1:$PORT"; }

HTTPS_HEALTH=$(curl --fail --silent --max-time 10 "$PROD_APP_URL/api/v1/health") || {
  rollback_application_only
  die "HTTPS health request failed for $PROD_APP_URL/api/v1/health"
}
echo "$HTTPS_HEALTH" | node -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    const v=JSON.parse(s).data;
    if(v?.status!=="ok"||v?.database!==true) process.exit(1);
  });
' || { rollback_application_only; die "HTTPS health payload invalid"; }

# Read-only endpoint & RBAC/redirect smoke probes (zero mutations)
for pub_route in /login /privacy /register /api/v1/packages /api/v1/booking-policy; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL$pub_route")
  [[ $code == "200" ]] || { rollback_application_only; die "HTTPS probe $pub_route returned HTTP $code"; }
done
admin_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/admin/dashboard")
[[ $admin_code == "302" || $admin_code == "307" ]] || { rollback_application_only; die "Unauthenticated /admin/dashboard returned HTTP $admin_code"; }
audit_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/api/v1/admin/audit")
[[ $audit_code == "401" || $audit_code == "403" ]] || { rollback_application_only; die "Unauthenticated /api/v1/admin/audit returned HTTP $audit_code"; }

# Verify invariants after cutover (zero secret/legacy/staging/source drift)
PROD_ENV_SHA_AFTER=$(sha256sum "$ENV_FILE" | cut -d' ' -f1)
[[ $PROD_ENV_SHA_AFTER == "$PROD_ENV_SHA_BEFORE" ]] || die "Production .env checksum changed unexpectedly"
[[ -d $LEGACY_RUNTIME ]] || die "Legacy runtime directory missing after cutover"

STAGING_ACTIVE_AFTER=$(systemctl is-active "$STAGING_SERVICE" 2>/dev/null || echo "unknown")
STAGING_PID_AFTER=$(systemctl show "$STAGING_SERVICE" -p MainPID --value 2>/dev/null || echo "0")
STAGING_CURRENT_AFTER=$(readlink -f "$BASE/releases/staging/current" 2>/dev/null || echo "none")
[[ $STAGING_ACTIVE_AFTER == "$STAGING_ACTIVE_BEFORE" && $STAGING_PID_AFTER == "$STAGING_PID_BEFORE" && $STAGING_CURRENT_AFTER == "$STAGING_CURRENT_BEFORE" ]] || die "Staging baseline changed unexpectedly"

if [[ -d $SOURCE/.git ]]; then
  SOURCE_HEAD_AFTER=$(git -C "$SOURCE" rev-parse HEAD 2>/dev/null || echo "unknown")
  SOURCE_STATUS_AFTER=$(git -C "$SOURCE" status --porcelain 2>/dev/null || echo "unknown")
  [[ $SOURCE_HEAD_AFTER == "$SOURCE_HEAD_BEFORE" && $SOURCE_STATUS_AFTER == "$SOURCE_STATUS_BEFORE" ]] || die "Shared source checkout changed unexpectedly"
fi

# Emit sanitized deployment evidence (no secrets, passwords, or PHI)
EVIDENCE_DIR="$BASE/shared/production/evidence"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
EVIDENCE_FILE="$EVIDENCE_DIR/cutover-$CUTOVER_TS-$SHA.txt"
cat > "$EVIDENCE_FILE" <<EOF
PDH Smart Health Check — Production Cutover Evidence (Sanitized)
Timestamp (UTC):       $CUTOVER_TS
Branch:                $BRANCH
Pinned SHA:            $SHA
Migration Digest:      $CALCULATED_DIGEST
Active Release:        $RELEASE
Legacy Runtime Kept:   $LEGACY_RUNTIME
Systemd Unit Backup:   $SYS_BACKUP_DIR
Production Backup:     $LATEST_BACKUP
Backup SHA-256:        $BACKUP_SHA256
Production Service:    $SERVICE (active, PID=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "unknown"))
Listener:              127.0.0.1:$PORT
HTTPS Health:          $HTTPS_HEALTH
Unauth Admin Gate:     /admin/dashboard -> HTTP $admin_code, /api/v1/admin/audit -> HTTP $audit_code
Staging Unchanged:     $STAGING_SERVICE ($STAGING_ACTIVE_AFTER, PID=$STAGING_PID_AFTER)
EOF
chmod 600 "$EVIDENCE_FILE"
cat "$EVIDENCE_FILE"
