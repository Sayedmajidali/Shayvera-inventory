#!/usr/bin/env bash
# Netlify build: apply database migrations, seed units (and the first admin if
# configured), then build the Next.js app.
set -euo pipefail

# A connected Netlify DB provides NETLIFY_DATABASE_URL (pooled) and
# NETLIFY_DATABASE_URL_UNPOOLED (direct). Any other PostgreSQL uses
# DATABASE_URL, plus DIRECT_DATABASE_URL when DATABASE_URL goes through a pooler.
APP_DB_URL="${DATABASE_URL:-${NETLIFY_DATABASE_URL:-}}"
MIGRATE_DB_URL="${DIRECT_DATABASE_URL:-${NETLIFY_DATABASE_URL_UNPOOLED:-$APP_DB_URL}}"

if [ -z "$MIGRATE_DB_URL" ]; then
  echo "ERROR: no database configured. Connect Netlify DB to this site, or set DATABASE_URL." >&2
  exit 1
fi
SECRET="${SESSION_SECRET:-}"
if [ "${#SECRET}" -lt 32 ]; then
  echo "ERROR: set SESSION_SECRET (at least 32 random characters) in Site configuration > Environment variables." >&2
  exit 1
fi
if [ "${STORAGE_DRIVER:-}" != "netlify" ] && [ "${STORAGE_DRIVER:-}" != "s3" ]; then
  echo "ERROR: set STORAGE_DRIVER=netlify (Netlify Blobs) or s3. Local disk storage does not persist on Netlify." >&2
  exit 1
fi

echo "Applying database migrations..."
DATABASE_URL="$MIGRATE_DB_URL" npx prisma migrate deploy

echo "Seeding units and first administrator (skipped if they already exist)..."
DATABASE_URL="$MIGRATE_DB_URL" npx prisma db seed

echo "Building the app..."
npm run build
