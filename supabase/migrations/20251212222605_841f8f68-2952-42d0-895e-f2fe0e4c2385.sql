-- Add show_in_menu column to pages table
ALTER TABLE public.pages 
ADD COLUMN show_in_menu boolean NOT NULL DEFAULT true;