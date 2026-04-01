#!/usr/bin/env bash

# FlowWink CLI
# Interactive command-line interface for FlowWink setup and management
#
# Usage:
#   ./scripts/flowwink.sh

# ─── Colors ───
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
CYAN='\033[0;36m'
DIM='\033[2m'
BOLD='\033[1m'
NC='\033[0m'

# ─── Ensure we run from project root ───
cd "$(dirname "$0")/.." || exit 1

# ─── State ───
PROJECT_REF=""
PROJECT_NAME=""
SUPABASE_URL=""
ANON_KEY=""
SERVICE_ROLE_KEY=""

VERSION=$(node -p "require('./package.json').version" 2>/dev/null || echo "1.0.0")

# ─── Helpers ───

print_divider() {
    echo -e "${DIM}  ──────────────────────────────────────────────────────────${NC}"
}

print_section() {
    echo -e "${BOLD}  $1${NC}"
    print_divider
    echo ""
}

require_link() {
    if [ -z "$PROJECT_REF" ]; then
        echo -e "  ${RED}✗ No project linked.${NC} Run ${CYAN}/link${NC} first."
        echo ""
        return 1
    fi
}

set_secret() {
    local name="$1"
    local value="$2"
    if [ -n "$value" ]; then
        if supabase secrets set "${name}=${value}" 2>/dev/null; then
            echo -e "  ${GREEN}✓${NC} ${name}"
        else
            echo -e "  ${RED}✗${NC} Failed to set ${name}"
        fi
    fi
}

load_project() {
    if [ -f "supabase/.temp/project-ref" ]; then
        PROJECT_REF=$(cat supabase/.temp/project-ref)
        SUPABASE_URL="https://${PROJECT_REF}.supabase.co"
        local api_keys
        api_keys=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null || echo "[]")
        ANON_KEY=$(echo "$api_keys" | jq -r '.[] | select(.name == "anon") | .api_key' 2>/dev/null || echo "")
        SERVICE_ROLE_KEY=$(echo "$api_keys" | jq -r '.[] | select(.name == "service_role") | .api_key' 2>/dev/null || echo "")
        local projects
        projects=$(supabase projects list --output json 2>/dev/null || echo "[]")
        PROJECT_NAME=$(echo "$projects" | jq -r --arg ref "$PROJECT_REF" '.[] | select(.id == $ref) | .name' 2>/dev/null || echo "$PROJECT_REF")
    fi
}

# ─── Commands ───

cmd_help() {
    echo ""
    print_divider
    echo -e "  ${BOLD}Commands${NC}"
    print_divider
    echo ""
    echo -e "  ${CYAN}/login${NC}           Log in to Supabase CLI"
    echo -e "  ${CYAN}/link${NC}            Select and link a Supabase project to this directory"
    echo ""
    echo -e "  ${BOLD}── First-time setup ──────────────────────────────────${NC}"
    echo -e "  ${CYAN}/install${NC}         Full install: migrations → functions → admin → keys → FlowPilot"
    echo ""
    echo -e "  ${BOLD}── Update existing installation ──────────────────────${NC}"
    echo -e "  ${CYAN}/update-db${NC}       Push new database migrations to linked project"
    echo -e "  ${CYAN}/update-funcs${NC}    Re-deploy all edge functions (picks up code changes)"
    echo -e "  ${CYAN}/set-keys${NC}        Add or rotate API keys & Supabase secrets"
    echo -e "  ${CYAN}/create-admin${NC}    Create a new admin user account"
    echo -e "  ${CYAN}/patch-flowpilot${NC} Patch FlowPilot: sync missing skills/soul or renew heartbeat cron"
    echo ""
    echo -e "  ${BOLD}── Info ──────────────────────────────────────────────${NC}"
    echo -e "  ${CYAN}/env${NC}             Print environment variables needed for hosting (Vercel/Easypanel)"
    echo -e "  ${CYAN}/status${NC}          Check deployment status: DB, functions, secrets"
    echo -e "  ${CYAN}/about${NC}           About FlowWink"
    echo -e "  ${CYAN}/help${NC}            Show this help"
    echo -e "  ${CYAN}/quit${NC}            Exit"
    echo ""
    print_divider
    echo ""
}

cmd_about() {
    echo ""
    print_section "About FlowWink"
    echo "  FlowWink is an open-source CMS + AI consultant platform."
    echo "  Self-hosted. One deployment per customer."
    echo ""
    echo -e "  ${DIM}Version:${NC}   v${VERSION}"
    echo -e "  ${DIM}GitHub:${NC}    https://github.com/magnusfroste/flowwink"
    echo ""
}

