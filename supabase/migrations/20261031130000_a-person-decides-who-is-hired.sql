-- ============================================================
-- Migration: a person decides who moves on and who is hired
-- Date: 2026-10-31
-- Safe to re-run: Yes
-- ============================================================
--
-- The promise of recruitment in FlowWink: every application is handled on the
-- business's own instance, AI assists (it parses the CV, scores the fit,
-- drafts the outreach) — and the selection is made by a person. Until now an
-- agent could move a candidate (reject them included) or hire them on its own:
-- move_application_stage, hire_application and hire_candidate ran at the
-- default trust 'notify' — done first, told after.
--
-- Now an agent's stage move or hire waits for a person's approval:
--   * agent_skills.trust_level 'approve' for the three — what an external
--     agent over MCP is held to. Raised only where the row still has the
--     default 'notify'; an operator's own explicit choice stays. New installs
--     get it from the skill seeds.
--   * agent_trust_policies for FlowPilot — a policy row always wins over the
--     'proving' posture, which otherwise downgrades approve → notify (the same
--     wall update_skill_instructions has, 20260712150000).
-- A person in the admin moves and hires directly — they are the decision.

UPDATE public.agent_skills
   SET trust_level = 'approve', updated_at = now()
 WHERE name IN ('move_application_stage', 'hire_application', 'hire_candidate')
   AND trust_level = 'notify';

INSERT INTO public.agent_trust_policies (actor, skill_name, effective_trust_level, note)
SELECT 'flowpilot', s, 'approve', 'Recruitment: a person decides who moves on and who is hired — AI assists, never selects'
  FROM unnest(ARRAY['move_application_stage', 'hire_application', 'hire_candidate']) AS s
 WHERE NOT EXISTS (
   SELECT 1 FROM public.agent_trust_policies WHERE actor = 'flowpilot' AND skill_name = s
 );
