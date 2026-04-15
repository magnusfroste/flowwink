ALTER TABLE public.api_keys ADD COLUMN IF NOT EXISTS key_raw text;
ALTER TABLE public.a2a_peers DROP CONSTRAINT IF EXISTS a2a_peers_url_check;