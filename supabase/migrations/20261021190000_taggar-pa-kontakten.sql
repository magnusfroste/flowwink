-- Tags on the contact.
--
-- Odoo's kanban card carries the record's tags, and a team reads its wall by
-- them ("Enterprise", "Renewal", "Partner"). FlowWink had tags on companies but
-- not on leads, so the Odoo importer could only write a contact's tags into a
-- note — invisible on the board. The column follows companies.tags: text[],
-- empty by default, shown on the kanban and list cards.

ALTER TABLE public.leads
  ADD COLUMN IF NOT EXISTS tags text[] NOT NULL DEFAULT '{}'::text[];

CREATE INDEX IF NOT EXISTS leads_tags_gin ON public.leads USING gin (tags);

COMMENT ON COLUMN public.leads.tags IS
  'Free labels on the contact, shown on the kanban and list cards. The Odoo importer fills them from crm.tag; companies carry their own tags.';
