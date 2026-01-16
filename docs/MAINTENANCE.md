# Maintenance Guide for Self-Hosted FlowWink

This guide covers essential maintenance tasks for self-hosted FlowWink installations. Regular maintenance ensures security, performance, and reliability of your CMS.

## Table of Contents

- [Daily Maintenance](#daily-maintenance)
- [Weekly Maintenance](#weekly-maintenance)
- [Monthly Maintenance](#monthly-maintenance)
- [Backup Strategy](#backup-strategy)
- [Monitoring & Alerts](#monitoring--alerts)
- [Performance Optimization](#performance-optimization)
- [Security Updates](#security-updates)
- [Troubleshooting Common Issues](#troubleshooting-common-issues)

---

## Daily Maintenance

### Health Checks
- [ ] Verify website is accessible and loading properly
- [ ] Check that admin panel login works
- [ ] Test basic functionality (create page, upload image, send newsletter)
- [ ] Monitor server resources (CPU, memory, disk space)

### Log Review
- [ ] Check application logs for errors
- [ ] Review Supabase edge function logs
- [ ] Monitor database performance metrics
- [ ] Check for unusual traffic patterns

---

## Weekly Maintenance

### Content Management
- [ ] Review unpublished drafts and scheduled content
- [ ] Check for broken links or images
- [ ] Verify newsletter delivery and open rates
- [ ] Review user activity and role assignments

### System Health
- [ ] Update package dependencies
- [ ] Clear temporary files and cache
- [ ] Verify backup integrity
- [ ] Check disk space usage trends

---

## Monthly Maintenance

### Security Review
- [ ] Audit user permissions and roles
- [ ] Review and rotate API keys
- [ ] Check for security vulnerabilities
- [ ] Update security policies if needed

### Performance Review
- [ ] Analyze website speed and performance metrics
- [ ] Review database query performance
- [ ] Check edge function execution times
- [ ] Optimize images and media files

---

## Backup Strategy

### Automated Backups
FlowWink supports multiple backup methods depending on your hosting setup.

#### Database Backups
```bash
# Daily database backup
supabase db dump -f backup-$(date +%Y%m%d).sql

# Or using pg_dump directly
pg_dump $DATABASE_URL > backup-$(date +%Y%m%d).sql
```

#### File Storage Backups
```bash
# Download all media files from Supabase Storage
# Via Supabase Dashboard: Storage → cms-images → Download

# Or via API (requires service role key)
curl -H "Authorization: Bearer $SERVICE_ROLE_KEY" \
  https://your-project.supabase.co/storage/v1/object/list/cms-images \
  -o storage-backup.json
```

#### Application Backups
```bash
# Backup Docker images
docker save flowwink:latest | gzip > flowwink-backup-$(date +%Y%m%d).tar.gz

# Backup configuration files
tar -czf config-backup-$(date +%Y%m%d).tar.gz .env nginx.conf docker-compose.yml
```

### Backup Retention Policy
- **Daily backups**: Keep 7 days
- **Weekly backups**: Keep 4 weeks
- **Monthly backups**: Keep 12 months
- **Yearly backups**: Keep indefinitely

### Backup Testing
Regularly test your backups:
```bash
# Test database restore
createdb test_restore
psql test_restore < backup.sql
# Verify data integrity
dropdb test_restore
```

---

## Monitoring & Alerts

### Application Monitoring
Set up monitoring for key metrics:

#### Response Time Monitoring
- Page load times should be < 3 seconds
- API response times should be < 1 second
- Edge function execution should be < 5 seconds

#### Error Rate Monitoring
- Track 4xx and 5xx error rates
- Alert if error rate exceeds 5%
- Monitor edge function failures

### System Monitoring
Monitor infrastructure health:

#### Server Resources
```bash
# Check disk usage
df -h

# Monitor memory usage
free -h

# Check CPU load
uptime
top -bn1 | head -20
```

#### Database Monitoring
```sql
-- Check database size
SELECT pg_size_pretty(pg_database_size(current_database()));

-- Monitor active connections
SELECT count(*) FROM pg_stat_activity;

-- Check for slow queries
SELECT pid, now() - pg_stat_activity.query_start AS duration, query
FROM pg_stat_activity
WHERE state = 'active'
ORDER BY duration DESC
LIMIT 10;
```

### Alert Configuration
Set up alerts for:
- High CPU/memory usage (>80%)
- Low disk space (<10% remaining)
- Database connection issues
- Failed backups
- Security events (failed login attempts)

---

## Performance Optimization

### Database Optimization
```sql
-- Analyze table statistics
ANALYZE VERBOSE;

-- Check for unused indexes
SELECT schemaname, tablename, indexname
FROM pg_indexes
WHERE schemaname = 'public'
ORDER BY tablename, indexname;

-- Vacuum tables to reclaim space
VACUUM (VERBOSE, ANALYZE);
```

### Cache Management
- Clear application cache when needed
- Optimize edge function caching settings
- Monitor cache hit rates
- Adjust TTL values based on content update frequency

### Image Optimization
FlowWink automatically optimizes images, but you can manually optimize:
```bash
# Check image sizes
find /path/to/images -type f -exec ls -lh {} \; | sort -k5 -hr | head -10

# Manual optimization (if needed)
npm install -g sharp-cli
sharp input.jpg -o output.webp --quality 80
```

### CDN Optimization
If using Cloudflare:
- Monitor cache hit rates
- Purge cache when needed
- Optimize image delivery
- Set up proper cache rules

---

## Security Updates

### Regular Updates
- Keep FlowWink updated with latest patches
- Update Supabase CLI regularly
- Monitor Supabase security advisories
- Update hosting platform security patches

### Security Scanning
```bash
# Check for vulnerabilities (if using Snyk or similar)
snyk test

# Scan for exposed secrets
git ls-files | xargs grep -l "password\|secret\|key" | xargs grep -v "^#" | head -10
```

### Access Control
- Regularly audit user access
- Remove inactive users
- Rotate API keys quarterly
- Review and update firewall rules

---

## Troubleshooting Common Issues

### Performance Issues
**Slow page loads:**
- Check edge function caching settings
- Verify database indexes are in place
- Monitor server resources
- Clear application cache

**High memory usage:**
- Check for memory leaks in edge functions
- Monitor database connection pooling
- Restart services if needed
- Scale up server resources

### Database Issues
**Connection timeouts:**
- Check database connection limits
- Monitor active connections
- Restart database if needed
- Verify connection string

**Slow queries:**
- Analyze query execution plans
- Add missing indexes
- Optimize database configuration
- Archive old data

### Edge Function Issues
**Function timeouts:**
- Check function logs for errors
- Optimize function code
- Increase timeout limits if needed
- Monitor function execution times

**Authentication errors:**
- Verify JWT secrets are correct
- Check function permissions
- Review authentication flow
- Test with different user roles

---

## Emergency Procedures

### Data Loss Recovery
1. Stop all write operations immediately
2. Restore from latest backup
3. Verify data integrity
4. Resume operations
5. Investigate root cause

### Security Breach Response
1. Isolate affected systems
2. Change all passwords and keys
3. Review access logs
4. Notify affected users if needed
5. Implement additional security measures

### Service Outage
1. Check system status and logs
2. Restart affected services
3. Verify connectivity
4. Communicate with users
5. Document incident and resolution

---

## Maintenance Checklist

Use this checklist for regular maintenance:

### Daily
- [ ] Website accessibility check
- [ ] Log review
- [ ] Resource monitoring
- [ ] Backup verification

### Weekly
- [ ] Content review
- [ ] System health check
- [ ] Dependency updates
- [ ] Performance monitoring

### Monthly
- [ ] Security audit
- [ ] Performance review
- [ ] Backup testing
- [ ] Documentation updates

### Quarterly
- [ ] Full security assessment
- [ ] Infrastructure review
- [ ] Disaster recovery testing
- [ ] Compliance verification

---

Regular maintenance is crucial for the security and performance of your self-hosted FlowWink installation. Schedule these tasks and monitor your system health continuously.
