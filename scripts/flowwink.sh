#!/bin/bash

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
    echo -e "  ${CYAN}/login${NC}           Log in to Supabase"
    echo -e "  ${CYAN}/link${NC}            Select and link a Supabase project"
    echo ""
    echo -e "  ${CYAN}/install${NC}         Full first-time setup"
    echo -e "  ${CYAN}/update-db${NC}       Push database migrations"
    echo -e "  ${CYAN}/update-funcs${NC}    Deploy all edge functions"
    echo -e "  ${CYAN}/set-keys${NC}        Configure API keys & secrets"
    echo -e "  ${CYAN}/create-admin${NC}    Create an admin user"
    echo ""
    echo -e "  ${CYAN}/env${NC}             Show environment variables for hosting"
    echo -e "  ${CYAN}/status${NC}          Check deployment status"
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

    if supabase projects list &>/dev/null; then
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

    if ! supabase projects list &>/dev/null; then
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
    functions=$(find "$functions_dir" -mindepth 1 -maxdepth 1 -type d -exec basename {} \; | grep -v "^_" | sort)
    total=$(echo "$functions" | wc -l | tr -d ' ')

    echo -e "  ${DIM}Project: ${PROJECT_NAME}${NC}"
    echo -e "  Deploying ${total} functions..."
    echo ""

    local count=0 failed=0
    for func in $functions; do
        count=$((count + 1))
        printf "  [%${#total}d/%d] %-42s" "$count" "$total" "$func"

        local jwt_flag=""
        local verify_jwt
        verify_jwt=$(grep -A1 "\[functions.$func\]" supabase/config.toml 2>/dev/null | grep "verify_jwt" | cut -d= -f2 | tr -d ' ' || echo "true")
        [ "$verify_jwt" = "false" ] && jwt_flag="--no-verify-jwt"

        if supabase functions deploy "$func" $jwt_flag 2>/dev/null; then
            echo -e "${GREEN}✓${NC}"
        else
            echo -e "${RED}✗${NC}"
            failed=$((failed + 1))
        fi
    done

    echo ""
    if [ "$failed" -eq 0 ]; then
        echo -e "  ${GREEN}✓ All ${total} functions deployed${NC}"
    else
        echo -e "  ${RED}✗ ${failed}/${total} failed — check Supabase Dashboard → Functions${NC}"
    fi
    echo ""
}

