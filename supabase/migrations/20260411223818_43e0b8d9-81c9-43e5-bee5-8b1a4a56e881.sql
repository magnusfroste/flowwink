
-- Contract types enum
DO $$ BEGIN
  CREATE TYPE public.contract_type AS ENUM ('service', 'nda', 'employment', 'lease', 'other');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.contract_status AS ENUM ('draft', 'pending_signature', 'active', 'expired', 'terminated');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

DO $$ BEGIN
  CREATE TYPE public.renewal_type AS ENUM ('none', 'auto', 'manual');
EXCEPTION WHEN duplicate_object THEN NULL;
END $$;

-- Contracts table
CREATE TABLE IF NOT EXISTS public.contracts (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  title TEXT NOT NULL,
  contract_type public.contract_type NOT NULL DEFAULT 'service',
  status public.contract_status NOT NULL DEFAULT 'draft',
  counterparty_name TEXT NOT NULL,
  counterparty_email TEXT,
  start_date DATE,
  end_date DATE,
  renewal_type public.renewal_type NOT NULL DEFAULT 'none',
  renewal_notice_days INTEGER DEFAULT 30,
  value_cents BIGINT DEFAULT 0,
  currency TEXT NOT NULL DEFAULT 'SEK',
  file_url TEXT,
  notes TEXT,
  signed_at TIMESTAMPTZ,
  terminated_at TIMESTAMPTZ,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now(),
  updated_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Contract documents (versions/attachments)
CREATE TABLE IF NOT EXISTS public.contract_documents (
  id UUID PRIMARY KEY DEFAULT gen_random_uuid(),
  contract_id UUID NOT NULL REFERENCES public.contracts(id) ON DELETE CASCADE,
  file_name TEXT NOT NULL,
  file_url TEXT NOT NULL,
  file_type TEXT DEFAULT 'pdf',
  version INTEGER NOT NULL DEFAULT 1,
  uploaded_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMPTZ NOT NULL DEFAULT now()
);

-- Indexes
CREATE INDEX IF NOT EXISTS idx_contracts_status ON public.contracts(status);
CREATE INDEX IF NOT EXISTS idx_contracts_end_date ON public.contracts(end_date);
CREATE INDEX IF NOT EXISTS idx_contracts_created_by ON public.contracts(created_by);
CREATE INDEX IF NOT EXISTS idx_contract_documents_contract_id ON public.contract_documents(contract_id);

-- Triggers
DROP TRIGGER IF EXISTS update_contracts_updated_at ON public.contracts;
CREATE TRIGGER update_contracts_updated_at
  BEFORE UPDATE ON public.contracts
  FOR EACH ROW EXECUTE FUNCTION public.update_updated_at();

-- RLS
ALTER TABLE public.contracts ENABLE ROW LEVEL SECURITY;
ALTER TABLE public.contract_documents ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Authenticated users can view contracts" ON public.contracts FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create contracts" ON public.contracts FOR INSERT TO authenticated WITH CHECK (auth.uid() = created_by);
CREATE POLICY "Authenticated users can update contracts" ON public.contracts FOR UPDATE TO authenticated USING (true);
CREATE POLICY "Authenticated users can delete contracts" ON public.contracts FOR DELETE TO authenticated USING (true);

CREATE POLICY "Authenticated users can view contract documents" ON public.contract_documents FOR SELECT TO authenticated USING (true);
CREATE POLICY "Authenticated users can create contract documents" ON public.contract_documents FOR INSERT TO authenticated WITH CHECK (auth.uid() = uploaded_by);
CREATE POLICY "Authenticated users can delete contract documents" ON public.contract_documents FOR DELETE TO authenticated USING (true);
