-- Add soft delete support to pages table
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS deleted_at TIMESTAMP WITH TIME ZONE DEFAULT NULL;

-- Add deleted_by to track who deleted
ALTER TABLE public.pages ADD COLUMN IF NOT EXISTS deleted_by UUID REFERENCES auth.users(id) ON DELETE SET NULL DEFAULT NULL;

-- Index for efficient filtering of non-deleted pages
CREATE INDEX IF NOT EXISTS idx_pages_deleted_at ON public.pages (deleted_at) WHERE deleted_at IS NULL;

-- Update the unique constraint on slug to only apply to non-deleted pages
-- First drop the existing unique constraint
ALTER TABLE public.pages DROP CONSTRAINT IF EXISTS pages_slug_key;

-- Create a partial unique index (slug must be unique only among non-deleted pages)
CREATE UNIQUE INDEX IF NOT EXISTS pages_slug_unique_active ON public.pages (slug) WHERE deleted_at IS NULL;
