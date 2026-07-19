#!/usr/bin/env bash
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
#   SBP_TOKEN=sbp_xxx bash scripts/deploy-edge-via-api.sh lcztuuaxulxivhbnkcpm ai-task
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
mapfile -t FILES < <(python3 - "$FN" <<'PY'
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

resp=$(curl -s -m 180 -X POST \
  "https://api.supabase.com/v1/projects/$REF/functions/deploy?slug=$FN" \
  -H "Authorization: Bearer $SBP_TOKEN" "${ARGS[@]}")

echo "$resp" | python3 -c '
import sys, json
raw = sys.stdin.read()
try:
    d = json.loads(raw)
    slug = d.get("slug"); ver = d.get("version"); status = d.get("status")
    print("  -> {} v{} {}".format(slug, ver, status))
except Exception:
    print("  -> " + raw[:300]); sys.exit(1)'
