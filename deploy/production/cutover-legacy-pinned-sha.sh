#!/usr/bin/env bash
set -Eeuo pipefail

# PDH Smart Health Check — Production Legacy-Compatible Pinned-SHA Cutover
# Safety Guarantees:
# - Operates exclusively on DEPLOY_ENV=production (127.0.0.1:3036, pdh_healthcheck)
# - Preserves existing legacy runtime (e.g. /var/www/pdhcheckup/releases/rc01-e75f4d9) untouched
# - Never mutates /var/www/pdhcheckup/source (uses isolated bare cache + git archive)
# - Enforces exact reviewed remote branch tip SHA match (not mere ancestry)
# - Preserves live systemd unit directives and drop-ins; verifies backup provenance strictly
# - Uses validated non-executable JSON rollback state with fail-closed SHA-256 verification
# - Idempotent transaction-aware application-only rollback on EXIT/ERR/INT/TERM after activation begins
# - Never runs seed, db reset, destructive SQL, or automatic Production DB restore

export DEPLOY_ENV=production

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_TOOLS="$(cd -- "$SCRIPT_DIR/../shared" && pwd)"
# shellcheck source=../shared/common.sh
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

ACTIVATION_STARTED=false
ACTIVATION_COMMITTED=false
ROLLBACK_IN_PROGRESS=false
ROLLBACK_SUCCEEDED=false
ROLLBACK_FAILED=false
SYS_BACKUP_DIR=""
UNIT_PATH=""
PREVIOUS_CURRENT=""
ORIGINAL_WORKDIR=""
LEGACY_RUNTIME=""
RELEASE=""
LATEST_BACKUP=""
BACKUP_SHA256=""
EVIDENCE_FILE=""
EVIDENCE_SHA256=""

_restore_prev_rollback_state() {
  local dir="$1" state_tmp="$2" sha_tmp="$3" state_prev="$4" sha_prev="$5"
  rm -f -- "$state_tmp" "$sha_tmp"
  if [[ -f $state_prev ]]; then
    mv -Tf "$state_prev" "$dir/rollback-state.json" || true
  fi
  if [[ -f $sha_prev ]]; then
    mv -Tf "$sha_prev" "$dir/rollback-state.json.sha256" || true
  fi
}

write_rollback_state() {
  local phase="$1"
  local state_tmp="$SYS_BACKUP_DIR/rollback-state.json.tmp"
  local state_prev="$SYS_BACKUP_DIR/rollback-state.json.prev"
  local sha_tmp="$SYS_BACKUP_DIR/rollback-state.json.sha256.tmp"
  local sha_prev="$SYS_BACKUP_DIR/rollback-state.json.sha256.prev"
  local dropin_dir="$SYS_BACKUP_DIR/dropins.orig"
  local had_dropins="false"
  if [[ -d $dropin_dir ]]; then
    had_dropins="true"
  fi
  rm -f -- "$state_tmp" "$sha_tmp" "$state_prev" "$sha_prev"

  node -e '
    const fs = require("node:fs");
    const [
      outPath, phase, unitPath, unitOrigSha256, hadDropIns, dropInDir,
      origWorkDir, origExecStart, prevCurrent, legacyRuntime, targetRelease,
      targetSha, backupFile, backupSha256, evidenceFile, evidenceSha256
    ] = process.argv.slice(1);
    const dropInNames = hadDropIns === "true" && fs.existsSync(dropInDir)
      ? fs.readdirSync(dropInDir).sort()
      : [];
    const state = {
      schemaVersion: 1,
      phase,
      unitPath,
      unitOrigSha256,
      hadDropIns: hadDropIns === "true",
      dropInNames,
      originalWorkingDirectory: origWorkDir,
      originalExecStart: origExecStart,
      previousCurrent: prevCurrent,
      legacyRuntime,
      targetRelease,
      targetSha,
      backupFile,
      backupSha256,
      evidenceFile,
      evidenceSha256,
    };
    fs.writeFileSync(outPath, JSON.stringify(state, null, 2) + "\n", { mode: 0o600 });
  ' "$state_tmp" "$phase" "$UNIT_PATH" "$UNIT_ORIG_SHA256" "$had_dropins" "$dropin_dir" \
    "$ORIGINAL_WORKDIR" "$PROD_EXEC_BEFORE" "$PREVIOUS_CURRENT" "$LEGACY_RUNTIME" "$RELEASE" \
    "$SHA" "$LATEST_BACKUP" "$BACKUP_SHA256" "$EVIDENCE_FILE" "$EVIDENCE_SHA256" || {
      rm -f -- "$state_tmp"
      return 1
    }
  chmod 600 "$state_tmp" || { rm -f -- "$state_tmp"; return 1; }

  local state_digest
  state_digest=$(sha256sum "$state_tmp" | cut -d' ' -f1) || {
    rm -f -- "$state_tmp" "$sha_tmp"
    return 1
  }
  [[ $state_digest =~ ^[a-f0-9]{64}$ ]] || {
    rm -f -- "$state_tmp" "$sha_tmp"
    return 1
  }
  printf '%s  %s\n' "$state_digest" "rollback-state.json" > "$sha_tmp" || {
    rm -f -- "$state_tmp" "$sha_tmp"
    return 1
  }
  chmod 600 "$sha_tmp" || { rm -f -- "$state_tmp" "$sha_tmp"; return 1; }

  if [[ -f $SYS_BACKUP_DIR/rollback-state.json ]]; then
    cp -a "$SYS_BACKUP_DIR/rollback-state.json" "$state_prev" || {
      rm -f -- "$state_tmp" "$sha_tmp" "$state_prev"
      return 1
    }
  fi
  if [[ -f $SYS_BACKUP_DIR/rollback-state.json.sha256 ]]; then
    cp -a "$SYS_BACKUP_DIR/rollback-state.json.sha256" "$sha_prev" || {
      rm -f -- "$state_tmp" "$sha_tmp" "$state_prev" "$sha_prev"
      return 1
    }
  fi

  mv -Tf "$state_tmp" "$SYS_BACKUP_DIR/rollback-state.json" || {
    _restore_prev_rollback_state "$SYS_BACKUP_DIR" "$state_tmp" "$sha_tmp" "$state_prev" "$sha_prev"
    return 1
  }
  mv -Tf "$sha_tmp" "$SYS_BACKUP_DIR/rollback-state.json.sha256" || {
    _restore_prev_rollback_state "$SYS_BACKUP_DIR" "$state_tmp" "$sha_tmp" "$state_prev" "$sha_prev"
    return 1
  }
  (cd "$SYS_BACKUP_DIR" && sha256sum -c rollback-state.json.sha256 >/dev/null) || {
    _restore_prev_rollback_state "$SYS_BACKUP_DIR" "$state_tmp" "$sha_tmp" "$state_prev" "$sha_prev"
    return 1
  }
  rm -f -- "$state_prev" "$sha_prev"
}

