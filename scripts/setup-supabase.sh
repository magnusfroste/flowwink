#!/bin/bash

# FlowWink Supabase Setup Script
# This script sets up the complete Supabase backend for self-hosting
#
# Usage:
#   ./scripts/setup-supabase.sh          # Normal setup
#   ./scripts/setup-supabase.sh --fresh  # Fresh start (logout, clear cache)
#   ./scripts/setup-supabase.sh --env    # Just show environment variables

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Check for --env flag (just show environment variables)
ENV_ONLY=false
if [[ "$1" == "--env" ]]; then
    ENV_ONLY=true
fi

# Check for --fresh flag (useful for agencies setting up multiple sites)
if [[ "$1" == "--fresh" ]]; then
    echo -e "${YELLOW}Fresh start requested - clearing all cached data...${NC}"
    echo ""
    
    # Logout from Supabase CLI (auto-confirm with 'y')
    if command -v supabase &> /dev/null; then
        echo "y" | supabase logout 2>/dev/null || true
        echo -e "${GREEN}✓ Logged out from Supabase CLI${NC}"
    fi
    
    # Clear cached project link
    if [ -d "supabase/.temp" ]; then
        rm -rf supabase/.temp
        echo -e "${GREEN}✓ Cleared cached project link${NC}"
    fi
    
    echo ""
fi

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlowWink Supabase Setup                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Check if logged in
echo -e "${YELLOW}Checking Supabase login status...${NC}"
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}Not logged in to Supabase CLI${NC}"
    echo ""
    read -p "Would you like to login now? [Y/n]: " do_login
    if [[ ! "$do_login" =~ ^[Nn]$ ]]; then
        echo ""
        supabase login
        echo ""
        # Verify login worked
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

# Get list of projects and let user choose by number
echo ""
echo -e "${BLUE}Your Supabase projects:${NC}"
echo ""

# Get projects and display with numbers
PROJECTS=$(supabase projects list --output json 2>/dev/null || echo "[]")
if [ "$PROJECTS" == "[]" ] || [ -z "$PROJECTS" ]; then
    echo -e "${RED}No projects found. Create one at supabase.com first.${NC}"
    exit 1
fi

# Parse and display projects with numbers
echo "$PROJECTS" | jq -r 'to_entries | .[] | "\(.key + 1)) \(.value.name) (\(.value.id)) - \(.value.region)"'
echo ""

# Check if already linked and if the project still exists
CURRENT_REF=""
PROJECT_COUNT=$(echo "$PROJECTS" | jq 'length')

if [ -f "supabase/.temp/project-ref" ]; then
    CURRENT_REF=$(cat supabase/.temp/project-ref)
    CURRENT_NAME=$(echo "$PROJECTS" | jq -r --arg ref "$CURRENT_REF" '.[] | select(.id == $ref) | .name' 2>/dev/null || echo "")
    
    if [ -n "$CURRENT_NAME" ] && [ "$CURRENT_NAME" != "null" ]; then
        # Project exists - ask if user wants to use it
        echo -e "${YELLOW}Currently linked to: ${CURRENT_NAME} (${CURRENT_REF})${NC}"
        echo ""
        read -p "Use this project? [Y/n] or enter number to switch: " use_current
        
        # Check if user entered a number (wants to switch)
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
        # Project was deleted - force re-selection
        echo -e "${YELLOW}Previously linked project no longer exists.${NC}"
        rm -rf supabase/.temp
        CURRENT_REF=""
        selection=""
    fi
fi

# If no current project or user wants to switch
if [ -z "$CURRENT_REF" ]; then
    # If selection wasn't already set by entering a number above
    if [ -z "$selection" ]; then
        read -p "Select project number (1-${PROJECT_COUNT}): " selection
    fi
    
    # Validate selection
    if ! [[ "$selection" =~ ^[0-9]+$ ]] || [ "$selection" -lt 1 ] || [ "$selection" -gt "$PROJECT_COUNT" ]; then
        echo -e "${RED}Invalid selection${NC}"
        exit 1
    fi
    
    # Get project ref by index (0-based)
    PROJECT_REF=$(echo "$PROJECTS" | jq -r ".[$((selection - 1))].id")
    PROJECT_NAME=$(echo "$PROJECTS" | jq -r ".[$((selection - 1))].name")
    
    echo ""
    echo -e "${YELLOW}Linking to ${PROJECT_NAME} (${PROJECT_REF})...${NC}"
    supabase link --project-ref "$PROJECT_REF"
else
    PROJECT_REF="$CURRENT_REF"
fi

echo -e "${GREEN}✓ Project linked: ${PROJECT_REF}${NC}"

# If --env flag, skip to environment variables
if [ "$ENV_ONLY" = true ]; then
    echo ""
    echo -e "${YELLOW}Skipping setup steps (--env flag)${NC}"
