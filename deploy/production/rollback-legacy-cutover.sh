#!/usr/bin/env bash
set -Eeuo pipefail

# PDH Smart Health Check — Production Legacy Cutover Preflight & Application Rollback
# Safety Guarantees:
# - Operates exclusively on DEPLOY_ENV=production
# - Never restores, truncates, drops, or modifies Production database pdh_healthcheck
# - Restores only the backed-up systemd unit and previous release / legacy runtime symlink

export DEPLOY_ENV=production

SCRIPT_DIR="$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)"
SHARED_TOOLS="$(cd -- "$SCRIPT_DIR/../shared" && pwd)"
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
  echo "=== PRODUCTION ROLLBACK & LEGACY PREFLIGHT ==="
  echo "Service:           $SERVICE ($(systemctl is-active "$SERVICE" 2>/dev/null || echo "unknown"), PID=$(systemctl show "$SERVICE" -p MainPID --value 2>/dev/null || echo "0"))"
  echo "Unit Path:         $UNIT_PATH"
  echo "WorkingDirectory:  $(systemctl show "$SERVICE" -p WorkingDirectory --value 2>/dev/null || echo "unknown")"
  echo "ExecStart:         $(systemctl show "$SERVICE" -p ExecStart --value 2>/dev/null || echo "unknown")"
  echo "Current Symlink:   $(readlink -f "$RELEASES/current" 2>/dev/null || echo "none")"
  echo "Previous Symlink:  $(readlink -f "$RELEASES/previous" 2>/dev/null || echo "none")"
  echo "Legacy Runtime:    ${LEGACY_RUNTIME_DIR:-$BASE/releases/rc01-e75f4d9} (exists=$([[ -d ${LEGACY_RUNTIME_DIR:-$BASE/releases/rc01-e75f4d9} ]] && echo yes || echo no))"
  echo "Latest DB Backup:  $(ls -1t "$BASE/shared/production/backups"/*.sql.gz 2>/dev/null | head -n1 || echo "none")"
  echo "Systemd Backups:   $(ls -1dt "$BASE/shared/production/systemd-backups"/* 2>/dev/null | head -n3 | tr '\n' ' ' || echo "none")"
  echo "APP_URL:           $PROD_APP_URL"
  exit 0
fi

[[ -n $BACKUP_ARG && -d $BACKUP_ARG ]] || die "Valid SYSTEMD_BACKUP_DIR is required for --restore-legacy"
[[ ${SCHEMA_COMPATIBILITY_REVIEWED:-} == "true" ]] || die "Set SCHEMA_COMPATIBILITY_REVIEWED=true after verifying DB compatibility"
[[ ${CONFIRM_PRODUCTION_ROLLBACK:-} == "pdh_healthcheck" ]] || die "Set CONFIRM_PRODUCTION_ROLLBACK=pdh_healthcheck to execute application rollback"

SYS_BACKUP_DIR=$(realpath -e "$BACKUP_ARG")
[[ $SYS_BACKUP_DIR == "$BASE/shared/production/systemd-backups/"* ]] || die "Systemd backup directory must reside under $BASE/shared/production/systemd-backups"
[[ -f "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" ]] || die "Missing backed up unit file"
[[ -f "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig.sha256" ]] || die "Missing backed up unit checksum"
[[ -f "$SYS_BACKUP_DIR/rollback-state.env" ]] || die "Missing rollback-state.env"

(cd "$SYS_BACKUP_DIR" && sha256sum -c pdhcheckup-production.service.orig.sha256) || die "Systemd unit backup checksum verification failed"

# shellcheck source=/dev/null
source "$SYS_BACKUP_DIR/rollback-state.env"
[[ -n ${UNIT_PATH:-} ]] || die "UNIT_PATH missing in rollback-state.env"

sudo cp -a "$SYS_BACKUP_DIR/pdhcheckup-production.service.orig" "$UNIT_PATH"
if [[ -d "$SYS_BACKUP_DIR/dropins.orig" ]]; then
  sudo mkdir -p "${UNIT_PATH}.d"
  sudo cp -a "$SYS_BACKUP_DIR/dropins.orig/." "${UNIT_PATH}.d/"
fi

if [[ -n ${PREVIOUS_CURRENT:-} ]]; then
  [[ -d $PREVIOUS_CURRENT ]] || die "Previous release directory missing: $PREVIOUS_CURRENT"
  ln -s "$PREVIOUS_CURRENT" "$RELEASES/current.rollback"
  mv -Tf "$RELEASES/current.rollback" "$RELEASES/current"
else
  rm -f -- "$RELEASES/current"
fi

sudo systemctl daemon-reload
sudo systemctl restart "$SERVICE"
bash "$TOOLS/healthcheck.sh"

curl --fail --silent --max-time 10 "$PROD_APP_URL/api/v1/health" | node -e '
  let s="";
  process.stdin.on("data",d=>s+=d).on("end",()=>{
    const v=JSON.parse(s).data;
    if(v?.status!=="ok"||v?.database!==true) process.exit(1);
    console.log("Production rollback HTTPS health:", JSON.stringify(v));
  });
' || die "Production HTTPS health verification failed after rollback"

echo "Production application rollback complete (database pdh_healthcheck unchanged)."