verify_restored_legacy_runtime() {
  local expected_workdir="$1"
  local expected_prev="$2"
  local load_state=""
  local active_state="unknown"
  local main_pid="0"
  local actual_workdir="unknown"

  load_state=$(systemctl show "$SERVICE" -p LoadState --value 2>/dev/null || echo "")
  if [[ -n $load_state && $load_state != "loaded" ]]; then
    echo "ROLLBACK ERROR: $SERVICE LoadState='$load_state' after restore (expected loaded)" >&2
    return 1
  fi

  systemctl is-active --quiet "$SERVICE" || {
    echo "ROLLBACK ERROR: $SERVICE is not active after restore" >&2
    return 1
  }
  active_state=$(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown")
  main_pid=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "0")
  [[ $active_state == "active" && $main_pid =~ ^[0-9]+$ && $main_pid -gt 0 ]] || {
    echo "ROLLBACK ERROR: Invalid restored service state ($active_state, PID=$main_pid)" >&2
    return 1
  }

  actual_workdir=$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "")
  [[ $actual_workdir == "$expected_workdir" ]] || {
    echo "ROLLBACK ERROR: WorkingDirectory '$actual_workdir' does not match restored legacy '$expected_workdir'" >&2
    return 1
  }

  if [[ -n $expected_prev ]]; then
    local cur_resolved
    cur_resolved=$(readlink -e "$RELEASES/current" 2>/dev/null || echo "")
    [[ $cur_resolved == "$expected_prev" ]] || {
      echo "ROLLBACK ERROR: current symlink '$cur_resolved' does not match '$expected_prev'" >&2
      return 1
    }
  else
    [[ ! -e $RELEASES/current && ! -L $RELEASES/current ]] || {
      echo "ROLLBACK ERROR: current symlink still present when legacy state had none" >&2
      return 1
    }
  fi

  bash "$TOOLS/healthcheck.sh" || {
    echo "ROLLBACK ERROR: Loopback healthcheck failed on restored legacy runtime" >&2
    return 1
  }
}

