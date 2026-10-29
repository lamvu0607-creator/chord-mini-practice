#!/usr/bin/env sh
set -eu

BASE_URL="${BASE_URL:-http://localhost:3000}"
curl --fail --silent --show-error "${BASE_URL}/api/persistence/health"
curl --fail --silent --show-error "${BASE_URL}/api/health"
echo "Deployment health checks passed"
