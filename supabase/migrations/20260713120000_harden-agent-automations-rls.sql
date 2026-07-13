-- Security hardening (2026-07-13) — close the one operator-control-plane RLS hole.
--
-- agent_automations had TWO write policies:
--   1. "Admins can manage automations"  — ALL, has_role(admin)     ← the intended gate
--   2. "System can update automations"   — UPDATE, authenticated, USING (true)  ← the hole
--
-- Policy #2 lets ANY authenticated user UPDATE ANY automation row — disable the
-- operator, redirect a skill, rewrite skill_arguments. On an instance with a
-- customer portal, `authenticated` includes customers, so this is privilege
-- escalation into the autonomous operator's control plane.
--
-- It is also REDUNDANT: the only legitimate non-admin writer is the server-side
-- dispatcher (automation-dispatcher / handlers), which runs as service_role and
-- BYPASSES RLS entirely — it never needed this policy. Dropping it therefore
-- breaks nothing:
--   • admins keep full manage via policy #1 (has_role),
--   • the dispatcher keeps bumping run_count/last_run via service_role,
--   • only untrusted authenticated users lose write — exactly the fix.
--
-- Idempotent + forward-dated (managed instances skip backdated files).

drop policy if exists "System can update automations" on public.agent_automations;

-- Belt-and-suspenders: ensure the admin manage policy exists (no-op where present).
do $$
begin
  if not exists (
    select 1 from pg_policies
    where schemaname='public' and tablename='agent_automations'
      and (coalesce(qual,'')||coalesce(with_check,'')) ilike '%has_role%'
  ) then
    create policy "Admins can manage automations" on public.agent_automations
      for all using (public.has_role(auth.uid(), 'admin'))
      with check (public.has_role(auth.uid(), 'admin'));
  end if;
end $$;
