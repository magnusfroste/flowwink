CREATE OR REPLACE FUNCTION public.handle_new_user()
RETURNS trigger
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $function$
DECLARE
  signup_type text;
BEGIN
  signup_type := COALESCE(NEW.raw_user_meta_data ->> 'signup_type', 'admin');

  INSERT INTO public.profiles (id, email, full_name)
  VALUES (
    NEW.id,
    NEW.email,
    COALESCE(NEW.raw_user_meta_data ->> 'full_name', NEW.email)
  )
  ON CONFLICT (id) DO NOTHING;

  IF signup_type = 'customer' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'customer')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSIF signup_type = 'admin' THEN
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'admin')
    ON CONFLICT (user_id, role) DO NOTHING;
  ELSE
    INSERT INTO public.user_roles (user_id, role)
    VALUES (NEW.id, 'writer')
    ON CONFLICT (user_id, role) DO NOTHING;
  END IF;

  RETURN NEW;
END;
$function$;

-- Cleanup: remove redundant 'writer' role from accounts that already have 'admin'
DELETE FROM public.user_roles w
WHERE w.role = 'writer'
  AND EXISTS (
    SELECT 1 FROM public.user_roles a
    WHERE a.user_id = w.user_id AND a.role = 'admin'
  );