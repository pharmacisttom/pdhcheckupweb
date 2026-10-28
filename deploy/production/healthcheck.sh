#!/usr/bin/env bash
set -Eeuo pipefail
export DEPLOY_ENV=production
exec bash "$(dirname -- "${BASH_SOURCE[0]}")/../shared/healthcheck.sh" "$@"