else

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 1: Deploy Edge Functions${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Deploy all edge functions
FUNCTIONS_DIR="supabase/functions"
if [ -d "$FUNCTIONS_DIR" ]; then
    FUNCTIONS=$(find "$FUNCTIONS_DIR" -mindepth 1 -maxdepth 1 -type d -exec basename {} \;)
    TOTAL=$(echo "$FUNCTIONS" | wc -l | tr -d ' ')
    
    echo "Found $TOTAL edge functions to deploy..."
    echo ""
    
    COUNT=0
    FAILED=0
    for func in $FUNCTIONS; do
        COUNT=$((COUNT + 1))
        echo -ne "[$COUNT/$TOTAL] Deploying $func... "
        # Check if function should verify JWT from config
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
        exit 1
    fi
else
    echo -e "${RED}Error: No functions directory found${NC}"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 2: Run Database Migrations${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

echo -e "${YELLOW}Checking migration history...${NC}"
# Check for migration conflicts
MIGRATION_OUTPUT=$(supabase migration list --linked 2>&1 || echo "")
if echo "$MIGRATION_OUTPUT" | grep -q "Remote migration versions not found"; then
    echo -e "${YELLOW}⚠ Migration history mismatch detected. Repairing...${NC}"
    # Extract old remote migrations that don't exist locally
    OLD_MIGRATIONS=$(echo "$MIGRATION_OUTPUT" | grep -E '^\s+\|\s+[0-9]{14}' | awk '{print $2}' | tr '\n' ' ')
    if [ -n "$OLD_MIGRATIONS" ]; then
        echo "Reverting old remote migrations: $OLD_MIGRATIONS"
        supabase migration repair --status reverted $OLD_MIGRATIONS 2>/dev/null || true
        echo -e "${GREEN}✓ Migration history repaired${NC}"
    fi
fi

echo -e "${YELLOW}Pushing database schema...${NC}"
# Use --yes to auto-confirm
if supabase db push --yes 2>&1; then
    echo -e "${GREEN}✓ Database migrations applied${NC}"
else
    echo -e "${RED}✗ Database migration failed${NC}"
    echo -e "${YELLOW}Try running: supabase migration list --linked${NC}"
    echo "You may need to run migrations manually via Supabase Dashboard"
    exit 1
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 3: Create Admin User${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

read -p "Admin email [admin@example.com]: " ADMIN_EMAIL
ADMIN_EMAIL=${ADMIN_EMAIL:-admin@example.com}

read -s -p "Admin password [secure-password-123]: " ADMIN_PASSWORD
echo ""
ADMIN_PASSWORD=${ADMIN_PASSWORD:-secure-password-123}

echo ""
echo -e "${YELLOW}Creating admin user...${NC}"

# Create admin user via edge function
SUPABASE_URL="https://${PROJECT_REF}.supabase.co"

# Get service role key from API keys
API_KEYS_ADMIN=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null || echo "[]")
SERVICE_ROLE_KEY=$(echo "$API_KEYS_ADMIN" | jq -r '.[] | select(.name == "service_role") | .api_key' 2>/dev/null || echo "")

if [ -z "$SERVICE_ROLE_KEY" ] || [ "$SERVICE_ROLE_KEY" == "null" ]; then
    echo -e "${YELLOW}Note: Could not get service role key automatically.${NC}"
    echo "You can create the admin user manually in Supabase Dashboard → Authentication"
else
    # Create admin user via Supabase Admin API
    RESPONSE=$(curl -s -X POST "${SUPABASE_URL}/auth/v1/admin/users" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "apikey: ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\", \"email_confirm\": true, \"user_metadata\": {\"full_name\": \"Admin\"}}" 2>&1)
    
    if echo "$RESPONSE" | grep -q '"id"'; then
        # User created, now update role to admin
        USER_ID=$(echo "$RESPONSE" | jq -r '.id' 2>/dev/null || echo "")
        if [ -n "$USER_ID" ] && [ "$USER_ID" != "null" ]; then
            # Update role via edge function or direct API
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
        echo -e "${YELLOW}⚠ User already exists: ${ADMIN_EMAIL}${NC}"
    else
        echo -e "${YELLOW}⚠ Could not create admin user${NC}"
        echo "Create admin manually: Supabase Dashboard → Authentication → Add user"
        echo "Then run: INSERT INTO user_roles (user_id, role) SELECT id, 'admin' FROM auth.users WHERE email = '${ADMIN_EMAIL}';"
    fi
fi

fi  # End of ENV_ONLY check

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 4: Environment Variables${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Fetch project API keys
echo -e "${YELLOW}Fetching API keys...${NC}"

# Get the anon key from project API settings
API_KEYS=$(supabase projects api-keys --project-ref "$PROJECT_REF" --output json 2>/dev/null || echo "[]")
ANON_KEY=$(echo "$API_KEYS" | jq -r '.[] | select(.name == "anon") | .api_key' 2>/dev/null || echo "")

if [ -z "$ANON_KEY" ] || [ "$ANON_KEY" == "null" ]; then
    echo -e "${YELLOW}Could not fetch keys automatically. Get them from Supabase Dashboard.${NC}"
    echo ""
    echo "Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
    echo ""
    echo "Then set these environment variables:"
    echo ""
    echo -e "${BLUE}┌────────────────────────────────────────────────────────────┐${NC}"
    echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
    echo "VITE_SUPABASE_PUBLISHABLE_KEY=<your-anon-key>"
    echo "VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
    echo -e "${BLUE}└────────────────────────────────────────────────────────────┘${NC}"
else
    echo ""
    echo -e "${GREEN}Copy these environment variables to your hosting platform (e.g., Easypanel):${NC}"
    echo ""
    echo -e "${BLUE}┌────────────────────────────────────────────────────────────┐${NC}"
    echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
    echo "VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}"
    echo "VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
    echo -e "${BLUE}└────────────────────────────────────────────────────────────┘${NC}"
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Setup Complete!                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Copy the environment variables above to your hosting platform"
echo "  2. Deploy your frontend"
if [ "$ENV_ONLY" = false ]; then
    echo "  3. Login with: ${ADMIN_EMAIL}"
fi
echo ""

# Ask if user wants to configure integrations
if [ "$ENV_ONLY" = false ]; then
    read -p "Configure optional integrations (AI, email, payments)? [y/N]: " configure_secrets
    if [[ "$configure_secrets" =~ ^[Yy]$ ]]; then
        echo ""
        ./scripts/configure-secrets.sh
    else
        echo ""
        echo "You can run ./scripts/configure-secrets.sh later to set up integrations."
        echo ""
    fi
fi
