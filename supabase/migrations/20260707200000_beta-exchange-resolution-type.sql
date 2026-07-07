-- Allow 'resolution' message_type on beta_test_exchanges.
-- agent-execute's resolve_finding logs resolution notes with message_type='resolution',
-- but the CHECK constraint rejected it, so resolution notes were silently lost
-- (the insert error was not surfaced). Add 'resolution' to the allowed values.
-- Idempotent: drop + re-add the constraint.

ALTER TABLE public.beta_test_exchanges
  DROP CONSTRAINT IF EXISTS beta_test_exchanges_message_type_check;

ALTER TABLE public.beta_test_exchanges
  ADD CONSTRAINT beta_test_exchanges_message_type_check
  CHECK (message_type = ANY (ARRAY[
    'observation'::text,
    'instruction'::text,
    'feedback'::text,
    'learning'::text,
    'action_request'::text,
    'action_result'::text,
    'question'::text,
    'acknowledgment'::text,
    'suggestion'::text,
    'error'::text,
    'status_update'::text,
    'resolution'::text
  ]));