cmd_login() {
    echo ""
    print_section "Log in to Supabase"

    local list_out
    list_out=$(supabase projects list 2>&1)
    if [ $? -eq 0 ] && ! echo "$list_out" | grep -qi "error\|not logged\|unauthorized\|login required"; then
        echo -e "  ${GREEN}✓ Already logged in${NC}"
        echo ""
        return 0
    fi

    echo "  Opening browser for Supabase login..."
    echo ""
    supabase login

    if supabase projects list &>/dev/null; then
        echo ""
        echo -e "  ${GREEN}✓ Logged in successfully${NC}"
    else
        echo -e "  ${RED}✗ Login failed. Try again.${NC}"
    fi
    echo ""
}

cmd_link() {
    echo ""
    print_section "Link Supabase Project"

    local _list_check
    _list_check=$(supabase projects list 2>&1)
    if [ $? -ne 0 ] || echo "$_list_check" | grep -qi "error\|not logged\|unauthorized\|login required"; then
        echo -e "  ${RED}✗ Not logged in.${NC} Run ${CYAN}/login${NC} first."
        echo ""
        return 1
    fi

    local projects
    projects=$(supabase projects list --output json 2>/dev/null || echo "[]")

    if [ "$projects" = "[]" ] || [ -z "$projects" ]; then
        echo -e "  ${RED}✗ No projects found.${NC} Create one at supabase.com first."
        echo ""
        return 1
    fi

    local count
    count=$(echo "$projects" | jq 'length')

    echo "$projects" | jq -r 'to_entries[] | "  \(.key + 1))  \(.value.name)  \u001b[2m(\(.value.id)) — \(.value.region)\u001b[0m"'
    echo ""

    local selection
    read -e -p "  Select project (1-${count}): " selection

    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$count" ]; then
        echo -e "  ${RED}✗ Invalid selection${NC}"
        echo ""
        return 1
    fi

    local ref name
    ref=$(echo "$projects" | jq -r ".[$((selection - 1))].id")
    name=$(echo "$projects" | jq -r ".[$((selection - 1))].name")

    echo ""
    echo -e "  Linking to ${BOLD}${name}${NC}..."
    supabase link --project-ref "$ref" 2>&1 | sed 's/^/  /'

    PROJECT_REF="$ref"
    PROJECT_NAME="$name"
    SUPABASE_URL="https://${ref}.supabase.co"

    local api_keys
    api_keys=$(supabase projects api-keys --project-ref "$ref" --output json 2>/dev/null || echo "[]")
    ANON_KEY=$(echo "$api_keys" | jq -r '.[] | select(.name == "anon") | .api_key' 2>/dev/null || echo "")
    SERVICE_ROLE_KEY=$(echo "$api_keys" | jq -r '.[] | select(.name == "service_role") | .api_key' 2>/dev/null || echo "")

    echo ""
    echo -e "  ${GREEN}✓ Linked to ${name}${NC}"
    echo ""
}

cmd_update_db() {
    echo ""
    print_section "Push Database Migrations"
    require_link || return 1

    echo -e "  ${DIM}Project: ${PROJECT_NAME}${NC}"
    echo ""

    local migration_output
    migration_output=$(supabase migration list --linked 2>&1 || echo "")

    if echo "$migration_output" | grep -q "Remote migration versions not found"; then
        echo -e "  ${YELLOW}⚠ Migration history mismatch — repairing...${NC}"
        local old
        old=$(echo "$migration_output" | grep -E '^\s+\|\s+[0-9]{14}' | awk '{print $2}' | tr '\n' ' ')
        if [ -n "$old" ]; then
            supabase migration repair --status reverted $old 2>/dev/null || true
            echo -e "  ${GREEN}✓ Repaired${NC}"
        fi
        echo ""
    fi

    echo -e "  Pushing schema..."
    echo ""
    if supabase db push --yes 2>&1 | sed 's/^/  /'; then
        echo ""
        echo -e "  ${GREEN}✓ Migrations applied${NC}"
    else
        echo ""
        echo -e "  ${RED}✗ Migration failed${NC}"
        echo -e "  ${DIM}Tip: supabase migration list --linked${NC}"
    fi
    echo ""
}

