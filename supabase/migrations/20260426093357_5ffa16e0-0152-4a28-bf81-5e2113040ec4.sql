-- Default executor for new automations is 'platform' (admin-created, deterministic).
-- FlowPilot module's seedData explicitly sets executor='flowpilot' on its own automations.
ALTER TABLE public.agent_automations ALTER COLUMN executor SET DEFAULT 'platform';