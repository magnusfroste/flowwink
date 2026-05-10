---
name: Skill Manifest Coverage Guardrail
description: Platform-test suite that detects DB skills without a module-manifest skillSeed declaration
type: feature
---
Platform-test suite `skill_manifest_coverage` (in `run-platform-tests`) compares `agent_skills` rows (origin=bundled) against a snapshot of all skill names declared in `src/lib/modules/*-module.ts` skillSeeds.

**Why:** orphan skills (in DB but not in any manifest) still execute, but never get schema/description updates from `bootstrapModule()` — they have to be edited via direct SQL forever.

**Snapshot:** `supabase/functions/run-platform-tests/_declared-skills.json`. Refresh via `bun run scripts/snapshot-declared-skills.ts` whenever a manifest changes.

**Current orphans (2026-05-10, 18 st):** auto_allocate_vacation, auto_mark_invoice_paid, flag_invoice_variance, follow_entity, get_company_profile, lint_skill, list_reorder_candidates, lock_timesheet_period, manage_activities, manage_addresses, manage_global_blocks, manage_saved_views, manage_tags, match_po_to_invoice, register_vendor_invoice, suggest_kb_for_ticket, tag_entity, update_company_profile.

**Note:** teardown är icke-destruktivt (bara `enabled=false`) och bootstrap är upsert, så orphans försvinner inte vid module-reset — de fryser bara på sin nuvarande schema. Tidigare memo `Full Record-to-Report Skill Coverage` överskattade risken (sade 9 skills, det är 18, och de raderas inte).
