#!/bin/bash

# FlowWink Supabase Setup Script
# This script sets up the complete Supabase backend for self-hosting
#
# Usage:
#   ./scripts/setup-supabase.sh          # Interactive menu (run any step)
#   ./scripts/setup-supabase.sh --all    # Run all steps (first-time setup)
#   ./scripts/setup-supabase.sh --fresh  # Fresh start (logout, clear cache)
#   ./scripts/setup-supabase.sh --env    # Just show environment variables

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
NC='\033[0m' # No Color

# Parse flags
RUN_ALL=false
ENV_ONLY=false
FRESH=false

for arg in "$@"; do
    case "$arg" in
        --all)   RUN_ALL=true ;;
        --env)   ENV_ONLY=true ;;
        --fresh) FRESH=true ;;
    esac
done

# ─── Fresh start ───
if [ "$FRESH" = true ]; then
    echo -e "${YELLOW}Fresh start requested - clearing all cached data...${NC}"
    echo ""
    if command -v supabase &> /dev/null; then
        echo "y" | supabase logout 2>/dev/null || true
        echo -e "${GREEN}✓ Logged out from Supabase CLI${NC}"
    fi
    if [ -d "supabase/.temp" ]; then
        rm -rf supabase/.temp
        echo -e "${GREEN}✓ Cleared cached project link${NC}"
    fi
    echo ""
fi

# ─── Header ───
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlowWink Supabase Setup                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# ─── Prerequisites ───
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# ─── Login check ───
echo -e "${YELLOW}Checking Supabase login status...${NC}"
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Supabase CLI${NC}"
    echo ""
    read -p "Would you like to login now? [Y/n]: " do_login
    if [[ ! "$do_login" =~ ^[Nn]$ ]]; then
        echo ""
        supabase login
        echo ""
        if ! supabase projects list &> /dev/null; then
            echo -e "${RED}Login failed. Please try again.${NC}"
            exit 1
        fi
    else
        echo -e "${RED}Login required to continue.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ Logged in to Supabase${NC}"

# ─── Project selection ───
echo ""
echo -e "${BLUE}Your Supabase projects:${NC}"
echo ""

PROJECTS=$(supabase projects list --output json 2>/dev/null || echo "[]")
if [ "$PROJECTS" == "[]" ] || [ -z "$PROJECTS" ]; then
    echo -e "${RED}No projects found. Create one at supabase.com first.${NC}"
    exit 1
fi

echo "$PROJECTS" | jq -r 'to_entries | .[] | "\(.key + 1)) \(.value.name) (\(.value.id)) - \(.value.region)"'
echo ""

CURRENT_REF=""
PROJECT_COUNT=$(echo "$PROJECTS" | jq 'length')

if [ -f "supabase/.temp/project-ref" ]; then
    CURRENT_REF=$(cat supabase/.temp/project-ref)
    CURRENT_NAME=$(echo "$PROJECTS" | jq -r --arg ref "$CURRENT_REF" '.[] | select(.id == $ref) | .name' 2>/dev/null || echo "")
    
    if [ -n "$CURRENT_NAME" ] && [ "$CURRENT_NAME" != "null" ]; then
        echo -e "${YELLOW}Currently linked to: ${CURRENT_NAME} (${CURRENT_REF})${NC}"
        echo ""
        read -p "Use this project? [Y/n] or enter number to switch: " use_current
        if [[ "$use_current" =~ ^[0-9]+$ ]]; then
            rm -rf supabase/.temp
            CURRENT_REF=""
            selection="$use_current"
        elif [[ "$use_current" =~ ^[Nn]$ ]]; then
            rm -rf supabase/.temp
            CURRENT_REF=""
            selection=""
        fi
    else
        echo -e "${YELLOW}Previously linked project no longer exists.${NC}"
        rm -rf supabase/.temp
        CURRENT_REF=""
        selection=""
    fi
fi