cmd_update_funcs() {
    echo ""
    print_section "Deploy Edge Functions"
    require_link || return 1

    local functions_dir="supabase/functions"
    if [ ! -d "$functions_dir" ]; then
        echo -e "  ${RED}✗ No functions directory found${NC}"
        echo ""
        return 1
    fi

    local functions total
    functions=$(find "$functions_dir" -mindepth 1 -maxdepth 1 -type d | while read -r dir; do
        [ -f "$dir/index.ts" ] && basename "$dir"
    done | sort)
    total=$(echo "$functions" | wc -l | tr -d ' ')

    echo -e "  ${DIM}Project: ${PROJECT_NAME}${NC}"
    echo -e "  Deploying ${total} functions..."
    echo ""

    local count=0 failed=0
    local failed_names=()
    local failed_errors=()

    for func in $functions; do
        count=$((count + 1))
        printf "  [%${#total}d/%d] %-42s" "$count" "$total" "$func"

        local jwt_flag=""
        local verify_jwt
        verify_jwt=$(grep -A1 "\[functions.$func\]" supabase/config.toml 2>/dev/null | grep "verify_jwt" | cut -d= -f2 | tr -d ' ' || echo "true")
        [ "$verify_jwt" = "false" ] && jwt_flag="--no-verify-jwt"

        local err
        if err=$(supabase functions deploy "$func" $jwt_flag 2>&1); then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            failed=$((failed + 1))
            failed_names+=("$func")
            failed_errors+=("$err")
        fi
    done

    echo ""
    if [ "$failed" -eq 0 ]; then
        echo -e "  ${GREEN}✓ All ${total} functions deployed${NC}"
    else
        echo -e "  ${RED}✗ ${failed}/${total} failed:${NC}"
        echo ""
        for i in "${!failed_names[@]}"; do
            echo -e "  ${RED}▶ ${failed_names[$i]}${NC}"
            echo "${failed_errors[$i]}" | grep -i "error\|failed\|invalid" | head -3 | sed 's/^/    /'
            echo ""
        done
    fi
    echo ""
}

