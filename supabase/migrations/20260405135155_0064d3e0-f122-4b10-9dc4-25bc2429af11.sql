ALTER TABLE public.beta_test_exchanges DROP CONSTRAINT IF EXISTS beta_test_exchanges_message_type_check;
ALTER TABLE public.beta_test_exchanges ADD CONSTRAINT beta_test_exchanges_message_type_check CHECK (message_type = ANY (ARRAY['observation', 'instruction', 'feedback', 'learning', 'action_request', 'action_result', 'question', 'acknowledgment', 'suggestion', 'error', 'status_update']));
