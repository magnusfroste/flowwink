#!/usr/bin/env bash
#
# deploy-fleet.sh — ship the 3 non-frontend layers (migrations, edge functions,
# skills) to a FlowWink instance. The frontend deploys separately (Vercel auto
# for www/demo from `main`; a manual rebuild for forks/separate accounts).
#
# A `git push` ships ONLY the frontend, and only to www + demo. Everything this
# script does must run per-instance — see docs/operators/provisioning-and-updates.md.
#
# Usage:
#   # 1. Be logged into the Supabase account that owns the target project:
#   supabase login                     # or: export SUPABASE_ACCESS_TOKEN=sbp_...
#   # 2. Provide the DB password for that project (Project Settings → Database):
#   export PGPW='<db password>'
#   # 3. Run for one instance (or `all`):
#   bash scripts/deploy-fleet.sh www
#   bash scripts/deploy-fleet.sh liteit
#   bash scripts/deploy-fleet.sh all
#
# Notes:
#   * Idempotent — migrations use IF NOT EXISTS / CREATE OR REPLACE; sync:skills
#     and lint:skill are read-then-upsert. Safe to re-run.
#   * liteit & autoversio live in DIFFERENT Supabase accounts — switch your
#     `supabase login` / SUPABASE_ACCESS_TOKEN and PGPW for each before running.
#   * autoversio is a FORK: its frontend does NOT auto-deploy from `main` — rebuild
#     it manually and notify the owner.
#   * Override the edge-function set with EDGE_FNS="fn1 fn2"; default is the set
#     changed in the latest content/operator release.
#
set -euo pipefail

FLEET_JSON="$(dirname "$0")/fleet.json"

# Edge functions changed in the current release. Override via EDGE_FNS=… .
# All are agent/server/webhook/cron-invoked → must deploy with --no-verify-jwt
# (an interactive admin JWT is never present on these call paths).
EDGE_FNS="${EDGE_FNS:-agent-execute ai-task composio-proxy composio-webhook}"

ref_for() {
  node -e "const f=require('$FLEET_JSON');const i=f.instances.find(x=>x.name==='$1');if(!i){console.error('unknown instance: $1');process.exit(1)}process.stdout.write(i.ref)"
}

# db.<ref>.supabase.co resolves IPv6-only — unreachable from IPv4-only networks.
# Use the instance's Supavisor pooler (user postgres.<ref>, port 6543) when
# fleet.json declares one. PGPW is read from the environment, not interpolated.
db_url_for() {
  node -e "const f=require('$FLEET_JSON');const i=f.instances.find(x=>x.name==='$1');if(!i){console.error('unknown instance: $1');process.exit(1)}const pw=process.env.PGPW;process.stdout.write(i.poolerHost?('postgresql://postgres.'+i.ref+':'+pw+'@'+i.poolerHost+':6543/postgres'):('postgresql://postgres:'+pw+'@db.'+i.ref+'.supabase.co:5432/postgres'))"
}

deploy_one() {
  local name="$1" ref
  ref="$(ref_for "$name")"
  echo ""
  echo "════════════════════════════════════════════════════════════"
  echo "  $name  (ref: $ref)"
  echo "════════════════════════════════════════════════════════════"

  if [[ -z "${PGPW:-}" ]]; then
    echo "✗ PGPW not set — export the DB password for $name and re-run." >&2
    return 1
  fi
  local dburl
  dburl="$(db_url_for "$name")"

  echo "── 1/4  Migrations (db push, idempotent) ──────────────────"
  supabase db push --project-ref "$ref"

  echo "── 2/4  Edge functions (--no-verify-jwt) ──────────────────"
  for fn in $EDGE_FNS; do
    echo "   deploy: $fn"
    supabase functions deploy "$fn" --no-verify-jwt --project-ref "$ref"
  done

  echo "── 3/4  Skill sync (dry-run → apply) ──────────────────────"
  DATABASE_URL="$dburl" npm run --silent sync:skills           # dry-run, writes nothing
  DATABASE_URL="$dburl" npm run --silent sync:skills -- --apply

  echo "── 4/4  Verify (skill-linter) ─────────────────────────────"
  DATABASE_URL="$dburl" npm run --silent lint:skill

  echo "✓ $name up to date (backend layers). Frontend deploys separately."
}

main() {
  local target="${1:-}"
  if [[ -z "$target" ]]; then
    echo "usage: bash scripts/deploy-fleet.sh <www|demo|liteit|autoversio|all>" >&2
    exit 1
  fi

  # Always refresh the versioned artifact first so the sync mirrors current code.
  echo "Regenerating skill artifact (npm run skills:json)…"
  npm run --silent skills:json

  if [[ "$target" == "all" ]]; then
    for n in www demo liteit autoversio; do deploy_one "$n"; done
  else
    deploy_one "$target"
  fi
  echo ""
  echo "Done. Fleet health snapshot:  PGPW=… npm run fleet:status"
}

main "$@"
