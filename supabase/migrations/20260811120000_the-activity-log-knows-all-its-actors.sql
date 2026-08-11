-- ============================================================================
-- The activity log must know every actor that acts.
--
-- agent_activity.agent is the enum agent_type — and it stopped growing when
-- the platform didn't: 'admin_ui' (the B1a callSkill rail) and 'flowwork'
-- (the employee dispatch surface) were never added. Every logActivity insert
-- for those actors has failed silently ever since: the skill executed, the
-- evidence did not land.
--
-- On a platform whose objectives close on EVIDENCE from agent_activity —
-- never on prose — a caller whose actions cannot be logged is a caller whose
-- work cannot be proven. The monitors watching for FlowWork's first live
-- calls were blind by construction.
--
-- ALTER TYPE ... ADD VALUE cannot run inside a DO block; plain statements,
-- idempotent via IF NOT EXISTS.
-- ============================================================================

ALTER TYPE public.agent_type ADD VALUE IF NOT EXISTS 'admin_ui';
ALTER TYPE public.agent_type ADD VALUE IF NOT EXISTS 'flowwork';
