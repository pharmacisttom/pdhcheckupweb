#!/usr/bin/env bash
set -Eeuo pipefail

# PDH Smart Health Check — Production Legacy Cutover Preflight & Application Rollback
# Safety Guarantees:
# - Operates exclusively on DEPLOY_ENV=production
# - Validates non-executable JSON rollback state + SHA-256 checksums fail-closed
# - Restores exact original systemd unit AND drop-ins
# - Verifies health specifically against the restored legacy runtime (WorkingDirectory + symlink + loopback + HTTPS)
# - Never restores, truncates, drops, or modifies Production database pdh_healthcheck

export DEPLOY_ENV=production

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_TOOLS="$(cd -- "$SCRIPT_DIR/../shared" && pwd)"
# shellcheck source=../shared/common.sh
source "$SHARED_TOOLS/common.sh"
TOOLS="$SHARED_TOOLS"

[[ ${DEPLOY_ENV:-} == production ]] || die "Refusing to run: DEPLOY_ENV must be production"

MODE="${1:-}"
BACKUP_ARG="${2:-}"

if [[ $MODE != "--preflight" && $MODE != "--restore-legacy" ]]; then
  die "Usage: bash deploy/production/rollback-legacy-cutover.sh --preflight | --restore-legacy <SYSTEMD_BACKUP_DIR>"
fi

lock_environment
require_env

PROD_APP_URL=$(with_env node -e 'console.log(process.env.APP_URL || "")')
UNIT_PATH=$(systemctl show "$SERVICE" -p FragmentPath --value 2>/dev/null || true)
[[ -n $UNIT_PATH && -f $UNIT_PATH ]] || UNIT_PATH="/etc/systemd/system/$SERVICE"

if [[ $MODE == "--preflight" ]]; then
  LATEST_DB_BACKUP=$(find "$BASE/shared/production/backups" -maxdepth 1 -type f -name '*.sql.gz' 2>/dev/null | sort -r | head -n1 || true)
  [[ -n $LATEST_DB_BACKUP ]] || LATEST_DB_BACKUP="none"
  SYS_BACKUPS=$(find "$BASE/shared/production/systemd-backups" -mindepth 1 -maxdepth 1 -type d 2>/dev/null | sort -r | head -n3 | tr '\n' ' ' || true)
  [[ -n $SYS_BACKUPS ]] || SYS_BACKUPS="none"
  LEGACY_DEFAULT="${LEGACY_RUNTIME_DIR:-$BASE/releases/rc01-e75f4d9}"
  echo "=== PRODUCTION ROLLBACK & LEGACY PREFLIGHT ==="
  echo "Service:           $SERVICE ($(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown"), PID=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "0"))"
  echo "Unit Path:         $UNIT_PATH"
  echo "WorkingDirectory:  $(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "unknown")"
  echo "ExecStart:         $(systemctl show "$SERVICE" -p ExecStart --value 2>/dev/null || echo "unknown")"
  echo "Current Symlink:   $(readlink -f "$RELEASES/current" 2>/dev/null || echo "none")"
  echo "Previous Symlink:  $(readlink -f "$RELEASES/previous" 2>/dev/null || echo "none")"
  echo "Legacy Runtime:    $LEGACY_DEFAULT (exists=$([[ -d $LEGACY_DEFAULT ]] && echo yes || echo no))"
  echo "Latest DB Backup:  $LATEST_DB_BACKUP"
  echo "Systemd Backups:   $SYS_BACKUPS"
  echo "APP_URL:           $PROD_APP_URL"
  exit 0
fi

[[ -n $BACKUP_ARG && -d $BACKUP_ARG ]] || die "Valid SYSTEMD_BACKUP_DIR is required for --restore-legacy"
[[ ${SCHEMA_COMPATIBILITY_REVIEWED:-} == "true" ]] || die "Set SCHEMA_COMPATIBILITY_REVIEWED=true after verifying DB compatibility"
[[ ${CONFIRM_PRODUCTION_ROLLBACK:-} == "pdh_healthcheck" ]] || die "Set CONFIRM_PRODUCTION_ROLLBACK=pdh_healthcheck to execute application rollback"

SYS_BACKUP_DIR=$(realpath -e "$BACKUP_ARG")
EXPECTED_BACKUP_PARENT=$(realpath -e "$BASE/shared/production/systemd-backups")
[[ $SYS_BACKUP_DIR == "$EXPECTED_BACKUP_PARENT/"* ]] || die "Systemd backup directory must reside under $BASE/shared/production/systemd-backups"
[[ -f "$SYS_BACKUP_DIR/rollback-state.json" ]] || die "Missing rollback-state.json"
[[ -f "$SYS_BACKUP_DIR/rollback-state.json.sha256" ]] || die "Missing rollback-state.json.sha256"
[[ -f "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" ]] || die "Missing backed up unit file"
[[ -f "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig.sha256" ]] || die "Missing backed up unit checksum"

