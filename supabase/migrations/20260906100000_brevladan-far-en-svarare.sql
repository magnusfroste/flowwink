-- Brevlådan får en svarare — reply_mode bredvid route_mode.
--
-- route_mode säger VAR ett inkommande mejl hamnar (CRM, ärende). reply_mode
-- säger VEM som svarar, med samma rattform som chattens routingMode:
--   human_first (default) FlowPilot skriver ett utkast, en person skickar
--   ai_first              FlowPilot skickar när källorna täcker frågan,
--                         annars utkast flaggat needs_person
--   human_only            FlowPilot skriver inget
-- Idempotent: kolumn + CHECK bara om de saknas.

ALTER TABLE public.inbound_email_accounts
  ADD COLUMN IF NOT EXISTS reply_mode text NOT NULL DEFAULT 'human_first';

DO $$
BEGIN
  IF NOT EXISTS (
    SELECT 1 FROM pg_constraint WHERE conname = 'inbound_email_accounts_reply_mode_check'
  ) THEN
    ALTER TABLE public.inbound_email_accounts
      ADD CONSTRAINT inbound_email_accounts_reply_mode_check
      CHECK (reply_mode IN ('ai_first', 'human_first', 'human_only'));
  END IF;
END $$;

COMMENT ON COLUMN public.inbound_email_accounts.reply_mode IS
  'Who answers mail to this mailbox: human_first = FlowPilot drafts, a person sends; ai_first = FlowPilot sends when grounded, drafts otherwise; human_only = FlowPilot writes nothing.';
