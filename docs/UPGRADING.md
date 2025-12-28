# Upgrading Pezcms

This guide explains how to safely upgrade your self-hosted Pezcms installation.

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

### Standard Upgrade (Recommended)

```bash
# 1. Navigate to your project directory
cd your-pezcms-directory

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

### If You Have Local Modifications

```bash
# 1. Stash your changes
git stash

# 2. Pull updates
git pull origin main

# 3. Re-apply your changes
git stash pop

# 4. Resolve any conflicts manually
# Then continue with steps 5-8 above
```

---

## Database Migrations

### How Migrations Work

Pezcms uses Supabase migrations. Each migration is designed to be:
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
