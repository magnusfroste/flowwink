#!/usr/bin/env bash
# Delete ALL deployed Supabase Edge Functions for a project.
# Usage: ./scripts/delete-all-edge-functions.sh <project-ref>
# Example: ./scripts/delete-all-edge-functions.sh rzhjotxffjfsdlhrdkpj
#
# Requires: supabase CLI authenticated (`supabase login`)
# DANGER: This is irreversible. You will be asked to type DELETE to confirm.

set -euo pipefail

PROJECT_REF="${1:-}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "Usage: $0 <project-ref>"
  exit 1
fi

if ! command -v supabase >/dev/null 2>&1; then
  echo "Error: supabase CLI not found in PATH."
  exit 1
fi

echo "Fetching deployed functions for project: $PROJECT_REF"
# `supabase functions list` outputs a table; extract the NAME column (skip header + separators).
FUNCTIONS=$(supabase functions list --project-ref "$PROJECT_REF" \
  | awk 'NR>1 && $1 !~ /^[-+|]+$/ && $2 != "" && $2 != "NAME" {print $2}' \
  | grep -v '^$' || true)

if [[ -z "$FUNCTIONS" ]]; then
  echo "No deployed functions found."
  exit 0
fi

COUNT=$(echo "$FUNCTIONS" | wc -l | tr -d ' ')
echo ""
echo "Found $COUNT deployed function(s):"
echo "$FUNCTIONS" | sed 's/^/  - /'
echo ""
echo "⚠️  This will DELETE ALL $COUNT functions from project $PROJECT_REF."
read -r -p "Type DELETE to confirm: " CONFIRM
if [[ "$CONFIRM" != "DELETE" ]]; then
  echo "Aborted."
  exit 1
fi

FAILED=()
while IFS= read -r fn; do
  [[ -z "$fn" ]] && continue
  echo "→ Deleting $fn ..."
  if supabase functions delete "$fn" --project-ref "$PROJECT_REF" --no-verify-jwt 2>/dev/null \
     || supabase functions delete "$fn" --project-ref "$PROJECT_REF"; then
    echo "  ✓ deleted"
  else
    echo "  ✗ failed"
    FAILED+=("$fn")
  fi
done <<< "$FUNCTIONS"

echo ""
if [[ ${#FAILED[@]} -eq 0 ]]; then
  echo "✅ All $COUNT functions deleted."
else
  echo "⚠️  ${#FAILED[@]} function(s) failed:"
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