perform_rollback_steps() {
  if [[ -z $SYS_BACKUP_DIR || ! -d $SYS_BACKUP_DIR ]]; then
    echo "CRITICAL ROLLBACK FAILURE: Systemd backup directory missing" >&2
    return 1
  fi

  # Fail-closed integrity verification of state and backed-up unit/drop-ins
  (cd "$SYS_BACKUP_DIR" && sha256sum -c rollback-state.json.sha256) || {
    echo "CRITICAL ROLLBACK FAILURE: rollback-state.json checksum mismatch" >&2
    return 1
  }
  (cd "$SYS_BACKUP_DIR" && sha256sum -c pdhcheckup-production.service.orig.sha256) || {
    echo "CRITICAL ROLLBACK FAILURE: unit backup checksum mismatch; refusing to overwrite $UNIT_PATH" >&2
    return 1
  }

  local parsed
  parsed=$(node -e '
    const fs = require("node:fs");
    const crypto = require("node:crypto");
    const [statePath, origUnitPath] = process.argv.slice(1);
    const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
    const safeAbs = (v) => typeof v === "string" && !v.includes("..") && (/^\/[A-Za-z0-9._\/-]+$/.test(v) || /^[A-Za-z]:[\\\/][A-Za-z0-9._\\\/-]+$/.test(v));
    if (s.schemaVersion !== 1 || !safeAbs(s.unitPath)) {
      throw new Error("Invalid rollback state schema");
    }
    const actualOrigSha = crypto.createHash("sha256").update(fs.readFileSync(origUnitPath)).digest("hex");
    if (actualOrigSha !== s.unitOrigSha256) {
      throw new Error("Unit orig sha256 mismatch against rollback-state.json");
    }
    console.log([
      s.unitPath,
      s.hadDropIns ? "true" : "false",
      s.originalWorkingDirectory || "",
      s.previousCurrent || "",
    ].join("\t"));
  ' "$SYS_BACKUP_DIR/rollback-state.json" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig") || {
    echo "CRITICAL ROLLBACK FAILURE: rollback-state.json validation failed" >&2
    return 1
  }

  local st_unit_path st_had_dropins st_orig_workdir st_prev_current
  IFS=$'\t' read -r st_unit_path st_had_dropins st_orig_workdir st_prev_current <<< "$parsed"

  if [[ $st_had_dropins == "true" ]]; then
    [[ -f "$SYS_BACKUP_DIR/dropins.sha256" && -d "$SYS_BACKUP_DIR/dropins.orig" ]] || {
      echo "CRITICAL ROLLBACK FAILURE: Drop-in backup checksum or directory missing" >&2
      return 1
    }
    (cd "$SYS_BACKUP_DIR/dropins.orig" && sha256sum -c ../dropins.sha256) || {
      echo "CRITICAL ROLLBACK FAILURE: Drop-in backup checksum mismatch" >&2
      return 1
    }
    sudo rm -rf -- "${st_unit_path}.d" || return 1
    sudo mkdir -p "${st_unit_path}.d" || return 1
    sudo cp -a "$SYS_BACKUP_DIR/dropins.orig/." "${st_unit_path}.d/" || return 1
  elif [[ -d "${st_unit_path}.d" ]]; then
    sudo rm -rf -- "${st_unit_path}.d" || return 1
  fi

  sudo cp -a "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$st_unit_path" || return 1

  if [[ -n $st_prev_current ]]; then
    ln -s "$st_prev_current" "$RELEASES/current.rollback" || return 1
    mv -Tf "$RELEASES/current.rollback" "$RELEASES/current" || return 1
  else
    rm -f -- "$RELEASES/current" || return 1
  fi

  sudo systemctl daemon-reload || return 1
  if command -v systemd-analyze >/dev/null 2>&1; then
    sudo systemd-analyze verify "$st_unit_path" || return 1
  fi
  sudo systemctl restart "$SERVICE" || return 1
  verify_restored_legacy_runtime "$st_orig_workdir" "$st_prev_current" || return 1
}

rollback_application_only() {
  if [[ $ROLLBACK_SUCCEEDED == true ]]; then
    return 0
  fi
  if [[ $ROLLBACK_IN_PROGRESS == true ]]; then
    echo "ROLLBACK IN PROGRESS: skipping re-entrant invocation" >&2
    return 1
  fi

  ROLLBACK_IN_PROGRESS=true
  ROLLBACK_FAILED=false
  echo "ACTIVATION FAILED: Executing fail-closed application-only rollback (ROLLBACK_IN_PROGRESS=true, Production DB untouched)..." >&2

  if perform_rollback_steps; then
    ROLLBACK_IN_PROGRESS=false
    ROLLBACK_SUCCEEDED=true
    ROLLBACK_FAILED=false
    write_rollback_state "rolled_back" || true
    echo "Application-only rollback verified against restored legacy runtime ($ORIGINAL_WORKDIR) (ROLLBACK_SUCCEEDED=true). Production DB untouched." >&2
    return 0
  fi

  ROLLBACK_IN_PROGRESS=false
  ROLLBACK_SUCCEEDED=false
  ROLLBACK_FAILED=true
  write_rollback_state "rollback_failed" || true
  return 1
}

on_err() {
  local rc=$?
  local line="${1:-unknown}"
  echo "ERR TRAP: command exited with status $rc at line $line" >&2
}

on_signal() {
  local sig="$1"
  local exit_code=130
  if [[ $sig == "TERM" ]]; then
    exit_code=143
  fi
  echo "SIGNAL RECEIVED: $sig" >&2
  if [[ $ACTIVATION_STARTED == true && $ACTIVATION_COMMITTED == false && $ROLLBACK_SUCCEEDED == false ]]; then
    rollback_application_only || true
  fi
  rm -rf -- "$TMP_WORK"
  exit "$exit_code"
}

on_exit() {
  local rc=$?
  if [[ $rc -ne 0 && $ACTIVATION_STARTED == true && $ACTIVATION_COMMITTED == false && $ROLLBACK_SUCCEEDED == false ]]; then
    if [[ $ROLLBACK_FAILED == true ]]; then
      echo "RETRYING ROLLBACK: Previous attempt recorded ROLLBACK_FAILED=true" >&2
    fi
    if ! rollback_application_only; then
      echo "FATAL: Automatic rollback failed (ROLLBACK_FAILED=true); inspect $SYS_BACKUP_DIR immediately." >&2
    fi
  fi
  rm -rf -- "$TMP_WORK"
  return "$rc"
}