(cd "$SYS_BACKUP_DIR" && sha256sum -c rollback-state.json.sha256) || die "rollback-state.json checksum verification failed"
(cd "$SYS_BACKUP_DIR" && sha256sum -c pdhcheckup-production.service.orig.sha256) || die "Systemd unit backup checksum verification failed"

PARSED=$(node -e '
  const fs = require("node:fs");
  const crypto = require("node:crypto");
  const [statePath, origUnitPath] = process.argv.slice(1);
  const s = JSON.parse(fs.readFileSync(statePath, "utf8"));
  const safeAbs = (v) => typeof v === "string" && !v.includes("..") && (/^\/[A-Za-z0-9._\/-]+$/.test(v) || /^[A-Za-z]:[\\\/][A-Za-z0-9._\\\/-]+$/.test(v));
  if (s.schemaVersion !== 1 || !safeAbs(s.unitPath)) {
    throw new Error("Invalid rollback-state.json schema");
  }
  const actualOrigSha = crypto.createHash("sha256").update(fs.readFileSync(origUnitPath)).digest("hex");
  if (actualOrigSha !== s.unitOrigSha256) {
    throw new Error("Backed-up unit SHA-256 does not match rollback-state.json");
  }
  console.log([
    s.unitPath,
    s.hadDropIns ? "true" : "false",
    s.originalWorkingDirectory || "",
    s.previousCurrent || "",
  ].join("\t"));
' "$SYS_BACKUP_DIR/rollback-state.json" "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig") || die "rollback-state.json validation failed"

IFS=$'\t' read -r ST_UNIT_PATH ST_HAD_DROPINS ST_ORIG_WORKDIR ST_PREV_CURRENT <<< "$PARSED"

if [[ $ST_HAD_DROPINS == "true" ]]; then
  [[ -f "$SYS_BACKUP_DIR/dropins.sha256" && -d "$SYS_BACKUP_DIR/dropins.orig" ]] || die "Missing drop-ins backup or checksum"
  (cd "$SYS_BACKUP_DIR/dropins.orig" && sha256sum -c ../dropins.sha256) || die "Drop-ins backup checksum verification failed"
  sudo rm -rf -- "${ST_UNIT_PATH}.d"
  sudo mkdir -p "${ST_UNIT_PATH}.d"
  sudo cp -a "$SYS_BACKUP_DIR/dropins.orig/." "${ST_UNIT_PATH}.d/"
elif [[ -d "${ST_UNIT_PATH}.d" ]]; then
  sudo rm -rf -- "${ST_UNIT_PATH}.d"
fi

sudo cp -a "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$ST_UNIT_PATH"

if [[ -n $ST_PREV_CURRENT ]]; then
  [[ -d $ST_PREV_CURRENT ]] || die "Previous release directory missing: $ST_PREV_CURRENT"
  ln -s "$ST_PREV_CURRENT" "$RELEASES/current.rollback"
  mv -Tf "$RELEASES/current.rollback" "$RELEASES/current"
else
  rm -f -- "$RELEASES/current"
fi

sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"

systemctl is-active --quiet "$SERVICE" || die "$SERVICE failed to start after rollback"
RESTORED_PID=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "0")
[[ $RESTORED_PID =~ ^[0-9]+$ && $RESTORED_PID -gt 0 ]] || die "Invalid PID after rollback: $RESTORED_PID"
RESTORED_WORKDIR=$(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "")
[[ $RESTORED_WORKDIR == "$ST_ORIG_WORKDIR" ]] || die "Restored WorkingDirectory '$RESTORED_WORKDIR' does not match original '$ST_ORIG_WORKDIR'"

if [[ -n $ST_PREV_CURRENT ]]; then
  CUR_RESOLVED=$(readlink -e "$RELEASES/current" 2>/dev/null || echo "")
  [[ $CUR_RESOLVED == "$ST_PREV_CURRENT" ]] || die "Restored current symlink '$CUR_RESOLVED' does not match '$ST_PREV_CURRENT'"
else
  [[ ! -e $RELEASES/current && ! -L $RELEASES/current ]] || die "current symlink still exists after rollback to legacy layout"
fi

bash "$TOOLS/healthcheck.sh"

curl --fail --silent --max-time 10 "$PROD_APP_URL/api/v1/health" | node -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    const v=JSON.parse(s).data;
    if(v?.status!=="ok"||v?.database!==true) process.exit(1);
    console.log("Production rollback HTTPS health:", JSON.stringify(v));
  });
' || die "Production HTTPS health verification failed after rollback"

echo "Production application rollback complete and verified against restored runtime ($ST_ORIG_WORKDIR). Database pdh_healthcheck unchanged."
