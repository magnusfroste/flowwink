
-- API Keys table for MCP server authentication
CREATE TABLE IF NOT EXISTS public.api_keys (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  name text NOT NULL,
  key_hash text NOT NULL,
  key_prefix text NOT NULL,
  scopes text[] DEFAULT '{}',
  created_by uuid REFERENCES auth.users(id) ON DELETE SET NULL,
  last_used_at timestamptz,
  expires_at timestamptz,
  created_at timestamptz NOT NULL DEFAULT now()
);

ALTER TABLE public.api_keys ENABLE ROW LEVEL SECURITY;

CREATE POLICY "Admins can manage api_keys"
  ON public.api_keys FOR ALL TO authenticated
  USING (public.has_role(auth.uid(), 'admin'))
  WITH CHECK (public.has_role(auth.uid(), 'admin'));

-- Add mcp_exposed flag to agent_skills
ALTER TABLE public.agent_skills ADD COLUMN IF NOT EXISTS mcp_exposed boolean DEFAULT false;

-- Set mcp_exposed = true on a curated set of safe skills
UPDATE public.agent_skills SET mcp_exposed = true
WHERE name IN (
  'manage_blog_post', 'list_blog_posts', 'search_blog',
  'manage_lead', 'list_leads', 'search_leads',
  'manage_deal', 'list_deals',
  'manage_page', 'list_pages',
  'search_kb', 'list_kb_articles',
  'check_stock', 'low_stock_report',
  'list_products', 'manage_product',
  'list_companies', 'manage_company',
  'create_invoice', 'list_invoices',
  'list_bookings'
);
