CREATE OR REPLACE FUNCTION public.tg_support_agent_offline_release()
RETURNS TRIGGER
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path = public
AS $$
BEGIN
  IF NEW.status = 'offline' AND COALESCE(OLD.status, 'offline') <> 'offline' THEN
    PERFORM public.release_agent_conversations(NEW.user_id);
  END IF;
  RETURN NEW;
END;
$$;

DROP TRIGGER IF EXISTS support_agent_offline_release ON public.support_agents;
CREATE TRIGGER support_agent_offline_release
AFTER UPDATE OF status ON public.support_agents
FOR EACH ROW
EXECUTE FUNCTION public.tg_support_agent_offline_release();