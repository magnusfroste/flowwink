-- Privata projekt — flowtable-principen (default DELAT, ägaren kan låsa).
-- Peters önskan på optic 2026-08-28: kunna driva projekt som inte alla ser.
-- Samma semantik som flowtable: nya projekt föds delade (samarbete är
-- normalfallet), synligheten är ägarens ratt, admin ser allt.
-- Tasks ärver projektets synlighet — ett privat projekts aktiviteter ska
-- inte läcka via aktivitetsvyer.

ALTER TABLE public.projects ADD COLUMN IF NOT EXISTS visibility text NOT NULL DEFAULT 'shared';
DO $$ BEGIN
  ALTER TABLE public.projects ADD CONSTRAINT projects_visibility_check CHECK (visibility IN ('shared','private'));
EXCEPTION WHEN duplicate_object THEN NULL; END $$;

DROP POLICY IF EXISTS "Authenticated users can view projects" ON public.projects;
DROP POLICY IF EXISTS "Shared or own projects are visible" ON public.projects;
CREATE POLICY "Shared or own projects are visible" ON public.projects
  FOR SELECT TO authenticated
  USING (visibility = 'shared' OR created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role));

DROP POLICY IF EXISTS "Creators can update own projects" ON public.projects;
CREATE POLICY "Creators can update own projects" ON public.projects
  FOR UPDATE TO authenticated
  USING (created_by = auth.uid());

DROP POLICY IF EXISTS "Authenticated users can view tasks" ON public.project_tasks;
DROP POLICY IF EXISTS "Tasks follow project visibility" ON public.project_tasks;
CREATE POLICY "Tasks follow project visibility" ON public.project_tasks
  FOR SELECT TO authenticated
  USING (EXISTS (
    SELECT 1 FROM public.projects p
    WHERE p.id = project_tasks.project_id
      AND (p.visibility = 'shared' OR p.created_by = auth.uid() OR has_role(auth.uid(), 'admin'::app_role))
  ));
