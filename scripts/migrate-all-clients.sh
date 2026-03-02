#!/bin/bash

# FlowWink Multi-Client Migration Script
# Run migrations across multiple client Supabase instances

# DO NOT use set -e - we want to continue even if one client fails
set -u  # Exit on undefined variables

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

# Check if migrations directory exists
if [ ! -d "supabase/migrations" ]; then
    echo "❌ No migrations directory found at: supabase/migrations"
    echo "   Make sure you're running this from the FlowWink project root."
    exit 1
fi

# Count migrations
MIGRATION_COUNT=$(find supabase/migrations -name "*.sql" 2>/dev/null | wc -l | tr -d ' ')
echo "✅ Supabase CLI ready"
echo "✅ Found $MIGRATION_COUNT migration(s) to apply"
echo ""

# Validate client entries
echo "Validating client project refs..."
INVALID_CLIENTS=()
for client in "${CLIENTS[@]}"; do
    IFS=':' read -r name ref <<< "$client"
    
    # Check format (project ref should be 20 chars)
    if [ ${#ref} -ne 20 ]; then
        echo "⚠️  Warning: $name has invalid project ref length (${#ref} chars, expected 20)"
        INVALID_CLIENTS+=("$name")
    fi
done

if [ ${#INVALID_CLIENTS[@]} -gt 0 ]; then
    echo ""
    echo "❌ Found ${#INVALID_CLIENTS[@]} client(s) with invalid project refs:"
    for client in "${INVALID_CLIENTS[@]}"; do
        echo "  - $client"
    done
    echo ""
    read -p "Continue anyway? (y/N) " -n 1 -r
    echo ""
    if [[ ! $REPLY =~ ^[Yy]$ ]]; then
        echo "Aborted."
        exit 0
    fi
fi

# Confirm before proceeding
echo ""
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
SKIP_COUNT=0

for client in "${CLIENTS[@]}"; do
    IFS=':' read -r name ref <<< "$client"
    
    echo ""
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    echo "📦 Migrating: $name ($ref)"
    echo "━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━"
    
    # Link to project (show errors)
    echo "🔗 Linking to project..."
    if supabase link --project-ref "$ref" 2>&1; then
        echo "✅ Linked to $name"
        
        # Run migrations (show full output)
        echo ""
        echo "🔄 Running migrations..."
        if supabase db push 2>&1; then
            echo ""
            echo "✅ Migrations completed for $name"
            ((SUCCESS_COUNT++))
        else
            echo ""
            echo "❌ Migration failed for $name"
            echo "   Check the error output above for details"
            ((FAIL_COUNT++))
            FAILED_CLIENTS+=("$name")
        fi
    else
        echo ""
        echo "❌ Could not link to $name"
        echo "   Possible reasons:"
        echo "   - Invalid project ref"
        echo "   - No access to this project"
        echo "   - Project doesn't exist"
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
