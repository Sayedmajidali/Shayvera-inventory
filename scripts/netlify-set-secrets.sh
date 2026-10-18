#!/usr/bin/env bash
# Interactive: store the production settings that are secret or personal on the
# linked Netlify site (run `npx netlify-cli link` first). Nothing typed here is
# echoed or printed; the session secret is generated and never shown.
set -euo pipefail

NETLIFY=(npx --yes netlify-cli@27.10.2)

read -r -s -p "Neon POOLED connection string (input hidden): " DB
echo
case "$DB" in
  postgresql://*-pooler*|postgres://*-pooler*) ;;
  postgresql://*|postgres://*) echo "Note: this isn't the pooled string (no '-pooler' in the address). Continuing anyway." ;;
  *) echo "That doesn't look like a PostgreSQL connection string. Nothing was saved." >&2; exit 1 ;;
esac

read -r -p "Administrator email: " EMAIL
[[ "$EMAIL" == *@*.* ]] || { echo "Enter a valid email. Nothing was saved." >&2; exit 1; }
read -r -p "Administrator name: " NAME
[ -n "$NAME" ] || NAME="Shayvera Admin"

while true; do
  read -r -s -p "Administrator password, 10+ characters (input hidden): " PW
  echo
  read -r -s -p "Repeat the password: " PW2
  echo
  if [ "${#PW}" -lt 10 ]; then echo "Too short, try again."; continue; fi
  if [ "$PW" != "$PW2" ]; then echo "The passwords don't match, try again."; continue; fi
  break
done

echo "Saving to Netlify..."
save() { # name value [extra flags...]; output is discarded so values never reach the screen
  local name="$1" value="$2"
  shift 2
  if "${NETLIFY[@]}" env:set "$name" "$value" "$@" >/dev/null 2>&1; then
    echo "  saved $name"
  else
    echo "  FAILED to save $name (is this folder linked? run: npx netlify-cli@27.10.2 link)" >&2
    exit 1
  fi
}
save DATABASE_URL "$DB" --secret --context production
save SESSION_SECRET "$(openssl rand -hex 32)" --secret --context production
save SEED_ADMIN_EMAIL "$EMAIL"
save SEED_ADMIN_NAME "$NAME"
save SEED_ADMIN_PASSWORD "$PW" --secret --context production
unset DB PW PW2

echo "Done. Tell Claude 'done' so it can start the deploy."
