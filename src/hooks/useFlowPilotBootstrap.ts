import { useEffect, useRef } from 'react';
import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { useToast } from '@/hooks/use-toast';
import { useModules, defaultModulesSettings } from '@/hooks/useModules';
import { useAuth } from '@/hooks/useAuth';
import { bootstrapModule, ensureModulesRow, ensurePlatformCron, ensureSkillRegistry } from '@/lib/module-bootstrap';
import { bootstrapPlatform, missingPlatformSkills, PLATFORM_SKILL_NAMES } from '@/lib/platform-seeds';

/**
 * Module-scoped so a StrictMode double-mount (or a route change that remounts
 * AdminLayout) cannot run the heal twice — a useRef is recreated on remount.
 * It resets on page reload, so a FAILED heal is retried on the next load
 * instead of being permanently swallowed.
 */
let platformHealStarted = false;

/**
 * useFlowPilotBootstrap
 *
 * After the modular refactor, FlowPilot's init is owned by the module system:
 *   - Toggle FlowPilot module ON in /admin/modules → bootstrapModule('flowpilot')
 *     seeds soul, identity, agents-rules, tool_policy, starter objectives,
 *     core skills, and the weekly digest automation.
 *
 * This hook serves as a SAFETY NET, and it carries TWO independent branches:
 *
 *   1. PLATFORM (unconditional) — seeds the always-on platform skill layer and
 *      the platform cron jobs when they are incomplete. Runs regardless of any
 *      module toggle, because a fresh install has no other automatic path to
 *      its 4th deploy layer. Never enables a module.
 *   2. FLOWPILOT (only when the FlowPilot module is enabled) — if soul is
 *      missing (partial install, manual DB edit), re-bootstraps the module.
 *
 * Keeping them separate is deliberate: branch 2 is gated on a module that is
 * OFF by default, so it can never be the carrier for platform-level repair.
 * No more calls to the legacy setup-flowpilot edge function from here.
 */
