import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { triggerWebhook } from '@/lib/webhook-utils';
import {
  ModuleDefinition,
  BookingModuleInput,
  BookingModuleOutput,
  bookingModuleInputSchema,
  bookingModuleOutputSchema,
} from '@/types/module-contracts';

export const bookingModule: ModuleDefinition<BookingModuleInput, BookingModuleOutput> = {
  id: 'booking',
  name: 'Booking',
  version: '1.0.0',
  description: 'Create and manage bookings/appointments',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  inputSchema: bookingModuleInputSchema,
  outputSchema: bookingModuleOutputSchema,

  async publish(input: BookingModuleInput): Promise<BookingModuleOutput> {
    try {
      const validated = bookingModuleInputSchema.parse(input);

      const { data, error } = await supabase
        .from('bookings')
        .insert({
          customer_name: validated.customer_name,
          customer_email: validated.customer_email,
          customer_phone: validated.customer_phone || null,
          service_id: validated.service_id || null,
          start_time: validated.start_time,
          end_time: validated.end_time,
          notes: validated.notes || null,
          status: validated.status,
        })
        .select('id, status')
        .single();

      if (error) {
        logger.error('[BookingModule] Insert error:', error);
        return { success: false, error: error.message };
      }

      let confirmationSent = false;
      try {
        await supabase.functions.invoke('send-booking-confirmation', { body: { bookingId: data.id } });
        confirmationSent = true;
      } catch (e) {
        logger.warn('[BookingModule] Confirmation email failed:', e);
      }

      try {
        await triggerWebhook({
          event: 'booking.submitted',
          data: { id: data.id, customer_email: validated.customer_email, customer_name: validated.customer_name, start_time: validated.start_time, source_module: validated.meta?.source_module },
        });
      } catch (webhookError) {
        logger.warn('[BookingModule] Webhook failed:', webhookError);
      }

      return { success: true, id: data.id, status: data.status, confirmation_sent: confirmationSent };
    } catch (error) {
      logger.error('[BookingModule] Error:', error);
      return { success: false, error: error instanceof Error ? error.message : 'Unknown error' };
    }
  },
};
