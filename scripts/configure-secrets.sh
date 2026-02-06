#!/bin/bash

# FlowWink Secrets Configuration Script
# Configure optional Supabase secrets for integrations

set -e

# Colors for output
RED='\033[0;31m'
GREEN='\033[0;32m'
YELLOW='\033[1;33m'
BLUE='\033[0;34m'
NC='\033[0m' # No Color

echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   FlowWink Secrets Configuration                           ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "This script helps you configure optional Supabase secrets for integrations."
echo "Skip any integration you don't need by pressing Enter."
echo ""

# Check if supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo -e "${RED}Error: Supabase CLI is not installed${NC}"
    echo "Install it with: npm install -g supabase"
    exit 1
fi

# Check if project is linked
if [ ! -f "supabase/.temp/project-ref" ]; then
    echo -e "${RED}Error: No Supabase project linked${NC}"
    echo "Run ./scripts/setup-supabase.sh first"
    exit 1
fi

PROJECT_REF=$(cat supabase/.temp/project-ref)
echo -e "${GREEN}✓ Project linked: ${PROJECT_REF}${NC}"
echo ""

# Resend (Email)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Email (Resend)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Required for: Newsletter sending, transactional emails"
echo "Get your key from: https://resend.com/api-keys"
echo ""
read -p "Configure Resend? [y/N]: " configure_resend

if [[ "$configure_resend" =~ ^[Yy]$ ]]; then
    read -p "Resend API Key: " RESEND_API_KEY
    if [ -n "$RESEND_API_KEY" ]; then
        supabase secrets set RESEND_API_KEY="$RESEND_API_KEY"
        echo -e "${GREEN}✓ Resend configured${NC}"
    fi
fi

echo ""

# Stripe (Payments)
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Payments (Stripe)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Required for: E-commerce, subscriptions, payments"
echo "Get your keys from: https://dashboard.stripe.com/apikeys"
echo ""
read -p "Configure Stripe? [y/N]: " configure_stripe

if [[ "$configure_stripe" =~ ^[Yy]$ ]]; then
    read -p "Stripe Secret Key (sk_...): " STRIPE_SECRET_KEY
    if [ -n "$STRIPE_SECRET_KEY" ]; then
        supabase secrets set STRIPE_SECRET_KEY="$STRIPE_SECRET_KEY"
        echo -e "${GREEN}✓ Stripe secret key configured${NC}"
    fi
    
    read -p "Stripe Webhook Secret (whsec_...): " STRIPE_WEBHOOK_SECRET
    if [ -n "$STRIPE_WEBHOOK_SECRET" ]; then
        supabase secrets set STRIPE_WEBHOOK_SECRET="$STRIPE_WEBHOOK_SECRET"
        echo -e "${GREEN}✓ Stripe webhook secret configured${NC}"
    fi
fi

echo ""

# OpenAI
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI Features (OpenAI)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Required for: AI chat, text generation, content migration"
echo "Get your key from: https://platform.openai.com/api-keys"
echo ""
read -p "Configure OpenAI? [y/N]: " configure_openai

if [[ "$configure_openai" =~ ^[Yy]$ ]]; then
    read -p "OpenAI API Key: " OPENAI_API_KEY
    if [ -n "$OPENAI_API_KEY" ]; then
        supabase secrets set OPENAI_API_KEY="$OPENAI_API_KEY"
        echo -e "${GREEN}✓ OpenAI configured${NC}"
    fi
fi

echo ""

# Gemini
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  AI Features (Google Gemini)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Alternative to OpenAI, often cheaper"
echo "Get your key from: https://aistudio.google.com/app/apikey"
echo ""
read -p "Configure Gemini? [y/N]: " configure_gemini

if [[ "$configure_gemini" =~ ^[Yy]$ ]]; then
    read -p "Gemini API Key: " GEMINI_API_KEY
    if [ -n "$GEMINI_API_KEY" ]; then
        supabase secrets set GEMINI_API_KEY="$GEMINI_API_KEY"
        echo -e "${GREEN}✓ Gemini configured${NC}"
    fi
