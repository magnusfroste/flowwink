-- Audit trigger for role_module_access changes
CREATE OR REPLACE FUNCTION public.log_role_module_access_change()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF TG_OP = 'INSERT' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES (
      'role_module_access.grant',
      'role_module_access',
      NULL,
      auth.uid(),
      jsonb_build_object('role', NEW.role, 'module_id', NEW.module_id)
    );
    RETURN NEW;
  ELSIF TG_OP = 'DELETE' THEN
    INSERT INTO public.audit_logs (action, entity_type, entity_id, user_id, metadata)
    VALUES (
      'role_module_access.revoke',
      'role_module_access',
      NULL,
      auth.uid(),
      jsonb_build_object('role', OLD.role, 'module_id', OLD.module_id)
    );
    RETURN OLD;
  END IF;
  RETURN NULL;
END;
$$;

DROP TRIGGER IF EXISTS trg_log_role_module_access_change ON public.role_module_access;
CREATE TRIGGER trg_log_role_module_access_change
AFTER INSERT OR DELETE ON public.role_module_access
FOR EACH ROW
EXECUTE FUNCTION public.log_role_module_access_change();