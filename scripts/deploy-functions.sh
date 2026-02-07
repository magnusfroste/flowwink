#!/bin/bash

# =============================================================================
# FlowWink Edge Functions Deployment Script
# =============================================================================
# This script deploys Supabase edge functions to your project.
#
# Usage:
#   ./scripts/deploy-functions.sh [minimal|full]
#
# Examples:
#   ./scripts/deploy-functions.sh minimal  # Deploy only essential functions
#   ./scripts/deploy-functions.sh full     # Deploy all functions
#   ./scripts/deploy-functions.sh          # Interactive mode
# =============================================================================

set -e  # Exit on error

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

# Essential functions for basic CMS functionality (hardcoded for safety)
MINIMAL_FUNCTIONS=(
  "setup-database"
  "get-page"
  "track-page-view"
)

# Auto-discover all functions from filesystem
ALL_FUNCTIONS=()
for func_dir in supabase/functions/*/; do
  if [ -d "$func_dir" ]; then
    func_name=$(basename "$func_dir")
    # Check if index.ts exists (valid function)
    if [ -f "$func_dir/index.ts" ]; then
      ALL_FUNCTIONS+=("$func_name")
    fi
  fi
done

# Sort for consistent output
IFS=$'\n' ALL_FUNCTIONS=($(sort <<<"${ALL_FUNCTIONS[*]}"))
unset IFS

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlowWink Edge Functions Deployment                      ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "${GREEN}✓ Auto-discovered ${#ALL_FUNCTIONS[@]} edge functions${NC}"
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

# Determine deployment mode (default to full)
MODE="${1:-full}"

if [ "$MODE" != "minimal" ] && [ "$MODE" != "full" ]; then
    echo -e "${RED}✗ Invalid mode: $MODE${NC}"
    echo "Usage: $0 [minimal|full]"
    echo ""
    echo "  minimal - Deploy 3 essential functions (basic CMS)"
    echo "  full    - Deploy all functions (default)"
    exit 1
fi

# Select functions to deploy
if [ "$MODE" = "minimal" ]; then
    FUNCTIONS=("${MINIMAL_FUNCTIONS[@]}")
    echo -e "${YELLOW}⚠ Deploying minimal functions only (${#MINIMAL_FUNCTIONS[@]} functions)${NC}"
    echo -e "${YELLOW}  Some features will not be available (AI, newsletter, etc.)${NC}"
elif [ "$MODE" = "full" ]; then
    FUNCTIONS=("${ALL_FUNCTIONS[@]}")
    echo -e "${GREEN}✓ Deploying all functions (${#ALL_FUNCTIONS[@]} auto-discovered)${NC}"
fi

echo ""
echo "Functions to deploy:"
for func in "${FUNCTIONS[@]}"; do
    echo "  • $func"
done
echo ""

read -p "Continue? [y/N]: " confirm
if [[ ! "$confirm" =~ ^[Yy]$ ]]; then
    echo "Deployment cancelled"
    exit 0
fi

echo ""
echo -e "${BLUE}Starting deployment...${NC}"
echo ""

# Deploy functions
SUCCESS_COUNT=0
FAILED_COUNT=0
FAILED_FUNCTIONS=()

for func in "${FUNCTIONS[@]}"; do
    echo -n "Deploying $func... "
    
    if supabase functions deploy "$func" --no-verify-jwt &> /tmp/deploy-$func.log; then
        echo -e "${GREEN}✓${NC}"
        ((SUCCESS_COUNT++))
    else
        echo -e "${RED}✗${NC}"
        ((FAILED_COUNT++))
        FAILED_FUNCTIONS+=("$func")
        echo "  Error log: /tmp/deploy-$func.log"
    fi
done

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Deployment Summary                                       ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo -e "  ${GREEN}✓ Successful:${NC} $SUCCESS_COUNT"
echo -e "  ${RED}✗ Failed:${NC}     $FAILED_COUNT"
echo ""

if [ $FAILED_COUNT -gt 0 ]; then
    echo -e "${YELLOW}Failed functions:${NC}"
    for func in "${FAILED_FUNCTIONS[@]}"; do
        echo "  • $func"
    done
    echo ""
    echo "Check error logs in /tmp/deploy-*.log"
    exit 1
fi

echo -e "${GREEN}✓ All functions deployed successfully!${NC}"
echo ""
echo "Next steps:"
echo "  1. Verify deployment: supabase functions list"
echo "  2. Test functions in your app"
echo "  3. Check function logs: Supabase Dashboard → Edge Functions → Logs"
echo ""
