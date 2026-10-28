#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
require_env
# Provision a dedicated local MySQL backup account in a mode-600 client option file.
OPTIONS="$BASE/shared/$DEPLOY_ENV/backup.cnf"
[[ -f $OPTIONS && ! -L $OPTIONS && $(stat -c %a "$OPTIONS") == 600 ]] || die 'Missing mode-600 backup.cnf'
DATABASE=pdh_healthcheck
[[ $DEPLOY_ENV == production ]] || DATABASE=pdh_healthcheck_staging
DEST="$BASE/shared/$DEPLOY_ENV/backups"
mkdir -p "$DEST"
chmod 700 "$DEST"
FILE="$DEST/$(date -u +%Y%m%dT%H%M%S)-$(openssl rand -hex 4).sql.gz"
trap 'rm -f -- "$FILE.partial"' EXIT
mysqldump --defaults-extra-file="$OPTIONS" --host=127.0.0.1 --single-transaction --quick --no-tablespaces --set-gtid-purged=OFF --databases "$DATABASE" | gzip > "$FILE.partial"
gzip -t "$FILE.partial"
[[ -s $FILE.partial ]] || die 'Empty backup'
mv -- "$FILE.partial" "$FILE"
sha256sum "$FILE" > "$FILE.sha256"
echo 'Database backup and checksum created in protected environment backup directory.'
