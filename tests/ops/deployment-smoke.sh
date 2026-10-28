#!/usr/bin/env bash
# Isolated smoke harness: no real services, databases, credentials or /var/www writes.
set -Eeuo pipefail
ROOT=$(cd "$(dirname "${BASH_SOURCE[0]}")/../.." && pwd)
FIXTURE=$(mktemp -d)
[[ $FIXTURE == /tmp/tmp.* && $(realpath "$FIXTURE") == /tmp/tmp.* ]] || exit 1
trap 'rm -rf -- "$FIXTURE"' EXIT
export REAL_NODE=$(command -v node)
export OPS_LOG="$FIXTURE/actions.log"
mkdir -p "$FIXTURE/tools" "$FIXTURE/bin" "$FIXTURE/base/shared/staging" "$FIXTURE/base/releases/staging"
cp "$ROOT/deploy/shared/"*.sh "$FIXTURE/tools/"
# The sole source substitution redirects the fixed VPS root into disposable test storage.
sed -i "s|BASE=/var/www/pdhcheckup|BASE=$FIXTURE/base|" "$FIXTURE/tools/common.sh"
printf 'test fixture only\n' > "$FIXTURE/base/shared/staging/.env"
# Git Bash has no flock; lock behavior requires a Linux rehearsal.
cat > "$FIXTURE/bin/flock" <<'MOCK'
#!/usr/bin/env bash
exit 0
MOCK
cat > "$FIXTURE/bin/stat" <<'MOCK'
#!/usr/bin/env bash
echo 600
MOCK
cat > "$FIXTURE/bin/node" <<'MOCK'
#!/usr/bin/env bash
if [[ $1 == --env-file=* ]]; then exit 0; fi
exec "$REAL_NODE" "$@"
MOCK
cat > "$FIXTURE/bin/sudo" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPS_LOG"
MOCK
cat > "$FIXTURE/bin/curl" <<'MOCK'
#!/usr/bin/env bash
printf '%s\n' "$*" >> "$OPS_LOG"
if [[ $* == *api/v1/health* ]]; then printf '{"data":{"status":"ok","database":true}}'; fi
MOCK
chmod +x "$FIXTURE/bin/"*
export PATH="$FIXTURE/bin:$PATH"
export DEPLOY_ENV=staging
RELEASE_ID=20261022T000000-aaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaaa
mkdir -p "$FIXTURE/base/releases/staging/$RELEASE_ID/runtime"
touch "$FIXTURE/base/releases/staging/$RELEASE_ID/runtime/server.js" "$FIXTURE/base/releases/staging/$RELEASE_ID/REVISION"
if bash "$FIXTURE/tools/rollback.sh" "$RELEASE_ID" >/dev/null 2>&1; then echo 'Missing schema review was accepted'; exit 1; fi
if SCHEMA_COMPATIBILITY_REVIEWED=true bash "$FIXTURE/tools/rollback.sh" ../production >/dev/null 2>&1; then echo 'Path traversal was accepted'; exit 1; fi
case "$(uname -s)" in
  MINGW*|MSYS*)
    bash "$FIXTURE/tools/healthcheck.sh"
    grep -q '127.0.0.1:3037/api/v1/health' "$OPS_LOG"
    ! grep -q 'production\|3036' "$OPS_LOG"
    echo 'PASS: schema gate, traversal rejection, staging HTTP health and route probes'
    echo 'SKIP: native atomic symlink activation and flock on Windows; run this harness on Linux'
    exit 0 ;;
esac
SCHEMA_COMPATIBILITY_REVIEWED=true bash "$FIXTURE/tools/rollback.sh" "$RELEASE_ID"
[[ $(readlink "$FIXTURE/base/releases/staging/current") == "$FIXTURE/base/releases/staging/$RELEASE_ID" ]]
grep -q 'systemctl restart pdhcheckup-staging.service' "$OPS_LOG"
grep -q '127.0.0.1:3037/api/v1/health' "$OPS_LOG"
! grep -q 'production\|3036' "$OPS_LOG"
[[ ! -e $FIXTURE/base/releases/production ]]
echo 'PASS: schema gate, traversal rejection, atomic rollback, staging-only restart and health routes'
