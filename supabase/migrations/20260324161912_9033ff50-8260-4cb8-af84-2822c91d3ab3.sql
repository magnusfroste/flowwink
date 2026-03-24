-- Sync expected_skill_hash to current state after audit cleanup
UPDATE agent_memory 
SET value = jsonb_build_object('hash', '863d15713e8c62c12819c308910b2355d45d58b571e243756fc30b2e7174b541', 'updated_at', now()::text, 'reason', 'Post-audit sync: removed 3 duplicate skills, disabled 1 broken automation'),
    updated_at = now()
WHERE key = 'expected_skill_hash';