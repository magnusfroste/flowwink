import { supabase } from '@/integrations/supabase/client';
import { logger } from '@/lib/logger';
import { triggerWebhook } from '@/lib/webhook-utils';
import type { SkillSeed } from '@/lib/module-bootstrap';
import { defineModule } from '@/lib/module-def';
import {
  BookingModuleInput,
  BookingModuleOutput,
  bookingModuleInputSchema,
  bookingModuleOutputSchema,
} from '@/types/module-contracts';

// ── Bundled skill definitions (migrated from setup-flowpilot) ──
const BOOKING_SKILLS: SkillSeed[] = [
  {
    name: 'book_appointment',
    description: 'Create a booking for a customer. Use when: a customer wants to schedule an appointment; confirming a service reservation; creating a booking from a chat conversation. NOT for: checking availability (check_availability); managing existing bookings (manage_bookings).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description: 'Create a booking for a customer. Use when: a customer wants to schedule an appointment; confirming a service reservation; creating a booking from a chat conversation. NOT for: checking availability (check_availability); managing existing bookings (manage_bookings).',
        parameters: {
          type: 'object',
          properties: {
            customer_name: {
              type: 'string',
            },
            customer_email: {
              type: 'string',
            },
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format',
            },
            time: {
              type: 'string',
              description: 'Time in HH:MM format',
            },
            service_id: {
              type: 'string',
              description: 'Optional service ID',
            },
          },
          required: [
            'customer_name',
            'customer_email',
            'date',
            'time',
          ],
        },
      },
    },
    instructions: `## book_appointment
### What
Creates a booking for a customer at a specific date and time.
### When to use
- Visitor asks to book/schedule an appointment in chat
- Admin creates a booking manually
- Automated booking from a workflow
### Parameters
- **customer_name**: Required.
- **customer_email**: Required for confirmation email.
- **date**: Required, YYYY-MM-DD format.
- **time**: Required, HH:MM format (24h).
- **service_id**: Optional. If omitted, uses default service.
### Edge cases
- Always call check_availability first to verify the slot is open.
- Booking confirmation email is sent automatically.
- Double bookings are rejected by the handler.`,
  },
  {
    name: 'check_availability',
    description: 'Check booking availability for a specific date. Use when: a customer wants to know if a slot is open; determining if a service can be booked; verifying potential appointment times. NOT for: creating a booking (book_appointment); managing availability settings (manage_booking_availability).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'check_availability',
        description: 'Check booking availability for a specific date. Use when: a customer wants to know if a slot is open; determining if a service can be booked; verifying potential appointment times. NOT for: creating a booking (book_appointment); managing availability settings (manage_booking_availability).',
        parameters: {
          type: 'object',
          properties: {
            date: {
              type: 'string',
              description: 'Date in YYYY-MM-DD format',
            },
            service_id: {
              type: 'string',
              description: 'Optional service filter',
            },
          },
          required: [
            'date',
          ],
        },
      },
    },
    instructions: `## check_availability
### What
Checks booking availability for a specific date.
### When to use
- Visitor asks about available times in chat
- Before calling book_appointment
- Calendar management
### Parameters
- **date**: Required. Date in YYYY-MM-DD format.
- **service_id**: Optional. Filter by specific service.
### Edge cases
- Returns available time slots based on booking_availability hours minus existing bookings.
- Respects blocked dates from booking_blocked_dates.`,
  },
  {
    name: 'browse_services',
    description: 'List available booking services. Use when: a user asks what services are offered; displaying service options; selecting a service for booking. NOT for: checking availability (check_availability); managing booking settings (manage_booking_availability).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'browse_services',
        description: 'List available booking services. Use when: a user asks what services are offered; displaying service options; selecting a service for booking. NOT for: checking availability (check_availability); managing booking settings (manage_booking_availability).',
        parameters: {
          type: 'object',
          properties: {},
        },
      },
    },
    instructions: `## browse_services
### What
Lists available booking services (visitor-facing).
### When to use
- Visitor asks what services are available
- Before booking to let visitor choose a service
### Parameters
- None required.
### Edge cases
- Only returns active services (is_active=true).
- Includes price and duration information.`,
  },
  {
    name: 'manage_booking_availability',
    description: 'Manage booking hours and blocked dates. Use when: setting up service availability; blocking holiday dates; adjusting operating hours. NOT for: checking availability (check_availability); creating bookings (book_appointment).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_booking_availability',
        description: 'Manage booking hours and blocked dates. Use when: setting up service availability; blocking holiday dates; adjusting operating hours. NOT for: checking availability (check_availability); creating bookings (book_appointment).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list_hours',
                'set_hours',
                'block_date',
                'unblock_date',
                'list_blocked',
              ],
            },
            day_of_week: {
              type: 'number',
              description: '0=Sunday, 6=Saturday',
            },
            start_time: {
              type: 'string',
              description: 'HH:MM format',
            },
            end_time: {
              type: 'string',
              description: 'HH:MM format',
            },
            date: {
              type: 'string',
              description: 'Date for blocking (YYYY-MM-DD)',
            },
            reason: {
              type: 'string',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_booking_availability
### What
Manages booking hours and blocked dates for the scheduling system.
### When to use
- Admin sets business hours
- Admin blocks dates for holidays/vacations
- Schedule configuration changes
### Parameters
- **action**: Required. list_hours, set_hours, block_date, unblock_date, list_blocked.
- **day_of_week**: 0-6 (0=Sunday) for set_hours.
- **start_time**, **end_time**: HH:MM format.
- **date**: YYYY-MM-DD for block/unblock.
### Edge cases
- Setting hours replaces existing hours for that day.
- Blocked dates override availability hours.`,
  },
  {
    name: 'manage_bookings',
    description: 'List, view, update or cancel bookings. Use when: reviewing scheduled appointments; modifying a booking time; cancelling an appointment. NOT for: managing availability settings (manage_booking_availability); browsing services (browse_services).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_bookings',
        description: 'List, view, update or cancel bookings. Use when: reviewing scheduled appointments; modifying a booking time; cancelling an appointment. NOT for: managing availability settings (manage_booking_availability); browsing services (browse_services).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update_status',
                'cancel',
              ],
            },
            booking_id: {
              type: 'string',
            },
            status: {
              type: 'string',
            },
            period: {
              type: 'string',
              enum: [
                'today',
                'week',
                'month',
              ],
            },
            limit: {
              type: 'number',
            },
          },
          required: [
            'action',
          ],
        },
      },
    },
    instructions: `## manage_bookings
### What
Lists, views, updates, or cancels bookings.
### When to use
- Admin manages appointments
- Booking status updates (confirm, cancel)
- Calendar overview
### Parameters
- **action**: Required. list, get, update_status, cancel.
- **booking_id**: For get/update_status/cancel.
- **period**: Filter: today, week, month.
### Edge cases
- Cancel sends a cancellation email to the customer.
- Cancelled bookings free up the time slot.`,
  },
  {
    name: 'book_appointment_slot',
    description: 'Create a booking from a start time — the end is derived from the service duration, and overlapping bookings for the same service are rejected. Use when: booking with proper slot length + double-booking protection. NOT for: ad-hoc bookings without a service (book_appointment) or availability listing (check_availability).',
    category: 'commerce',
    handler: 'rpc:book_appointment_slot',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_appointment_slot',
        description: 'Books a service at a start time; end_time = start + service.duration_minutes. Rejects overlap with any non-cancelled booking of the same service (slot_unavailable).',
        parameters: {
          type: 'object',
          required: ['p_service_id', 'p_customer_name', 'p_customer_email', 'p_start_time'],
          properties: {
            p_service_id: { type: 'string', format: 'uuid' },
            p_customer_name: { type: 'string' },
            p_customer_email: { type: 'string' },
            p_start_time: { type: 'string', description: 'ISO timestamp of the slot start' },
            p_customer_phone: { type: 'string' },
            p_notes: { type: 'string' },
          },
        },
      },
    },
    instructions: 'The slot length comes from booking_services.duration_minutes — callers only pass the start. Double-booking the same service is rejected (slot_unavailable); cancelled bookings free the slot; adjacent slots are allowed. Pair with check_availability to find open starts.',
  },
];

export const bookingModule = defineModule<BookingModuleInput, BookingModuleOutput>({
  id: 'bookings',
  name: 'Booking',
  version: '1.0.0',
  processes: ['lead-to-customer'],
  maturity: 'L3',
  description: 'Create and manage bookings/appointments',
  capabilities: ['content:receive', 'data:write', 'webhook:trigger'],
  tier: 'standard',
  inputSchema: bookingModuleInputSchema,
  outputSchema: bookingModuleOutputSchema,

  skills: [
    'book_appointment',
    'check_availability',
    'browse_services',
    'manage_booking_availability',
    'manage_bookings',
    'book_appointment_slot',
  ],
  skillSeeds: BOOKING_SKILLS,

  webhookEvents: [
    { event: 'booking.submitted', description: 'A booking was submitted' },
    { event: 'booking.confirmed', description: 'A booking was confirmed' },
    { event: 'booking.cancelled', description: 'A booking was cancelled' },
  ],

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
});
