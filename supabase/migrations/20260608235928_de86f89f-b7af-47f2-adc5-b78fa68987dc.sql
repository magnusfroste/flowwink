DO $$ BEGIN
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='audit_logs' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete audit logs" ON public.audit_logs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='auth_events' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete auth events" ON public.auth_events FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='bootstrap_runs' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete bootstrap runs" ON public.bootstrap_runs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
  IF NOT EXISTS (SELECT 1 FROM pg_policies WHERE schemaname='public' AND tablename='platform_test_runs' AND cmd='DELETE') THEN
    CREATE POLICY "Admins can delete platform test runs" ON public.platform_test_runs FOR DELETE TO authenticated USING (has_role(auth.uid(), 'admin'::app_role));
  END IF;
END $$;