cmd_set_keys() {
    echo ""
    print_section "Configure Secrets"
    require_link || return 1

    # name | primary_key_to_check | label for prompt(s) | url
    local -a INT_DEF=(
        "Email — Resend|RESEND_API_KEY|newsletter & transactional emails|https://resend.com/api-keys"
        "Payments — Stripe|STRIPE_SECRET_KEY|e-commerce & subscriptions|https://dashboard.stripe.com/apikeys"
        "AI — OpenAI|OPENAI_API_KEY|chat, text generation, content tools|https://platform.openai.com/api-keys"
        "AI — Gemini|GEMINI_API_KEY|alternative to OpenAI|https://aistudio.google.com/app/apikey"
        "AI — Anthropic|ANTHROPIC_API_KEY|Claude AI models|https://console.anthropic.com/settings/keys"
        "Local LLM|LOCAL_LLM_API_KEY|Ollama / vLLM — only if auth required|"
        "Firecrawl|FIRECRAWL_API_KEY|content migration & company enrichment|https://firecrawl.dev"
        "Jina AI|JINA_API_KEY|alternative web search & scraping|https://jina.ai/api-key"
        "Unsplash|UNSPLASH_ACCESS_KEY|stock photo search in media library|https://unsplash.com/oauth/applications"
        "Gmail — Google OAuth|GOOGLE_CLIENT_ID|inbox scanning & email signals|https://console.cloud.google.com/apis/credentials"
        "Hunter.io|HUNTER_API_KEY|prospect research & email finder|https://hunter.io/api"
        "Composio|COMPOSIO_API_KEY|tool integrations (Gmail, Calendar, etc)|https://app.composio.dev/settings"
        "N8N|N8N_API_KEY|webhook auth key (if required)|"
        "Site URL|SITE_URL|base URL for OAuth redirects|"
    )

    local val
    while true; do
        # Re-fetch secrets each loop so status stays current
        local secrets
        secrets=$(supabase secrets list 2>/dev/null || echo "")

        # Build menu with live ✓/○ status
        local -a menu=()
        for entry in "${INT_DEF[@]}"; do
            local mname mkey
            mname=$(cut -d'|' -f1 <<< "$entry")
            mkey=$(cut -d'|' -f2 <<< "$entry")
            if echo "$secrets" | grep -q "$mkey"; then
                menu+=("${GREEN}✓${NC}  $mname")
            else
                menu+=("${DIM}○${NC}  $mname")
            fi
        done
        menu+=("── Done")

        # Strip color codes for _fw_select (printf handles them in draw)
        local -a plain_menu=()
        for item in "${menu[@]}"; do
            plain_menu+=("$(echo -e "$item")")
        done

        echo -e "  ${DIM}↑↓ navigate  Enter select  Esc quit${NC}"
        echo ""
        _fw_select "${plain_menu[@]}"
        local idx=$_FW_IDX

        # Cancelled (Esc/Ctrl-C) or Done
        [ "$idx" -eq -1 ] && break
        [ "$idx" -eq "${#INT_DEF[@]}" ] && break

        local entry="${INT_DEF[$idx]}"
        local iname idesc iurl
        iname=$(cut -d'|' -f1 <<< "$entry")
        idesc=$(cut -d'|' -f3 <<< "$entry")
        iurl=$(cut -d'|' -f4 <<< "$entry")

        echo ""
        echo -e "  ${BOLD}${iname}${NC}  ${DIM}— ${idesc}${NC}"
        [ -n "$iurl" ] && echo -e "  ${DIM}${iurl}${NC}"
        echo ""

        case "$idx" in
            0)  read -e -p "  RESEND_API_KEY: " val
                set_secret "RESEND_API_KEY" "$val" ;;
            1)  read -e -p "  STRIPE_SECRET_KEY: " val
                set_secret "STRIPE_SECRET_KEY" "$val"
                read -e -p "  STRIPE_WEBHOOK_SECRET: " val
                set_secret "STRIPE_WEBHOOK_SECRET" "$val" ;;
            2)  read -e -p "  OPENAI_API_KEY: " val
                set_secret "OPENAI_API_KEY" "$val" ;;
            3)  read -e -p "  GEMINI_API_KEY: " val
                set_secret "GEMINI_API_KEY" "$val" ;;
            4)  read -e -p "  ANTHROPIC_API_KEY: " val
                set_secret "ANTHROPIC_API_KEY" "$val" ;;
            5)  read -e -p "  LOCAL_LLM_API_KEY: " val
                set_secret "LOCAL_LLM_API_KEY" "$val" ;;
            6)  read -e -p "  FIRECRAWL_API_KEY: " val
                set_secret "FIRECRAWL_API_KEY" "$val" ;;
            7)  read -e -p "  JINA_API_KEY: " val
                set_secret "JINA_API_KEY" "$val" ;;
            8)  read -e -p "  UNSPLASH_ACCESS_KEY: " val
                set_secret "UNSPLASH_ACCESS_KEY" "$val" ;;
            9)  read -e -p "  GOOGLE_CLIENT_ID: " val
                set_secret "GOOGLE_CLIENT_ID" "$val"
                read -e -p "  GOOGLE_CLIENT_SECRET: " val
                set_secret "GOOGLE_CLIENT_SECRET" "$val" ;;
            10) read -e -p "  HUNTER_API_KEY: " val
                set_secret "HUNTER_API_KEY" "$val" ;;
            11) read -e -p "  COMPOSIO_API_KEY: " val
                set_secret "COMPOSIO_API_KEY" "$val" ;;
            12) read -e -p "  N8N_API_KEY: " val
                set_secret "N8N_API_KEY" "$val" ;;
            13) read -e -p "  SITE_URL (e.g. https://yoursite.com): " val
                set_secret "SITE_URL" "$val" ;;
        esac
        echo ""
    done

    echo -e "  ${DIM}Manage anytime: Supabase Dashboard → Settings → Edge Functions → Secrets${NC}"
    echo ""
}

