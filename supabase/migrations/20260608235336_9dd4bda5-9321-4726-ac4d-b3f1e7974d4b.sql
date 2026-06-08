-- Add admin DELETE policies to agent observability tables so Reset Site actually clears them
DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='agent_events' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete agent events" ON public.agent_events FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='ai_usage_logs' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete ai usage logs" ON public.ai_usage_logs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demo_runs' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete demo runs" ON public.demo_runs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='demo_run_items' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete demo run items" ON public.demo_run_items FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;