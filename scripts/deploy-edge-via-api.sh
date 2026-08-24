#!/usr/bin/env bash
#
# REQUIRES bash 4+. macOS ships bash 3.2 as /bin/bash, which cannot PARSE this
# file (the failure is a cryptic "unexpected EOF while looking for matching )",
# raised before a single line runs, so no in-script version check can catch it).
# On macOS run it as:  /opt/homebrew/bin/bash scripts/deploy-edge-via-api.sh ...
#
# deploy-edge-via-api.sh — deploy a Supabase edge function via the Management API
# (HTTPS), with NO supabase CLI and NO direct Postgres access required.
#
# Why this exists: the Supabase CLI needs Docker + a direct DB/socket path that
# some environments (sandboxes, CI behind an HTTPS-only proxy) don't have, and
# Lovable's redeploy ships ITS sandbox copy — which can lag `main`, silently
# deploying a stale function (we hit exactly this: ai-task stuck at a June-07
# build with none of the new tasks). This script bundles a function's local
# dependency closure and POSTs it to:
#   POST https://api.supabase.com/v1/projects/{ref}/functions/deploy?slug={fn}
# so the CURRENT repo code reaches any instance you have a management token for —
# including forks the CLI/Lovable don't manage.
#
# Usage:
#   export SBP_TOKEN=sbp_...            # Management API token for that account
#   bash scripts/deploy-edge-via-api.sh <project-ref> <function-name> [--verify-jwt]
#
# Example:
#   SBP_TOKEN=sbp_xxx bash scripts/deploy-edge-via-api.sh <project-ref> ai-task
#
# Notes:
#   * Public/agent-called functions deploy with verify_jwt=false by default; pass
#     --verify-jwt for admin-only functions.
#   * The dependency closure is computed from local `from '...'` relative imports;
#     remote (https://) imports are fetched by Supabase's bundler at deploy time.
#   * Files are uploaded under paths relative to supabase/functions/ so that
#     `../_shared/x.ts` resolves correctly.
set -euo pipefail

REF="${1:?usage: deploy-edge-via-api.sh <ref> <function> [--verify-jwt]}"
FN="${2:?missing function name}"
VERIFY_JWT=false
[[ "${3:-}" == "--verify-jwt" ]] && VERIFY_JWT=true
: "${SBP_TOKEN:?export SBP_TOKEN with a Supabase Management API token}"

cd "$(dirname "$0")/../supabase/functions"

# Compute the local dependency closure (entry + transitively-imported relative files).
#
# Captured with `$(...)` rather than read from `< <(...)` so the python exit
# code is VISIBLE. Inside `< <(...)` a failing generator is invisible to
# `set -e`: python exits 1, the loop reads nothing, and the script sails on with
# an EMPTY closure — which is how "MISSING local imports" once turned into a
# silent 0-file deploy. With command substitution the failure propagates.
#
# This does NOT make the file bash 3.2-parseable, and pretending otherwise would
# be its own small lie: 3.2's `$()` scanner trips over the quote soup in the
# python body below (`['\"]`), exactly as it did over the process substitution
# before. Getting there means moving the python into its own .py file. Not worth
# it for a legacy manual-deploy path — the fleet syncs via scripts/sync-forks.sh
# now. See the REQUIRES note at the top of this file.
_CLOSURE=$(python3 - "$FN" <<'PY'
import re, os, sys
fn = sys.argv[1]
def imports_of(p):
    if not os.path.isfile(p): return []
    txt = open(p, encoding='utf-8').read(); out=[]
    for m in re.finditer(r"""from\s+['"]([^'"]+)['"]""", txt):
        s = m.group(1)
        if s.startswith('.'):
            out.append(os.path.normpath(os.path.join(os.path.dirname(p), s)))
    return out
start = f"{fn}/index.ts"
if not os.path.isfile(start):
    sys.exit(f"no entrypoint {start}")
seen={start}; queue=[start]; missing=[]
while queue:
    f=queue.pop()
    for d in imports_of(f):
        # JSON module imports (`from "./x.json" with { type: "json" }`) are
        # already complete paths — appending .ts broke the closure and made
        # the script bail with "MISSING ... _templates.json.ts" (0 files).
        if not d.endswith('.ts') and not d.endswith('.json'): d+='.ts'
        if d in seen: continue
        seen.add(d)
        queue.append(d) if os.path.isfile(d) else missing.append(d)
if missing:
    sys.exit("MISSING local imports: "+", ".join(missing))
for f in sorted(seen): print(f)
PY
)

FILES=()
while IFS= read -r _line; do
  [ -n "$_line" ] && FILES+=("$_line")
done <<< "$_CLOSURE"

# A function may carry its own import map (deno.json) for BARE specifiers —
# `from "hono"`, `from "mcp-lite"`. Those are not paths, so the closure walker
# above never sees them; without the map the bundler fails with
# `Relative import path "x" not prefixed with / or ./ or ../`. Ship the map and
# tell the API where it is. (Found empirically: mcp-server was undeployable
# through this script until the map was included.)
IMPORT_MAP=""
if [ -f "$FN/deno.json" ]; then
    IMPORT_MAP="$FN/deno.json"
    FILES+=("$IMPORT_MAP")
elif [ -f "$FN/import_map.json" ]; then
    IMPORT_MAP="$FN/import_map.json"
    FILES+=("$IMPORT_MAP")
fi

echo "Deploying '$FN' to $REF  (verify_jwt=$VERIFY_JWT, ${#FILES[@]} files${IMPORT_MAP:+, import map: $IMPORT_MAP})"
printf '  + %s\n' "${FILES[@]}"

META="{\"entrypoint_path\":\"$FN/index.ts\",\"name\":\"$FN\",\"verify_jwt\":$VERIFY_JWT"
[ -n "$IMPORT_MAP" ] && META="$META,\"import_map_path\":\"$IMPORT_MAP\""
META="$META}"

ARGS=(-F "metadata=$META;type=application/json")
for f in "${FILES[@]}"; do ARGS+=(-F "file=@$f;filename=$f"); done

# Capture the HTTP status separately. An API error is still valid JSON, so
# parsing alone proves nothing: a 403 used to parse fine, yield slug=None, print
# "-> None vNone None" and exit 0 — a deploy that never happened, reported as if
# it had. Status first, then shape.
resp=$(curl -s -m 180 -w '\n%{http_code}' -X POST \
  "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$FN" \
  -H "Authorization: Bearer $SBP_TOKEN" "${ARGS[@]}")

code="${resp##*$'\n'}"
payload="${resp%$'\n'*}"

if [ "$code" -lt 200 ] 2>/dev/null || [ "$code" -ge 300 ] 2>/dev/null; then
  echo "  !! deploy FAILED — HTTP $code" >&2
  echo "     $(printf '%s' "$payload" | head -c 300)" >&2
  [ "$code" = "403" ] && echo "     (SBP_TOKEN has no access to project $REF — wrong account?)" >&2
  exit 1
fi

printf '%s' "$payload" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw)
except Exception:
    print("  !! deploy returned non-JSON: " + raw[:300]); sys.exit(1)
slug, ver, status = d.get("slug"), d.get("version"), d.get("status")
if not slug:
    print("  !! deploy returned 2xx without a function body: " + raw[:300]); sys.exit(1)
print("  -> {} v{} {}".format(slug, ver, status))'