trap 'on_err $LINENO' ERR
trap 'on_signal INT' INT
trap 'on_signal TERM' TERM
trap 'on_exit' EXIT

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
ORIGINAL_WORKDIR="$PROD_WORKDIR_BEFORE"
LEGACY_RUNTIME="${LEGACY_RUNTIME_DIR:-$BASE/releases/rc01-e75f4d9}"
[[ -d $LEGACY_RUNTIME ]] || LEGACY_RUNTIME="$PROD_WORKDIR_BEFORE"

# Resolve Git cache: ephemeral in --preflight-only so releases/.git-cache is untouched
REMOTE_URL="${PROD_REPO_URL:-}"
if [[ -z $REMOTE_URL && -d $SOURCE/.git ]]; then
  REMOTE_URL=$(git -C "$SOURCE" remote get-url origin 2>/dev/null || echo "")
fi
if [[ -z $REMOTE_URL ]]; then
  REMOTE_URL="https://github.com/pharmacisttom/pdhcheckupweb.git"
fi

if [[ $PREFLIGHT_ONLY == true ]]; then
  GIT_CACHE="$TMP_WORK/git-cache"
  git init --bare "$GIT_CACHE" >/dev/null
  git -C "$GIT_CACHE" remote add origin "$REMOTE_URL"
else
  GIT_CACHE="$RELEASES/.git-cache"
  if [[ ! -d $GIT_CACHE ]]; then
    git init --bare "$GIT_CACHE" >/dev/null
    git -C "$GIT_CACHE" remote add origin "$REMOTE_URL"
  else
    git -C "$GIT_CACHE" remote set-url origin "$REMOTE_URL"
  fi
fi

git -C "$GIT_CACHE" fetch --prune origin "refs/heads/$BRANCH:refs/remotes/origin/$BRANCH"
git -C "$GIT_CACHE" cat-file -e "${SHA}^{commit}" || die "Pinned SHA $SHA not found in fetched branch $BRANCH"
BRANCH_TIP=$(git -C "$GIT_CACHE" rev-parse "refs/remotes/origin/$BRANCH")
[[ $BRANCH_TIP == "$SHA" ]] || die "Pinned SHA $SHA does not match exact remote branch tip $BRANCH_TIP for origin/$BRANCH"

# Extract migrations from pinned commit archive and verify aggregate digest + per-file checksums
MIG_TMP="$TMP_WORK/migrations"
mkdir -p "$MIG_TMP"
git -c core.autocrlf=false -C "$GIT_CACHE" archive "$SHA" prisma/migrations | tar -x -C "$MIG_TMP"
CALCULATED_DIGEST=$(cd "$MIG_TMP" && find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sed 's/ \*/  /' | sha256sum | cut -d' ' -f1)
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
    local mig_name mig_sum
    mig_name=$(basename "$(dirname "$mig_file")")
    mig_sum=$(sha256sum "$mig_file" | cut -d' ' -f1)
    printf '%s\t%s\n' "$mig_name" "$mig_sum" >> "$git_checksums"
  done < <(find "$MIG_TMP/prisma/migrations" -type f -name migration.sql | sort)

  diff -u "$git_checksums" "$db_checksums" >/dev/null || die "Production _prisma_migrations checksums do not match pinned SHA $SHA"
  rm -f -- "$cnf_path"
}

verify_production_db_state

echo "=== PRODUCTION LEGACY CUTOVER PREFLIGHT ==="
echo "Branch:               $BRANCH"
echo "Pinned SHA:           $SHA (matches exact origin/$BRANCH tip)"
echo "Migration Digest:     $CALCULATED_DIGEST"
echo "DB Identity:          pdh_healthcheck (14/14 migrations & checksums matched, 0 failed)"
echo "Unit File:            $UNIT_PATH (dropins=$([[ -d ${UNIT_PATH}.d ]] && echo present || echo none))"
echo "Service State:        $SERVICE ($PROD_ACTIVE_BEFORE, PID=$PROD_PID_BEFORE)"
echo "Current WorkDir:      $PROD_WORKDIR_BEFORE"
echo "Current ExecStart:    $PROD_EXEC_BEFORE"
echo "Legacy Runtime:       $LEGACY_RUNTIME"
echo "Production Port:      $PORT"
echo "Staging Baseline:     $STAGING_SERVICE ($STAGING_ACTIVE_BEFORE, PID=$STAGING_PID_BEFORE)"
echo "Source Baseline:      HEAD=$SOURCE_HEAD_BEFORE"

if [[ $PREFLIGHT_ONLY == true ]]; then
  echo "Preflight-only mode completed (acquired $RELEASES/.deploy.lock and cleaned ephemeral cache/db-cnf; zero runtime/DB/unit mutations)."
  exit 0
fi

