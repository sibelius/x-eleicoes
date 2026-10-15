#!/usr/bin/env bash
# Loads secrets from the macOS Keychain (service "x-eleicoes") into the environment, then runs the command.
# Set/update a secret:  pnpm secrets:set X_CLIENT_SECRET   (prompts, value never hits shell history)
set -euo pipefail
SERVICE="x-eleicoes"
# Turso (production DB) is only loaded with USE_PROD_DB=1 — by default local dev uses ./local.db.
names="X_API_KEY X_API_SECRET X_CLIENT_ID X_CLIENT_SECRET AUTH_SECRET APIFY_TOKEN VAPID_PUBLIC_KEY VAPID_PRIVATE_KEY"
[ "${USE_PROD_DB:-0}" = "1" ] && names="$names TURSO_DATABASE_URL TURSO_AUTH_TOKEN"
for name in $names; do
  if value=$(security find-generic-password -s "$SERVICE" -a "$name" -w 2>/dev/null); then
    export "$name=$value"
  fi
done
exec "$@"
