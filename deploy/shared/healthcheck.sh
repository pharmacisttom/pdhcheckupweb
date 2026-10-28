#!/usr/bin/env bash
set -Eeuo pipefail
source "$(dirname -- "${BASH_SOURCE[0]}")/common.sh"
for attempt in {1..30}; do
  if curl --fail --silent --max-time 5 "http://127.0.0.1:$PORT/api/v1/health" | node -e 'let s="";process.stdin.on("data",d=>s+=d).on("end",()=>{try{const v=JSON.parse(s).data;process.exit(v?.status==="ok"&&v?.database===true?0:1)}catch{process.exit(1)}})'; then
    for route in / /login /api/v1/packages /api/v1/booking-policy; do
      curl --fail --silent --output /dev/null --max-time 10 "http://127.0.0.1:$PORT$route" || exit 1
    done
    echo "$DEPLOY_ENV HTTP and database health passed on loopback port $PORT"
    exit 0
  fi
  sleep 2
done
echo 'Health check failed' >&2
exit 1
