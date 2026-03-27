
-- Seed heartbeat_protocol into agent_memory if not exists
INSERT INTO public.agent_memory (key, value, category, created_by)
SELECT
  'heartbeat_protocol',
  jsonb_build_object(
    'protocol', E'HEARTBEAT PROTOCOL:\n1. EVALUATE — Call evaluate_outcomes for unevaluated past actions. Score each with record_outcome.\n2. PLAN — For active objectives WITHOUT a plan, call decompose_objective.\n3. ADVANCE — For objectives WITH a plan, call advance_plan to execute the next pending step.\n4. PROPOSE — If no active objectives remain, use propose_objective based on analytics/memory.\n5. AUTOMATE — Check for recurring patterns worth turning into automations.\n6. REFLECT — Call reflect to review recent actions and distill learnings.\n7. REMEMBER — Use memory_write to save any important insights or decisions.',
    'updated_at', now()::text
  ),
  'context'::agent_memory_category,
  'flowpilot'::agent_type
WHERE NOT EXISTS (
  SELECT 1 FROM public.agent_memory WHERE key = 'heartbeat_protocol'
);
