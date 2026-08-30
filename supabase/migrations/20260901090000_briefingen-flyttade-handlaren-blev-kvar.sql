-- The briefing moved. Its handler stayed behind.
--
-- `run_daily_briefing` was seeded by 20260624225254 with
-- `handler = 'edge:flowpilot-briefing'`, back when
-- `supabase/functions/flowpilot-briefing/` was a function of its own. That
-- directory is gone: the briefing is now `flowpilot-lifecycle/briefing.ts`,
-- reached as `edge:flowpilot-lifecycle`, with agent-execute's edge dispatch
-- deriving the `briefing` sub-task from the skill name
-- (`run_daily_briefing: 'briefing'` in flowpilot-lifecycle/index.ts).
--
-- Nothing under `src/lib/` still carries the old handler — `platform-seeds.ts`
-- says `edge:flowpilot-lifecycle` — so `bootstrapModule()` repairs the row on
-- any instance the moment skills are synced from code. That is exactly why
-- this went unnoticed: every live instance had already been bootstrapped past
-- it. The stale value only exists in the window between "migrations applied"
-- and "skills synced" — which is precisely the state a FRESH INSTALL is in,
-- and precisely the state the blocking skill linter inspects:
--
--   run_daily_briefing [edge:flowpilot-briefing] — L5 edge-function-missing (BLOCKING)
--
-- So the repair belongs in the migration layer, not the bootstrap layer. The
-- schema has to be born correct, not corrected afterwards — same lesson as the
-- role_module_access_defaults seed: "works on dev" is the weakest possible
-- evidence, because dev has been bootstrapped and can never fail this test.
--
-- Forward-dated past the 20260831100000 HEAD because a managed instance's
-- migrate runner silently skips anything below its ledger HEAD; a backdated
-- fix would miss every instance it is meant for.
--
-- Scoped to the one dead value on purpose. An unconditional write would
-- clobber a handler that a later seed — or an operator — has deliberately
-- moved. Matching on the old function's name makes this a no-op on the second
-- run and on every instance bootstrap has already fixed.

UPDATE public.agent_skills
SET handler    = 'edge:flowpilot-lifecycle',
    updated_at = now()
WHERE name = 'run_daily_briefing'
  AND handler = 'edge:flowpilot-briefing';
