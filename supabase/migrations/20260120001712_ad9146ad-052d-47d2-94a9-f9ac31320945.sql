-- Add new webhook event types for products, bookings, deals, companies, media, and global blocks
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'product.created';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'product.updated';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'product.deleted';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'booking.confirmed';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'booking.cancelled';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'deal.created';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'deal.updated';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'deal.stage_changed';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'deal.won';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'deal.lost';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'company.created';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'company.updated';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'media.uploaded';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'media.deleted';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'global_block.updated';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'kb_article.published';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'kb_article.updated';