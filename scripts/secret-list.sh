#!/usr/bin/env bash
# Lists which secrets exist in the macOS Keychain (service "x-eleicoes"), without printing values.
for name in X_CLIENT_ID X_CLIENT_SECRET AUTH_SECRET TURSO_DATABASE_URL TURSO_AUTH_TOKEN; do
  if security find-generic-password -s x-eleicoes -a "$name" >/dev/null 2>&1; then echo "✓ $name"; else echo "· $name (not set)"; fi
done
