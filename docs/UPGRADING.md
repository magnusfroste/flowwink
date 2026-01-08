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

### Quick Upgrade (Automated Script)

The easiest way to upgrade is using the included upgrade script:

```bash
# Make the script executable (first time only)
chmod +x scripts/upgrade.sh

# Run the upgrade
./scripts/upgrade.sh
```

The script will:
1. ✓ Remind you to backup
2. ✓ Stash any local changes
3. ✓ Pull latest code from GitHub
4. ✓ Install new dependencies
5. ✓ Run database migrations
6. ✓ Deploy edge functions

### Manual Upgrade

If you prefer manual control:

```bash
# 1. Navigate to your project directory
cd your-flowwink-directory

# 2. Fetch latest changes
git fetch origin

# 3. Check what will change
git log HEAD..origin/main --oneline

# 4. Pull the changes
git pull origin main

# 5. Install any new dependencies
npm install

# 6. Run database migrations
supabase db push

# 7. Deploy edge functions (if any changed)
supabase functions deploy --all

# 8. Restart your application
npm run build
```

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