cmd_create_admin() {
    echo ""
    print_section "Create Admin User"

    require_link || return 1

    # Check existing users
    if [ -n "$SERVICE_ROLE_KEY" ] && [ "$SERVICE_ROLE_KEY" != "null" ]; then
        local users
        users=$(curl -s "${SUPABASE_URL}/auth/v1/admin/users?per_page=1" \
            -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
            -H "apikey: ${SERVICE_ROLE_KEY}" 2>/dev/null || echo "")
        if echo "$users" | grep -q '"users"'; then
            local count
            count=$(echo "$users" | jq '.users | length' 2>/dev/null || echo "0")
            if [ "$count" != "0" ]; then
                echo -e "  ${YELLOW}⚠ ${count} user(s) already exist in this project.${NC}"
                echo ""
                read -e -p "  Create another user anyway? [y/N]: " confirm
                [[ ! "$confirm" =~ ^[Yy]$ ]] && echo "" && return 0
                echo ""
            fi
        fi
    fi

    read -e -p "  Email [admin@example.com]: " email
    email=${email:-admin@example.com}

    read -s -p "  Password [changeme123]: " password
    echo ""
    password=${password:-changeme123}
    echo ""

    if [ -z "$SERVICE_ROLE_KEY" ] || [ "$SERVICE_ROLE_KEY" = "null" ]; then
        echo -e "  ${YELLOW}⚠ Could not get service role key automatically.${NC}"
        echo "  Create the user in: Supabase Dashboard → Authentication → Add user"
        echo ""
        return 0
    fi

    local response
    response=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\":\"${email}\",\"password\":\"${password}\",\"email_confirm\":true,\"user_metadata\":{\"full_name\":\"Admin\"}}" 2>&1)

    if echo "$response" | grep -q '"id"'; then
        local user_id
        user_id=$(echo "$response" | jq -r '.id' 2>/dev/null || echo "")
        if [ -n "$user_id" ] && [ "$user_id" != "null" ]; then
            curl -s -X PATCH "${SUPABASE_URL}/rest/v1/user_roles?user_id=eq.${user_id}" \
                -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
                -H "apikey: ${SERVICE_ROLE_KEY}" \
                -H "Content-Type: application/json" \
                -H "Prefer: return=minimal" \
                -d '{"role":"admin"}' >/dev/null 2>&1
        fi
        echo -e "  ${GREEN}✓ Admin created:${NC} ${email}"
    elif echo "$response" | grep -q "already been registered"; then
        echo -e "  ${YELLOW}⚠ User already exists:${NC} ${email}"
    else
        echo -e "  ${YELLOW}⚠ Could not create user automatically.${NC}"
        echo "  Use Supabase Dashboard → Authentication → Add user"
    fi
    echo ""
}

cmd_env() {
    echo ""
    print_section "Environment Variables"
    require_link || return 1

    echo -e "  ${DIM}Copy these to your hosting platform (Vercel, Easypanel, etc.):${NC}"
    echo ""
    print_divider
    if [ -n "$ANON_KEY" ] && [ "$ANON_KEY" != "null" ]; then
        echo "  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
        echo "  VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}"
        echo "  VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
    else
        echo "  VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
        echo "  VITE_SUPABASE_PUBLISHABLE_KEY=<Dashboard → Settings → API → anon key>"
        echo "  VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
    fi
    print_divider
    echo ""
}

cmd_status() {
    echo ""
    print_section "Deployment Status"
    require_link || return 1

    echo -e "  ${DIM}Project: ${PROJECT_NAME} (${PROJECT_REF})${NC}"
    echo ""

    # Edge functions
    local func_count
    func_count=$(supabase functions list --project-ref "$PROJECT_REF" 2>/dev/null | grep -c "ACTIVE" || echo "0")
    if [ "$func_count" -gt 0 ] 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC}  Edge functions    ${DIM}${func_count} active${NC}"
    else
        echo -e "  ${YELLOW}○${NC}  Edge functions    ${DIM}not deployed — run /update-funcs${NC}"
    fi

    # Migrations
    local mig_out total applied pending
    mig_out=$(supabase migration list --linked 2>/dev/null || echo "")
    total=$(echo "$mig_out" | tail -n +4 | grep -c "^" 2>/dev/null || echo "0")
    applied=$(echo "$mig_out" | tail -n +4 | grep -v "Not applied" | grep -c "^" 2>/dev/null || echo "0")
    pending=$((total - applied))

    if [ "$pending" -eq 0 ] && [ "$applied" -gt 0 ] 2>/dev/null; then
        echo -e "  ${GREEN}✓${NC}  Database          ${DIM}${applied} migrations applied${NC}"
    elif [ "$pending" -gt 0 ] 2>/dev/null; then
        echo -e "  ${YELLOW}○${NC}  Database          ${DIM}${applied}/${total} applied, ${pending} pending — run /update-db${NC}"
    else
        echo -e "  ${YELLOW}○${NC}  Database          ${DIM}no migrations applied — run /update-db${NC}"
    fi

    # Secrets
    local secrets secret_count=0
    secrets=$(supabase secrets list --project-ref "$PROJECT_REF" 2>/dev/null || echo "")
    for key in OPENAI_API_KEY GEMINI_API_KEY ANTHROPIC_API_KEY RESEND_API_KEY STRIPE_SECRET_KEY FIRECRAWL_API_KEY; do
        echo "$secrets" | grep -q "$key" && secret_count=$((secret_count + 1))
    done
    local secret_total=6
    if [ "$secret_count" -eq "$secret_total" ]; then
        echo -e "  ${GREEN}✓${NC}  Secrets           ${DIM}all configured${NC}"
    elif [ "$secret_count" -gt 0 ]; then
        echo -e "  ${CYAN}◐${NC}  Secrets           ${DIM}${secret_count}/${secret_total} key integrations set — run /set-keys${NC}"
    else
        echo -e "  ${YELLOW}○${NC}  Secrets           ${DIM}not configured — run /set-keys${NC}"
    fi

    # Admin users
    if [ -n "$SERVICE_ROLE_KEY" ] && [ "$SERVICE_ROLE_KEY" != "null" ]; then
        local users user_count
        users=$(curl -s "${SUPABASE_URL}/auth/v1/admin/users?per_page=1" \
            -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
            -H "apikey: ${SERVICE_ROLE_KEY}" 2>/dev/null || echo "")
        if echo "$users" | grep -q '"users"'; then
            user_count=$(echo "$users" | jq '.users | length' 2>/dev/null || echo "0")
            if [ "$user_count" -gt 0 ]; then
                echo -e "  ${GREEN}✓${NC}  Admin user        ${DIM}${user_count} user(s)${NC}"
            else
                echo -e "  ${YELLOW}○${NC}  Admin user        ${DIM}none — run /create-admin${NC}"
            fi
        fi
    fi

    echo ""
}

