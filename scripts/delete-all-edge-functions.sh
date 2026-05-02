#!/usr/bin/env bash
# Delete ALL deployed Supabase Edge Functions for a project.
# Usage: ./scripts/delete-all-edge-functions.sh <project-ref>
# Example: ./scripts/delete-all-edge-functions.sh rzhjotxffjfsdlhrdkpj
#
# Requires: supabase CLI (logged in), jq
# DANGER: Irreversible. You must type DELETE to confirm.

set -euo pipefail

PROJECT_REF="${1:-}"
if [[ -z "$PROJECT_REF" ]]; then
  echo "Usage: $0 <project-ref>"
  exit 1
fi

for cmd in supabase jq; do
  if ! command -v "$cmd" >/dev/null 2>&1; then
    echo "Error: '$cmd' not found in PATH."
    exit 1
  fi
done

echo "Fetching deployed functions for project: $PROJECT_REF"

# Use JSON output (works on supabase CLI >= 1.150). Fallback to table parsing if JSON fails.
RAW_JSON="$(supabase functions list --project-ref "$PROJECT_REF" --output json 2>/dev/null || true)"

if [[ -n "$RAW_JSON" ]] && echo "$RAW_JSON" | jq empty 2>/dev/null; then
  FUNCTIONS=$(echo "$RAW_JSON" | jq -r '.[] | (.slug // .name)' | grep -v '^$' || true)
else
  echo "JSON output unavailable, falling back to table parsing..."
  # Strip box-drawing chars, then grab the 2nd column (NAME / SLUG).
  FUNCTIONS=$(supabase functions list --project-ref "$PROJECT_REF" \
    | sed 's/[│┃|]/ /g; s/[─━┄┈]//g' \
    | awk 'NR>2 && NF>=2 && $2 !~ /^(NAME|SLUG|ID)$/ {print $2}' \
    | grep -v '^$' || true)
fi

if [[ -z "$FUNCTIONS" ]]; then
  echo "No deployed functions found (or could not parse output)."
  echo ""
  echo "Try running manually to see raw output:"
  echo "  supabase functions list --project-ref $PROJECT_REF"
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
DELETED=0
while IFS= read -r fn; do
  [[ -z "$fn" ]] && continue
  echo "→ Deleting $fn ..."
  if supabase functions delete "$fn" --project-ref "$PROJECT_REF"; then
    echo "  ✓ deleted"
    DELETED=$((DELETED + 1))
  else
    echo "  ✗ failed"
    FAILED+=("$fn")
  fi
done <<< "$FUNCTIONS"

echo ""
echo "Deleted: $DELETED / $COUNT"
if [[ ${#FAILED[@]} -gt 0 ]]; then
  echo "⚠️  Failed:"
  printf '  - %s\n' "${FAILED[@]}"
  exit 1
fi
echo "✅ Done."
