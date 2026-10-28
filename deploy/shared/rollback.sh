#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# == 1 && $1 =~ ^[0-9]{8}T[0-9]{6}-[a-f0-9]{40}$ ]] || die 'Supply a reviewed release directory ID'
[[ ${SCHEMA_COMPATIBILITY_REVIEWED:-} == true ]] || die 'Set SCHEMA_COMPATIBILITY_REVIEWED=true only after reviewing current database compatibility'
lock_environment
require_env
TARGET=$(realpath -e "$RELEASES/$1")
[[ $TARGET == "$RELEASES/$1" && -f $TARGET/runtime/server.js && -f $TARGET/REVISION ]] || die 'Invalid release target'
ln -s "$TARGET" "$RELEASES/current.next"
mv -Tf "$RELEASES/current.next" "$RELEASES/current"
sudo systemctl restart "$SERVICE"
bash "$TOOLS/healthcheck.sh"
echo 'Application rollback complete; database unchanged.'
