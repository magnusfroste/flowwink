-- Add enriched_at column to companies table
ALTER TABLE public.companies 
ADD COLUMN enriched_at timestamp with time zone DEFAULT NULL;