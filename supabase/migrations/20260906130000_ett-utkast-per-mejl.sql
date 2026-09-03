-- Ett utkast per inkommande mejl — sagt i databasen, inte bara i koden.
--
-- Simuleringen på Resta (25 mejl, 2026-09-04) gav dubbla utkast på flera
-- trådar: två körningar av draft_email_reply tre sekunder isär, båda förbi
-- kodens "finns redan?"-läsning innan någon hunnit skriva. Ett partiellt
-- unikt index gör den andra insättningen omöjlig; handlern svarar
-- "already drafted" på 23505.
CREATE UNIQUE INDEX IF NOT EXISTS outbound_communications_one_draft_per_message
  ON public.outbound_communications (thread_id, (metadata->>'draft_of'))
  WHERE status = 'draft' AND metadata->>'draft_of' IS NOT NULL;
