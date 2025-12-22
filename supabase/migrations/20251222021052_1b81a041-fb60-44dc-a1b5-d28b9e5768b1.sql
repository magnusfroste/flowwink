-- Create companies table
CREATE TABLE public.companies (
  id UUID NOT NULL DEFAULT gen_random_uuid() PRIMARY KEY,
  name TEXT NOT NULL,
  domain TEXT,
  industry TEXT,
  size TEXT,
  address TEXT,
  phone TEXT,
  website TEXT,
  notes TEXT,
  created_by UUID REFERENCES auth.users(id),
  created_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now(),
  updated_at TIMESTAMP WITH TIME ZONE NOT NULL DEFAULT now()
);

-- Add company_id to leads table
ALTER TABLE public.leads ADD COLUMN company_id UUID REFERENCES public.companies(id) ON DELETE SET NULL;

-- Enable RLS
ALTER TABLE public.companies ENABLE ROW LEVEL SECURITY;

-- RLS policies for companies
CREATE POLICY "Admins can manage companies"
  ON public.companies
  FOR ALL
  USING (has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can view and update companies"
  ON public.companies
  FOR SELECT
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can insert companies"
  ON public.companies
  FOR INSERT
  WITH CHECK (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

CREATE POLICY "Approvers can update companies"
  ON public.companies
  FOR UPDATE
  USING (has_role(auth.uid(), 'approver'::app_role) OR has_role(auth.uid(), 'admin'::app_role));

-- Trigger for updated_at
CREATE TRIGGER update_companies_updated_at
  BEFORE UPDATE ON public.companies
  FOR EACH ROW
  EXECUTE FUNCTION public.update_updated_at();

-- Index for faster lookups
CREATE INDEX idx_companies_name ON public.companies(name);
CREATE INDEX idx_leads_company_id ON public.leads(company_id);