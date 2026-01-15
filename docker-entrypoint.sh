#!/bin/sh
# =============================================================================
# Runtime Environment Variable Injection for Vite SPA
# =============================================================================
# This script replaces placeholder values in the built JS files with actual
# environment variables at container startup time.
# =============================================================================

set -e

# Define placeholders and their corresponding env vars
# These placeholders are injected during build and replaced at runtime
PLACEHOLDER_URL="__VITE_SUPABASE_URL_PLACEHOLDER__"
PLACEHOLDER_KEY="__VITE_SUPABASE_PUBLISHABLE_KEY_PLACEHOLDER__"

# Get the JS file(s) in assets folder
JS_FILES=$(find /usr/share/nginx/html/assets -name "*.js" 2>/dev/null || true)

if [ -n "$JS_FILES" ]; then
  for file in $JS_FILES; do
    # Replace URL placeholder if env var is set
    if [ -n "$VITE_SUPABASE_URL" ]; then
      sed -i "s|${PLACEHOLDER_URL}|${VITE_SUPABASE_URL}|g" "$file"
    fi
    
    # Replace key placeholder if env var is set
    if [ -n "$VITE_SUPABASE_PUBLISHABLE_KEY" ]; then
      sed -i "s|${PLACEHOLDER_KEY}|${VITE_SUPABASE_PUBLISHABLE_KEY}|g" "$file"
    fi
  done
  
  echo "[entrypoint] Environment variables injected successfully"
else
  echo "[entrypoint] No JS files found to inject"
fi

# Start nginx
exec nginx -g "daemon off;"
