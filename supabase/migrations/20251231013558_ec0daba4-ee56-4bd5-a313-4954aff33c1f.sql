-- Add order webhook events to the enum
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'order.created';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'order.paid';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'order.cancelled';
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'order.refunded';