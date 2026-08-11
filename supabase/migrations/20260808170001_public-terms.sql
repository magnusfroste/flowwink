-- Terms become a public web surface — the way operators publish them.
--
-- The template split (Avtal → Tjänstevillkor → Allmänna villkor) only pays
-- off if the referenced versions are PUBLISHED: the short agreement points at
-- "Allmänna villkor version 2026-08" and the customer must be able to read
-- exactly that, on the web, like a privacy policy. Publication is an explicit
-- flag, never an inference from naming — a template becomes public the day an
-- operator decides it is.

ALTER TABLE public.contract_templates
  ADD COLUMN IF NOT EXISTS is_public boolean NOT NULL DEFAULT false;

CREATE OR REPLACE FUNCTION public.get_public_terms()
RETURNS TABLE (
  id uuid,
  name text,
  description text,
  contract_type public.contract_type,
  language text,
  body_markdown text,
  updated_at timestamptz
)
LANGUAGE sql
STABLE
SECURITY DEFINER
SET search_path = public
AS $$
  SELECT t.id, t.name, t.description, t.contract_type, t.language,
         t.body_markdown, t.updated_at
  FROM public.contract_templates t
  WHERE t.is_public AND t.is_active
  ORDER BY
    -- Allmänna villkor first, then service terms alphabetically.
    (t.name NOT ILIKE 'Allmänna%'), t.name;
$$;

-- Deliberately anon-callable: published terms ARE the public surface.
GRANT EXECUTE ON FUNCTION public.get_public_terms() TO anon, authenticated, service_role;
