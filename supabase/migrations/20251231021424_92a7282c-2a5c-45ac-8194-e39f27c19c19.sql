-- Add column to track when confirmation email was sent
ALTER TABLE public.orders 
ADD COLUMN confirmation_sent_at timestamp with time zone DEFAULT NULL;