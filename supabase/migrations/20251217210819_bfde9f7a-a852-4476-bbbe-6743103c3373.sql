-- Create global_blocks table for reusable elements (footer, header, etc.)
CREATE TABLE public.global_blocks (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  slot TEXT NOT NULL, -- 'footer', 'header', 'sidebar', etc.
  type TEXT NOT NULL, -- block type (e.g., 'footer')
  data JSONB NOT NULL DEFAULT '{}'::jsonb,
  is_active BOOLEAN NOT NULL DEFAULT true,
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  created_by UUID REFERENCES auth.users(id),
  updated_by UUID REFERENCES auth.users(id),
  UNIQUE(slot) -- Only one block per slot
);

-- Enable RLS
ALTER TABLE public.global_blocks ENABLE ROW LEVEL SECURITY;

-- Public can view active global blocks
CREATE POLICY "Public can view active global blocks"
ON public.global_blocks
FOR SELECT
USING (is_active = true);

-- Authenticated users can view all global blocks
CREATE POLICY "Authenticated can view all global blocks"
ON public.global_blocks
FOR SELECT
TO authenticated
USING (true);

-- Admins can insert global blocks
CREATE POLICY "Admins can insert global blocks"
ON public.global_blocks
FOR INSERT
TO authenticated
WITH CHECK (has_role(auth.uid(), 'admin'::app_role));

-- Admins can update global blocks
CREATE POLICY "Admins can update global blocks"
ON public.global_blocks
FOR UPDATE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Admins can delete global blocks
CREATE POLICY "Admins can delete global blocks"
ON public.global_blocks
FOR DELETE
TO authenticated
USING (has_role(auth.uid(), 'admin'::app_role));

-- Add trigger for updated_at
CREATE TRIGGER update_global_blocks_updated_at
BEFORE UPDATE ON public.global_blocks
FOR EACH ROW
EXECUTE FUNCTION public.update_updated_at();

-- Migrate existing footer settings to global_blocks
INSERT INTO public.global_blocks (slot, type, data, is_active)
SELECT 
  'footer',
  'footer',
  COALESCE(value, '{}'::jsonb),
  true
FROM public.site_settings
WHERE key = 'footer'
ON CONFLICT (slot) DO NOTHING;