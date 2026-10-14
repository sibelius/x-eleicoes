#!/usr/bin/env bash
# Usage: pnpm secrets:set NAME  — prompts for the value and stores it in the macOS Keychain.
set -euo pipefail
name="${1:?usage: pnpm secrets:set NAME}"
read -rsp "Value for $name: " value; echo
security add-generic-password -U -s x-eleicoes -a "$name" -w "$value"
echo "Saved $name in Keychain (service x-eleicoes)."
