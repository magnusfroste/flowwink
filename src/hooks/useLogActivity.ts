import { useMutation, useQueryClient } from '@tanstack/react-query';
import { supabase } from '@/integrations/supabase/client';
import { toast } from 'sonner';
import { logger } from '@/lib/logger';

export type DiscussActivityType = 'note' | 'call' | 'email' | 'meeting';

interface LogActivityInput {
  leadId?: string;
  email?: string;
  type: DiscussActivityType;
  body: string;
  subject?: string;
}

const POINTS: Record<DiscussActivityType, number> = {
  note: 0,
  call: 5,
  email: 3,
  meeting: 10,
};

/**
 * Log a manual activity (note/call/email/meeting) on a lead.
 * If only `email` is supplied, looks up (or no-ops) the matching lead first.
 */
export function useLogActivity() {
  const qc = useQueryClient();

  return useMutation({
    mutationFn: async ({ leadId, email, type, body, subject }: LogActivityInput) => {
      let targetLeadId = leadId;

      if (!targetLeadId && email) {
        const { data: lead } = await supabase
          .from('leads')
          .select('id')
          .eq('email', email.toLowerCase())
          .maybeSingle();
        targetLeadId = lead?.id;
      }

      if (!targetLeadId) {
        throw new Error('No lead found for this contact — create a lead first.');
      }

      const metadata: Record<string, unknown> = { note: body };
      if (subject) metadata.subject = subject;

      const { error } = await supabase.from('lead_activities').insert([{
        lead_id: targetLeadId,
        type,
        metadata,
        points: POINTS[type],
      }]);

      if (error) throw error;
      return { leadId: targetLeadId };
    },
    onSuccess: ({ leadId }) => {
      qc.invalidateQueries({ queryKey: ['lead-activities', leadId] });
      qc.invalidateQueries({ queryKey: ['unified-timeline'] });
      qc.invalidateQueries({ queryKey: ['customer-360'] });
      qc.invalidateQueries({ queryKey: ['lead', leadId] });
      qc.invalidateQueries({ queryKey: ['leads'] });
      toast.success('Activity logged');
    },
    onError: (e: Error) => {
      logger.error('Log activity error:', e);
      toast.error(e.message || 'Could not log activity');
    },
  });
}