if [ -z "$CURRENT_REF" ]; then
    if [ -z "$selection" ]; then
        read -p "Select project number (1-${PROJECT_COUNT}): " selection
    fi
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$PROJECT_COUNT" ]; then
        echo -e "${RED}Invalid selection${NC}"
        exit 1
    fi
    PROJECT_REF=$(echo "$PROJECTS" | jq -r ".[$((selection - 1))].id")
    PROJECT_NAME=$(echo "$PROJECTS" | jq -r ".[$((selection - 1))].name")
    echo ""
    echo -e "${YELLOW}Linking to ${PROJECT_NAME} (${PROJECT_REF})...${NC}"
    supabase link --project-ref "$PROJECT_REF"
else
    PROJECT_REF="$CURRENT_REF"
fi

echo -e "${GREEN}✓ Project linked: ${PROJECT_REF}${NC}"

# ─── Detect current status ───
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
API_KEYS=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null || echo "[]")
ANON_KEY=$(echo "$API_KEYS" | jq -r '.[] | select(.name == "anon") | .api_key' 2>/dev/null || echo "")
SERVICE_ROLE_KEY=$(echo "$API_KEYS" | jq -r '.[] | select(.name == "service_role") | .api_key' 2>/dev/null || echo "")

# Check what's already done
check_functions_deployed() {
    local deployed
    deployed=$(supabase functions list --project-ref "$PROJECT_REF" 2>/dev/null | grep -c "Active" || echo "0")
    echo "$deployed"
}

check_migrations_applied() {
    local pending
    pending=$(supabase migration list --linked 2>&1 | grep -c "Not applied" || echo "0")
    echo "$pending"
}

