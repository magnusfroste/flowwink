-- 1. Extend contracts with markdown body + signing fields
ALTER TABLE public.contracts
  ADD COLUMN IF NOT EXISTS body_markdown TEXT,
  ADD COLUMN IF NOT EXISTS body_updated_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS accept_token TEXT,
  ADD COLUMN IF NOT EXISTS sent_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS viewed_at TIMESTAMPTZ,
  ADD COLUMN IF NOT EXISTS signer_name TEXT,
  ADD COLUMN IF NOT EXISTS signer_email TEXT,
  ADD COLUMN IF NOT EXISTS signer_ip TEXT,
  ADD COLUMN IF NOT EXISTS version INTEGER NOT NULL DEFAULT 1;

CREATE UNIQUE INDEX IF NOT EXISTS idx_contracts_accept_token_unique
  ON public.contracts (accept_token) WHERE accept_token IS NOT NULL;

-- Trigram index for markdown search via MCP
CREATE INDEX IF NOT EXISTS idx_contracts_body_markdown_trgm
  ON public.contracts USING gin (body_markdown gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contracts_title_trgm
  ON public.contracts USING gin (title gin_trgm_ops);

CREATE INDEX IF NOT EXISTS idx_contracts_counterparty_trgm
  ON public.contracts USING gin (counterparty_name gin_trgm_ops);

-- 2. contract_versions — snapshot history
CREATE TABLE IF NOT EXISTS public.contract_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  version_number INTEGER NOT NULL,
  snapshot JSONB NOT NULL,
  reason TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (contract_id, version_number)
);

CREATE INDEX IF NOT EXISTS idx_contract_versions_contract_id
  ON public.contract_versions (contract_id);

ALTER TABLE public.contract_versions ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view contract versions" ON public.contract_versions;
CREATE POLICY "Authenticated can view contract versions"
  ON public.contract_versions FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Authenticated can insert contract versions" ON public.contract_versions;
CREATE POLICY "Authenticated can insert contract versions"
  ON public.contract_versions FOR INSERT TO authenticated WITH CHECK (true);

-- 3. contract_signatures — view/accept/reject log
CREATE TABLE IF NOT EXISTS public.contract_signatures (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  action TEXT NOT NULL CHECK (action IN ('view', 'accept', 'reject')),
  signer_name TEXT,
  signer_email TEXT,
  signature_data TEXT,
  comment TEXT,
  ip_address TEXT,
  user_agent TEXT,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

CREATE INDEX IF NOT EXISTS idx_contract_signatures_contract_id
  ON public.contract_signatures (contract_id);

ALTER TABLE public.contract_signatures ENABLE ROW LEVEL SECURITY;

DROP POLICY IF EXISTS "Authenticated can view contract signatures" ON public.contract_signatures;
CREATE POLICY "Authenticated can view contract signatures"
  ON public.contract_signatures FOR SELECT TO authenticated USING (true);

DROP POLICY IF EXISTS "Public can insert via valid token" ON public.contract_signatures;
CREATE POLICY "Public can insert via valid token"
  ON public.contract_signatures FOR INSERT TO anon, authenticated
  WITH CHECK (
    EXISTS (
      SELECT 1 FROM public.contracts c
      WHERE c.id = contract_id AND c.accept_token IS NOT NULL
    )
  );

-- 4. Allow public read of contracts via accept_token (mirrors quotes)
DROP POLICY IF EXISTS "Public can view contract by token" ON public.contracts;
CREATE POLICY "Public can view contract by token"
  ON public.contracts FOR SELECT TO anon, authenticated
  USING (
    accept_token IS NOT NULL
    AND status = ANY (ARRAY['pending_signature'::contract_status, 'active'::contract_status])
  );

-- 5. Auto-touch body_updated_at when body_markdown changes
CREATE OR REPLACE FUNCTION public.touch_contract_body()
RETURNS TRIGGER
LANGUAGE plpgsql
SET search_path = public
AS $$
BEGIN
  IF NEW.body_markdown IS DISTINCT FROM OLD.body_markdown THEN
    NEW.body_updated_at = now();
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS contracts_touch_body ON public.contracts;
CREATE TRIGGER contracts_touch_body
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW
  EXECUTE FUNCTION public.touch_contract_body();