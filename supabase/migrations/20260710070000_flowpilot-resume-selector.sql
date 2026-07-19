-- FlowPilot 2.0 Phase 1 — resumption selector + graveyard backfill.
--
-- Audit finding 2026-07-10 (docs/architecture/flowpilot-2.0.md): nothing re-executes an
-- approved-but-unexecuted agent_activity, so every trust-approve action a human approves in
-- /admin/approvals dies in 'approved' limbo. 24 such rows were stranded on dev (money, comms,
-- content). This is the proof-weeks blocker.
--
-- This migration ships the SAFE, deterministic half: (1) backfill the stale graveyard to
-- 'expired' (they predate the fix — resurrecting month-old approvals would be wrong), and
-- (2) a selector RPC the resume pass consumes. The EXECUTOR (re-invoke via agent-execute with
-- _approved=true) is wired into the heartbeat as a reviewed follow-up — it auto-runs money
-- skills, so it does not get auto-armed by an unreviewed migration.

-- 0) 'expired' terminal status for approvals that aged out unexecuted (honest: they were
--    approved, not rejected). ALTER TYPE ADD VALUE runs in autocommit, so keep it first.
ALTER TYPE public.agent_activity_status ADD VALUE IF NOT EXISTS 'expired';

-- REST OF THIS MIGRATION moved to 20260710070001 (fresh-install finding #5):
-- a new enum value cannot be USED in the same transaction that adds it
-- (SQLSTATE 55P04). Worked on existing instances only because 'expired'
-- was already committed there; a fresh install always failed here.