# Create separate immutable release directory (never touches legacy runtime)
RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%S)-$SHA"
[[ ! -e $RELEASE ]] || die "Release directory already exists: $RELEASE"
mkdir -p "$RELEASE"
git -c core.autocrlf=false -C "$GIT_CACHE" archive "$SHA" | tar -x -C "$RELEASE"
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

# Create and verify fresh Production DB backup bound to this exact invocation
BACKUP_START_EPOCH=$(date +%s)
BACKUP_OUTPUT=$(bash "$TOOLS/backup.sh")
printf '%s\n' "$BACKUP_OUTPUT"
LATEST_BACKUP=$(printf '%s\n' "$BACKUP_OUTPUT" | sed -n 's/^BACKUP_FILE=//p' | tail -n1)
LATEST_BACKUP_SHA_FILE=$(printf '%s\n' "$BACKUP_OUTPUT" | sed -n 's/^BACKUP_SHA256_FILE=//p' | tail -n1)
EXPECTED_BACKUP_DIR="$BASE/shared/production/backups"
[[ -n $LATEST_BACKUP && $LATEST_BACKUP == "$EXPECTED_BACKUP_DIR/"*.sql.gz ]] || die "Invalid BACKUP_FILE emitted by backup.sh: $LATEST_BACKUP"
[[ -f $LATEST_BACKUP && -s $LATEST_BACKUP ]] || die "Backup file missing or empty: $LATEST_BACKUP"
[[ $LATEST_BACKUP_SHA_FILE == "$LATEST_BACKUP.sha256" && -f $LATEST_BACKUP_SHA_FILE ]] || die "Backup sha256 sidecar mismatch: $LATEST_BACKUP_SHA_FILE"

BACKUP_MTIME=$(stat -c %Y "$LATEST_BACKUP" 2>/dev/null || echo "0")
(( BACKUP_MTIME + 2 >= BACKUP_START_EPOCH )) || die "Backup file mtime ($BACKUP_MTIME) predates current invocation ($BACKUP_START_EPOCH)"

gzip -t "$LATEST_BACKUP" || die "Production backup gzip integrity check failed"
(cd "$(dirname "$LATEST_BACKUP")" && sha256sum -c "$(basename "$LATEST_BACKUP_SHA_FILE")") || die "Production backup sha256 verification failed"
BACKUP_SHA256=$(cut -d' ' -f1 "$LATEST_BACKUP_SHA_FILE")