cmd_setup_flowpilot() {
    echo ""
    print_section "Patch FlowPilot"
    require_link || return 1

    if [ -z "$SERVICE_ROLE_KEY" ] || [ "$SERVICE_ROLE_KEY" = "null" ]; then
        echo -e "  ${RED}✗ Service role key not available.${NC}"
        echo -e "  ${DIM}Run /link to reload project keys.${NC}"
        echo ""
        return 1
    fi

    echo -e "  ${DIM}Project: ${PROJECT_NAME}${NC}"
    echo ""
    echo -e "  ${DIM}↑↓ navigate  Enter select${NC}"
    echo ""

    local -a OPTIONS=(
        "Sync missing skills & soul"
        "Register / renew heartbeat cron only"
        "Cancel"
    )

    _fw_select "${OPTIONS[@]}"
    local idx=$_FW_IDX
    [ "$idx" -eq -1 ] || [ "$idx" -eq 2 ] && echo "" && return 0

    echo ""

    local payload
    if [ "$idx" -eq 0 ]; then
        echo -e "  Syncing missing skills & soul..."
        payload="{\"seed_skills\":true,\"seed_soul\":true}"
    else
        echo -e "  Registering heartbeat cron..."
        payload="{\"seed_skills\":false,\"seed_soul\":false}"
    fi

    local response
    response=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/setup-flowpilot" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "$payload" 2>&1)

    if echo "$response" | grep -qE '"success"\s*:\s*true|"objectives_seeded"|"cron_registered"'; then
        echo -e "  ${GREEN}✓ FlowPilot setup complete${NC}"
        local obj_count
        obj_count=$(echo "$response" | jq -r '.objectives_seeded // empty' 2>/dev/null || echo "")
        [ -n "$obj_count" ] && echo -e "  ${DIM}Objectives seeded: ${obj_count}${NC}"
        local auto_count
        auto_count=$(echo "$response" | jq -r '.automations_seeded // empty' 2>/dev/null || echo "")
        [ -n "$auto_count" ] && echo -e "  ${DIM}Automations seeded: ${auto_count}${NC}"
        local cron_ok
        cron_ok=$(echo "$response" | jq -r '.cron_registered // empty' 2>/dev/null || echo "")
        [ "$cron_ok" = "true" ] && echo -e "  ${DIM}Cron registered ✓${NC}"
    else
        echo -e "  ${RED}✗ Setup failed${NC}"
        local err
        err=$(echo "$response" | jq -r '.error // .message // .' 2>/dev/null || echo "$response")
        echo "$err" | head -3 | sed 's/^/  /'
    fi
    echo ""
}

