# =============================================================================
# FlowWink Dockerfile - Multi-stage build for production
# =============================================================================
# This Dockerfile creates an optimized production image:
# - Stage 1: Build the Vite React app
# - Stage 2: Serve static files with Nginx
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

# Build arguments for Vite environment variables
ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID

# Set as environment variables for the build process
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY
ENV VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID

# Validate that all required credentials are set
RUN if [ -z "$VITE_SUPABASE_URL" ] || [ -z "$VITE_SUPABASE_PUBLISHABLE_KEY" ] || [ -z "$VITE_SUPABASE_PROJECT_ID" ]; then \
      echo "ERROR: Missing required Supabase credentials"; \
      echo "Please set these build arguments:"; \
      echo "  VITE_SUPABASE_URL"; \
      echo "  VITE_SUPABASE_PUBLISHABLE_KEY"; \
      echo "  VITE_SUPABASE_PROJECT_ID"; \
      echo ""; \
      echo "Get these from your Supabase project: Settings → API"; \
      exit 1; \
    fi

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm ci for reproducible builds)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application (VITE_ env vars are now available)
# This creates the /app/dist folder with optimized static assets
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Install curl for health checks and enable nginx logging to stdout/stderr
RUN apk add --no-cache curl \
    && ln -sf /dev/stdout /var/log/nginx/access.log \
    && ln -sf /dev/stderr /var/log/nginx/error.log

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 (Easypanel/Traefik will handle HTTPS)
EXPOSE 80

# Health check for container orchestration
# Using curl instead of wget, shorter interval for faster startup detection
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
