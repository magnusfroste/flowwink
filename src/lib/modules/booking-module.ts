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
    description: 'Create a simple booking WITHOUT overlap protection — PREFER book_appointment_slot for normal bookings (it derives the end from the service duration and rejects double-bookings). Use when: booking without a defined service, or a workflow explicitly needs ad-hoc date+time. NOT for: normal service bookings (book_appointment_slot); checking availability (check_availability); managing existing bookings (manage_bookings).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'both',
    tool_definition: {
      type: 'function',
      function: {
        name: 'book_appointment',
        description: 'Create a simple booking WITHOUT overlap protection — prefer book_appointment_slot for normal service bookings. Use when: booking without a defined service or ad-hoc date+time. NOT for: normal service bookings (book_appointment_slot); checking availability (check_availability).',
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
    instructions: `## book_appointment (legacy simple path)
PREFER book_appointment_slot — it derives the end time from the service duration and rejects double-bookings. This skill books blindly at date+time.
### When to use
- Booking without any defined service
- A workflow explicitly needs an ad-hoc date+time booking
### Parameters
- **customer_name**: Required.
- **customer_email**: Required for confirmation email. Phone callers without email: pass customer_phone — a placeholder email is derived.
- **date**: Required, YYYY-MM-DD. **time**: Required, HH:MM (24h). (starts_at ISO is also accepted instead of date+time.)
- **service_id**: Optional. If omitted, the first active service is used.
### Edge cases
- Always call check_availability first and pick from its free_slots.
- NO overlap protection here — that is why book_appointment_slot is preferred.`,
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
Checks booking availability for a specific date and computes DISCRETE free slots.
### When to use
- Visitor asks about available times in chat/voice
- Before calling book_appointment / book_appointment_slot
- Calendar management
### Parameters
- **date**: Required. Date in YYYY-MM-DD format.
- **service_id**: Optional. Slot grid follows the service's duration (else 30 min). Generic availability windows (service_id NULL) always apply.
### Response
- **free_slots**: ready-to-offer start times, e.g. ["09:00","09:30","10:00"] — already excludes existing bookings, blocked ranges and past times (today). Read these straight to the user; do not recompute from windows.
- **slot_minutes**: the grid size used.
- **booked_ranges** + **available_windows**: raw data for custom reasoning.
### Edge cases
- Empty free_slots + empty available_windows = no availability configured that weekday.
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
    description: 'List, view, update status/no-show, assign staff, or cancel EXISTING bookings — find a customer\'s booking by email or phone ("when is my appointment?", "cancel my booking"). Use when: a customer asks about/cancels their booking; admin reviews the calendar; confirming bookings; assigning a staff member; marking a past booking as no-show. NOT for: creating bookings (book_appointment_slot); availability settings (manage_booking_availability); free times (check_availability).',
    category: 'crm',
    handler: 'module:booking',
    scope: 'internal',
    tool_definition: {
      type: 'function',
      function: {
        name: 'manage_bookings',
        description: 'List, view, update status (including no_show), assign staff, or cancel existing bookings. Find a customer\'s booking via customer_email or customer_phone. NOT for creating bookings (book_appointment_slot).',
        parameters: {
          type: 'object',
          properties: {
            action: {
              type: 'string',
              enum: [
                'list',
                'get',
                'update_status',
                'assign_staff',
                'cancel',
              ],
            },
            booking_id: {
              type: 'string',
            },
            status: {
              type: 'string',
              description: 'For action=update_status: pending, confirmed, completed, cancelled, or no_show (customer confirmed but did not attend a past appointment).',
            },
            assigned_employee_id: {
              type: 'string',
              description: 'For action=assign_staff: employee UUID to assign as staff for this booking (look up via manage_employee search/list_employees), or null/omit to unassign.',
            },
            period: {
              type: 'string',
              enum: [
                'today',
                'week',
                'month',
              ],
            },
            customer_email: {
              type: 'string',
              description: 'Filter list by customer email — use to find "my booking".',
            },
            customer_phone: {
              type: 'string',
              description: 'Filter list by customer phone (suffix match) — ideal for voice callers.',
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
Lists, views, updates, assigns staff to, or cancels EXISTING bookings.
### When to use
- Customer asks "when is my appointment?" → action=list + customer_email OR customer_phone
- Customer wants to cancel → find via list, then action=cancel with booking_id
- Admin calendar overview / confirming bookings
- Assign a staff member → action=assign_staff with booking_id + assigned_employee_id (find the employee via manage_employee first)
- Booking's time has passed and the customer never showed → action=update_status with status=no_show
### Parameters
- **action**: Required. list, get, update_status, assign_staff, cancel.
- **booking_id**: For get/update_status/assign_staff/cancel.
- **status**: For update_status — pending, confirmed, completed, cancelled, no_show.
- **assigned_employee_id**: For assign_staff — employee UUID, or omit/null to unassign.
- **customer_email** / **customer_phone**: Filter list to a customer's own bookings (phone matches on the last 7 digits — perfect for voice callers).
- **period**: Filter: today, week, month.
### RESCHEDULE ("flytta min tid")
There is no move action — do: (1) find the booking (list + customer filter), (2) action=cancel, (3) book the new time with book_appointment_slot. Tell the customer both steps happened.
### Edge cases
- Cancel sends a cancellation email to the customer.
- Cancelled bookings free up the time slot immediately.
- no_show is only meaningful for a booking whose start_time is in the past and was confirmed — don't mark future bookings no_show.`,
  },
  {
    name: 'book_appointment_slot',
    description: 'PREFERRED way to book an appointment: books a service at a start time — the end is derived from the service duration and double-bookings are rejected. Use when: a customer/caller wants to book a time for a service (chat, voice, MCP). NOT for: bookings without a service (book_appointment, legacy), availability listing (check_availability), or changing existing bookings (manage_bookings).',
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
    instructions: `## book_appointment_slot (PREFERRED booking path)
### Complete workflow
1. browse_services → let the user pick (or default to the first) — note the service id.
2. check_availability {date, service_id} → read **free_slots** (ready-to-offer start times on the service-duration grid).
3. Book: combine the chosen date + free_slot into p_start_time as an ISO timestamp WITH timezone offset (e.g. 2026-07-03T10:00:00+02:00 for Swedish local time).
### Parameters (exact RPC names — keep the p_ prefix)
- **p_service_id**: UUID from browse_services. Required.
- **p_customer_name** + **p_customer_email**: Required. Phone callers without email: ask once; if unavailable, use book_appointment instead (it derives a placeholder from p-phone).
- **p_start_time**: ISO timestamp with offset. Required. End time is computed from the service duration — never pass an end.
- **p_customer_phone**, **p_notes**: Optional but pass them when known (phone enables "find my booking" later).
### Error recovery
- **slot_unavailable** → the slot was taken between check and book: re-run check_availability and offer the nearest free_slots. Do NOT retry the same time.
- Cancelled bookings free their slot; back-to-back (adjacent) bookings are allowed.`,
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
  data: {
    tables: ['booking_availability', 'booking_blocked_dates', 'bookings', 'booking_services'],
  },
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
