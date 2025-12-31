-- Allow public to view active products
CREATE POLICY "Public can view active products" 
ON public.products 
FOR SELECT 
USING (is_active = true);