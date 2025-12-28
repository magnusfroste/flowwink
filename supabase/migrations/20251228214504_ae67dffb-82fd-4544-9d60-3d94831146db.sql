-- Add booking.submitted event to webhook_event enum
ALTER TYPE webhook_event ADD VALUE IF NOT EXISTS 'booking.submitted';