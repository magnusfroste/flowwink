import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { defineModule } from '@/lib/module-def';
import {
  WebinarModuleInput,
  WebinarModuleOutput,
  webinarModuleInputSchema,
  webinarModuleOutputSchema,
} from '@/types/module-contracts';

export const webinarsModule = defineModule<WebinarModuleInput, WebinarModuleOutput>({
  id: 'webinars',
  name: 'Webinars',
  version: '1.0.0',
  description: 'Plan, promote and follow up webinars and online events',
  capabilities: ['content:receive', 'data:write'],
  inputSchema: webinarModuleInputSchema,
  outputSchema: webinarModuleOutputSchema,

  skills: [
    'manage_webinar',
    'register_webinar',
  ],

  async publish(input: WebinarModuleInput): Promise<WebinarModuleOutput> {
    try {
      const validated = webinarModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('webinars')
        .insert({
          title: validated.title,
          description: validated.description || null,
          agenda: validated.agenda || null,
          date: validated.date,
          duration_minutes: validated.duration_minutes,
          platform: validated.platform,
          meeting_url: validated.meeting_url || null,
          cover_image: validated.cover_image || null,
          max_attendees: validated.max_attendees || null,
          status: validated.status,
        })
        .select('id, status')
        .single();

      if (error) {
        logger.error('[WebinarsModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      return { success: true, id: data.id, status: data.status };
    } catch (error) {
      logger.error('[WebinarsModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
});
