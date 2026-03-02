# Upgrading FlowWink

This guide explains how to safely upgrade your self-hosted FlowWink installation.

## Before You Upgrade

### 1. Read the Changelog

Always check [CHANGELOG.md](../CHANGELOG.md) before upgrading to understand:
- New features added
- Breaking changes that require action
- Deprecated features

### 2. Backup Your Data

**This is critical.** Always backup before upgrading:

```bash
# Export your Supabase database
supabase db dump -f backup-$(date +%Y%m%d).sql

# Or use pg_dump directly
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

Also backup:
- Your `.env` file
- Any custom modifications you've made
- Uploaded media files (if stored locally)

### 3. Check Breaking Changes

Look for the ⚠️ **BREAKING** label in the changelog. These require manual action.

---

## Upgrade Process

There are **three different workflows** depending on what you're upgrading:

### Option 1: Full Code Update (upgrade.sh)

**Use when:** You want to update your local FlowWink codebase from GitHub

```bash
./scripts/upgrade.sh
```

**What it does:**
1. ✓ Pulls latest code from GitHub (`git pull`)
2. ✓ Installs new dependencies (`npm install`)
3. ✓ Runs database migrations (`supabase db push`)
4. ✓ Deploys edge functions
5. ✓ Rebuilds the application

**Perfect for:** Keeping your development environment up to date

---

### Option 2: Client Database Update (Manual)

**Use when:** You only need to update a client's Supabase instance (no code changes)

```bash
# 1. Link to the client's project
supabase link
# → Select the client's project from the list

# 2. Run migrations
supabase db push

# 3. Deploy edge functions (if needed)
./scripts/deploy-functions.sh
```

**What it does:**
- ✓ Updates the client's database schema
- ✓ Deploys latest edge functions
- ✗ Does NOT update your local code

**Perfect for:** Updating client Supabase instances without touching your local codebase

---

### Option 3: Multi-Client Update (migrate-all-clients.sh)

**Use when:** You manage multiple clients and want to update all their databases at once

```bash
# 1. Edit scripts/migrate-all-clients.sh with your client project refs
CLIENTS=(
  "Client1:abcdefghijklmnop"
  "Client2:qrstuvwxyzabcdef"
  ...
)

# 2. Run migrations for all clients
./scripts/migrate-all-clients.sh
```

**What it does:**
- ✓ Runs migrations on all clients in the list
- ✗ Does NOT deploy edge functions (must be done separately per client)
- ✗ Does NOT update your local code

**Perfect for:** Agencies managing 5+ client installations

**Note:** Edge functions must still be deployed manually per client:
```bash
supabase link --project-ref <client-ref>
./scripts/deploy-functions.sh
```

---

### Quick Reference

| Scenario | Command | Updates Code | Updates DB | Updates Functions |
|----------|---------|--------------|------------|-------------------|
| **Update my dev environment** | `./scripts/upgrade.sh` | ✓ | ✓ | ✓ |
| **Update one client** | `supabase link` + `supabase db push` + `./scripts/deploy-functions.sh` | ✗ | ✓ | ✓ |
| **Update many clients** | `./scripts/migrate-all-clients.sh` | ✗ | ✓ | ✗ |

---

## Common Upgrade Scenarios

### Scenario 1: Regular Update (No Local Changes)

You're running a clean installation and want the latest features.

```bash
./scripts/upgrade.sh
```

That's it! The script handles everything.

### Scenario 2: Update with Local Modifications

You've customized some components or styles.

```bash
# Option A: Let the script stash your changes
./scripts/upgrade.sh
# When prompted, choose 'y' to stash changes
# After upgrade completes:
git stash pop
# Resolve any conflicts if needed

# Option B: Manual approach
git stash
git pull origin main
npm install
supabase db push
git stash pop
# Fix conflicts, then rebuild
npm run build
```

### Scenario 3: Skip Database Migrations

You're not using Supabase CLI or want to run migrations separately.

```bash
# Pull code only
git pull origin main
npm install

# Run migrations later through Supabase Dashboard
# Go to SQL Editor and run contents of new migration files
```

### Scenario 4: Upgrade After Long Time (Multiple Versions)

You haven't updated in a while and are several versions behind.

```bash
# 1. Check the changelog for ALL versions you're skipping
cat CHANGELOG.md

# 2. Look for any BREAKING changes and note required actions

# 3. Create a full backup
supabase db dump -f backup-full-$(date +%Y%m%d).sql
cp .env .env.backup

# 4. Run the upgrade
./scripts/upgrade.sh

# 5. Apply any breaking change migrations manually if needed

