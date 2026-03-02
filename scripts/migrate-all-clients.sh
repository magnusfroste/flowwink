#!/bin/bash

# FlowWink Multi-Client Migration Script
# Run migrations across multiple client Supabase instances

set -e

echo "🚀 FlowWink Multi-Client Migration Tool"
echo "========================================"
echo ""

# Define your client projects here
# Format: "CLIENT_NAME:PROJECT_REF"
CLIENTS=(
  "Client1:abcdefghijklmnop"
  "Client2:qrstuvwxyzabcdef"
  "Client3:ghijklmnopqrstuv"
  "Client4:wxyzabcdefghijkl"
  "Client5:mnopqrstuvwxyzab"
)

# Check if Supabase CLI is installed
if ! command -v supabase &> /dev/null; then
    echo "❌ Supabase CLI not found. Install with:"
    echo "   npm install -g supabase"
    exit 1
fi

# Check if logged in
if ! supabase projects list &> /dev/null; then
    echo "❌ Not logged in to Supabase. Run:"
    echo "   supabase login"
    exit 1
fi

echo "✅ Supabase CLI ready"
echo ""

# Confirm before proceeding
echo "This will run migrations on ${#CLIENTS[@]} client projects:"
for client in "${CLIENTS[@]}"; do
    IFS=':' read -r name ref <<< "$client"
    echo "  - $name ($ref)"
done
echo ""
read -p "Continue? (y/N) " -n 1 -r
echo ""
if [[ ! $REPLY =~ ^[Yy]$ ]]; then
    echo "Aborted."
    exit 0
fi

# Run migrations for each client
SUCCESS_COUNT=0
FAIL_COUNT=0
FAILED_CLIENTS=()

for client in "${CLIENTS[@]}"; do
    IFS=':' read -r name ref <<< "$client"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Migrating: $name"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Link to project
    if supabase link --project-ref "$ref" 2>/dev/null; then
        echo "✅ Linked to $name"
        
        # Run migrations
        if supabase db push; then
            echo "✅ Migrations completed for $name"
            ((SUCCESS_COUNT++))
        else
            echo "❌ Migration failed for $name"
            ((FAIL_COUNT++))
            FAILED_CLIENTS+=("$name")
        fi
    else
        echo "❌ Could not link to $name"
        ((FAIL_COUNT++))
        FAILED_CLIENTS+=("$name")
    fi
done

# Summary
echo ""
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "📊 Migration Summary"
echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
echo "✅ Successful: $SUCCESS_COUNT"
echo "❌ Failed: $FAIL_COUNT"

if [ $FAIL_COUNT -gt 0 ]; then
    echo ""
    echo "Failed clients:"
    for client in "${FAILED_CLIENTS[@]}"; do
        echo "  - $client"
    done
    exit 1
fi

echo ""
echo "🎉 All migrations completed successfully!"
