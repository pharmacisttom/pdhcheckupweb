#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
[[ $# == 2 ]] || die 'Usage: deploy.sh BRANCH FULL_COMMIT_SHA; requires APPROVED_MIGRATIONS_SHA256'
BRANCH=$1
SHA=$2
[[ $SHA =~ ^[a-f0-9]{40}$ ]] || die 'Use a full 40-character commit SHA'
git check-ref-format --branch "$BRANCH" >/dev/null
[[ $BRANCH != -* ]] || die 'Invalid branch'
lock_environment
require_env
[[ $(realpath "$TOOLS") == "$SOURCE/deploy/shared" ]] || die 'Run tooling from the reviewed source checkout'
cd "$SOURCE"
[[ -z $(git status --porcelain) ]] || die 'Source working tree must be clean'
[[ $(git branch --show-current) == "$BRANCH" ]] || die 'Source checkout is on another branch'
git fetch origin "refs/heads/$BRANCH"
[[ $(git rev-parse FETCH_HEAD) == "$SHA" && $(git rev-parse HEAD) == "$SHA" ]] || die 'Selected SHA must match checkout and fetched branch tip'
RELEASE="$RELEASES/$(date -u +%Y%m%dT%H%M%S)-$SHA"
mkdir "$RELEASE"
git archive "$SHA" | tar -x -C "$RELEASE"
cd "$RELEASE"
# This script must be run from this same reviewed commit, never a different checkout.
diff -qr "$TOOLS" deploy/shared >/dev/null || die 'Deployment tooling differs from selected commit'
TOOLS="$RELEASE/deploy/shared"
ln -s "$ENV_FILE" .env
npm ci --include=dev
with_env npx prisma generate
with_env npm run typecheck
with_env npm run lint
RUN_DB_TESTS=false with_env npm test
with_env npm run build
mkdir runtime
cp -a .next/standalone/. runtime/
mkdir -p runtime/.next
cp -a .next/static runtime/.next/static
cp -a public runtime/public
# Never copy a secret-bearing build .env into the runtime artifact.
rm -f -- runtime/.env runtime/.env.production runtime/.env.local
printf '%s\n' "$SHA" > REVISION
DIGEST=$(find prisma/migrations -type f -name migration.sql -print0 | sort -z | xargs -0 sha256sum | sha256sum | cut -d' ' -f1)
[[ ${APPROVED_MIGRATIONS_SHA256:-} == "$DIGEST" ]] || die "Review migration SQL and rerun with APPROVED_MIGRATIONS_SHA256=$DIGEST"
# Status returns nonzero for pending migrations; deploy is authoritative for failures.
with_env npx prisma migrate status || echo 'Migration status requires review; approved digest is required and deploy will fail closed.'
bash "$TOOLS/backup.sh"
with_env npx prisma migrate deploy
PREVIOUS=
if [[ -L $RELEASES/current ]]; then PREVIOUS=$(readlink -e "$RELEASES/current");
elif [[ -e $RELEASES/current ]]; then die 'Current must be a release symlink'; fi
[[ -z $PREVIOUS || $PREVIOUS == "$RELEASES/"* ]] || die 'Current release resolves outside environment'
if [[ -n $PREVIOUS ]]; then
  ln -s "$PREVIOUS" "$RELEASES/previous.next"
  mv -Tf "$RELEASES/previous.next" "$RELEASES/previous"
fi
ln -s "$RELEASE" "$RELEASES/current.next"
mv -Tf "$RELEASES/current.next" "$RELEASES/current"
if ! sudo systemctl restart "$SERVICE" || ! bash "$TOOLS/healthcheck.sh"; then
  echo 'Activation failed. Database changes are retained; review schema compatibility before application rollback.' >&2
  echo "Run: bash deploy/$DEPLOY_ENV/rollback.sh PREVIOUS_RELEASE_ID" >&2
  exit 1
fi
echo "Activated $DEPLOY_ENV commit $SHA. Verify public HTTPS, authenticated MFA and booking workflows manually."
