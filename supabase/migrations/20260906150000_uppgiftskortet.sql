-- Uppgiftskortet — en uppgift är en yta, inte en rad.
--
-- Peter på Optic lägger upp projekt där uppgifterna blir mer än en titel, och
-- FlowPilot och en extern agent ska kunna arbeta i dem med människor som
-- tittar in, lägger till, ändrar och verifierar. Kortet får det Trello har
-- rätt om: en checklista (vad "klart" består av) och en kommentarstråd i
-- tidsordning där människor och agenter skriver i samma liggare — steg,
-- frågor, beslut. Beroendena fanns redan; de får synas på kortet.

ALTER TABLE public.project_tasks
  ADD COLUMN IF NOT EXISTS checklist jsonb NOT NULL DEFAULT '[]'::jsonb;
COMMENT ON COLUMN public.project_tasks.checklist IS
  'Acceptance items: [{id, text, done, done_at, done_by}]. What "done" consists of — a person or an agent ticks them.';

CREATE TABLE IF NOT EXISTS public.project_task_comments (
  id uuid PRIMARY KEY DEFAULT gen_random_uuid(),
  task_id uuid NOT NULL REFERENCES public.project_tasks(id) ON DELETE CASCADE,
  project_id uuid NOT NULL REFERENCES public.projects(id) ON DELETE CASCADE,
  body text NOT NULL,
  -- comment: a person's note · step: what an agent did · question: needs a person · decision: settled
  kind text NOT NULL DEFAULT 'comment' CHECK (kind IN ('comment', 'step', 'question', 'decision')),
  author_type text NOT NULL DEFAULT 'person' CHECK (author_type IN ('person', 'flowpilot', 'agent')),
  author_id uuid,
  author_name text,
  created_at timestamptz NOT NULL DEFAULT now()
);
CREATE INDEX IF NOT EXISTS idx_project_task_comments_task ON public.project_task_comments (task_id, created_at);

GRANT SELECT, INSERT ON public.project_task_comments TO authenticated;
GRANT ALL ON public.project_task_comments TO service_role;
ALTER TABLE public.project_task_comments ENABLE ROW LEVEL SECURITY;
DROP POLICY IF EXISTS "project task comments follow the matrix" ON public.project_task_comments;
CREATE POLICY "project task comments follow the matrix" ON public.project_task_comments
  FOR ALL TO authenticated
  USING (public.can_access_module(auth.uid(), 'projects'))
  WITH CHECK (public.can_access_module(auth.uid(), 'projects'));