# Verify restore-readiness structure via EOF-consuming scan (pipefail-safe for large dumps)
DUMP_SCAN_RESULT=$(gzip -dc "$LATEST_BACKUP" | awk '
  /^CREATE DATABASE / || /^USE / {
    db_stmts++
    if ($0 ~ /pdh_healthcheck_staging/) bad_staging++
    else if ($0 !~ /`pdh_healthcheck`([ ;]|$)/ && $0 !~ /[ \t]pdh_healthcheck([ ;]|$)/) bad_other++
  }
  /^CREATE TABLE / {
    tables++
  }
  END {
    printf "%d|%d|%d|%d\n", db_stmts+0, bad_staging+0, bad_other+0, tables+0
  }
')
IFS='|' read -r DUMP_DB_STMTS DUMP_BAD_STAGING DUMP_BAD_OTHER DUMP_CREATE_TABLES <<< "$DUMP_SCAN_RESULT"
(( DUMP_DB_STMTS > 0 )) || die "Backup dump missing CREATE DATABASE / USE header"
(( DUMP_BAD_STAGING == 0 )) || die "Backup dump contains staging database reference"
(( DUMP_BAD_OTHER == 0 )) || die "Backup dump contains unexpected database statement"
(( DUMP_CREATE_TABLES > 0 )) || die "Backup dump missing CREATE TABLE statements"

# Re-verify DB identity and 14/14 migration checksums immediately before cutover (zero seed/reset/SQL writes)
verify_production_db_state

# Backup original systemd unit, drop-ins, and previous current symlink for immediate application-only rollback
CUTOVER_TS=$(date -u +%Y%m%dT%H%M%S)
SYS_BACKUP_DIR="$BASE/shared/production/systemd-backups/$CUTOVER_TS"
mkdir -p "$SYS_BACKUP_DIR"
chmod 700 "$SYS_BACKUP_DIR"
cp -a "$UNIT_PATH" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig"
(cd "$SYS_BACKUP_DIR" && sha256sum pdhcheckup-production.service.orig > pdhcheckup-production.service.orig.sha256)
chmod 600 "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig.sha256"
UNIT_ORIG_SHA256=$(cut -d' ' -f1 "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig.sha256")

if [[ -d "${UNIT_PATH}.d" ]]; then
  mkdir -p "$SYS_BACKUP_DIR/dropins.orig"
  chmod 700 "$SYS_BACKUP_DIR/dropins.orig"
  cp -a "${UNIT_PATH}.d/." "$SYS_BACKUP_DIR/dropins.orig/"
  (cd "$SYS_BACKUP_DIR/dropins.orig" && find . -maxdepth 2 -type f | sort | xargs -r sha256sum > ../dropins.sha256)
  chmod 600 "$SYS_BACKUP_DIR/dropins.sha256"
fi

PREVIOUS_CURRENT=""
if [[ -L $RELEASES/current ]]; then
  PREVIOUS_CURRENT=$(readlink -e "$RELEASES/current")
elif [[ -e $RELEASES/current ]]; then
  die "$RELEASES/current exists and is not a symlink"
fi

write_rollback_state "backup_ready"

# Render updated systemd unit by surgically preserving live unit directives (and updating drop-ins if needed)
NODE_BIN=$(command -v node)
[[ -x $NODE_BIN ]] || die "Node binary not found"
UNIT_RENDERED="$TMP_WORK/pdhcheckup-production.service"
TARGET_RUNTIME_DIR="$RELEASES/current/runtime"
TARGET_NEXT_RW="$TARGET_RUNTIME_DIR/.next"

node -e '
  const fs = require("node:fs");
  const [srcPath, dstPath, workDir, nodeBin, nextRw] = process.argv.slice(1);
  const raw = fs.readFileSync(srcPath, "utf8");
  const lines = raw.split(/\r?\n/);
  let inService = false;
  let sawWorkDir = false;
  let sawExec = false;
  let sawRw = false;
  const out = [];
  const flushMissing = () => {
    if (!sawWorkDir) out.push(`WorkingDirectory=${workDir}`);
    if (!sawExec) out.push(`ExecStart=${nodeBin} server.js`);
    if (!sawRw) out.push(`ReadWritePaths=${nextRw}`);
  };
  for (let i = 0; i < lines.length; i++) {
    const line = lines[i];
    const trimmed = line.trim();
    if (/^\[.+\]$/.test(trimmed)) {
      if (inService) flushMissing();
      inService = trimmed === "[Service]";
      out.push(line);
      continue;
    }
    if (inService) {
      if (/^WorkingDirectory=/.test(trimmed)) {
        out.push(`WorkingDirectory=${workDir}`);
        sawWorkDir = true;
        continue;
      }
      if (/^ExecStart=/.test(trimmed)) {
        out.push(`ExecStart=${nodeBin} server.js`);
        sawExec = true;
        continue;
      }
      if (/^ReadWritePaths=/.test(trimmed)) {
        const existing = trimmed.slice("ReadWritePaths=".length).trim();
        const parts = existing ? existing.split(/\s+/) : [];
        if (!parts.includes(nextRw)) parts.push(nextRw);
        out.push(`ReadWritePaths=${parts.join(" ")}`);
        sawRw = true;
        continue;
      }
    }
    out.push(line);
  }
  if (inService) flushMissing();
  fs.writeFileSync(dstPath, out.join("\n").replace(/\n*$/, "\n"), "utf8");
' "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$UNIT_RENDERED" "$TARGET_RUNTIME_DIR" "$NODE_BIN" "$TARGET_NEXT_RW"
chmod 644 "$UNIT_RENDERED"

DROPINS_RENDERED_DIR=""
if [[ -d "$SYS_BACKUP_DIR/dropins.orig" ]]; then
  DROPINS_RENDERED_DIR="$TMP_WORK/dropins.rendered"
  mkdir -p "$DROPINS_RENDERED_DIR"
  cp -a "$SYS_BACKUP_DIR/dropins.orig/." "$DROPINS_RENDERED_DIR/"
  node -e '
    const fs = require("node:fs");
    const path = require("node:path");
    const [dir, workDir, nodeBin, nextRw, legacyDir, prevDir] = process.argv.slice(1);
    for (const entry of fs.readdirSync(dir).sort()) {
      if (!entry.endsWith(".conf")) continue;
      const p = path.join(dir, entry);
      if (!fs.statSync(p).isFile()) continue;
      const raw = fs.readFileSync(p, "utf8");
      const lines = raw.split(/\r?\n/).map((line) => {
        const t = line.trim();
        if (/^WorkingDirectory=/.test(t) && ((legacyDir && t.includes(legacyDir)) || (prevDir && t.includes(prevDir)) || !t.includes(workDir))) {
          return `WorkingDirectory=${workDir}`;
        }
        if (/^ExecStart=/.test(t) && t !== "ExecStart=" && ((legacyDir && t.includes(legacyDir)) || (prevDir && t.includes(prevDir)) || /server\.js/.test(t))) {
          return `ExecStart=${nodeBin} server.js`;
        }
        if (/^ReadWritePaths=/.test(t)) {
          const existing = t.slice("ReadWritePaths=".length).trim();
          if (!existing) return line;
          const parts = existing.split(/\s+/);
          if (!parts.includes(nextRw)) parts.push(nextRw);
          return `ReadWritePaths=${parts.join(" ")}`;
        }
        return line;
      });
      fs.writeFileSync(p, lines.join("\n").replace(/\n*$/, "\n"), "utf8");
    }
  ' "$DROPINS_RENDERED_DIR" "$TARGET_RUNTIME_DIR" "$NODE_BIN" "$TARGET_NEXT_RW" "$LEGACY_RUNTIME" "$PREVIOUS_CURRENT"
fi

verify_effective_systemd_config() {
  if command -v systemd-analyze >/dev/null 2>&1; then
    sudo systemd-analyze verify "$UNIT_PATH" || die "systemd-analyze verify failed for $UNIT_PATH"
  fi

  local load_state eff_user eff_workdir eff_exec eff_envfiles eff_rw eff_protect
  load_state=$(systemctl show "$SERVICE" -p LoadState --value 2>/dev/null || echo "")
  if [[ -n $load_state && $load_state != "loaded" ]]; then
    die "Effective systemd LoadState='$load_state' (expected loaded)"
  fi

  eff_user=$(systemctl show "$SERVICE" -p User --value 2>/dev/null || echo "")
  [[ $eff_user == "pdhcheckup" ]] || die "Effective systemd User mismatch: '$eff_user' != 'pdhcheckup'"

  eff_workdir=$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "")
  [[ $eff_workdir == "$TARGET_RUNTIME_DIR" ]] || die "Effective WorkingDirectory mismatch: '$eff_workdir' != '$TARGET_RUNTIME_DIR'"

  eff_exec=$(systemctl show "$SERVICE" -p ExecStart --value 2>/dev/null || echo "")
  node -e '
    const [raw, nodeBin, legacyDir] = process.argv.slice(1);
    const braced = raw.match(/\{[^}]*\}/g);
    const entries = braced
      ? braced.map((s) => s.trim()).filter(Boolean)
      : raw.split(/\r?\n/).map((s) => s.trim()).filter((s) => s && s !== "ExecStart=");
    if (entries.length !== 1) {
      throw new Error(`Expected exactly 1 effective ExecStart entry, got ${entries.length}: ${raw}`);
    }
    const e = entries[0];
    if (!e.includes(nodeBin) || !e.includes("server.js")) {
      throw new Error(`Effective ExecStart does not point to ${nodeBin} server.js: ${e}`);
    }
    if (legacyDir && e.includes(legacyDir)) {
      throw new Error(`Effective ExecStart still references legacy dir ${legacyDir}: ${e}`);
    }
  ' "$eff_exec" "$NODE_BIN" "$LEGACY_RUNTIME" || die "Effective ExecStart validation failed"

  eff_envfiles=$(systemctl show "$SERVICE" -p EnvironmentFiles --value 2>/dev/null || echo "")
  if [[ -n $eff_envfiles ]]; then
    [[ $eff_envfiles != *"staging"* ]] || die "Effective EnvironmentFiles references staging: $eff_envfiles"
    local required_env_paths=""
    required_env_paths=$(node -e '
      const raw = process.argv[1];
      const tokens = [];
      const re = /([^\s()]+)(?:\s*\(([^)]*)\))?/g;
      let m;
      while ((m = re.exec(raw)) !== null) {
        let p = m[1];
        const meta = m[2] || "";
        const optional = p.startsWith("-") || meta.includes("ignore_errors=yes");
        if (p.startsWith("-")) p = p.slice(1);
        if (!optional && (p.startsWith("/") || /^[A-Za-z]:[\\/]/.test(p))) tokens.push(p);
      }
      console.log(tokens.join("\n"));
    ' "$eff_envfiles")
    if [[ -n $required_env_paths ]]; then
      while IFS= read -r env_p; do
        [[ -z $env_p ]] && continue
        [[ -f $env_p ]] || die "Effective EnvironmentFile missing: $env_p"
        if [[ $env_p == "$ENV_FILE" ]]; then
          [[ $(stat -c %a "$env_p") == "600" ]] || die "Effective EnvironmentFile mode invalid: $env_p"
        fi
      done <<< "$required_env_paths"
    fi
  fi

  eff_rw=$(systemctl show "$SERVICE" -p ReadWritePaths --value 2>/dev/null || echo "")
  eff_protect=$(systemctl show "$SERVICE" -p ProtectSystem --value 2>/dev/null || echo "")
  if [[ -n $eff_rw || $eff_protect == "strict" || $eff_protect == "full" ]]; then
    if [[ $eff_rw != *"$TARGET_NEXT_RW"* && $eff_rw != *"$TARGET_RUNTIME_DIR"* && $eff_rw != *"$RELEASES"* ]]; then
      die "Effective ReadWritePaths ('$eff_rw') omits runtime .next path ($TARGET_NEXT_RW) under ProtectSystem=$eff_protect"
    fi
  fi

  [[ -r "$TARGET_RUNTIME_DIR/server.js" && -d "$TARGET_NEXT_RW" && -w "$TARGET_NEXT_RW" ]] || die "Runtime permissions invalid at $TARGET_RUNTIME_DIR"
  if id -u pdhcheckup >/dev/null 2>&1; then
    sudo -u pdhcheckup test -r "$TARGET_RUNTIME_DIR/server.js" && sudo -u pdhcheckup test -w "$TARGET_NEXT_RW" || die "Service user pdhcheckup lacks required runtime permissions"
  fi
}