cmd_set_keys() {
    echo ""
    print_section "Configure Secrets"
    require_link || return 1

    echo -e "  ${DIM}Press Enter to skip. Set any of these later in:${NC}"
    echo -e "  ${DIM}Supabase Dashboard → Project → Settings → Edge Functions → Secrets${NC}"
    echo ""

    # ── Email ──
    print_divider
    echo -e "  ${BOLD}Email${NC}  ${DIM}Resend — newsletter & transactional emails${NC}"
    echo -e "  ${DIM}https://resend.com/api-keys${NC}"
    read -e -p "  RESEND_API_KEY: " val; set_secret "RESEND_API_KEY" "$val"
    echo ""

    # ── Payments ──
    print_divider
    echo -e "  ${BOLD}Payments${NC}  ${DIM}Stripe — e-commerce & subscriptions${NC}"
    echo -e "  ${DIM}https://dashboard.stripe.com/apikeys${NC}"
    read -e -p "  STRIPE_SECRET_KEY: " val; set_secret "STRIPE_SECRET_KEY" "$val"
    read -e -p "  STRIPE_WEBHOOK_SECRET: " val; set_secret "STRIPE_WEBHOOK_SECRET" "$val"
    echo ""

    # ── AI: OpenAI ──
    print_divider
    echo -e "  ${BOLD}AI — OpenAI${NC}  ${DIM}chat, text generation, content tools${NC}"
    echo -e "  ${DIM}https://platform.openai.com/api-keys${NC}"
    read -e -p "  OPENAI_API_KEY: " val; set_secret "OPENAI_API_KEY" "$val"
    echo ""

    # ── AI: Gemini ──
    print_divider
    echo -e "  ${BOLD}AI — Google Gemini${NC}  ${DIM}alternative to OpenAI${NC}"
    echo -e "  ${DIM}https://aistudio.google.com/app/apikey${NC}"
    read -e -p "  GEMINI_API_KEY: " val; set_secret "GEMINI_API_KEY" "$val"
    echo ""

    # ── AI: Anthropic ──
    print_divider
    echo -e "  ${BOLD}AI — Anthropic / Claude${NC}  ${DIM}alternative to OpenAI${NC}"
    echo -e "  ${DIM}https://console.anthropic.com/settings/keys${NC}"
    read -e -p "  ANTHROPIC_API_KEY: " val; set_secret "ANTHROPIC_API_KEY" "$val"
    echo ""

    # ── Local LLM ──
    print_divider
    echo -e "  ${BOLD}Local LLM${NC}  ${DIM}Ollama, vLLM, LM Studio — only if auth is required${NC}"
    echo -e "  ${DIM}Endpoint & model are set in Admin → Integrations${NC}"
    read -e -p "  LOCAL_LLM_API_KEY: " val; set_secret "LOCAL_LLM_API_KEY" "$val"
    echo ""

    # ── Web scraping ──
    print_divider
    echo -e "  ${BOLD}Web Scraping${NC}  ${DIM}Firecrawl — content migration, company enrichment${NC}"
    echo -e "  ${DIM}https://firecrawl.dev${NC}"
    read -e -p "  FIRECRAWL_API_KEY: " val; set_secret "FIRECRAWL_API_KEY" "$val"
    echo ""

    print_divider
    echo -e "  ${BOLD}Web Search${NC}  ${DIM}Jina AI — alternative web search & scraping${NC}"
    echo -e "  ${DIM}https://jina.ai/api-key${NC}"
    read -e -p "  JINA_API_KEY: " val; set_secret "JINA_API_KEY" "$val"
    echo ""

    # ── Stock photos ──
    print_divider
    echo -e "  ${BOLD}Stock Photos${NC}  ${DIM}Unsplash — image search in media library${NC}"
    echo -e "  ${DIM}https://unsplash.com/oauth/applications${NC}"
    read -e -p "  UNSPLASH_ACCESS_KEY: " val; set_secret "UNSPLASH_ACCESS_KEY" "$val"
    echo ""

    # ── Gmail ──
    print_divider
    echo -e "  ${BOLD}Gmail Integration${NC}  ${DIM}inbox scanning, email signals${NC}"
    echo -e "  ${DIM}https://console.cloud.google.com/apis/credentials${NC}"
    read -e -p "  GOOGLE_CLIENT_ID: " val; set_secret "GOOGLE_CLIENT_ID" "$val"
    read -e -p "  GOOGLE_CLIENT_SECRET: " val; set_secret "GOOGLE_CLIENT_SECRET" "$val"
    echo ""

    # ── Sales intelligence ──
    print_divider
    echo -e "  ${BOLD}Sales Intelligence${NC}  ${DIM}Hunter.io — prospect research & email finder${NC}"
    echo -e "  ${DIM}https://hunter.io/api${NC}"
    read -e -p "  HUNTER_API_KEY: " val; set_secret "HUNTER_API_KEY" "$val"
    echo ""

    # ── N8N ──
    print_divider
    echo -e "  ${BOLD}N8N Automation${NC}  ${DIM}only if your N8N webhook requires auth${NC}"
    echo -e "  ${DIM}Webhook URL is set in Admin → Integrations${NC}"
    read -e -p "  N8N_API_KEY: " val; set_secret "N8N_API_KEY" "$val"
    echo ""

    # ── Site URL ──
    print_divider
    echo -e "  ${BOLD}Site URL${NC}  ${DIM}required for OAuth redirects (e.g. Gmail)${NC}"
    read -e -p "  SITE_URL (e.g. https://yoursite.com): " val; set_secret "SITE_URL" "$val"
    echo ""

    print_divider
    echo -e "  ${GREEN}✓ Done.${NC} View or update at any time:"
    echo -e "  ${DIM}Supabase Dashboard → Project → Settings → Edge Functions → Secrets${NC}"
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

cmd_install() {
    echo ""
    print_section "Full Installation"
    require_link || return 1

    echo -e "  Runs: ${CYAN}/update-db${NC} → ${CYAN}/update-funcs${NC} → ${CYAN}/create-admin${NC} → ${CYAN}/env${NC}"
    echo ""
    read -e -p "  Continue? [y/N]: " confirm
    [[ ! "$confirm" =~ ^[Yy]$ ]] && echo "" && return 0

    cmd_update_db
    cmd_update_funcs
    cmd_create_admin
    cmd_env

    read -e -p "  Configure API keys now? [y/N]: " keys
    [[ "$keys" =~ ^[Yy]$ ]] && cmd_set_keys
}

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
echo -e "  Type ${CYAN}/help${NC} for commands  ·  ${CYAN}/quit${NC} to exit"
echo ""

# ─── REPL ───

while true; do
    if [ -n "$PROJECT_REF" ]; then
        prompt="$(printf "\033[0;36mflowwink\033[0m \033[2m[${PROJECT_NAME}]\033[0m > ")"
    else
        prompt="$(printf "\033[0;36mflowwink\033[0m > ")"
    fi

    read -e -p "$prompt" input
    [ -z "$input" ] && continue
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