cmd_install() {
    echo ""
    print_section "Full Installation"
    require_link || return 1

    echo -e "  Runs: ${CYAN}/update-db${NC} → ${CYAN}/update-funcs${NC} → ${CYAN}/create-admin${NC} → ${CYAN}/env${NC} → ${CYAN}/patch-flowpilot${NC}"
    echo ""
    read -e -p "  Continue? [y/N]: " confirm
    [[ ! "$confirm" =~ ^[Yy]$ ]] && echo "" && return 0

    cmd_update_db
    cmd_update_funcs
    cmd_create_admin
    cmd_env

    # Seed skills + soul directly — no menu needed on fresh install.
    # Objectives and automations are seeded automatically on first admin login.
    print_section "Patch FlowPilot"
    require_link || return 1
    echo -e "  Seeding skills & soul..."
    local fp_response
    fp_response=$(curl -s -X POST "${SUPABASE_URL}/functions/v1/setup-flowpilot" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"seed_skills\":true,\"seed_soul\":true}" 2>&1)
    if echo "$fp_response" | grep -qE '"success"\s*:\s*true'; then
        echo -e "  ${GREEN}✓ FlowPilot setup complete${NC}"
    else
        echo -e "  ${YELLOW}⚠ FlowPilot setup may have failed — check logs${NC}"
    fi
    echo ""

    read -e -p "  Configure API keys now? [y/N]: " keys
    [[ "$keys" =~ ^[Yy]$ ]] && cmd_set_keys
}

# ─── Generic interactive select (outside readline context) ───
# Result index in _FW_IDX; -1 = cancelled
_FW_IDX=-1

_fw_select_draw() {
    local sel="$1"; shift
    local items=("$@")
    for i in "${!items[@]}"; do
        if [ "$i" -eq "$sel" ]; then
            printf "  \033[0;36m▶ %s\033[0m\n" "${items[$i]}"
        else
            printf "  \033[2m  %s\033[0m\n" "${items[$i]}"
        fi
    done
}

_fw_select() {
    local items=("$@")
    local count=${#items[@]}
    local sel=0
    _FW_IDX=-1

    printf '\033[?25l'
    _fw_select_draw "$sel" "${items[@]}"

    local key seq
    while true; do
        IFS= read -rsn1 key
        case "$key" in
            $'\033')
                IFS= read -rsn2 -t 0.1 seq
                case "$seq" in
                    '[A') sel=$(( (sel - 1 + count) % count )) ;;
                    '[B') sel=$(( (sel + 1) % count )) ;;
                    '')   break ;;   # plain Escape (no following bytes)
                esac
                ;;
            $'\t') sel=$(( (sel + 1) % count )) ;;
            ''|$'\r') _FW_IDX=$sel; break ;;
            $'\x03') break ;;        # Ctrl-C
        esac
        printf "\033[${count}A"
        _fw_select_draw "$sel" "${items[@]}"
    done

    printf "\033[${count}A\033[J"
    printf '\033[?25h'
}

# ─── Tab completion (requires bash 4+) ───

FW_COMMANDS=(
    "/login" "/link" "/install"
    "/update-db" "/update-funcs" "/set-keys" "/create-admin"
    "/patch-flowpilot"
    "/env" "/status" "/about" "/help" "/quit"
)

_fw_draw_menu() {
    local selected="$1"; shift
    local items=("$@")
    for i in "${!items[@]}"; do
        if [ "$i" -eq "$selected" ]; then
            printf "  \033[0;36m▶ %-22s\033[0m\n" "${items[$i]}" >/dev/tty
        else
            printf "  \033[2m  %-22s\033[0m\n" "${items[$i]}" >/dev/tty
        fi
    done
}

# Called directly (never in a subshell) so it can set READLINE_LINE/POINT
_fw_menu() {
    local items=("$@")
    local count=${#items[@]}
    local selected=0 cancelled=0

    printf '\n' >/dev/tty
    printf '\033[?25l' >/dev/tty       # hide cursor
    _fw_draw_menu "$selected" "${items[@]}"

    local key seq
    while true; do
        IFS= read -rsn1 key </dev/tty
        case "$key" in
            $'\033')
                IFS= read -rsn2 -t 0.1 seq </dev/tty
                case "$seq" in
                    '[A') selected=$(( (selected - 1 + count) % count )) ;;
                    '[B') selected=$(( (selected + 1) % count )) ;;
                    '')   cancelled=1; break ;;   # plain Escape
                esac
                ;;
            $'\t')
                selected=$(( (selected + 1) % count ))
                ;;
            ''|$'\r')
                break
                ;;
            $'\x03')
                cancelled=1; break
                ;;
        esac
        printf "\033[${count}A" >/dev/tty
        _fw_draw_menu "$selected" "${items[@]}"
    done

    printf "\033[${count}A\033[J" >/dev/tty   # clear menu
    printf '\033[?25h' >/dev/tty               # show cursor

    if [ "$cancelled" -eq 0 ]; then
        READLINE_LINE="${items[$selected]}"
        READLINE_POINT=${#READLINE_LINE}
    fi
}

