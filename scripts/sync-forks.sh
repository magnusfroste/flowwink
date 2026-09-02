#!/usr/bin/env bash
# sync-forks.sh — propagate main to every fleet fork, waking their backends.
#
# The deploy topology (proven 2026-08-12): each customer instance is a GitHub
# FORK paired with its own Supabase project via the GitHub integration. A push
# to the fork's main applies supabase/migrations/ and deploys every function in
# config.toml — the full backend, no CLI, no Docker. But forks do NOT follow
# upstream on their own, and the Supabase pairing only triggers on a PUSH to
# the fork: a fork synced BEFORE its pairing was enabled sits idle forever
# (observed: three instances, 14 minutes, zero ledger movement — the pairing
# had nothing to wake on).
#
# This script is that push. It calls the same endpoint as GitHub's "Sync fork"
# button (POST /repos/{fork}/merge-upstream) with a per-fork token from
# .env.local:
#
#   GITHUB_TOKEN_<NAME>=ghp_…   GITHUB_REPO_<NAME>=owner/repo
#
# Tokens need Contents: Read and write on their fork — nothing more. Repos are
# listed here (they are not secrets); tokens never are.
#
# Usage:
#   ./scripts/sync-forks.sh          # sync every fork
#   ./scripts/sync-forks.sh liteit   # sync one
#
# After a sync, each paired Supabase project deploys itself. Verify with the
# ledger (SELECT max(version) FROM supabase_migrations.schema_migrations) or
# npm run fleet:status — do not trust "merge succeeded" alone; the ledger is
# the deploy's end state, the merge is only its trigger.
set -euo pipefail

cd "$(dirname "$0")/.."
FORKS="WWW OPTIC LITEIT AUTOVERSIO RESTA LABS1100"
ONLY="${1:-}"

# Portable uppercase. `${ONLY^^}` is bash 4+, and macOS ships bash 3.2 as
# /bin/bash — so `#!/usr/bin/env bash` resolves to a shell that fails this line
# with "bad substitution" and, under `set -e`, kills the whole run. Observed
# 2026-08-23: a full fleet sync aborted before touching a single fork.
if [ -n "$ONLY" ]; then
  ONLY_UC=$(printf '%s' "$ONLY" | tr '[:lower:]' '[:upper:]')
  case " $FORKS " in
    *" $ONLY_UC "*) ;;
    *)
      printf 'Okänd fork: %s\nGiltiga: %s\n' "$ONLY" "$FORKS" >&2
      exit 2
      ;;
  esac
fi

fail=0
for NAME in $FORKS; do
  # An unmatched filter used to fall through here silently and exit 0 having
  # synced nothing — a no-op that reads exactly like a successful sync. The
  # validation above turns that into a refusal.
  [ -n "$ONLY" ] && [ "$ONLY_UC" != "$NAME" ] && continue
  TOKEN=$(grep -E "^GITHUB_TOKEN_${NAME}=" .env.local | grep -oE "(ghp_|github_pat_)[A-Za-z0-9_]+" | head -1 || true)
  REPO=$(grep -E "GITHUB_REPO_${NAME}=" .env.local | grep -oE "GITHUB_REPO_${NAME}=[^ ]+" | cut -d= -f2 || true)
  if [ -z "$TOKEN" ] || [ -z "$REPO" ]; then
    printf "%-11s SKIPPAD — GITHUB_TOKEN_%s/GITHUB_REPO_%s saknas i .env.local\n" "$NAME" "$NAME" "$NAME"
    fail=1
    continue
  fi
  RESP=$(curl -s -X POST "https://api.github.com/repos/${REPO}/merge-upstream" \
    -H "Authorization: Bearer ${TOKEN}" \
    -H "Accept: application/vnd.github+json" \
    -d '{"branch":"main"}')
  MSG=$(printf '%s' "$RESP" | python3 -c "import sys,json; d=json.load(sys.stdin); print(d.get('message') or d.get('merge_type') or '?')")
  printf "%-11s %-28s → %s\n" "$NAME" "$REPO" "$MSG"
  case "$MSG" in
    *"not behind"*|*"Successfully fetched"*|fast-forward|merge|none) ;;
    *) fail=1 ;;
  esac
done
exit $fail
