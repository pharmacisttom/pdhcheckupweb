#!/usr/bin/env bash
set -Eeuo pipefail
umask 077
[[ ${DEPLOY_ENV:-} == production || ${DEPLOY_ENV:-} == staging ]] || { echo 'Invalid environment' >&2; exit 1; }
BASE=/var/www/pdhcheckup
SOURCE="$BASE/source"
RELEASES="$BASE/releases/$DEPLOY_ENV"
ENV_FILE="$BASE/shared/$DEPLOY_ENV/.env"
SERVICE="pdhcheckup-$DEPLOY_ENV.service"
PORT=3036
[[ $DEPLOY_ENV == production ]] || PORT=3037
TOOLS=$(cd -- "$(dirname -- "${BASH_SOURCE[0]}")" && pwd)
die() { echo "$1" >&2; exit 1; }
require_env() {
  [[ -f $ENV_FILE && ! -L $ENV_FILE ]] || die 'Missing protected environment file'
  [[ $(stat -c %a "$ENV_FILE") == 600 ]] || die 'Environment file must have mode 600'
  env -u DATABASE_URL -u NODE_ENV -u SEED_DEMO -u HOSTNAME -u PORT -u APP_URL -u DATA_ENCRYPTION_KEY -u OTP_PEPPER -u OTP_PROVIDER -u EMAIL_PROVIDER -u EMAIL_FROM -u EMAIL_SENDER_VERIFIED -u SMTP_HOST -u SMTP_PORT -u SMTP_USER -u SMTP_PASSWORD -u RESEND_API_KEY -u EMAIL_DKIM_SELECTOR -u CHAT_ENABLED -u CHAT_AI_ENABLED -u CHAT_AI_PROVIDER -u CHAT_EXTERNAL_PROCESSING_APPROVED -u CHAT_AI_MODEL -u CHAT_AI_API_KEY -u CHAT_AI_ENDPOINT -u CHAT_AI_MAX_CALL_USD node --env-file="$ENV_FILE" "$TOOLS/validate-env.mjs" "$DEPLOY_ENV"
}
with_env() { env -u DATABASE_URL -u NODE_ENV -u SEED_DEMO -u HOSTNAME -u PORT -u APP_URL -u DATA_ENCRYPTION_KEY -u OTP_PEPPER -u OTP_PROVIDER -u EMAIL_PROVIDER -u EMAIL_FROM -u EMAIL_SENDER_VERIFIED -u SMTP_HOST -u SMTP_PORT -u SMTP_USER -u SMTP_PASSWORD -u RESEND_API_KEY -u EMAIL_DKIM_SELECTOR -u CHAT_ENABLED -u CHAT_AI_ENABLED -u CHAT_AI_PROVIDER -u CHAT_EXTERNAL_PROCESSING_APPROVED -u CHAT_AI_MODEL -u CHAT_AI_API_KEY -u CHAT_AI_ENDPOINT -u CHAT_AI_MAX_CALL_USD node --env-file="$ENV_FILE" "$TOOLS/run.mjs" "$@"; }
lock_environment() {
  mkdir -p "$RELEASES"
  exec 9>"$RELEASES/.deploy.lock"
  flock -n 9 || die 'Another deployment or rollback is running'
}
