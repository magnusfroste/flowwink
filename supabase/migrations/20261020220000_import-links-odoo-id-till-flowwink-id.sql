-- Importlänkar: Odoo-id → FlowWink-id, så en migrering kan köras om.
--
-- synclairvision flyttar från Odoo (2026-10). En import som inte kan köras om
-- är en import man bara vågar köra en gång — och då på go-live-dagen, utan
-- generalrepetition. Länktabellen gör den idempotent: varje rad som skapats
-- från en Odoo-post minns varifrån den kom, så nästa körning uppdaterar i
-- stället för att dubblera, och relationer (partner → bolag, lead → partner,
-- meddelande → lead) slås upp här i stället för att gissas på namn.
--
-- Generell på avsikt: `source` är 'odoo' i dag; samma tabell bär en HubSpot-
-- eller Pipedrive-import i morgon. Ingen anon- eller authenticated-åtkomst:
-- bara importören (service role) och admin via RPC läser den.
CREATE TABLE IF NOT EXISTS public.import_links (
  source       text NOT NULL,
  model        text NOT NULL,
  external_id  text NOT NULL,
  target_table text NOT NULL,
  target_id    uuid NOT NULL,
  imported_at  timestamptz NOT NULL DEFAULT now(),
  updated_at   timestamptz NOT NULL DEFAULT now(),
  payload_hash text,
  PRIMARY KEY (source, model, external_id)
);
COMMENT ON TABLE public.import_links IS
  'One row per record created or matched by an importer (import_from_odoo …): where it came from and where it landed. Re-runs update through this instead of duplicating.';
CREATE INDEX IF NOT EXISTS idx_import_links_target ON public.import_links (target_table, target_id);

ALTER TABLE public.import_links ENABLE ROW LEVEL SECURITY;
REVOKE ALL ON public.import_links FROM PUBLIC, anon, authenticated;
GRANT ALL ON public.import_links TO service_role;

DROP POLICY IF EXISTS "import_links_admin_read" ON public.import_links;
CREATE POLICY "import_links_admin_read" ON public.import_links
  FOR SELECT TO authenticated
  USING (public.has_role(auth.uid(), 'admin'));
GRANT SELECT ON public.import_links TO authenticated;
