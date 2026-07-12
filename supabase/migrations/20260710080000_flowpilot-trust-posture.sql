-- FlowPilot 2.0 — actor-aware trust posture (open-by-default, narrow-by-policy).
--
-- Today trust_level lives on the skill row and gates ALL internal callers identically
-- (agent-execute reads skill.trust_level regardless of agent_type). That is right for the
-- external boundary — OpenClaw must hit the real gates to prove it operates within them —
-- but it means a skill Magnus opened for OpenClaw's role-proving is also open (or gated) for
-- FlowPilot with no way to shape the INTERNAL operator's autonomy separately.
--
-- Magnus's model (2026-07-10): open first so the operator can PROVE autonomy, then let admin
-- add gated HIL per area — "öppen men sedan stänger man ned, inte tvärtom", and make adding a
-- policy trivial. This ships that as two layers, both consulted only for agent_type='flowpilot'
-- (chat/mcp keep the skill's own trust_level — the external boundary is unchanged):
--
--   1. POSTURE (site_settings 'flowpilot_autonomy'.posture):
--        'proving'  → FlowPilot treats an 'approve' skill as 'notify' (act + record, never
--                     dead-end) — maximal autonomy to prove itself. Money-core idempotency +
--                     abort guards keep this safe; every action is logged for review.
--        'guarded'  → honors the skill's gate (the resumption executor completes it after a
--                     human approves). SAFE PLATFORM DEFAULT (a stranger's fresh install must
--                     opt in before the agent moves money unattended).
--   2. POLICY (agent_trust_policies): additive narrowing/opening per skill or category —
--        an explicit row ALWAYS wins over the posture. This is the "add a policy when needed"
--        surface: e.g. gate payroll for flowpilot even in proving, or open one category early.

create table if not exists public.agent_trust_policies (
  id uuid primary key default gen_random_uuid(),
  actor text not null default 'flowpilot',          -- which internal operator this shapes
  skill_name text,                                  -- exact skill (wins over category)
  skill_category text,                              -- or a whole category
  effective_trust_level text not null check (effective_trust_level in ('auto','notify','approve')),
  note text,
  created_by uuid,
  created_at timestamptz not null default now(),
  constraint agent_trust_policies_target_ck check (skill_name is not null or skill_category is not null)
);
create unique index if not exists agent_trust_policies_skill_uk
  on public.agent_trust_policies(actor, skill_name) where skill_name is not null;
create unique index if not exists agent_trust_policies_category_uk
  on public.agent_trust_policies(actor, skill_category) where skill_category is not null and skill_name is null;

alter table public.agent_trust_policies enable row level security;
drop policy if exists agent_trust_policies_admin_all on public.agent_trust_policies;
create policy agent_trust_policies_admin_all on public.agent_trust_policies
  for all using (public.has_role(auth.uid(), 'admin')) with check (public.has_role(auth.uid(), 'admin'));

comment on table public.agent_trust_policies is
  'FlowPilot 2.0 per-actor trust overrides. An explicit row wins over the flowpilot_autonomy posture; empty table = posture governs. skill_name beats skill_category. Only consulted for internal operators (agent_type=flowpilot); chat/mcp keep the skill''s own trust_level.';

-- Resolver: the effective trust level for a skill+actor. Kept as a function so agent-execute,
-- the resume executor and any dashboard agree on one truth.
create or replace function public.resolve_agent_trust(p_skill_name text, p_skill_category text, p_base_trust text, p_agent_type text)
returns text language plpgsql stable security definer set search_path = public as $$
declare v_policy text; v_posture text;
begin
  if p_agent_type is distinct from 'flowpilot' then
    return coalesce(p_base_trust, 'auto');           -- external boundary unchanged
  end if;
  -- explicit policy: skill-specific first, then category
  select effective_trust_level into v_policy from public.agent_trust_policies
   where actor = 'flowpilot' and skill_name = p_skill_name limit 1;
  if v_policy is not null then return v_policy; end if;
  select effective_trust_level into v_policy from public.agent_trust_policies
   where actor = 'flowpilot' and skill_category = p_skill_category and skill_name is null limit 1;
  if v_policy is not null then return v_policy; end if;
  -- posture
  select coalesce(value->>'posture','guarded') into v_posture from public.site_settings where key='flowpilot_autonomy';
  if coalesce(v_posture,'guarded') = 'proving' and coalesce(p_base_trust,'auto') = 'approve' then
    return 'notify';
  end if;
  return coalesce(p_base_trust, 'auto');
end;
$$;
