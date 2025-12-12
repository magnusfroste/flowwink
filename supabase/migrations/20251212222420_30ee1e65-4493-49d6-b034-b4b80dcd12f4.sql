-- Add menu_order column to pages table
ALTER TABLE public.pages 
ADD COLUMN menu_order integer NOT NULL DEFAULT 0;

-- Set initial order based on existing pages (hem first)
UPDATE public.pages 
SET menu_order = CASE 
  WHEN slug = 'hem' THEN 0 
  ELSE 100 
END;