/**
 * Concurrency Guard — Lane-based locking via agent_locks table.
 * Prevents race conditions between heartbeat, operate, and chat surfaces.
 */

export async function tryAcquireLock(supabase: any, lane: string, lockedBy = 'agent', ttlSeconds = 300): Promise<boolean> {
  const { data, error } = await supabase.rpc('try_acquire_agent_lock', {
    p_lane: lane,
    p_locked_by: lockedBy,
    p_ttl_seconds: ttlSeconds,
  });
  if (error) {
    console.warn(`[lock] Failed to acquire '${lane}':`, error.message);
    return false;
  }
  return data === true;
}

export async function releaseLock(supabase: any, lane: string): Promise<void> {
  await supabase.rpc('release_agent_lock', { p_lane: lane });
}