fi

echo ""

# Firecrawl
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Web Scraping (Firecrawl)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Required for: AI content migration, company enrichment"
echo "Get your key from: https://firecrawl.dev"
echo ""
read -p "Configure Firecrawl? [y/N]: " configure_firecrawl

if [[ "$configure_firecrawl" =~ ^[Yy]$ ]]; then
    read -p "Firecrawl API Key: " FIRECRAWL_API_KEY
    if [ -n "$FIRECRAWL_API_KEY" ]; then
        supabase secrets set FIRECRAWL_API_KEY="$FIRECRAWL_API_KEY"
        echo -e "${GREEN}✓ Firecrawl configured${NC}"
    fi
fi

echo ""

# Unsplash
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Stock Photos (Unsplash)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Required for: Unsplash image search in media library"
echo "Get your key from: https://unsplash.com/oauth/applications"
echo ""
read -p "Configure Unsplash? [y/N]: " configure_unsplash

if [[ "$configure_unsplash" =~ ^[Yy]$ ]]; then
    read -p "Unsplash Access Key: " UNSPLASH_ACCESS_KEY
    if [ -n "$UNSPLASH_ACCESS_KEY" ]; then
        supabase secrets set UNSPLASH_ACCESS_KEY="$UNSPLASH_ACCESS_KEY"
        echo -e "${GREEN}✓ Unsplash configured${NC}"
    fi
fi

echo ""

# Local LLM
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  Local LLM (Self-Hosted AI)${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Optional: API key for self-hosted LLM (Ollama, LM Studio, etc.)"
echo "Note: Endpoint and model are configured in Admin → Integrations → Local LLM"
echo "This secret is only needed if your local LLM requires authentication."
echo ""
read -p "Configure Local LLM API Key? [y/N]: " configure_local_llm

if [[ "$configure_local_llm" =~ ^[Yy]$ ]]; then
    read -p "Local LLM API Key (leave empty if not needed): " LOCAL_LLM_API_KEY
    if [ -n "$LOCAL_LLM_API_KEY" ]; then
        supabase secrets set LOCAL_LLM_API_KEY="$LOCAL_LLM_API_KEY"
        echo -e "${GREEN}✓ Local LLM API key configured${NC}"
    else
        echo -e "${YELLOW}⚠ Skipped - no key needed${NC}"
    fi
fi

echo ""

# N8N
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo -e "${BLUE}  N8N Workflow Automation${NC}"
echo -e "${BLUE}━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━${NC}"
echo ""
echo "Optional: API key for N8N webhook authentication"
echo "Note: Webhook URL is configured in Admin → Integrations → N8N"
echo "This secret is only needed if your N8N webhook requires authentication."
echo ""
read -p "Configure N8N API Key? [y/N]: " configure_n8n

if [[ "$configure_n8n" =~ ^[Yy]$ ]]; then
    read -p "N8N API Key (leave empty if not needed): " N8N_API_KEY
    if [ -n "$N8N_API_KEY" ]; then
        supabase secrets set N8N_API_KEY="$N8N_API_KEY"
        echo -e "${GREEN}✓ N8N API key configured${NC}"
    else
        echo -e "${YELLOW}⚠ Skipped - no key needed${NC}"
    fi
fi

echo ""
echo -e "${BLUE}╔════════════════════════════════════════════════════════════╗${NC}"
echo -e "${BLUE}║   Configuration Complete!                                  ║${NC}"
echo -e "${BLUE}╚════════════════════════════════════════════════════════════╝${NC}"
echo ""
echo "Secrets configured! You can:"
echo ""
echo "  • View secrets: supabase secrets list"
echo "  • Update secrets: supabase secrets set SECRET_NAME=value"
echo "  • Check status in Admin → Settings → Integrations"
echo ""
