#!/usr/bin/env bash
# Netlify build: apply database migrations, seed units (and the first admin if
# configured), then build the Next.js app.
set -euo pipefail

# Database connection, in order of preference:
#   DATABASE_URL (+ DIRECT_DATABASE_URL if it goes through a pooler)  any PostgreSQL
#   NETLIFY_DB_URL                                                     Netlify Database
#   NETLIFY_DATABASE_URL (+ NETLIFY_DATABASE_URL_UNPOOLED)              older Netlify DB (Neon extension)
if [ -n "${DATABASE_URL:-}" ]; then DB_SOURCE="DATABASE_URL"; APP_DB_URL="$DATABASE_URL"
elif [ -n "${NETLIFY_DB_URL:-}" ]; then DB_SOURCE="NETLIFY_DB_URL"; APP_DB_URL="$NETLIFY_DB_URL"
elif [ -n "${NETLIFY_DATABASE_URL:-}" ]; then DB_SOURCE="NETLIFY_DATABASE_URL"; APP_DB_URL="$NETLIFY_DATABASE_URL"
else DB_SOURCE=""; APP_DB_URL=""
fi
MIGRATE_DB_URL="${DIRECT_DATABASE_URL:-${NETLIFY_DATABASE_URL_UNPOOLED:-$APP_DB_URL}}"
# Migrations need a direct (non-pooled) connection; on Neon that is the same host without "-pooler".
MIGRATE_DB_URL="${MIGRATE_DB_URL/-pooler./.}"

if [ -z "$MIGRATE_DB_URL" ]; then
  echo "ERROR: no database configured. Enable Netlify Database for this site, or set DATABASE_URL." >&2
  echo "Database-related variables present: $(env | cut -d= -f1 | grep -iE 'DB|DATABASE|POSTGRES|NEON' | tr '\n' ' ')" >&2
  exit 1
fi
echo "Using database from $DB_SOURCE"
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