# Begin transactional activation (any failure or signal from here triggers idempotent rollback)
ACTIVATION_STARTED=true

if [[ -n $PREVIOUS_CURRENT ]]; then
  ln -s "$PREVIOUS_CURRENT" "$RELEASES/previous.next"
  mv -Tf "$RELEASES/previous.next" "$RELEASES/previous"
fi
ln -s "$RELEASE" "$RELEASES/current.next"
mv -Tf "$RELEASES/current.next" "$RELEASES/current"
write_rollback_state "symlink_switched"

sudo cp "$UNIT_RENDERED" "$UNIT_PATH"
if [[ -n $DROPINS_RENDERED_DIR ]]; then
  sudo cp -a "$DROPINS_RENDERED_DIR/." "${UNIT_PATH}.d/"
fi
write_rollback_state "unit_updated"

sudo systemctl daemon-reload
verify_effective_systemd_config
sudo systemctl restart "$SERVICE"
write_rollback_state "restarted"

bash "$TOOLS/healthcheck.sh"

# Verify runtime REVISION, active systemd service + WorkingDirectory, listener 127.0.0.1:3036, HTTPS health
ACTIVE_SHA=$(cat "$RELEASES/current/REVISION")
[[ $ACTIVE_SHA == "$SHA" ]] || die "Active REVISION mismatch: $ACTIVE_SHA != $SHA"

