# Meeting Polls

> Status: step 1 shipped 2026-09-28 (schema, RPCs, skills, battery scenario). Step 2 — public block, admin panel, comms — pending. See #590.

## What it does

Propose several candidate times, let people answer by link without an account, and let a **rule** pick the first time everyone can make — then put it on the calendar with the people who can make it as attendees. The group-scheduling step the booking module (one customer, one grid) does not have, and Odoo Appointments does not either.

Modelled on [timeslot.fit](https://github.com/magnusfroste/timeslot), ported as a model: that app has no rule (the organizer taps *confirm*), identifies people by name, and leaves RLS open. Here the rule is SQL, identity is a normalised e-mail, and anon never reads a base table.

## Skills exposed

| skill | handler | scope | when |
|---|---|---|---|
| `create_meeting_poll` | `rpc:create_meeting_poll` | internal | "find a time for the five of us" — FlowPilot reads gaps via `list_events` first. Params: `p_title`, `p_slots [{starts_at, duration_min}]`, `p_organizer_email`, `p_organizer_name`, `p_policy`, `p_quorum`, `p_expires_at`, `p_customer_facing`. Returns `share_path`. |
| `respond_to_meeting_poll` | `rpc:respond_to_meeting_poll_by_token` | **external**, `notify` | a link-holder says which slots work. `p_token`, `p_email`, `p_name`, `p_slot_ids`. One answer per e-mail, upserted. |
| `resolve_meeting_poll` | `rpc:resolve_meeting_poll` | internal | apply the policy. Read `resolved`, not `success`. Idempotent. |
| `list_meeting_polls` | `rpc:list_meeting_polls` | internal | operator overview. |

Policies: `first_all` (earliest slot every respondent chose — default), `first_quorum` (earliest with ≥ `quorum`), `max_attendance` (most chosen, earliest on a tie).

## Tables / RLS

`meeting_polls` · `meeting_poll_slots` · `meeting_poll_responses` — RLS on, **no policy names anon or public**. Staff via `has_role(admin)` or `can_access_module('bookings')`. Public access only through the two `_by_token` RPCs (SECURITY DEFINER, `REVOKE ALL FROM PUBLIC`, `GRANT … TO anon`). Two tokens: `share_token` (public link) and `edit_token` (organizer, step 2). `meeting_poll_responses` is in the realtime publication.

Resolve writes `calendar_events` (`related_entity_type = 'meeting_poll'`, attendees `[{email,name}]`, visibility `team`) and, when `customer_facing`, a `bookings` row.

## Settings

None. Module toggle `meetingPolls`; requires `bookings` and `calendar`.

## Related

- Process: `docs/processes/propose-to-meet.md`
- Battery: `scripts/process-battery/scenarios/propose-to-meet.ts`
- Parity: `docs/parity/capabilities/booking.json#group_scheduling_poll` (`odoo: false`)
- Source: `src/lib/modules/meeting-polls-module.ts`
