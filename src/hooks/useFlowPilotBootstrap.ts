import { useEffect, useRef } from 'react';
import { useQuery, useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';

/**
 * useFlowPilotBootstrap
 * 
 * Idempotent hook that auto-seeds FlowPilot (skills, soul, objectives,
 * automations, workflows, cron jobs) on the first admin session.
 * 
 * Called from AdminLayout — runs once per session.
 * If skills already exist, it's a no-op.
 */
export function useFlowPilotBootstrap() {
  const hasTriggered = useRef(false);
  const queryClient = useQueryClient();

  // Check if skills exist (lightweight query)
  const { data: skillCount, isLoading } = useQuery({
    queryKey: ['flowpilot-bootstrap-check'],
    queryFn: async () => {
      const { count, error } = await supabase
        .from('agent_skills')
        .select('id', { count: 'exact', head: true });
      if (error) throw error;
      return count ?? 0;
    },
    staleTime: 1000 * 60 * 30, // 30 min
  });

  const bootstrap = useMutation({
    mutationFn: async () => {
      logger.log('[FlowPilotBootstrap] Seeding FlowPilot for the first time...');
      
      const { data, error } = await supabase.functions.invoke('setup-flowpilot', {
        body: {
          seed_skills: true,
          seed_soul: true,
          // Generic objectives for all sites
          template_flowpilot: {
            objectives: [
              {
                goal: 'Establish content presence — publish 3 blog posts within the first week',
                success_criteria: { published_posts: 3 },
                constraints: { no_destructive_actions: true },
              },
              {
                goal: 'Configure lead capture — ensure at least one form or chat is active on the site',
                success_criteria: { lead_capture_active: true },
              },
              {
                goal: 'Set up weekly digest — monitor site performance and report key metrics every Friday',
                success_criteria: { weekly_digest_active: true },
              },
            ],
            automations: [
              {
                name: 'Weekly Business Digest',
                description: 'Every Friday afternoon, analyze performance and generate a business digest with key metrics, wins, and next week priorities.',
                trigger_type: 'cron',
                trigger_config: { cron: '0 16 * * 5', timezone: 'UTC' },
                skill_name: 'weekly_business_digest',
                skill_arguments: {},
                enabled: true,
              },
            ],
            workflows: [
              {
                name: 'Content Pipeline',
                description: 'Research a topic, generate a blog post proposal, write and publish.',
                steps: [
                  { id: 'step-1', skill_name: 'research_content', skill_args: { query: '{{topic}}' } },
                  { id: 'step-2', skill_name: 'generate_content_proposal', skill_args: { research_context: '{{step-1.output}}' } },
                  { id: 'step-3', skill_name: 'write_blog_post', skill_args: { proposal: '{{step-2.output}}' }, on_failure: 'stop' },
                ],
                trigger_type: 'manual',
                enabled: true,
              },
            ],
          },
        },
      });

      if (error) throw error;
      
      logger.log('[FlowPilotBootstrap] Bootstrap complete:', data);

      // Seed AGENTS document (operational rules) if not present
      try {
        const { data: existingAgents } = await supabase
          .from('agent_memory')
          .select('id')
          .eq('key', 'agents')
          .maybeSingle();

        if (!existingAgents) {
          await supabase.from('agent_memory').insert({
            key: 'agents',
            value: {
              version: '1.0',
              direct_action_rules: 'When a user asks you to DO something (delete, update, create, fix, clean up), ALWAYS execute it directly using the appropriate skill — NEVER create an automation instead. Only create automations when the user explicitly asks for scheduled/recurring tasks.',
              self_improvement: 'If a user asks you to do something you can\'t, consider creating a new skill. When you notice repetitive tasks, SUGGEST (don\'t auto-create) an automation. Use reflect periodically. Use skill_instruct to enrich skills. Use soul_update for fundamental role insights. Use agents_update for operational rule refinements. Set requires_approval=true for destructive skills. New automations are disabled by default.',
              memory_guidelines: 'Save user preferences, facts, and context with memory_write. Check memory before answering questions about the site. memory_read supports semantic search.',
              browser_rules: 'When a user provides a URL, ALWAYS call browser_fetch. NEVER guess URLs for social profiles. Use search_web first to find correct URLs.',
              workflow_conventions: 'Use workflow_create for sequential steps with conditional branching. Steps support {{stepId.result.field}} templates. Use on_failure:continue or stop.',
              a2a_conventions: 'Use delegate_task for subtasks to specialized agents. Built-in specialists: seo, content, sales, analytics, email.',
              skill_pack_rules: 'Use skill_pack_list to see available packs. Use skill_pack_install for batch installation.',
            },
            category: 'preference',
            created_by: 'flowpilot',
          });
          logger.log('[FlowPilotBootstrap] AGENTS document seeded');
        }
      } catch (agentsError) {
        logger.warn('[FlowPilotBootstrap] AGENTS seed failed (non-fatal):', agentsError);
      }

      // Fire initial heartbeat to decompose objectives
      try {
        await supabase.functions.invoke('flowpilot-heartbeat', {
          body: { time: new Date().toISOString(), trigger: 'auto-bootstrap' },
        });
        logger.log('[FlowPilotBootstrap] Initial heartbeat fired');
      } catch (hbError) {
        logger.warn('[FlowPilotBootstrap] Initial heartbeat failed (non-fatal):', hbError);
      }

      return data;
    },
    onSuccess: () => {
      // Invalidate relevant queries so Engine Room reflects the new skills
      queryClient.invalidateQueries({ queryKey: ['agent-skills'] });
      queryClient.invalidateQueries({ queryKey: ['agent-objectives'] });
      queryClient.invalidateQueries({ queryKey: ['agent-automations'] });
      queryClient.invalidateQueries({ queryKey: ['flowpilot-bootstrap-check'] });
    },
    onError: (error) => {
      logger.error('[FlowPilotBootstrap] Failed:', error);
    },
  });

  useEffect(() => {
    if (isLoading || hasTriggered.current) return;
    if (skillCount === 0) {
      hasTriggered.current = true;
      bootstrap.mutate();
    }
  }, [skillCount, isLoading]);
}
