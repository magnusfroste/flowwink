## Skill Instructions — Baked into DEFAULT_SKILLS (Option B) ✅ DONE

### What was done
1. **Added rich Markdown instructions** to all 60 skills in `DEFAULT_SKILLS` that were missing them (8 already had instructions). Each instruction follows LAW 1 format: What, When to use, Parameters, Edge cases.

2. **Added backfill logic** for existing installations: after seeding new skills, the bootstrap now updates existing skills that have `instructions = null` with the code-defined instructions. Agent-modified instructions (non-null) are preserved.

### Files changed
| File | Change |
|------|--------|
| `supabase/functions/setup-flowpilot/index.ts` | +835 lines — instructions on 60 skills + backfill loop |

### Impact
| Scenario | Before | After |
|----------|--------|-------|
| New installation | ~12/73 instructions → integrity ~60% | 73/73 → integrity 100% |
| Upgrade (re-run bootstrap) | 12/73 | 73/73 (backfill via `.is(null)`) |
| Agent-modified | — | Preserved (backfill skips non-null) |
