
-- Document versions
CREATE TABLE IF NOT EXISTS public.document_versions (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  version_no INTEGER NOT NULL,
  file_url TEXT NOT NULL,
  file_name TEXT,
  file_size_bytes BIGINT,
  file_type TEXT,
  uploaded_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  UNIQUE (document_id, version_no)
);
CREATE INDEX IF NOT EXISTS idx_document_versions_doc ON public.document_versions(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_versions TO authenticated;
GRANT ALL ON public.document_versions TO service_role;
ALTER TABLE public.document_versions ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_versions authenticated all" ON public.document_versions;
CREATE POLICY "document_versions authenticated all" ON public.document_versions FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Document share links (tokenized)
CREATE TABLE IF NOT EXISTS public.document_share_links (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  expires_at TIMESTAMPTZ,
  permissions TEXT NOT NULL DEFAULT 'download' CHECK (permissions IN ('view','download')),
  revoked_at TIMESTAMPTZ,
  access_count INTEGER NOT NULL DEFAULT 0,
  last_accessed_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_share_links_doc ON public.document_share_links(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_share_links TO authenticated;
GRANT ALL ON public.document_share_links TO service_role;
ALTER TABLE public.document_share_links ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_share_links authenticated all" ON public.document_share_links;
CREATE POLICY "document_share_links authenticated all" ON public.document_share_links FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Signature requests (single-signer)
CREATE TABLE IF NOT EXISTS public.document_signature_requests (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  document_id UUID NOT NULL REFERENCES public.documents(id) ON DELETE CASCADE,
  signer_email TEXT NOT NULL,
  signer_name TEXT,
  token UUID NOT NULL UNIQUE DEFAULT gen_random_uuid(),
  status TEXT NOT NULL DEFAULT 'draft' CHECK (status IN ('draft','sent','signed','declined','expired')),
  message TEXT,
  sent_at TIMESTAMPTZ,
  signed_at TIMESTAMPTZ,
  signature_data TEXT,        -- typed name OR sanitized PNG data-URL
  signature_type TEXT CHECK (signature_type IN ('typed','drawn')),
  ip_address TEXT,
  user_agent TEXT,
  expires_at TIMESTAMPTZ,
  created_by UUID,
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_document_signature_requests_doc ON public.document_signature_requests(document_id);
GRANT SELECT, INSERT, UPDATE, DELETE ON public.document_signature_requests TO authenticated;
GRANT ALL ON public.document_signature_requests TO service_role;
ALTER TABLE public.document_signature_requests ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "document_signature_requests authenticated all" ON public.document_signature_requests;
CREATE POLICY "document_signature_requests authenticated all" ON public.document_signature_requests FOR ALL TO authenticated USING (true) WITH CHECK (true);

-- Add signed marker on the documents table (idempotent)
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS signed_at TIMESTAMPTZ;
ALTER TABLE public.documents ADD COLUMN IF NOT EXISTS current_version_no INTEGER NOT NULL DEFAULT 1;

CREATE OR REPLACE FUNCTION public.update_updated_at_column()
RETURNS TRIGGER AS $$ BEGIN NEW.updated_at = now(); RETURN NEW; END; $$
LANGUAGE plpgsql SET search_path = public;

DROP TRIGGER IF EXISTS trg_doc_sig_requests_updated ON public.document_signature_requests;
CREATE TRIGGER trg_doc_sig_requests_updated
BEFORE UPDATE ON public.document_signature_requests
FOR EACH ROW EXECUTE FUNCTION public.update_updated_at_column();

-- Anon token resolvers (SECURITY DEFINER). Return minimal info + only when valid.
CREATE OR REPLACE FUNCTION public.resolve_document_share(_token UUID)
RETURNS TABLE (
  document_id UUID,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  title TEXT,
  permissions TEXT
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  link RECORD;
BEGIN
  SELECT * INTO link FROM public.document_share_links WHERE token = _token;
  IF NOT FOUND THEN RETURN; END IF;
  IF link.revoked_at IS NOT NULL THEN RETURN; END IF;
  IF link.expires_at IS NOT NULL AND link.expires_at < now() THEN RETURN; END IF;

  UPDATE public.document_share_links
  SET access_count = access_count + 1, last_accessed_at = now()
  WHERE id = link.id;

  RETURN QUERY
  SELECT d.id, d.file_url, d.file_name, d.file_type, d.title, link.permissions
  FROM public.documents d WHERE d.id = link.document_id;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_document_share(UUID) TO anon, authenticated, service_role;

CREATE OR REPLACE FUNCTION public.resolve_document_signature_request(_token UUID)
RETURNS TABLE (
  request_id UUID,
  document_id UUID,
  title TEXT,
  file_url TEXT,
  file_name TEXT,
  file_type TEXT,
  signer_email TEXT,
  signer_name TEXT,
  status TEXT,
  message TEXT,
  signed_at TIMESTAMPTZ,
  expires_at TIMESTAMPTZ
)
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  RETURN QUERY
  SELECT r.id, d.id, d.title, d.file_url, d.file_name, d.file_type,
         r.signer_email, r.signer_name, r.status, r.message, r.signed_at, r.expires_at
  FROM public.document_signature_requests r
  JOIN public.documents d ON d.id = r.document_id
  WHERE r.token = _token;
END;
$$;
GRANT EXECUTE ON FUNCTION public.resolve_document_signature_request(UUID) TO anon, authenticated, service_role;

-- Anon-callable: complete a signing request. Rejects when not sent, expired, already signed.
CREATE OR REPLACE FUNCTION public.complete_document_signature(
  _token UUID,
  _signature_data TEXT,
  _signature_type TEXT,
  _ip TEXT DEFAULT NULL,
  _ua TEXT DEFAULT NULL
)
RETURNS JSONB
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
DECLARE
  req RECORD;
BEGIN
  IF _signature_type NOT IN ('typed','drawn') THEN
    RAISE EXCEPTION 'signature_type must be typed or drawn';
  END IF;
  IF _signature_data IS NULL OR length(_signature_data) < 1 THEN
    RAISE EXCEPTION 'signature_data required';
  END IF;
  IF _signature_type = 'drawn' AND (NOT _signature_data LIKE 'data:image/png%' OR length(_signature_data) > 300000) THEN
    RAISE EXCEPTION 'invalid drawn signature payload';
  END IF;

  SELECT * INTO req FROM public.document_signature_requests WHERE token = _token FOR UPDATE;
  IF NOT FOUND THEN RAISE EXCEPTION 'unknown_token'; END IF;
  IF req.status = 'signed' THEN RAISE EXCEPTION 'already_signed'; END IF;
  IF req.status NOT IN ('draft','sent') THEN RAISE EXCEPTION 'invalid_status'; END IF;
  IF req.expires_at IS NOT NULL AND req.expires_at < now() THEN
    UPDATE public.document_signature_requests SET status = 'expired' WHERE id = req.id;
    RAISE EXCEPTION 'expired';
  END IF;

  UPDATE public.document_signature_requests
  SET status = 'signed',
      signed_at = now(),
      signature_data = _signature_data,
      signature_type = _signature_type,
      ip_address = _ip,
      user_agent = _ua
  WHERE id = req.id;

  UPDATE public.documents SET signed_at = now() WHERE id = req.document_id;

  RETURN jsonb_build_object('ok', true, 'document_id', req.document_id, 'signed_at', now());
END;
$$;
GRANT EXECUTE ON FUNCTION public.complete_document_signature(UUID, TEXT, TEXT, TEXT, TEXT) TO anon, authenticated, service_role;
