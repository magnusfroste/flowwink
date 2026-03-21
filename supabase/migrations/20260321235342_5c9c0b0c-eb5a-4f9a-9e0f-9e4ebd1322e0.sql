
-- Agent concurrency lock table
-- Provides lane-based FIFO locking to prevent overlapping agent runs
CREATE TABLE IF NOT EXISTS public.agent_locks (
  lane text PRIMARY KEY,
  locked_by text NOT NULL,
  locked_at timestamptz NOT NULL DEFAULT now(),
  expires_at timestamptz NOT NULL DEFAULT (now() + interval '5 minutes')
);

-- No RLS needed — only accessed via SECURITY DEFINER functions
ALTER TABLE public.agent_locks ENABLE ROW LEVEL SECURITY;

-- System can manage locks
CREATE POLICY "System can manage locks" ON public.agent_locks
  FOR ALL TO public USING (true) WITH CHECK (true);

-- Try to acquire a lock on a lane. Returns true if acquired, false if already held.
CREATE OR REPLACE FUNCTION public.try_acquire_agent_lock(
  p_lane text,
  p_locked_by text DEFAULT 'agent',
  p_ttl_seconds integer DEFAULT 300
)
RETURNS boolean
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
DECLARE
  rows_affected integer;
BEGIN
  -- Clean expired locks first
  DELETE FROM agent_locks WHERE expires_at < now();

  -- Try insert (no existing lock)
  INSERT INTO agent_locks (lane, locked_by, locked_at, expires_at)
  VALUES (p_lane, p_locked_by, now(), now() + (p_ttl_seconds || ' seconds')::interval)
  ON CONFLICT (lane) DO UPDATE
    SET locked_by = p_locked_by,
        locked_at = now(),
        expires_at = now() + (p_ttl_seconds || ' seconds')::interval
    WHERE agent_locks.expires_at < now();  -- Only take over expired locks

  GET DIAGNOSTICS rows_affected = ROW_COUNT;
  RETURN rows_affected > 0;
END;
$$;

-- Release a lock
CREATE OR REPLACE FUNCTION public.release_agent_lock(p_lane text)
RETURNS void
LANGUAGE plpgsql
SECURITY DEFINER
SET search_path TO 'public'
AS $$
BEGIN
  DELETE FROM agent_locks WHERE lane = p_lane;
END;
$$;
