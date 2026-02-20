# FlowWink Docker Quick Start

> **Audience:** Users/Admins
> **Last Updated:** February 2026

Deploy FlowWink with Docker in minutes. This guide covers the fastest path to production.

## Prerequisites

- Docker and Docker Compose installed
- A Supabase project (cloud or self-hosted)
- Domain name (optional, but recommended)

## Quick Deploy

### 1. Pull the Image

```bash
docker pull ghcr.io/magnusfroste/flowwink:latest
```

### 2. Create docker-compose.yml

```yaml
version: '3.8'

services:
  flowwink:
    image: ghcr.io/magnusfroste/flowwink:latest
    ports:
      - "80:80"
    build:
      args:
        - VITE_SUPABASE_URL=https://your-project.supabase.co
        - VITE_SUPABASE_PUBLISHABLE_KEY=your-anon-key
        - VITE_SUPABASE_PROJECT_ID=your-project-id
    restart: unless-stopped
```

### 3. Start FlowWink

```bash
docker-compose up -d
```

That's it! FlowWink is now running at `http://localhost`

## Upgrading

FlowWink follows semantic versioning. Upgrade to the latest version:

```bash
# Pull latest image
docker-compose pull

# Restart with new image
docker-compose up -d
```

Your content stays safe in Supabase - only the application code updates.

## Environment Variables

| Variable | Required | Description |
|----------|----------|-------------|
| `VITE_SUPABASE_URL` | Yes | Your Supabase project URL |
| `VITE_SUPABASE_PUBLISHABLE_KEY` | Yes | Your Supabase anon/public key |
| `VITE_SUPABASE_PROJECT_ID` | Yes | Your Supabase project ID |

## Platform-Specific Guides

- **[Easypanel](DEPLOYMENT.md#easypanel)** - One-click deployment with UI
- **[Railway](DEPLOYMENT.md#railway)** - Git-based deployment
- **[Fly.io](DEPLOYMENT.md#flyio)** - Global edge deployment
- **[VPS](DEPLOYMENT.md#vps)** - Any server with Docker

## Production Checklist

- [ ] Use a custom domain with HTTPS
- [ ] Set up Supabase backups
- [ ] Configure AI provider (OpenAI, Gemini, etc.)
- [ ] Enable monitoring (optional)
- [ ] Set up CDN (optional, for global performance)

## Versioning

FlowWink uses semantic versioning:

- `v1.0.0` - Major version (breaking changes)
- `v1.1.0` - Minor version (new features, backwards compatible)
- `v1.0.1` - Patch version (bug fixes)

**Tags available:**
- `latest` - Latest stable release
- `v1.0.0` - Specific version
- `v1.0` - Latest patch of minor version
- `v1` - Latest minor of major version

## Support

- **Documentation**: [docs/](.)
- **Issues**: [GitHub Issues](https://github.com/magnusfroste/flowwink/issues)
- **Discussions**: [GitHub Discussions](https://github.com/magnusfroste/flowwink/discussions)

---

**Made in Sweden 🇸🇪**