systemctl is-active --quiet "$SERVICE" || die "$SERVICE is not active"
ACTIVE_WORKDIR=$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "")
[[ $ACTIVE_WORKDIR == "$TARGET_RUNTIME_DIR" ]] || die "Active WorkingDirectory mismatch: $ACTIVE_WORKDIR != $TARGET_RUNTIME_DIR"

LISTENER_OK=false
if command -v ss >/dev/null 2>&1; then
  ss -ltn | grep -q "127.0.0.1:$PORT" && LISTENER_OK=true
else
  curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT/api/v1/health" >/dev/null && LISTENER_OK=true
fi
[[ $LISTENER_OK == true ]] || die "No listener verified on 127.0.0.1:$PORT"

HTTPS_HEALTH=$(curl --fail --silent --max-time 10 "$PROD_APP_URL/api/v1/health")
echo "$HTTPS_HEALTH" | node -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    const v=JSON.parse(s).data;
    if(v?.status!=="ok"||v?.database!==true) process.exit(1);
  });
' || die "HTTPS health payload invalid"

# Read-only endpoint & RBAC/redirect smoke probes (zero mutations)
for pub_route in /login /privacy /register /api/v1/packages /api/v1/booking-policy; do
  code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL$pub_route")
  [[ $code == "200" ]] || die "HTTPS probe $pub_route returned HTTP $code"
done
admin_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/admin/dashboard")
[[ $admin_code == "302" || $admin_code == "307" ]] || die "Unauthenticated /admin/dashboard returned HTTP $admin_code"
audit_code=$(curl -s -o /dev/null -w '%{http_code}' --max-time 10 "$PROD_APP_URL/api/v1/admin/audit")
[[ $audit_code == "401" || $audit_code == "403" ]] || die "Unauthenticated /api/v1/admin/audit returned HTTP $audit_code"

# Verify invariants after cutover (zero secret/legacy/staging/source drift; any failure triggers rollback!)
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

# Write and verify sanitized evidence + final committed state BEFORE committing transaction
EVIDENCE_DIR="$BASE/shared/production/evidence"
mkdir -p "$EVIDENCE_DIR"
chmod 700 "$EVIDENCE_DIR"
EVIDENCE_FILE="$EVIDENCE_DIR/cutover-$CUTOVER_TS-$SHA.txt"
EVIDENCE_TMP="$EVIDENCE_FILE.tmp"
EVIDENCE_SHA_TMP="$EVIDENCE_FILE.sha256.tmp"

cat > "$EVIDENCE_TMP" <<EOF
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
WorkingDirectory:      $ACTIVE_WORKDIR
Listener:              127.0.0.1:$PORT
HTTPS Health:          $HTTPS_HEALTH
Unauth Admin Gate:     /admin/dashboard -> HTTP $admin_code, /api/v1/admin/audit -> HTTP $audit_code
Staging Unchanged:     $STAGING_SERVICE ($STAGING_ACTIVE_AFTER, PID=$STAGING_PID_AFTER)
EOF
chmod 600 "$EVIDENCE_TMP"
EVIDENCE_SHA256=$(sha256sum "$EVIDENCE_TMP" | cut -d' ' -f1)
[[ $EVIDENCE_SHA256 =~ ^[a-f0-9]{64}$ ]] || die "Failed to compute sanitized evidence SHA-256"
printf '%s  %s\n' "$EVIDENCE_SHA256" "$(basename "$EVIDENCE_FILE")" > "$EVIDENCE_SHA_TMP"
chmod 600 "$EVIDENCE_SHA_TMP"
mv -Tf "$EVIDENCE_TMP" "$EVIDENCE_FILE"
mv -Tf "$EVIDENCE_SHA_TMP" "$EVIDENCE_FILE.sha256"
(cd "$EVIDENCE_DIR" && sha256sum -c "$(basename "$EVIDENCE_FILE.sha256")" >/dev/null) || die "Sanitized evidence checksum verification failed"

write_rollback_state "committed"
ACTIVATION_COMMITTED=true
cat "$EVIDENCE_FILE"
