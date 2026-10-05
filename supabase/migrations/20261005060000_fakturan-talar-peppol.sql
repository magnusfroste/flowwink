-- Fakturan talar Peppol.
--
-- Odoo: account_edi_ubl_cii — en faktura kan exporteras som UBL 2.1 (Peppol BIS
-- Billing 3.0) och skickas via en accesspunkt. FlowWink hade PDF och e-post;
-- en kommun eller ett större bolag som kräver e-faktura fick ett nej.
--
-- Det här är det som går att bygga och BEVISA utan en accesspunkt:
--   1. companies.peppol_id      — mottagarens elektroniska adress när den inte
--                                 är organisationsnumret (GLN 0088, utländsk).
--   2. invoices.buyer_reference — "Er referens" (BT-10). Peppol kräver den eller
--                                 en orderreferens; utan den avvisas dokumentet.
--   3. einvoice_dispatches      — liggaren: varje försök att skicka, med XML,
--                                 validering, mottagare, status. Status 'sent'
--                                 skrivs BARA när en accesspunkt svarat 2xx;
--                                 utan accesspunkt är försöket 'simulated' och
--                                 säger det. Ingen faktura ser skickad ut som
--                                 ingen tagit emot.
--   4. site_settings.einvoice   — bankgiro/IBAN/BIC (BG-16, krävs för en
--                                 faktura med belopp att betala), egen Peppol-id
--                                 när den inte är org-numret, accesspunktens URL.
--                                 Skrivbar för fakturamodulens roller, som chat
--                                 och company_profile är för sina.
--
-- Själva XML:en byggs i _shared/einvoice/ubl.ts (ren funktion, enhetstestad)
-- och serveras av edge-funktionen `einvoice`.

ALTER TABLE public.companies ADD COLUMN IF NOT EXISTS peppol_id text;
COMMENT ON COLUMN public.companies.peppol_id IS
  'Peppol participant id "scheme:value" (0007:5566778899, 0088:GLN). Derived from org_number (0007) or vat_number (9955) when empty.';

ALTER TABLE public.invoices ADD COLUMN IF NOT EXISTS buyer_reference text;
COMMENT ON COLUMN public.invoices.buyer_reference IS
  'Er referens (EN 16931 BT-10). Peppol requires this or a purchase-order reference; the e-invoice export refuses without one.';

CREATE TABLE IF NOT EXISTS public.einvoice_dispatches (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  invoice_id uuid NOT NULL REFERENCES public.invoices(id) ON DELETE CASCADE,
  format text NOT NULL DEFAULT 'peppol-bis-3',
  recipient_id text,
  sender_id text,
  status text NOT NULL CHECK (status IN ('simulated', 'sent', 'accepted', 'rejected', 'failed')),
  provider text,
  provider_ref text,
  validation jsonb NOT NULL DEFAULT '{}'::jsonb,
  xml text,
  error_message text,
  created_by uuid,
  created_at timestamptz NOT NULL DEFAULT now(),
  sent_at timestamptz
);
CREATE INDEX IF NOT EXISTS einvoice_dispatches_invoice ON public.einvoice_dispatches (invoice_id, created_at DESC);

ALTER TABLE public.einvoice_dispatches ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "Invoicing module manages e-invoice dispatches" ON public.einvoice_dispatches;
CREATE POLICY "Invoicing module manages e-invoice dispatches" ON public.einvoice_dispatches
  FOR ALL TO authenticated
  USING (can_access_module(auth.uid(), 'invoicing'))
  WITH CHECK (can_access_module(auth.uid(), 'invoicing'));
REVOKE ALL ON public.einvoice_dispatches FROM anon;
GRANT SELECT, INSERT, UPDATE, DELETE ON public.einvoice_dispatches TO authenticated, service_role;

-- The settings key, writable by the module's roles (the matrix, not a role list).
DROP POLICY IF EXISTS "E-invoice settings creatable by invoicing roles" ON public.site_settings;
CREATE POLICY "E-invoice settings creatable by invoicing roles" ON public.site_settings
  FOR INSERT TO authenticated
  WITH CHECK (key = 'einvoice' AND can_access_module(auth.uid(), 'invoicing'));
DROP POLICY IF EXISTS "E-invoice settings editable by invoicing roles" ON public.site_settings;
CREATE POLICY "E-invoice settings editable by invoicing roles" ON public.site_settings
  FOR UPDATE TO authenticated
  USING (key = 'einvoice' AND can_access_module(auth.uid(), 'invoicing'))
  WITH CHECK (key = 'einvoice' AND can_access_module(auth.uid(), 'invoicing'));
