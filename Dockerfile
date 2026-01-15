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

# Set as environment variables for the build process
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL
ENV VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY

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

# Copy entrypoint script for runtime env var injection
COPY docker-entrypoint.sh /docker-entrypoint.sh
RUN chmod +x /docker-entrypoint.sh

# Expose port 80 (Easypanel/Traefik will handle HTTPS)
EXPOSE 80

# Health check for container orchestration
# Using curl instead of wget, shorter interval for faster startup detection
HEALTHCHECK --interval=10s --timeout=5s --start-period=10s --retries=3 \
  CMD curl -f http://localhost/health || exit 1

# Use entrypoint to inject env vars at runtime, then start nginx
ENTRYPOINT ["/docker-entrypoint.sh"]
