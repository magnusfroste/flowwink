-- Add scheduled_at column to pages table
ALTER TABLE public.pages 
ADD COLUMN scheduled_at timestamp with time zone DEFAULT NULL;

-- Add index for efficient querying of scheduled pages
CREATE INDEX idx_pages_scheduled_at ON public.pages (scheduled_at) 
WHERE scheduled_at IS NOT NULL AND status = 'reviewing';

-- Comment for clarity
COMMENT ON COLUMN public.pages.scheduled_at IS 'Timestamp for scheduled publishing. When set and status is reviewing, page will be auto-published at this time.';