# 6. Test thoroughly before going to production
npm run dev
```

### Scenario 5: Rollback After Failed Upgrade

Something went wrong and you need to go back.

```bash
# 1. Find the last working commit
git log --oneline

# 2. Reset to that commit
git reset --hard abc1234  # Replace with your commit hash

# 3. Restore dependencies
npm install

# 4. Restore database if needed
psql $DATABASE_URL < backup-YYYYMMDD.sql

# 5. Rebuild
npm run build
```

### Scenario 6: Preview Changes Before Upgrading

You want to test the new version before committing.

```bash
# 1. Create a new branch
git fetch origin
git checkout -b test-upgrade origin/main

# 2. Install dependencies
npm install

# 3. Run locally (don't push migrations yet!)
npm run dev

# 4. If everything looks good, switch back and do the real upgrade
git checkout main
./scripts/upgrade.sh
```

### Scenario 7: Multi-Client Migrations (Agencies)

You're managing FlowWink for multiple clients (5+ Supabase instances).

**✨ One-Command Solution:**

```bash
# 1. Edit scripts/migrate-all-clients.sh with your client project refs
CLIENTS=(
  "Client1:abcdefghijklmnop"
  "Client2:qrstuvwxyzabcdef"
  "Client3:ghijklmnopqrstuv"
  "Client4:wxyzabcdefghijkl"
  "Client5:mnopqrstuvwxyzab"
)

# 2. Login to Supabase (once)
supabase login

# 3. Run migrations for all clients
./scripts/migrate-all-clients.sh
```

**Output:**
```
🚀 FlowWink Multi-Client Migration Tool
========================================

This will run migrations on 5 client projects:
  - Client1 (abcdefghijklmnop)
  - Client2 (qrstuvwxyzabcdef)
  ...

Continue? (y/N) y

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📦 Migrating: Client1
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Migrations completed for Client1

... (repeat for all clients)

━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
📊 Migration Summary
━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━━
✅ Successful: 5
❌ Failed: 0

🎉 All migrations completed successfully!
```

**Important:** You only need to run migrations, **not** `npm install` or `npm run build`. Frontend deployments (Vercel/Netlify) are separate from database migrations.

---

## Database Migrations

### How Migrations Work

FlowWink uses Supabase migrations. Each migration is designed to be:
- **Idempotent**: Safe to run multiple times
- **Non-destructive**: Never deletes user data without explicit action
- **Backward compatible**: Old data continues to work

### Running Migrations

```bash
# Push all pending migrations
supabase db push

# Or run specific migration
supabase migration up
```

### Migration Troubleshooting

If a migration fails:

1. **Check the error message** - Usually indicates what went wrong
2. **Check if partially applied** - Some changes may have succeeded
3. **Rollback if needed** - See Rollback section below

---

## Rollback

### Rolling Back Code

```bash
# Find the commit before the upgrade
git log --oneline

# Reset to that commit
git reset --hard <commit-hash>

# Reinstall dependencies
npm install
```

### Rolling Back Database

```bash
# Restore from your backup
psql $DATABASE_URL < backup-YYYYMMDD.sql
```

**Warning**: This will overwrite current data. Only use if necessary.

---

## Version-Specific Upgrade Notes

### Upgrading to 1.0.0-beta.2 (Future)

*No breaking changes expected*

### Upgrading to 1.0.0 (Future)

*Breaking changes will be documented here*

---

## Preserving Your Customizations

### What Gets Preserved (Always)

- All your content (pages, posts, articles)
- User accounts and settings
- Site settings and branding
- Media library uploads
- Form submissions
- CRM data (leads, deals, companies)

### What May Change

- Default configurations (you can override)
- UI components (if you haven't modified them)
- Edge function logic

### Recommended: Separation of Concerns

To make upgrades easier:

1. **Don't modify core components directly** - Create wrapper components instead
2. **Use the site_settings table** - For configuration that should persist
3. **Keep custom code in separate files** - Makes merging easier

---

## Getting Help

### Common Issues

**Q: Migration failed with "column already exists"**
A: This is usually safe to ignore. The migration is idempotent.

**Q: Edge function won't deploy**
A: Check if you have the required secrets configured:
```bash
supabase secrets list
```

**Q: UI looks broken after upgrade**
A: Clear your browser cache and rebuild:
```bash
npm run build
```

### Support Channels

- GitHub Issues: Report bugs or ask questions
- Discussions: Community help and feature requests

---

## Checklist

Use this checklist for each upgrade:

- [ ] Read the changelog
- [ ] Backup database
- [ ] Backup .env file
- [ ] Check for breaking changes
- [ ] Pull latest code
- [ ] Install dependencies
- [ ] Run migrations
- [ ] Deploy edge functions
- [ ] Test critical functionality
- [ ] Clear browser cache