_fw_complete() {
    local cur="$READLINE_LINE"
    local matches=()

    for cmd in "${FW_COMMANDS[@]}"; do
        [[ "$cmd" == "$cur"* ]] && matches+=("$cmd")
    done

    local count=${#matches[@]}
    [ "$count" -eq 0 ] && return

    if [ "$count" -eq 1 ]; then
        READLINE_LINE="${matches[0]}"
        READLINE_POINT=${#READLINE_LINE}
        return
    fi

    _fw_menu "${matches[@]}"
}

_fw_slash_hint() {
    READLINE_LINE="${READLINE_LINE:0:$READLINE_POINT}/${READLINE_LINE:$READLINE_POINT}"
    READLINE_POINT=$((READLINE_POINT + 1))
}

# Only bind if bash 4+ (bind -x not supported on macOS default bash 3.2)
if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
    bind -x '"\t":_fw_complete'   2>/dev/null
    bind -x '"/":_fw_slash_hint'  2>/dev/null
fi

# ─── Prerequisites ───

if ! command -v supabase &>/dev/null; then
    echo -e "${RED}Error: Supabase CLI not installed${NC}"
    echo "Install: npm install -g supabase"
    exit 1
fi

if ! command -v jq &>/dev/null; then
    echo -e "${RED}Error: jq not installed${NC}"
    echo "Install: brew install jq  (macOS)  |  apt install jq  (Linux)"
    exit 1
fi

# ─── Startup ───

load_project

clear
echo ""
echo -e "${BLUE}  ╔══════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}  ║${NC}  ${BOLD}FlowWink${NC}  ${DIM}v${VERSION}${NC}                                         ${BLUE}║${NC}"
echo -e "${BLUE}  ╚══════════════════════════════════════════════════════════╝${NC}"
echo ""

if [ -n "$PROJECT_REF" ]; then
    echo -e "  ${DIM}Project:${NC}  ${GREEN}${PROJECT_NAME}${NC}  ${DIM}(${PROJECT_REF})${NC}"
else
    echo -e "  ${DIM}Project:${NC}  ${YELLOW}not linked${NC}  ${DIM}— run /link to get started${NC}"
fi

echo ""
if [ "${BASH_VERSINFO[0]}" -ge 4 ]; then
    echo -e "  Type ${CYAN}/${NC} + Enter for command menu  ·  ${CYAN}Tab${NC} to complete  ·  ${CYAN}/quit${NC} to exit"
else
    echo -e "  Type ${CYAN}/help${NC} for commands  ·  ${CYAN}/quit${NC} to exit"
    echo -e "  ${DIM}(Tab completion requires bash 4+: brew install bash)${NC}"
fi
echo ""

# ─── REPL ───

while true; do
    if [ -n "$PROJECT_REF" ]; then
        prompt=$'\001\033[0;36m\002flowwink\001\033[0m\002 \001\033[2m\002['"${PROJECT_NAME}"$']\001\033[0m\002 > '
    else
        prompt=$'\001\033[0;36m\002flowwink\001\033[0m\002 > '
    fi

    read -e -p "$prompt" input
    [ -z "$input" ] && continue

    # Bare "/" → show navigable menu and execute the selected command immediately
    if [ "$input" = "/" ]; then
        echo ""
        _fw_select "${FW_COMMANDS[@]}"
        [ "$_FW_IDX" -eq -1 ] && continue
        input="${FW_COMMANDS[$_FW_IDX]}"
        echo -e "  ${DIM}→ ${input}${NC}"
        echo ""
    fi

    history -s "$input"

    cmd=$(echo "$input" | awk '{print $1}' | tr '[:upper:]' '[:lower:]')

    case "$cmd" in
        /login)                      cmd_login ;;
        /link)                       cmd_link ;;
        /install)                    cmd_install ;;
        /update-db)                  cmd_update_db ;;
        /update-funcs|/update-functions) cmd_update_funcs ;;
        /set-keys|/set-secrets)      cmd_set_keys ;;
        /create-admin)               cmd_create_admin ;;
        /patch-flowpilot|/setup-flowpilot) cmd_setup_flowpilot ;;
        /env)                        cmd_env ;;
        /status)                     cmd_status ;;
        /about)                      cmd_about ;;
        /help|/?)                    cmd_help ;;
        /quit|/exit|/q)
            echo ""
            echo -e "  ${DIM}Goodbye!${NC}"
            echo ""
            exit 0
            ;;
        *)
            echo ""
            echo -e "  ${RED}Unknown command:${NC} ${cmd}"
            echo -e "  ${DIM}Type /help to see available commands.${NC}"
            echo ""
            ;;
    esac
done
