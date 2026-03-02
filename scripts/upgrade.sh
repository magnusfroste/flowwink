#!/bin/bash

# FlowWink Upgrade Script
# Run this script to upgrade your self-hosted FlowWink installation
# Usage: ./scripts/upgrade.sh

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo ""
echo -e "${BLUE}╔════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║      FlowWink Upgrade Script           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════╝${NC}"
echo ""

# Check if we're in a git repo
if [ ! -d ".git" ]; then
    echo -e "${RED}Error: Not a git repository. Please run from the project root.${NC}"
    exit 1
fi

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${YELLOW}Warning: Supabase CLI not found. Database migrations will be skipped.${NC}"
    SUPABASE_AVAILABLE=false
else
    SUPABASE_AVAILABLE=true
fi

# Step 0: Backup reminder
echo -e "${YELLOW}⚠️  IMPORTANT: Have you backed up your database?${NC}"
echo ""
echo "   Run this command to backup:"
echo -e "   ${BLUE}supabase db dump -f backup-\$(date +%Y%m%d).sql${NC}"
echo ""
read -p "Press Enter to continue (or Ctrl+C to cancel)..."
echo ""

# Step 1: Check for local changes
echo -e "${BLUE}[1/6] Checking for local changes...${NC}"
if [ -n "$(git status --porcelain)" ]; then
    echo -e "${YELLOW}Warning: You have uncommitted changes.${NC}"
    git status --short
    echo ""
    read -p "Stash changes and continue? (y/n): " STASH_CONFIRM
    if [ "$STASH_CONFIRM" = "y" ]; then
        git stash
        echo -e "${GREEN}Changes stashed. Run 'git stash pop' later to restore.${NC}"
    else
        echo -e "${RED}Upgrade cancelled.${NC}"
        exit 1
    fi
fi
echo -e "${GREEN}✓ Working directory clean${NC}"
echo ""

# Step 2: Fetch and show changes
echo -e "${BLUE}[2/6] Fetching latest changes...${NC}"
git fetch origin

CURRENT_BRANCH=$(git branch --show-current)
COMMITS_BEHIND=$(git rev-list --count HEAD..origin/$CURRENT_BRANCH 2>/dev/null || echo "0")

if [ "$COMMITS_BEHIND" = "0" ]; then
    echo -e "${GREEN}✓ Already up to date!${NC}"
    echo ""
    read -p "Continue anyway? (y/n): " CONTINUE_CONFIRM
    if [ "$CONTINUE_CONFIRM" != "y" ]; then
        exit 0
    fi
else
    echo -e "${YELLOW}Found $COMMITS_BEHIND new commits:${NC}"
    git log --oneline HEAD..origin/$CURRENT_BRANCH
    echo ""
fi

# Step 3: Pull changes
echo -e "${BLUE}[3/6] Pulling changes...${NC}"
git pull origin $CURRENT_BRANCH
echo -e "${GREEN}✓ Code updated${NC}"
echo ""

# Step 4: Install dependencies
echo -e "${BLUE}[4/6] Installing dependencies...${NC}"
if command -v bun &> /dev/null; then
    bun install
elif command -v pnpm &> /dev/null; then
    pnpm install
elif command -v yarn &> /dev/null; then
    yarn install
else
    npm install
fi
echo -e "${GREEN}✓ Dependencies installed${NC}"
echo ""

# Step 5: Run database migrations
if [ "$SUPABASE_AVAILABLE" = true ]; then
    echo -e "${BLUE}[5/6] Running database migrations...${NC}"
    
    # Check if linked to a project
    if supabase db push --dry-run &> /dev/null; then
        supabase db push
        echo -e "${GREEN}✓ Database migrations complete${NC}"
    else
        echo -e "${YELLOW}Warning: Not linked to a Supabase project.${NC}"
        echo "   Run: supabase link --project-ref YOUR_PROJECT_REF"
    fi
else
    echo -e "${YELLOW}[5/6] Skipping database migrations (Supabase CLI not available)${NC}"
fi
echo ""

# Step 6: Deploy edge functions
if [ "$SUPABASE_AVAILABLE" = true ]; then
    echo -e "${BLUE}[6/6] Deploying edge functions...${NC}"
    
    if [ -d "supabase/functions" ]; then
        FUNCTIONS_DIR="supabase/functions"
        FUNCTION_COUNT=0
        
        for fn_dir in "$FUNCTIONS_DIR"/*/; do
            if [ -d "$fn_dir" ]; then
                fn_name=$(basename "$fn_dir")
                echo "   Deploying $fn_name..."
                supabase functions deploy "$fn_name" --no-verify-jwt 2>/dev/null || \
                supabase functions deploy "$fn_name" 2>/dev/null || \
                echo -e "${YELLOW}   Warning: Could not deploy $fn_name${NC}"
                FUNCTION_COUNT=$((FUNCTION_COUNT + 1))
            fi
        done
        
        echo -e "${GREEN}✓ Deployed $FUNCTION_COUNT edge functions${NC}"
    else
        echo -e "${YELLOW}No edge functions directory found${NC}"
    fi
else
    echo -e "${YELLOW}[6/6] Skipping edge function deployment (Supabase CLI not available)${NC}"
fi
echo ""

# Done!
echo -e "${GREEN}╔════════════════════════════════════════╗${NC}"
echo -e "${GREEN}║      Upgrade Complete! ✓               ║${NC}"
echo -e "${GREEN}╚════════════════════════════════════════╝${NC}"
echo ""
echo "Next steps:"
echo "  1. Review CHANGELOG.md for new features"
echo "  2. Rebuild production: npm run build"
echo "  3. Restart your application"
echo ""
echo -e "If something went wrong, see ${BLUE}docs/UPGRADING.md${NC} for rollback instructions."
echo ""
