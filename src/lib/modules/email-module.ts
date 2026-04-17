import { z } from 'zod';
import { defineModule } from '@/lib/module-def';
import { supabase } from '@/integrations/supabase/client';

const inputSchema = z.object({
  to: z.union([z.string(), z.array(z.string())]),
  subject: z.string(),
  html: z.string(),
  text: z.string().optional(),
  fromOverride: z.string().optional(),
  replyTo: z.string().optional(),
  tags: z.record(z.string()).optional(),
});
const outputSchema = z.object({
  success: z.boolean(),
  provider: z.enum(['smtp', 'resend']).optional(),
  error: z.string().optional(),
});
type Input = z.infer<typeof inputSchema>;
type Output = z.infer<typeof outputSchema>;

/**
 * Email — provider-agnostic transactional sender.
 *
 * FlowWink is self-hosted. Email is treated as an integration so the same
 * module logic (dunning, newsletter, booking confirms, receipts) works
 * regardless of whether the operator runs SMTP (Postfix/Mailgun/SES/Gmail
 * SMTP) or a hosted API (Resend). Provider selection lives in
 * `site_settings.integrations.email.config.provider`; credentials live in
 * SMTP_* / RESEND_API_KEY secrets.
 *
 * Always-on core module — other modules call its skill via the registry
 * rather than talking to providers directly.
 */
export const emailModule = defineModule<Input, Output>({
  id: 'email' as any,
  name: 'Email',
  version: '1.0.0',
  description:
    'Provider-agnostic email sender. Routes system emails through SMTP or Resend.',
  capabilities: ['data:write'],
  inputSchema,
  outputSchema,

  skills: ['send_email', 'configure_email_provider', 'preview_email_template'],

  async publish(input: Input): Promise<Output> {
    try {
      const v = inputSchema.parse(input);
      const { data, error } = await supabase.functions.invoke('email-send', {
        body: v,
      });
      if (error) throw error;
      return {
        success: !!data?.success,
        provider: data?.provider,
        error: data?.error,
      };
    } catch (e) {
      return {
        success: false,
        error: e instanceof Error ? e.message : 'Unknown error',
      };
    }
  },
});