export function useFlowPilotBootstrap() {
  const hasTriggered = useRef(false);
  const queryClient = useQueryClient();
  const { toast } = useToast();
  const { data: modules } = useModules();
  const isFlowPilotEnabled = modules?.flowpilot?.enabled ?? false;
  // Every heal below ends in an admin-gated RPC (ensure_modules_settings,
  // sync_skills_from_code, the cron registrar). AdminLayout mounts this hook
  // BEFORE its auth redirect runs, so without this gate the first call went out
  // as anon, the RPC correctly refused — and the catch path read that refusal
  // as "all 67 modules missing" and raised a destructive toast on the login
  // screen. A guard's refusal is not absence. Verified live on www 2026-08-24:
  // the RPC denies anon (42501) while the row itself is complete and healthy.
  //
  // `rolesReady`, not just `user`: roles resolve a beat after the session, and
  // gating on isAdmin before they land would skip the heal for real admins.
  const { user, rolesReady, isAdmin } = useAuth();
  const canHeal = !!user && rolesReady && isAdmin;

  const repair = useMutation({
    mutationFn: async () => {
      logger.log('[FlowPilotBootstrap] Soul missing for enabled FlowPilot — running module bootstrap to repair…');
      if (!modules) throw new Error('Modules settings not loaded');
      const result = await bootstrapModule('flowpilot', modules);
      logger.log('[FlowPilotBootstrap] Repair complete:', result);

      // Fire an initial heartbeat so objectives get decomposed quickly
      try {
        await supabase.functions.invoke('flowpilot-heartbeat', {
          body: { time: new Date().toISOString(), trigger: 'auto-repair' },
        });
      } catch (hbError) {
        logger.warn('[FlowPilotBootstrap] Initial heartbeat failed (non-fatal):', hbError);
      }
      return result;
    },
    onSuccess: () => {
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] });
      queryClient.invalidateQueries({ queryKey: ['agent-memory'] });
    },
    onError: (error) => {
      logger.error('[FlowPilotBootstrap] Repair failed:', error);
    },
  });

  // ── Platform layer self-heal ────────────────────────────────────────────
  //
  // A self-provisioned instance gets three of its four deploy layers for free
  // (schema via migrations, edge functions via the Supabase GitHub integration,
  // frontend via Vercel). The FOURTH — agent_skills, which is table DATA born
  // from TypeScript seeds — has no deploy layer at all. Nothing ever applied it
  // automatically, and nothing errored: the admin UI, the public site and the
  // chat all render fine while the agent surface is empty and every automation
  // sits at run_count 0 forever because the per-minute cron tick never existed.
  // Measured on a fresh replay: 6 skills, 6 cron jobs (a mature instance: 537
  // and 15).
  //
  // The previous guard here fired only when `run_daily_briefing` was ABSENT —
  // but that skill is migration-seeded, so it is present from birth and the
  // branch never ran. The condition is now the completeness of the whole
  // platform skill layer (see missingPlatformSkills), which is true on a fresh
  // install and false on a mature one.
  //
  // SCOPE: this seeds the PLATFORM layer only — the always-on skills and
  // automations from platform-seeds plus the platform cron jobs. It never
  // enables a module. ensureSkillRegistry() delegates to sync_skills_from_code,
  // which is itself module-gated server-side (`platform` always, other modules
  // only when site_settings.modules says enabled), so an operator's module
  // choices are respected, not overridden.
  //
  // COST: on a healthy instance this is exactly one bounded read — 14 names, at
  // most 14 rows — and then it stops. Nothing heavy runs per page load.
  // ── Module row self-heal ────────────────────────────────────────────────
  //
  // Runs UNCONDITIONALLY and independently of the platform heal below, because
  // the two failure modes do not overlap: a mature instance whose modules row
  // was emptied (ResetSiteDialog wrote `value: {}` for months) has a complete
  // skill layer, so the platform branch early-returns and would never repair
  // it. See ensureModulesRow() for the split brain this closes.
  //
  // Deduped at module scope inside ensureModulesRow, so a StrictMode double
  // mount or a route change costs one RPC per page load at most — and that RPC
  // writes nothing once the row is complete.
  // ── Skill-coverage reconcile ────────────────────────────────────────────
  //
  // Runs UNCONDITIONALLY, in the same effect and strictly AFTER the modules row
  // is settled, because the skill layer's requirement CHANGES over an instance's
  // life while nothing in the deploy chain notices:
  //   • a template install turns seven modules on (install_template →
  //     apply_settings), and
  //   • an operator toggles modules in /admin/modules.
  //
  // The platform branch below cannot carry this: it fires only while the
  // PLATFORM layer is incomplete, so on any instance past its first minute it
  // early-returns — the same shape as the self-heal that waited for a
  // migration-seeded skill to be absent. Measured consequence: a fresh, fully
  // provisioned instance with 96 of 347 skills, every commerce/contracts/
  // invoicing/tickets/sla/field-service module ON and empty, and a sync that
  // answered "unchanged" because it compared the ARTIFACT instead of the
  // instance.
  //
  // Cost on a healthy instance: one settings read plus one name-only read of
  // agent_skills, once per page load, and it writes nothing.
  useEffect(() => {
    if (!canHeal) return; // wait for an admin session — see canHeal above
    let cancelled = false;
    (async () => {
      const result = await ensureModulesRow(defaultModulesSettings);
      if (cancelled) return;

      if (result.missing.length > 0) {
        // Shout. A modules row the server cannot see is the difference between
        // "18 modules enabled" in the UI and 14 skills on the instance.
        toast({
          variant: 'destructive',
          title: 'Module settings not stored',
          description:
            `${result.missing.length} module(s) are missing from site_settings.modules ` +
            `(${result.missing.slice(0, 3).join(', ')}). Edge functions and the skill sync will treat them as OFF. ` +
            (result.error ? `Error: ${result.error}` : 'Open Modules and save once to write the row.'),
        });
      }

      const registry = await ensureSkillRegistry();
      if (cancelled) return;
      if (registry.missing > 0) {
        toast({
          variant: 'destructive',
          title: 'Agent skills incomplete',
          description:
            `${registry.missing} of ${registry.expected} skill(s) required by the enabled modules are missing ` +
            `(${registry.missingNames.slice(0, 3).join(', ')}). Agents cannot call what is not registered — ` +
            'open Modules → "Sync skills from code".',
        });
      }
    })();
    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canHeal]); // re-runs when the admin session lands — the heal must still happen AFTER login

  useEffect(() => {
    if (!canHeal) return; // wait for an admin session — see canHeal above
    if (platformHealStarted) return;
    platformHealStarted = true;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('agent_skills')
        .select('name')
        .in('name', PLATFORM_SKILL_NAMES as string[]);
      if (cancelled) return;
      if (error) {
        // Can't read the registry — say so rather than assuming health.
        logger.warn('[PlatformBootstrap] Could not read agent_skills:', error.message);
        platformHealStarted = false; // let the next load retry
        return;
      }

      const missing = missingPlatformSkills((data ?? []).map((r) => r.name as string));
      if (missing.length === 0) return; // steady state: one read, done

      logger.log(
        `[PlatformBootstrap] Platform layer incomplete — ${missing.length}/${PLATFORM_SKILL_NAMES.length} skills missing ` +
          `(${missing.slice(0, 5).join(', ')}${missing.length > 5 ? '…' : ''}). Seeding platform layer + cron.`
      );

      const errors: string[] = [];

      // 1. Platform skills + platform automations (Daily Briefing, Integration
      //    Health Check, Skill Curator). Always-on, module-toggle-independent.
      try {
        const seeded = await bootstrapPlatform();
        errors.push(...seeded.errors);
      } catch (err) {
        errors.push(`platform seeds: ${err instanceof Error ? err.message : 'unknown error'}`);
      }

      // 2. Platform cron. Postgres cannot derive the instance's own URL/anon key;
      //    the browser can. Without this there is no heartbeat, no automation
      //    dispatcher and no retrieval sweep — the silent half-install.
      const cron = await ensurePlatformCron();
      if (!cron.registered) errors.push(`platform cron: ${cron.error ?? 'not registered'}`);

      // 3. Reconcile the registry against the deployed seed artifact. Module-gated
      //    server-side; hash-gated so it is cheap once applied.
      //
      //    ORDER MATTERS: sync_skills_from_code reads site_settings.modules and
      //    syncs only what it says is enabled. Run it before the row exists and
      //    it syncs the `platform` pseudo-module alone — a fresh install lands
      //    on 14 skills, reports success, and looks fine. Await the row first.
      const modulesRow = await ensureModulesRow(defaultModulesSettings);
      if (modulesRow.missing.length > 0) {
        errors.push(
          `module settings row incomplete (${modulesRow.missing.length} missing) — skill sync will under-report`
        );
      }
      const registry = await ensureSkillRegistry();
      if (registry.status === 'error') errors.push(`skill registry: ${registry.error ?? 'sync failed'}`);
      // Coverage, not status. "synced" is the writer's word; `missing` is the
      // read-back — the only number that can contradict a successful-looking run.
      else if (registry.missing > 0) {
        errors.push(
          `skill registry: ${registry.missing}/${registry.expected} required skill(s) still missing ` +
            `(${registry.missingNames.slice(0, 3).join(', ')})`
        );
      }

      if (cancelled) return;

      // Verify — don't trust the seeder's own report. Re-read the floor.
      const { data: after } = await supabase
        .from('agent_skills')
        .select('name')
        .in('name', PLATFORM_SKILL_NAMES as string[]);
      const stillMissing = missingPlatformSkills((after ?? []).map((r) => r.name as string));

      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] });
      queryClient.invalidateQueries({ queryKey: ['instance-sync-status'] });

      if (cancelled) return;

      // Be honest. A half-succeeded seed is the exact failure mode this exists
      // to kill, so it must never be swallowed.
      if (stillMissing.length > 0 || errors.length > 0) {
        platformHealStarted = false; // retry on the next load
        logger.error(
          `[PlatformBootstrap] Platform seed incomplete — ${stillMissing.length} skill(s) still missing.`,
          errors
        );
        toast({
          variant: 'destructive',
          title: 'Platform layer not fully seeded',
          description:
            (stillMissing.length > 0
              ? `${stillMissing.length} platform skill(s) still missing (${stillMissing.slice(0, 3).join(', ')}). `
              : '') +
            (errors[0] ? `First error: ${errors[0]}. ` : '') +
            'Open Modules → "Sync skills from code".',
        });
        return;
      }

      logger.log('[PlatformBootstrap] Platform layer seeded — skills, automations and cron registered.');
      toast({
        title: 'Platform layer seeded',
        description: `${PLATFORM_SKILL_NAMES.length} platform skills, platform automations and scheduled jobs registered on this instance.`,
      });
    })();

    return () => {
      cancelled = true;
    };
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, [canHeal]); // re-runs when the admin session lands — the heal must still happen AFTER login

  useEffect(() => {
    if (!canHeal) return; // wait for an admin session — see canHeal above
    if (!isFlowPilotEnabled || !modules || hasTriggered.current) return;

    let cancelled = false;
    (async () => {
      const { data, error } = await supabase
        .from('agent_memory')
        .select('id')
        .eq('key', 'soul')
        .maybeSingle();
      if (cancelled || error) return;
      if (!data) {
        hasTriggered.current = true;
        repair.mutate();
      }
    })();

    return () => {
      cancelled = true;
    };
  }, [canHeal, isFlowPilotEnabled, modules]);
}
