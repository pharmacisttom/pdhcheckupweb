#!/usr/bin/env bash
set -Eeuo pipefail
export DEPLOY_ENV=staging
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/../shared/deploy.sh" "$@"
