#!/usr/bin/env sh
set -eu

test -f package-lock.json
test -f drizzle/0000_local_persistence.sql
test -f docker/nginx.conf
npm run lint
npx tsc --noEmit
npm test -- --runInBand
npm run build

if git grep -nEi 'legacy-cloud-sdk|legacy-document-store' -- ':!src/app/changelog/page.tsx'; then
  echo "Removed infrastructure references remain in the repository" >&2
  exit 1
fi

echo "Pre-deployment checks passed"