check_admin_exists() {
    if [ -z "$SERVICE_ROLE_KEY" ] || [ "$SERVICE_ROLE_KEY" == "null" ]; then
        echo "unknown"
        return
    fi
    local users
    users=$(curl -s "${SUPABASE_URL}/auth/v1/admin/users?per_page=1" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" 2>/dev/null || echo "")
    if echo "$users" | grep -q '"users"' 2>/dev/null; then
        local count
        count=$(echo "$users" | jq '.users | length' 2>/dev/null || echo "0")
        echo "$count"
    else
        echo "unknown"
    fi
}

check_secrets_configured() {
    local secrets
    secrets=$(supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null || echo "")
    if echo "$secrets" | grep -q "OPENAI_API_KEY\|GEMINI_API_KEY"; then
        echo "yes"
    else
        echo "no"
    fi
}

# ─── Step functions ───

step_deploy_functions() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Deploy Edge Functions${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    FUNCTIONS_DIR="supabase/functions"
    if [ ! -d "$FUNCTIONS_DIR" ]; then
        echo -e "${RED}Error: No functions directory found${NC}"
        return 1
    fi

    FUNCTIONS=$(find "$FUNCTIONS_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)
    TOTAL=$(echo "$FUNCTIONS" | wc -l | tr -d ' ')
    
    echo "Found $TOTAL edge functions to deploy..."
    echo ""
    
    COUNT=0
    FAILED=0
    SKIPPED=0
    for func in $FUNCTIONS; do
        COUNT=$((COUNT + 1))
        echo -ne "[$COUNT/$TOTAL] Deploying $func... "
        VERIFY_JWT=$(grep -A1 "\[functions.$func\]" supabase/config.toml 2>/dev/null | grep "verify_jwt" | cut -d= -f2 | tr -d ' ' || echo "true")
        if [ "$VERIFY_JWT" = "false" ]; then
            JWT_FLAG="--no-verify-jwt"
        else
            JWT_FLAG=""
        fi
        if supabase functions deploy "$func" $JWT_FLAG 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            FAILED=$((FAILED + 1))
        fi
    done
    
    echo ""
    if [ $FAILED -eq 0 ]; then
        echo -e "${GREEN}✓ All $TOTAL edge functions deployed successfully${NC}"
    else
        echo -e "${RED}✗ Failed to deploy $FAILED/$TOTAL functions${NC}"
        echo "Check function logs in Supabase Dashboard for details"
    fi
}

step_run_migrations() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Run Database Migrations${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    echo -e "${YELLOW}Checking migration history...${NC}"
    MIGRATION_OUTPUT=$(supabase migration list --linked 2>&1 || echo "")
    if echo "$MIGRATION_OUTPUT" | grep -q "Remote migration versions not found"; then
        echo -e "${YELLOW}⚠ Migration history mismatch detected. Repairing...${NC}"
        OLD_MIGRATIONS=$(echo "$MIGRATION_OUTPUT" | grep -E '^\s+\|\s+[0-9]{14}' | awk '{print $2}' | tr '\n' ' ')
        if [ -n "$OLD_MIGRATIONS" ]; then
            echo "Reverting old remote migrations: $OLD_MIGRATIONS"
            supabase migration repair --status reverted $OLD_MIGRATIONS 2>/dev/null || true
            echo -e "${GREEN}✓ Migration history repaired${NC}"
        fi
    fi

    echo -e "${YELLOW}Pushing database schema...${NC}"
    if supabase db push --yes 2>&1; then
        echo -e "${GREEN}✓ Database migrations applied${NC}"
    else
        echo -e "${RED}✗ Database migration failed${NC}"
        echo -e "${YELLOW}Try running: supabase migration list --linked${NC}"
    fi
}

step_create_admin() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Create Admin User${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Check if admin already exists
    ADMIN_COUNT=$(check_admin_exists)
    if [ "$ADMIN_COUNT" != "unknown" ] && [ "$ADMIN_COUNT" != "0" ]; then
        echo -e "${YELLOW}⚠ $ADMIN_COUNT user(s) already exist in this project.${NC}"
        echo ""
        read -p "Create another user anyway? [y/N]: " create_anyway
        if [[ ! "$create_anyway" =~ ^[Yy]$ ]]; then
            echo -e "${GREEN}✓ Skipped - users already exist${NC}"
            return 0
        fi
    fi

    read -p "Admin email [admin@example.com]: " ADMIN_EMAIL
    ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}

    read -s -p "Admin password [secure-password-123]: " ADMIN_PASSWORD
    echo ""
    ADMIN_PASSWORD=${ADMIN_PASSWORD:-secure-password-123}

    echo ""
    echo -e "${YELLOW}Creating admin user...${NC}"

    if [ -z "$SERVICE_ROLE_KEY" ] || [ "$SERVICE_ROLE_KEY" == "null" ]; then
        echo -e "${YELLOW}Note: Could not get service role key automatically.${NC}"
        echo "You can create the admin user manually in Supabase Dashboard → Authentication"
        return 0
    fi

    RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\", \"email_confirm\": true, \"user_metadata\": {\"full_name\": \"Admin\"}}" 2>&1)
    
    if echo "$RESPONSE" | grep -q '"id"'; then
        USER_ID=$(echo "$RESPONSE" | jq -r '.id' 2>/dev/null || echo "")
        if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
            curl -s -X PATCH "${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${USER_ID}" \
                -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
                -H "apikey: ${SERVICE_ROLE_KEY}" \
                -H "Content-Type: application/json" \
                -H "Prefer: return=minimal" \
                -d '{"role": "admin"}' > /dev/null 2>&1
            echo -e "${GREEN}✓ Admin user created: ${ADMIN_EMAIL}${NC}"
        else
            echo -e "${GREEN}✓ User created: ${ADMIN_EMAIL}${NC}"
            echo -e "${YELLOW}  Note: Run this SQL to make admin: UPDATE user_roles SET role = 'admin' WHERE user_id = (SELECT id FROM auth.users WHERE email = '${ADMIN_EMAIL}');${NC}"
        fi
    elif echo "$RESPONSE" | grep -q "already been registered"; then
        echo -e "${YELLOW}⚠ User already exists: ${ADMIN_EMAIL} (skipped)${NC}"
    else
        echo -e "${YELLOW}⚠ Could not create admin user${NC}"
        echo "Create admin manually: Supabase Dashboard → Authentication → Add user"
    fi
}

