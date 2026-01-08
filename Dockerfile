# =============================================================================
# Pezcms Dockerfile - Multi-stage build for production
# =============================================================================
# This Dockerfile creates an optimized production image:
# - Stage 1: Build the Vite React app
# - Stage 2: Serve static files with Nginx
# =============================================================================

# -----------------------------------------------------------------------------
# Stage 1: Build
# -----------------------------------------------------------------------------
FROM node:20-alpine AS builder

WORKDIR /app

# Copy package files
COPY package*.json ./

# Install dependencies (use npm ci for reproducible builds)
RUN npm ci --legacy-peer-deps

# Copy source code
COPY . .

# Build the application
# This creates the /app/dist folder with optimized static assets
RUN npm run build

# -----------------------------------------------------------------------------
# Stage 2: Production
# -----------------------------------------------------------------------------
FROM nginx:alpine

# Copy built assets from builder stage
COPY --from=builder /app/dist /usr/share/nginx/html

# Copy custom nginx configuration
COPY nginx.conf /etc/nginx/conf.d/default.conf

# Expose port 80 (Easypanel/Traefik will handle HTTPS)
EXPOSE 80

# Health check for container orchestration
HEALTHCHECK --interval=30s --timeout=3s --start-period=5s --retries=3 \
  CMD wget --no-verbose --tries=1 --spider http://localhost/ || exit 1

# Start nginx in foreground
CMD ["nginx", "-g", "daemon off;"]
