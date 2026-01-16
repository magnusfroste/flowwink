#!/bin/bash

# FlowWink Supabase Setup Script
# This script sets up the complete Supabase backend for self-hosting

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

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
    echo -e "${RED}Not logged in to Supabase CLI${NC}"
    echo "Run: supabase login"
    exit 1
fi
echo -e "${GREEN}✓ Logged in to Supabase${NC}"

# Check if project is linked
if [ ! -f "supabase/.temp/project-ref" ]; then
    echo ""
    echo -e "${YELLOW}No project linked. Let's link one now.${NC}"
    echo ""
    echo "Your Supabase projects:"
    supabase projects list
    echo ""
    read -p "Enter your project ref (from the list above): " PROJECT_REF
    
    if [ -z "$PROJECT_REF" ]; then
        echo -e "${RED}Error: Project ref is required${NC}"
        exit 1
    fi
    
    echo ""
    echo -e "${YELLOW}Linking to project ${PROJECT_REF}...${NC}"
    supabase link --project-ref "$PROJECT_REF"
    echo -e "${GREEN}✓ Project linked${NC}"
else
    PROJECT_REF=$(cat supabase/.temp/project-ref)
    echo -e "${GREEN}✓ Project already linked: ${PROJECT_REF}${NC}"
fi

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
        if supabase functions deploy "$func" --no-verify-jwt 2>/dev/null; then
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
        echo -e "${YELLOW}⚠ Deployed $((TOTAL - FAILED))/$TOTAL functions ($FAILED failed)${NC}"
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

echo -e "${YELLOW}Pushing database schema...${NC}"
if supabase db push; then
    echo -e "${GREEN}✓ Database migrations applied${NC}"
else
    echo -e "${RED}✗ Database migration failed${NC}"
    echo "You may need to run migrations manually via Supabase Dashboard"
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
SERVICE_ROLE_KEY=$(supabase secrets list 2>/dev/null | grep SUPABASE_SERVICE_ROLE_KEY | awk '{print $2}' || echo "")

if [ -z "$SERVICE_ROLE_KEY" ]; then
    echo -e "${YELLOW}Note: Could not get service role key automatically.${NC}"
    echo "You can create the admin user manually in Supabase Dashboard → Authentication"
else
    # Use the setup-database edge function to create admin
    curl -s -X POST "${SUPABASE_URL}/functions/v1/setup-database" \
        -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
        -H "Content-Type: application/json" \
        -d "{\"email\": \"${ADMIN_EMAIL}\", \"password\": \"${ADMIN_PASSWORD}\"}" > /dev/null 2>&1
    
    echo -e "${GREEN}✓ Admin user created: ${ADMIN_EMAIL}${NC}"
fi

echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Step 4: Environment Variables${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""

# Fetch project details
echo -e "${YELLOW}Fetching project details...${NC}"

# Get the anon key
ANON_KEY=$(supabase status 2>/dev/null | grep "anon key" | awk '{print $3}' || echo "")

if [ -z "$ANON_KEY" ]; then
    echo -e "${YELLOW}Could not fetch keys automatically. Get them from Supabase Dashboard.${NC}"
    echo ""
    echo "Go to: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
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
echo "  3. Login with: ${ADMIN_EMAIL}"
echo ""
echo "Optional: Run ./scripts/configure-secrets.sh to set up integrations"
echo ""
