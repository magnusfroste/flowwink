
-- Add 'customer' to app_role enum
ALTER TYPE public.app_role ADD VALUE IF NOT EXISTS 'customer';

-- Add user_id to orders table (optional, for logged-in customers)
ALTER TABLE public.orders ADD COLUMN IF NOT EXISTS user_id uuid REFERENCES auth.users(id) ON DELETE SET NULL;

-- Create customer_addresses table
CREATE TABLE public.customer_addresses (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  label text NOT NULL DEFAULT 'Home',
  full_name text NOT NULL,
  address_line1 text NOT NULL,
  address_line2 text,
  city text NOT NULL,
  state text,
  postal_code text NOT NULL,
  country text NOT NULL DEFAULT 'SE',
  phone text,
  is_default boolean NOT NULL DEFAULT false,
  created_at timestamptz NOT NULL DEFAULT now(),
  updated_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.customer_addresses ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Customers can view own addresses" ON public.customer_addresses
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Customers can insert own addresses" ON public.customer_addresses
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Customers can update own addresses" ON public.customer_addresses
  FOR UPDATE TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Customers can delete own addresses" ON public.customer_addresses
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- Create wishlist table
CREATE TABLE public.wishlist_items (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  user_id uuid NOT NULL REFERENCES auth.users(id) ON DELETE CASCADE,
  product_id uuid NOT NULL REFERENCES public.products(id) ON DELETE CASCADE,
  created_at timestamptz NOT NULL DEFAULT now(),
  UNIQUE(user_id, product_id)
);

ALTER TABLE public.wishlist_items ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Users can view own wishlist" ON public.wishlist_items
  FOR SELECT TO authenticated USING (user_id = auth.uid());

CREATE POLICY "Users can add to own wishlist" ON public.wishlist_items
  FOR INSERT TO authenticated WITH CHECK (user_id = auth.uid());

CREATE POLICY "Users can remove from own wishlist" ON public.wishlist_items
  FOR DELETE TO authenticated USING (user_id = auth.uid());

-- RLS: customers can view their own orders
CREATE POLICY "Customers can view own orders" ON public.orders
  FOR SELECT TO authenticated USING (user_id = auth.uid());

-- RLS: customers can view their own order items  
CREATE POLICY "Customers can view own order items" ON public.order_items
  FOR SELECT TO authenticated USING (
    EXISTS (
      SELECT 1 FROM public.orders 
      WHERE orders.id = order_items.order_id 
      AND orders.user_id = auth.uid()
    )
  );

-- Update handle_new_user to support customer signup
CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $function$
DECLARE
  signup_type text;
BEGIN
  -- Check metadata for signup type
  signup_type := COALESCE(NEW.raw_user_meta_data ->> 'signup_type', 'admin');

  -- Create profile
  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  );
  
  -- Assign role based on signup type
  IF signup_type = 'customer' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer');
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'writer');
  END IF;
  
  RETURN NEW;
END;
$function$;

-- Trigger for updated_at on customer_addresses
CREATE TRIGGER update_customer_addresses_updated_at
  BEFORE UPDATE ON public.customer_addresses
  FOR EACH ROW EXECUTE FUNCTION update_updated_at();