step_show_env() {
    echo ""
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  Environment Variables${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    if [ -z "$ANON_KEY" ] || [ "$ANON_KEY" == "null" ]; then
        echo -e "${YELLOW}Could not fetch keys automatically. Get them from Supabase Dashboard.${NC}"
        echo ""
        echo "Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
        echo ""
        echo -e "${BLUE}┌────────────────────────────────────────────────────────────┐${NC}"
        echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
        echo "VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>"
        echo "VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
        echo -e "${BLUE}└────────────────────────────────────────────────────────────┘${NC}"
    else
        echo -e "${GREEN}Copy these environment variables to your hosting platform:${NC}"
        echo ""
        echo -e "${BLUE}┌────────────────────────────────────────────────────────────┐${NC}"
        echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
        echo "VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}"
        echo "VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
        echo -e "${BLUE}└────────────────────────────────────────────────────────────┘${NC}"
    fi
}

step_configure_secrets() {
    echo ""
    if [ -f "./scripts/configure-secrets.sh" ]; then
        ./scripts/configure-secrets.sh
    else
        echo -e "${RED}Error: configure-secrets.sh not found${NC}"
    fi
}

# ─── Run all (first-time setup) ───
if [ "$RUN_ALL" = true ]; then
    step_deploy_functions
    step_run_migrations
    step_create_admin
    step_show_env
    echo ""
    read -p "Configure optional integrations (AI, email, payments)? [y/N]: " configure_secrets
    if [[ "$configure_secrets" =~ ^[Yy]$ ]]; then
        step_configure_secrets
    else
        echo ""
        echo "You can run ./scripts/configure-secrets.sh later to set up integrations."
    fi
    echo ""
    echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
    echo -e "${BLUE}║   Setup Complete!                                          ║${NC}"
    echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
    echo ""
    exit 0
fi

# ─── Env only ───
if [ "$ENV_ONLY" = true ]; then
    step_show_env
    exit 0
fi

# ─── Interactive menu ───
show_menu() {
    echo ""

    # Detect status
    local func_count
    func_count=$(check_functions_deployed)
    local pending_migrations
    pending_migrations=$(check_migrations_applied)
    local admin_count
    admin_count=$(check_admin_exists)
    local secrets_ok
    secrets_ok=$(check_secrets_configured)

    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo -e "${BLUE}  What would you like to do?${NC}"
    echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
    echo ""

    # Status indicators
    if [ "$func_count" -gt 0 ] 2>/dev/null; then
        echo -e "  1) Deploy Edge Functions        ${GREEN}✓ ${func_count} deployed${NC}"
    else
        echo -e "  1) Deploy Edge Functions        ${YELLOW}○ Not deployed${NC}"
    fi

    if [ "$pending_migrations" = "0" ]; then
        echo -e "  2) Run Database Migrations      ${GREEN}✓ Up to date${NC}"
    else
        echo -e "  2) Run Database Migrations      ${YELLOW}○ ${pending_migrations} pending${NC}"
    fi

    if [ "$admin_count" = "unknown" ]; then
        echo -e "  3) Create Admin User            ${DIM}? Unknown${NC}"
    elif [ "$admin_count" = "0" ]; then
        echo -e "  3) Create Admin User            ${YELLOW}○ No users${NC}"
    else
        echo -e "  3) Create Admin User            ${GREEN}✓ ${admin_count} user(s)${NC}"
    fi

    echo -e "  4) Show Environment Variables"

    if [ "$secrets_ok" = "yes" ]; then
        echo -e "  5) Configure Secrets (AI, etc.)  ${GREEN}✓ Configured${NC}"
    else
        echo -e "  5) Configure Secrets (AI, etc.)  ${YELLOW}○ Not configured${NC}"
    fi

    echo ""
    echo -e "  a) Run ALL steps (first-time setup)"
    echo -e "  q) Quit"
    echo ""
}

# Menu loop
while true; do
    show_menu
    read -p "Select option: " choice
    
    case "$choice" in
        1) step_deploy_functions ;;
        2) step_run_migrations ;;
        3) step_create_admin ;;
        4) step_show_env ;;
        5) step_configure_secrets ;;
        a|A)
            step_deploy_functions
            step_run_migrations
            step_create_admin
            step_show_env
            echo ""
            read -p "Configure optional integrations (AI, email, payments)? [y/N]: " configure_secrets
            if [[ "$configure_secrets" =~ ^[Yy]$ ]]; then
                step_configure_secrets
            fi
            ;;
        q|Q)
            echo ""
            echo -e "${GREEN}Done! Run this script again anytime to update individual steps.${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo -e "${RED}Invalid option${NC}"
            ;;
    esac
done
