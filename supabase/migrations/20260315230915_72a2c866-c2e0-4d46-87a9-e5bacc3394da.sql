
CREATE OR REPLACE FUNCTION public.checkout_objective(p_objective_id uuid, p_locked_by text DEFAULT 'heartbeat')
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rows_affected integer;
BEGIN
  UPDATE agent_objectives
  SET locked_by = p_locked_by, locked_at = now()
  WHERE id = p_objective_id
    AND (locked_by IS NULL OR locked_at < now() - interval '30 minutes');
  
  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;
