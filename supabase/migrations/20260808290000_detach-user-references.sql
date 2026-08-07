-- User deletion: one family of references was detached, the other was not.
--
-- `delete-user` (defdbe167) detaches exactly the 3 NO ACTION columns that
-- reference `profiles` — a correct and complete list FOR THAT FAMILY. But there
-- are two families: 27 more NO ACTION columns reference `auth.users` directly,
-- and none of them were handled. Live on optic while reviewing: the admin
-- account holds `contract_versions.created_by = 2` and `projects.created_by= 1`,
-- so deleting any colleague who has actually worked fails on an FK error.
-- Deleting a user who never created anything succeeds — which is how the gap
-- survives testing.
--
-- A HARDCODED LIST IS THE WRONG SHAPE for this. The first list was right on the
-- day it was written and wrong by review time; every new `created_by` column
-- silently re-opens the gap. So the detach walks pg_constraint at execution
-- time: every NO ACTION FK pointing at auth.users or profiles, nulled when
-- nullable, and reported by name when NOT NULL — an honest error beats a
-- generic FK failure. Today all 27 + 3 are nullable, so the blocker branch is
-- future-proofing, not a live path.
--
-- Authorship columns are NULLED, never reassigned. A contract does not stop
-- existing because its salesperson left, but it also was not authored by the
-- admin who pressed delete. History keeps the row and loses the name.
--
-- AND THE CASCADE IS DEFUSED. `flowtable_bases.owner_id` was NOT NULL with
-- ON DELETE CASCADE, which cascades on through tables to fields and records:
-- deleting optic's admin would have silently destroyed the Produkter base
-- (3 tables, 24 rows) the whole sales conversation reads from. A base is a
-- shared workspace artifact that happens to record who created it — the
-- creator's departure must orphan it, not erase it. SET NULL requires the
-- column to be nullable, and an ownerless base needs someone able to manage
-- it, so the owner-only UPDATE/DELETE policies gain the admin path every other
-- table already has.

-- ── the cascade ────────────────────────────────────────────────────────────
ALTER TABLE public.flowtable_bases ALTER COLUMN owner_id DROP NOT NULL;

DO $$
BEGIN
  IF EXISTS (
    SELECT 1 FROM pg_constraint
    WHERE conname = 'flowtable_bases_owner_id_fkey'
      AND conrelid = 'public.flowtable_bases'::regclass
      AND confdeltype = 'c'  -- only rewrite if still CASCADE
  ) THEN
    ALTER TABLE public.flowtable_bases DROP CONSTRAINT flowtable_bases_owner_id_fkey;
    ALTER TABLE public.flowtable_bases
      ADD CONSTRAINT flowtable_bases_owner_id_fkey
      FOREIGN KEY (owner_id) REFERENCES auth.users(id) ON DELETE SET NULL;
  END IF;
END $$;

-- An orphaned base must be manageable. The old policies were owner-only with
-- no admin clause at all — fine while every base had an owner, a dead end the
-- moment one does not.
DROP POLICY IF EXISTS "flowtable_bases owner update" ON public.flowtable_bases;
CREATE POLICY "flowtable_bases owner update"
  ON public.flowtable_bases FOR UPDATE
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

DROP POLICY IF EXISTS "flowtable_bases owner delete" ON public.flowtable_bases;
CREATE POLICY "flowtable_bases owner delete"
  ON public.flowtable_bases FOR DELETE
  USING (owner_id = auth.uid() OR public.has_role(auth.uid(), 'admin'::public.app_role));

-- ── the detach ─────────────────────────────────────────────────────────────
CREATE OR REPLACE FUNCTION public.detach_user_references(p_user_id uuid)
RETURNS jsonb
LANGUAGE plpgsql SECURITY DEFINER SET search_path TO 'public'
AS $$
DECLARE
  r record;
  v_count bigint;
  v_out jsonb := '{}'::jsonb;
  v_blockers text := '';
BEGIN
  -- Service role (the delete-user function) or an admin. Without this guard
  -- any authenticated user could strip ownership columns platform-wide — the
  -- function is SECURITY DEFINER. No postgres escape hatch: a superuser
  -- bypasses RLS anyway, and an extra OR-clause is one more thing a probe
  -- cannot exercise. (Direct-DB callers: SET LOCAL request.jwt.claims with
  -- role=service_role, as the rolled-back live test does.)
  IF NOT (auth.role() = 'service_role'
          OR public.has_role(auth.uid(), 'admin'::public.app_role)) THEN
    RAISE EXCEPTION 'detach_user_references: admin or service role required';
  END IF;

  FOR r IN
    SELECT c.conrelid::regclass::text AS tbl, a.attname AS col, a.attnotnull AS not_null
    FROM pg_constraint c
    JOIN unnest(c.conkey) k(attnum) ON true
    JOIN pg_attribute a ON a.attrelid = c.conrelid AND a.attnum = k.attnum
    JOIN pg_class cl ON cl.oid = c.conrelid
    WHERE c.contype = 'f'
      AND c.confdeltype = 'a'          -- NO ACTION: the ones that block
      AND c.confrelid IN ('auth.users'::regclass, 'public.profiles'::regclass)
      AND cl.relnamespace = 'public'::regnamespace
  LOOP
    IF r.not_null THEN
      -- Cannot null it; report it by name instead of failing generically.
      EXECUTE format('SELECT count(*) FROM %s WHERE %I = $1', r.tbl, r.col)
        USING p_user_id INTO v_count;
      IF v_count > 0 THEN
        v_blockers := v_blockers || format('%s.%s (%s rows) ', r.tbl, r.col, v_count);
      END IF;
      CONTINUE;
    END IF;

    EXECUTE format('UPDATE %s SET %I = NULL WHERE %I = $1', r.tbl, r.col, r.col)
      USING p_user_id;
    GET DIAGNOSTICS v_count = ROW_COUNT;
    IF v_count > 0 THEN
      v_out := v_out || jsonb_build_object(r.tbl || '.' || r.col, v_count);
    END IF;
  END LOOP;

  IF v_blockers <> '' THEN
    RAISE EXCEPTION 'User has NOT NULL references that cannot be detached: %. These columns need a schema decision (nullable, or reassignment) before this user can be deleted.', v_blockers;
  END IF;

  RETURN v_out;
END;
$$;

REVOKE ALL ON FUNCTION public.detach_user_references(uuid) FROM PUBLIC, anon;
GRANT EXECUTE ON FUNCTION public.detach_user_references(uuid) TO authenticated, service_role;
