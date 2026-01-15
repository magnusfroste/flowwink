#!/bin/bash

# =============================================================================
# FlowWink Complete Supabase Setup Script
# =============================================================================
# This script handles the complete Supabase backend setup:
# 1. Links to your Supabase project
# 2. Deploys all edge functions
# 3. Runs database migrations
# 4. Creates first admin user
#
# Usage:
#   ./scripts/setup-supabase.sh
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlowWink Complete Supabase Setup                        ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}✗ Supabase CLI not found${NC}"
    echo ""
    echo "Install it with:"
    echo "  npm install -g supabase"
    echo ""
    exit 1
fi

# Check if we're in the right directory
if [ ! -d "supabase/functions" ]; then
    echo -e "${RED}✗ Error: supabase/functions directory not found${NC}"
    echo "Please run this script from the project root directory"
    exit 1
fi

# Check if user is logged in
if ! supabase projects list &> /dev/null; then
    echo -e "${YELLOW}⚠ Not logged in to Supabase${NC}"
    echo ""
    echo "Logging in..."
    supabase login
    echo ""
fi

# Get project ref
echo -e "${BLUE}Step 1: Link to Supabase Project${NC}"
echo ""
read -p "Enter your Supabase project ref: " PROJECT_REF

if [ -z "$PROJECT_REF" ]; then
    echo -e "${RED}✗ Project ref is required${NC}"
    exit 1
fi

echo ""
echo "Linking to project $PROJECT_REF..."
supabase link --project-ref "$PROJECT_REF"
echo -e "${GREEN}✓ Linked to project${NC}"
echo ""

# Deploy edge functions
echo -e "${BLUE}Step 2: Deploy Edge Functions${NC}"
echo ""
./scripts/deploy-functions.sh full
echo ""

# Run database migrations
echo -e "${BLUE}Step 3: Run Database Migrations${NC}"
echo ""
echo "This will create all tables, RLS policies, and storage buckets..."
read -p "Continue? [y/N]: " confirm

if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Setup cancelled. Edge functions are deployed, but database is not migrated."
    exit 0
fi

echo ""
echo "Running migrations..."
supabase db push
echo -e "${GREEN}✓ Database migrations complete${NC}"
echo ""

# Create admin user
echo -e "${BLUE}Step 4: Create Admin User${NC}"
echo ""
read -p "Create admin user now? [y/N]: " create_admin

if [[ "$create_admin" =~ ^[Yy]$ ]]; then
    echo ""
    read -p "Admin email: " ADMIN_EMAIL
    read -sp "Admin password (min 8 chars): " ADMIN_PASSWORD
    echo ""
    read -p "Admin name (optional): " ADMIN_NAME
    
    if [ -z "$ADMIN_EMAIL" ] || [ -z "$ADMIN_PASSWORD" ]; then
        echo -e "${YELLOW}⚠ Skipping admin creation - email and password required${NC}"
    else
        # Use the create-user edge function
        echo ""
        echo "Creating admin user..."
        
        # Get service role key from environment or ask
        if [ -z "$SUPABASE_SERVICE_ROLE_KEY" ]; then
            echo ""
            echo -e "${YELLOW}Service role key needed (from Supabase Dashboard → Settings → API)${NC}"
            read -sp "Service role key: " SERVICE_ROLE_KEY
            echo ""
        else
            SERVICE_ROLE_KEY="$SUPABASE_SERVICE_ROLE_KEY"
        fi
        
        # Call create-user function
        RESPONSE=$(curl -s -X POST \
          "https://${PROJECT_REF}.supabase.co/functions/v1/create-user" \
          -H "Authorization: Bearer ${SERVICE_ROLE_KEY}" \
          -H "Content-Type: application/json" \
          -d "{
            \"email\": \"${ADMIN_EMAIL}\",
            \"password\": \"${ADMIN_PASSWORD}\",
            \"name\": \"${ADMIN_NAME:-$ADMIN_EMAIL}\",
            \"role\": \"admin\"
          }")
        
        if echo "$RESPONSE" | grep -q "error"; then
            echo -e "${RED}✗ Failed to create admin user${NC}"
            echo "$RESPONSE"
            echo ""
            echo "You can create an admin user manually:"
            echo "1. Sign up at your app"
            echo "2. Run this SQL in Supabase Dashboard:"
            echo ""
            echo "UPDATE public.user_roles SET role = 'admin'"
            echo "WHERE user_id = (SELECT id FROM auth.users WHERE email = '${ADMIN_EMAIL}');"
        else
            echo -e "${GREEN}✓ Admin user created${NC}"
        fi
    fi
fi

# Fetch project credentials
echo ""
echo -e "${BLUE}Fetching project credentials...${NC}"
echo ""

# Get project settings via CLI
PROJECT_SETTINGS=$(supabase projects api-keys --project-ref "$PROJECT_REF" 2>/dev/null || echo "")

if [ -n "$PROJECT_SETTINGS" ]; then
    # Extract anon key from output
    ANON_KEY=$(echo "$PROJECT_SETTINGS" | grep -A1 "anon key" | tail -1 | xargs)
    
    if [ -n "$ANON_KEY" ]; then
        echo -e "${GREEN}✓ Credentials fetched${NC}"
    else
        echo -e "${YELLOW}⚠ Could not auto-fetch anon key${NC}"
        echo "Get it from: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
        read -p "Enter anon key: " ANON_KEY
    fi
else
    echo -e "${YELLOW}⚠ Could not auto-fetch credentials${NC}"
    echo "Get them from: https://supabase.com/dashboard/project/${PROJECT_REF}/settings/api"
    read -p "Enter anon key: " ANON_KEY
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Setup Complete!                                          ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Supabase backend is ready!${NC}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Copy-Paste These Into Easypanel Environment Variables${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "VITE_SUPABASE_URL=https://${PROJECT_REF}.supabase.co"
echo "VITE_SUPABASE_PUBLISHABLE_KEY=${ANON_KEY}"
echo "VITE_SUPABASE_PROJECT_ID=${PROJECT_REF}"
echo ""
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Next steps:"
echo "  1. Copy the 3 variables above"
echo "  2. Paste into Easypanel → Service → Environment"
echo "  3. Deploy your app"
echo "  4. Visit your site and login with: ${ADMIN_EMAIL}"
echo "  5. Go to /admin to start building"
echo ""
