# =============================================================================
# FlowWink frontend — self-hosted deployment (Easypanel, Docker, any VPS)
# =============================================================================
# Multi-stage: Node builds the Vite SPA, nginx serves the static output using
# the nginx.conf checked into the repo root (SPA routing, caching, /health).
#
# Supabase target resolution (see docs/operators/self-hosted-frontend.md):
#   1. RUNTIME: container env VITE_SUPABASE_URL / _PUBLISHABLE_KEY /
#      _PROJECT_ID — the entrypoint regenerates /runtime-config.js on every
#      start, so one image serves any instance (switch = restart).
#   2. FALLBACK: the same vars as build args, baked into the bundle:
#
#   docker build \
#     --build-arg VITE_SUPABASE_URL=https://<ref>.supabase.co \
#     --build-arg VITE_SUPABASE_PUBLISHABLE_KEY=<anon-key> \
#     --build-arg VITE_SUPABASE_PROJECT_ID=<ref> \
#     -t flowwink .
# =============================================================================

FROM node:22-alpine AS build
WORKDIR /app

COPY package.json package-lock.json ./
RUN npm ci

COPY . .

ARG VITE_SUPABASE_URL
ARG VITE_SUPABASE_PUBLISHABLE_KEY
ARG VITE_SUPABASE_PROJECT_ID
ENV VITE_SUPABASE_URL=$VITE_SUPABASE_URL \
    VITE_SUPABASE_PUBLISHABLE_KEY=$VITE_SUPABASE_PUBLISHABLE_KEY \
    VITE_SUPABASE_PROJECT_ID=$VITE_SUPABASE_PROJECT_ID \
    # Large SPA — give Vite headroom on small VPS builders
    NODE_OPTIONS=--max-old-space-size=4096

# prebuild (run-migrations.js) self-skips without the Supabase CLI; DB
# migrations are applied separately (supabase db push), never from the image.
# The update notice tells an image's admin to pull a newer tag, not to sync a fork.
ENV FLOWWINK_DEPLOY_KIND=docker
RUN npm run build

FROM nginx:1.27-alpine
COPY nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/dist /usr/share/nginx/html
# Regenerate /runtime-config.js from container env on every start — lets one
# image point at any Supabase instance (restart to switch, no rebuild).
COPY docker/40-runtime-env.sh /docker-entrypoint.d/40-runtime-env.sh
RUN chmod +x /docker-entrypoint.d/40-runtime-env.sh

EXPOSE 80
HEALTHCHECK --interval=30s --timeout=3s --retries=3 \
  CMD wget -qO- http://127.0.0.1/health || exit 1
